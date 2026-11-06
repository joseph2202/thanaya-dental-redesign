// Headless Chrome through Playwright Core (installed only in isolated CI).
// Uses the already running temporary SQLite API and production Next.js server.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { mkdir } = require('node:fs/promises');
const { chromium } = require('playwright-core');

async function captureReview(page, name, target=page) {
  const directory = process.env.THANAYA_QA_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await target.screenshot({ path: path.join(directory, name + '.png'), animations: 'disabled',
    ...(target!==page?{style:'.thanaya-admin-header { visibility: hidden !important; }'}:{}) });
}

async function playwrightBrowserSession(base, { ownerEmail, ownerPassword, receivingFixture }) {
  const chrome = ['google-chrome-stable', 'google-chrome', 'chromium']
    .map(name => spawnSync('which', [name], { encoding: 'utf8' }))
    .find(result => result.status === 0)?.stdout.trim();
  if (!chrome) throw Error('Chrome is missing from isolated CI runner');
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(error.message.slice(0, 240)));
    const email = 'browser.' + randomUUID() + '@test.invalid';
    await page.goto(base + '/register');
    await page.getByPlaceholder('أحمد محمد').fill('Thanaya Browser Tester');
    await page.getByPlaceholder('example@email.com').fill(email);
    await page.getByPlaceholder('07822088894').fill('07812345678');
    await page.getByPlaceholder('8 أحرف على الأقل').fill('BrowserSafe#2026');
    await page.getByPlaceholder('أعد كتابة كلمة المرور').fill('BrowserSafe#2026');
    await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).click();
    try {
      await page.waitForURL('**/account', { timeout: 16000 });
    } catch (err) {
      const errors = await page.locator('.bg-red-50').allTextContents();
      throw Error('Registration UI did not navigate to account: ' +
        JSON.stringify({ path: new URL(page.url()).pathname, errors: errors.slice(0, 2), pageErrors: failures }));
    }
    await page.getByRole('heading', { name: /أهلاً/ }).waitFor();
    const cookies = await context.cookies();
    const session = cookies.find(x => x.name === 'thanaya_session');
    const csrf = cookies.find(x => x.name === 'thanaya_csrf');
    assert.ok(session && csrf);
    assert.equal(session.httpOnly, true);
    assert.equal(csrf.httpOnly, false);
    const stored = await page.evaluate(() => ({
      token: localStorage.getItem('thanaya-token'),
      exposed: document.cookie.includes('thanaya_session='),
    }));
    assert.deepEqual(stored, { token: null, exposed: false });
    console.log('PASS Playwright: registration from real browser form and secure cookies');

    await page.reload();
    await page.getByRole('heading', { name: /أهلاً/ }).waitFor({ timeout: 15000 });
    await captureReview(page, 'store-desktop-dark');
    const api = await page.evaluate(async () => {
      const mine = await fetch('/api/orders/mine');
      const denied = await fetch('/api/addresses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      const csrf = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith('thanaya_csrf='))?.split('=')[1];
      const allowed = await fetch('/api/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Thanaya-CSRF': csrf },
        body: JSON.stringify({
          label: 'CI test', name: 'Browser Test', phone: '07812345678',
          city: 'البصرة', address: 'عنوان الاختبار المؤقت'
        })
      });
      const addresses = await fetch('/api/addresses');
      return {
        ordersStatus: mine.status, deniedStatus: denied.status, allowedStatus: allowed.status,
        addressCount: (await addresses.json()).length
      };
    });
    assert.deepEqual(api, { ordersStatus: 200, deniedStatus: 403, allowedStatus: 201, addressCount: 1 });
    console.log('PASS Playwright: reload session and CSRF enforcement');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileToggle = page.getByRole('button', { name: 'فتح القائمة', exact: true });
    await mobileToggle.click();
    const mobileNav = page.getByRole('navigation', { name: 'قائمة التنقل', exact: true });
    await mobileNav.getByRole('link', { name: 'الرئيسية', exact: true }).focus();
    await page.keyboard.press('Escape');
    await mobileNav.waitFor({ state: 'detached' });
    assert.equal(await mobileToggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await mobileToggle.evaluate(el => el === document.activeElement), true,
      'Escape closes storefront navigation and returns keyboard focus');
    await page.getByRole('button', { name: 'تفعيل المظهر الفاتح' }).click();
    assert.equal(await page.locator('html').getAttribute('data-thanaya-theme'), 'light');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false,
      'mobile storefront must not overflow horizontally');
    await captureReview(page, 'store-mobile-light');
    await page.emulateMedia({ contrast: 'more', reducedMotion: 'reduce' });
    await page.waitForFunction(() => matchMedia('(prefers-contrast: more)').matches &&
      getComputedStyle(document.querySelector('header.thanaya-site-header')).backdropFilter === 'none',
      undefined, { timeout: 5000 });
    assert.equal(await page.locator('header.thanaya-site-header').evaluate(el =>
      getComputedStyle(el).backdropFilter), 'none',
      'higher contrast replaces glass with a solid navigation surface');
    await page.emulateMedia({ contrast: 'no-preference', reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'تفعيل المظهر الداكن' }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    console.log('PASS Playwright: mobile navigation Escape/focus, light/dark toggle and page width');
    // Customer role must be enforced by backend and frontend independently.
    const customerExport = await page.evaluate(async () => (await fetch('/api/exports/inventory')).status);
    assert.equal(customerExport, 403, 'customer session may not export private inventory');
    await page.goto(base + '/admin');
    await page.waitForURL(url => !url.pathname.startsWith('/admin'), { timeout: 13000 });
    console.log('PASS Playwright: customer cannot enter admin workspace or export files');
    await page.goto(base + '/account');
    await page.getByRole('heading', { name: /أهلاً/ }).waitFor({ timeout: 13000 });

    await page.locator('button.thanaya-header-logout-link').click();
    await page.waitForURL(/\/login(?:\?|$)/, { timeout: 15000 });
    assert.equal((await page.evaluate(async () => (await fetch('/api/auth/me')).status)), 401);
    assert.equal((await context.cookies()).some(c => c.name === 'thanaya_session'), false);
    console.log('PASS Playwright: real logout and session deletion');
    await context.close();

    // A completely separate browser context has no customer cookies. Log in
    // as an owner that was created solely in the disposable SQLite fixture.
    const staff = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const owner = await staff.newPage();
    owner.on('pageerror', error => failures.push(error.message.slice(0, 240)));
    await owner.goto(base + '/login');
    await owner.getByPlaceholder('example@email.com').fill(ownerEmail);
    await owner.getByPlaceholder('6 أحرف على الأقل').fill(ownerPassword);
    await owner.getByRole('button', { name: 'دخول', exact: true }).click();
    await owner.waitForURL('**/admin', { timeout: 17000 });
    await owner.getByRole('heading', { name: 'لوحة التحكم', exact: true }).waitFor({ timeout: 17000 });
    const staffCookies = await staff.cookies();
    assert.equal(staffCookies.find(c => c.name === 'thanaya_session')?.httpOnly, true);
    await owner.reload();
    await owner.getByRole('heading', { name: 'لوحة التحكم', exact: true }).waitFor({ timeout: 15000 });
    await captureReview(owner, 'admin-desktop-dark');
    await owner.setViewportSize({ width: 390, height: 844 });
    await owner.getByRole('button', { name: 'فتح قائمة الإدارة' }).click();
    const adminMenu = owner.getByRole('dialog', { name: 'قائمة إدارة ثنايا' });
    await adminMenu.waitFor({ state: 'visible' });
    await owner.keyboard.press('Escape');
    await adminMenu.waitFor({ state: 'hidden' });
    assert.equal(await owner.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false,
      'mobile admin workspace must not overflow horizontally');
    await captureReview(owner, 'admin-mobile-dark');
    await owner.setViewportSize({ width: 1440, height: 900 });
    console.log('PASS Playwright: owner login, admin access and session after reload');

    await owner.goto(base + '/admin/orders');
    const exportButton = owner.getByRole('button', { name: /تصدير كل الطلبات Excel/ });
    await exportButton.waitFor({ timeout: 15000 });
    const [excel] = await Promise.all([
      owner.waitForEvent('download', { timeout: 18000 }),
      exportButton.click(),
    ]);
    assert.match(excel.suggestedFilename(), /\.xlsx$/i, 'owner XLSX download has a spreadsheet filename');
    assert.equal(await excel.failure(), null, 'owner export completes without failure');
    console.log('PASS Playwright: private Excel orders export from admin button');

    // Upload a synthetic PNG from Chromium using the owner's HttpOnly session
    // and CSRF cookie. No permanent product or production image is created.
    const upload = await owner.evaluate(async () => {
      const proof = document.cookie.split(';').map(v => v.trim())
        .find(v => v.startsWith('thanaya_csrf='))?.split('=')[1];
      const raw = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO//lz8AAAAASUVORK5CYII=');
      const file = new File([Uint8Array.from(raw, ch => ch.charCodeAt(0))],
        'synthetic.png', { type: 'image/png' });
      const form = new FormData();
      form.append('image', file);
      const response = await fetch('/api/upload', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'X-Thanaya-CSRF': proof }, body: form,
      });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(upload.status, 200, JSON.stringify(upload.body));
    assert.match(upload.body.url, /^\/uploads\/[0-9a-f-]{36}\.png$/);
    assert.equal((await owner.request.get(base + upload.body.url)).status(), 200,
      'uploaded synthetic image must be reachable through Next rewrite');
    console.log('PASS Playwright: owner browser image upload with cookie/CSRF');

    // Exercise the actual ERP03 admin form in Chromium, including stock changes
    // on disposable SQLite only. Receipt and purchase IDs are synthetic.
    await owner.goto(base + '/admin/receiving?orderId=' + encodeURIComponent(receivingFixture.purchaseId));
    await owner.getByRole('heading', { name: 'استلام البضاعة من الموردين' }).waitFor({ timeout: 15000 });
    const plainField = owner.locator('fieldset').filter({ hasText: 'Browser Receipt Plain Product' });
    const lotField = owner.locator('fieldset').filter({ hasText: 'Browser Receipt Tracked Product' });
    await plainField.getByRole('spinbutton').fill('2');
    await lotField.getByRole('spinbutton').fill('1');
    await lotField.getByRole('textbox', { name: 'رقم التشغيلة' }).fill('CI-LOT-001');
    await lotField.getByLabel('تاريخ انتهاء الصلاحية').fill('2031-12-31');
    await owner.getByPlaceholder('مثلاً: سند تسليم المورد رقم 1254 وتاريخ الاستلام')
      .fill('CI test shipment 001');
    await owner.getByRole('button', { name: 'مراجعة سند الاستلام' }).click();
    await owner.getByText('راجع قبل التثبيت').waitFor();
    await owner.getByRole('button', { name: 'تأكيد الاستلام وتحديث المخزون' }).click();
    await owner.getByText('تم تسجيل البضاعة وتحديث المخزون بنجاح.').waitFor({ timeout: 18000 });
    const snapshot = await owner.evaluate(async orderId => {
      const response = await fetch('/api/receiving/purchase-orders/' + encodeURIComponent(orderId));
      return { status: response.status, body: await response.json() };
    }, receivingFixture.purchaseId);
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.receiptRevision, 1);
    assert.equal(snapshot.body.receipts.length, 1);
    assert.equal(snapshot.body.complete, false, 'partial shipment must not complete the order');
    const plainLine = snapshot.body.lines.find(line => line.productId === receivingFixture.plainId);
    const trackedLine = snapshot.body.lines.find(line => line.productId === receivingFixture.trackedId);
    assert.equal(plainLine.receivedQuantity, 2);
    assert.equal(plainLine.remainingQuantity, 3);
    assert.equal(trackedLine.receivedQuantity, 1);
    assert.equal(trackedLine.remainingQuantity, 1);
    assert.equal(trackedLine.lotTracking, true);
    console.log('PASS Playwright: owner goods receiving form, partial stock and tracked lot');

    // Place an order only in this disposable shop, then change its state from
    // the actual admin form and inspect its persisted staff timeline.
    const audited=await owner.evaluate(async productId=>{
      const proof=document.cookie.split(';').map(value=>value.trim())
        .find(value=>value.startsWith('thanaya_csrf='))?.split('=')[1];
      const response=await fetch('/api/orders',{
        method:'POST',headers:{'Content-Type':'application/json','X-Thanaya-CSRF':proof},
        body:JSON.stringify({requestId:crypto.randomUUID(),items:[{productId,quantity:1}],
          customer:{name:'زبون سجل تجريبي',phone:'07811111111',city:'البصرة',address:'عنوان صناعي لا يخص زبوناً'}}),
      });
      return {status:response.status,order:await response.json()};
    },receivingFixture.plainId);
    assert.equal(audited.status,201,JSON.stringify(audited));
    await owner.goto(base+'/admin/orders');
    await owner.getByRole('searchbox',{name:'البحث عن طلب بالرقم أو اسم الزبون أو الهاتف'}).fill(audited.order.id);
    await owner.getByRole('button',{name:'بحث',exact:true}).click();
    const auditCard=owner.locator('article.signature-order-card').filter({hasText:'زبون سجل تجريبي'});
    await auditCard.getByRole('button',{name:/الفاتورة وتفاصيل الطلب/}).click();
    const auditTimeline=auditCard.getByRole('region',{name:'سجل حالة الطلب'});
    await auditTimeline.getByText('تم إنشاء الطلب',{exact:true}).waitFor();
    await auditCard.getByRole('button',{name:'تغيير إلى مؤكد',exact:true}).click();
    const stateDialog=owner.getByRole('dialog',{name:'تأكيد تغيير حالة الطلب'});
    const actionNote='تمت مراجعة الطلب وتأكيد بيانات التوصيل';
    await stateDialog.getByRole('textbox',{name:'ملاحظة الإجراء (اختياري)'}).fill(actionNote);
    await stateDialog.getByRole('button',{name:'تأكيد تغيير الحالة',exact:true}).click();
    await stateDialog.waitFor({state:'hidden'});
    await auditTimeline.getByText(actionNote,{exact:true}).waitFor();
    assert.equal(await auditTimeline.getByText(/بواسطة Browser Test Owner/).count(),2);
    const recorded=await owner.evaluate(async id=>{
      const history=await (await fetch('/api/orders/'+encodeURIComponent(id)+'/history')).json();
      const ledger=await (await fetch('/api/finance/orders/'+encodeURIComponent(id))).json();
      return {events:history.events,collected:ledger.totals.collectedIqd};
    },audited.order.id);
    assert.equal(recorded.events.length,2);assert.equal(recorded.events[1].actorRole,'owner');
    assert.equal(recorded.events[1].reason,actionNote);assert.equal(recorded.collected,0);
    await owner.setViewportSize({width:390,height:844});
    assert.equal(await owner.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await captureReview(owner,'admin-order-timeline-mobile',auditTimeline);
    await owner.setViewportSize({width:1440,height:900});
    console.log('PASS Playwright: admin state confirmation stores the real actor/reason and refreshes the timeline without collecting money');

    await owner.goto(base+'/admin/payment-settings');
    const paymentLab=owner.getByRole('region',{name:'محاكي الدفع',exact:true});
    await paymentLab.getByRole('heading',{name:'محاكي الدفع — معاينة فقط'}).waitFor();
    await paymentLab.getByRole('combobox',{name:'طلب المعاينة',exact:true}).selectOption(audited.order.id);
    await paymentLab.getByRole('button',{name:'بدء محاولة تجريبية',exact:true}).click();
    const labStatus=paymentLab.getByRole('status',{name:'حالة المحاولة التجريبية',exact:true});
    await labStatus.getByText('بانتظار الدفع',{exact:true}).waitFor();
    await paymentLab.getByRole('button',{name:'محاكاة تفويض',exact:true}).click();
    await labStatus.getByText('مفوّض فقط؛ لم يدفع بعد',{exact:true}).waitFor();
    await paymentLab.getByRole('button',{name:'محاكاة دفع بإشعار مفقود',exact:true}).click();
    await paymentLab.getByText('تمت المحاكاة دون وصول الإشعار. استعلم لمطابقة الحالة.',{exact:true}).waitFor();
    await owner.reload();
    await labStatus.getByText('مفوّض فقط؛ لم يدفع بعد',{exact:true}).waitFor();
    await paymentLab.getByRole('button',{name:'الاستعلام ومطابقة الحالة',exact:true}).click();
    await labStatus.getByText('مدفوع تجريبياً',{exact:true}).waitFor();
    await paymentLab.getByRole('spinbutton',{name:'مبلغ الاسترداد التجريبي بالدينار',exact:true}).fill('10000');
    await paymentLab.getByRole('button',{name:'تأكيد استرداد تجريبي',exact:true}).click();
    await paymentLab.getByRole('status',{name:'مجموع الاسترداد التجريبي',exact:true}).getByText('10,000 د.ع',{exact:true}).waitFor();
    const untouched=await owner.evaluate(async id=>{
      const finance=await (await fetch('/api/finance/orders/'+id)).json();
      const order=await (await fetch('/api/orders/'+id)).json();
      return {collected:finance.totals.collectedIqd,refunded:finance.totals.refundedIqd,status:order.status};
    },audited.order.id);
    assert.deepEqual(untouched,{collected:0,refunded:0,status:'confirmed'});
    await owner.setViewportSize({width:390,height:844});
    assert.equal(await owner.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await captureReview(owner,'admin-payment-sandbox-mobile',paymentLab);
    await owner.setViewportSize({width:1440,height:900});
    console.log('PASS Playwright: owner payment sandbox form, authorization, lost callback, reload, reconciliation and refund; real order/cash unchanged');

    // ERP04: real owner-facing form creates a bill only after goods received,
    // then records an out-of-band supplier payment with a durable reference.
    await owner.goto(base + '/admin/payables');
    await owner.getByRole('heading', { name: 'فواتير الموردين والذمم' }).waitFor({ timeout: 16000 });
    await owner.getByRole('combobox', { name: 'أمر الشراء' }).selectOption(receivingFixture.purchaseId);
    await owner.getByText(/قيمة البضاعة المستلمة غير المفوترة: 98,000/).waitFor({ timeout: 16000 });
    await owner.getByRole('textbox', { name: 'رقم فاتورة المورد' }).fill('BROWSER-INV-01');
    await owner.getByRole('spinbutton', { name: 'القيمة بالدينار العراقي' }).fill('98000');
    await owner.getByRole('textbox', { name: 'مرجع الفاتورة / ملاحظة التحقق' }).fill('CI original invoice for supplier receipt');
    await owner.getByRole('button', { name: 'مراجعة الفاتورة' }).click();
    await owner.getByRole('button', { name: 'تأكيد تسجيل الفاتورة' }).click();
    await owner.getByText('تم تسجيل فاتورة المورد. لم يتم دفع أموال أو تغيير المخزون.').waitFor({ timeout: 18000 });
    const beforePayment = await owner.evaluate(async () => {
      const response=await fetch('/api/payables/invoices');
      const body=await response.json();
      return {status:response.status,body};
    });
    assert.equal(beforePayment.status,200);
    const invoice=beforePayment.body.invoices.find(x=>x.invoiceNumber==='BROWSER-INV-01');
    assert.ok(invoice, 'new supplier invoice must be visible to the owner');
    assert.equal(invoice.amountIqd,98000);
    assert.equal(invoice.remainingIqd,98000);
    await owner.getByRole('textbox', { name: 'ابحث برقم الفاتورة أو اسم المورد' })
      .fill('BROWSER-INV-01');
    await owner.getByRole('button', { name: 'بحث', exact: true }).click();
    await owner.getByText('1 فاتورة مطابقة للبحث.').waitFor({ timeout: 12000 });
    await owner.getByRole('spinbutton', { name: 'قيمة الدفعة المؤكدة' }).fill('30000');
    await owner.getByRole('textbox', { name: 'رقم الوصل أو مرجع التحويل' }).fill('CI bank transfer reference 1337');
    await owner.getByRole('button', { name: 'مراجعة الدفعة' }).click();
    await owner.getByRole('button', { name: 'تأكيد توثيق الدفعة' }).click();
    await owner.getByText('تم توثيق الدفعة التي سُددت خارج الموقع.').waitFor({ timeout: 18000 });
    const afterPayment=await owner.evaluate(async id => {
      const response=await fetch('/api/payables/invoices/'+encodeURIComponent(id));
      return {status:response.status,body:await response.json()};
    },invoice.id);
    assert.equal(afterPayment.status,200);
    assert.equal(afterPayment.body.paidIqd,30000);
    assert.equal(afterPayment.body.remainingIqd,68000);
    assert.equal(afterPayment.body.status,'partial');
    console.log('PASS Playwright: owner supplier invoice and partial payable from real admin forms');

    // ERP05 and ERP06: real admin browser pages, not just back-end JSON.
    await owner.goto(base + '/admin/reports');
    await owner.getByRole('heading', {
      name:'تكلفة البضاعة وهامش المبيعات الموثّق'
    }).waitFor({ timeout: 18000 });
    console.log('PASS Playwright: private merchandise COGS coverage is visible on reports screen');

    await owner.goto(base + '/admin/cash');
    await owner.getByRole('heading', { name:'المصاريف وحركة الصندوق' }).waitFor({ timeout: 18000 });
    await owner.getByRole('region', { name:'تقرير حركة النقد' }).waitFor();
    // Simulate out-of-order HTTP completion without writing any financial data.
    // A slow 7-day report must never replace the selected 90-day report.
    let releaseSeven, markSevenSeen, markSevenDone;
    const holdSeven = new Promise(resolve => { releaseSeven = resolve; });
    const sevenSeen = new Promise(resolve => { markSevenSeen = resolve; });
    const sevenDone = new Promise(resolve => { markSevenDone = resolve; });
    const completeWithin = async (promise, label) => {
      let timer;
      try {
        await Promise.race([promise,new Promise((_,reject) => {
          timer=setTimeout(() => reject(Error('Timed out waiting for '+label)),10000);
        })]);
      } finally { clearTimeout(timer); }
    };
    const fixture = (report, amount) => ({
      ...report, recordedExpenseIqd:amount, cashOutIqd:amount,
      netRecordedCashMovementIqd:-amount, expenseCount:1,
      components:{...report.components,cashOperatingExpensesIqd:amount},
    });
    const sevenPattern='**/api/cash/summary?range=7';
    const ninetyPattern='**/api/cash/summary?range=90';
    await owner.route(sevenPattern, async route => {
      const response=await route.fetch();
      const report=await response.json();
      markSevenSeen();
      await holdSeven;
      await route.fulfill({response,json:fixture(report,7000)});
      markSevenDone();
    });
    await owner.route(ninetyPattern, async route => {
      const response=await route.fetch();
      await route.fulfill({response,json:fixture(await response.json(),90000)});
    });
    try {
      await owner.getByRole('button', { name:'7 أيام', exact:true }).click();
      await completeWithin(sevenSeen,'the delayed 7-day report request');
      await owner.getByText('جاري تحميل تقرير الصندوق للفترة المحددة...').waitFor();
      assert.equal(await owner.getByRole('region', { name:'تقرير حركة النقد' }).count(),0,
        'old financial figures are hidden while the new range loads');
      await owner.getByRole('button', { name:'90 يوم', exact:true }).click();
      const report=owner.getByRole('region', { name:'تقرير حركة النقد' });
      await report.getByText('90,000 د.ع', { exact:true }).first().waitFor();
      releaseSeven();
      await completeWithin(sevenDone,'the obsolete 7-day report response');
      await owner.evaluate(() => new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await owner.getByRole('button', { name:'90 يوم',exact:true }).getAttribute('aria-pressed'),'true');
      await report.getByText('90,000 د.ع', { exact:true }).first().waitFor();
      assert.equal(await report.getByText('7,000 د.ع', { exact:true }).count(),0,
        'a completed stale report never overwrites the current range');
    } finally {
      releaseSeven();
      await owner.unroute(sevenPattern);
      await owner.unroute(ninetyPattern);
    }
    const realReport=owner.waitForResponse(response => response.url().endsWith('/api/cash/summary?range=30'));
    await owner.getByRole('button', { name:'30 يوم', exact:true }).click();
    await realReport;
    await owner.getByRole('region', { name:'تقرير حركة النقد' }).waitFor();
    console.log('PASS Playwright: cash period changes hide old figures and ignore a delayed obsolete report');
    const expenseForm=owner.locator('form').first();
    await expenseForm.getByRole('spinbutton', { name:'المبلغ بالدينار العراقي' }).fill('25000');
    await expenseForm.getByRole('textbox', { name:'مرجع الوصل أو المصروف' })
      .fill('CI-CASH-EXPENSE-001');
    await expenseForm.getByRole('textbox', { name:'وصف المصروف' })
      .fill('Browser test paid operating expense');
    await expenseForm.getByRole('button', { name:'مراجعة المصروف' }).click();
    await expenseForm.getByRole('button', { name:'تأكيد حفظ المصروف' }).click();
    await owner.getByText('تم حفظ المصروف المدفوع فعلياً.').waitFor({ timeout: 16000 });
    const drawerForm=owner.locator('form').nth(1);
    await drawerForm.getByRole('spinbutton', { name:'المبلغ بالدينار العراقي' }).fill('50000');
    await drawerForm.getByRole('textbox', { name:'مرجع الحركة' }).fill('CI-OWNER-CASH-001');
    await drawerForm.getByRole('textbox', { name:'سبب الحركة' })
      .fill('Browser test owner cash contribution');
    await drawerForm.getByRole('button', { name:'مراجعة حركة النقد' }).click();
    await drawerForm.getByRole('button', { name:'تأكيد حركة النقد' }).click();
    await owner.getByText('تم توثيق حركة النقد الخاصة بالمالك.').waitFor({ timeout: 16000 });
    const cashReport=await owner.evaluate(async()=>{
      const response=await fetch('/api/cash/summary?range=all');
      return {status:response.status,data:await response.json()};
    });
    assert.equal(cashReport.status,200);
    assert.equal(cashReport.data.recordedExpenseIqd,25000);
    assert.equal(cashReport.data.cashInIqd,50000);
    assert.equal(cashReport.data.cashOutIqd,25000);
    assert.equal(cashReport.data.netRecordedCashMovementIqd,25000);
    console.log('PASS Playwright: owner expense and cash-adjustment forms update real summary');
    await owner.goto(base + '/admin');
    const financial=owner.getByRole('region',{name:'المؤشرات المالية والتشغيلية',exact:true});
    const expenseFigure=()=>financial.getByRole('link',{name:/المصاريف التشغيلية المسجلة/});
    await expenseFigure().getByText('25,000 د.ع',{exact:true}).waitFor();
    await financial.getByRole('link',{name:/مستحقات الموردين الحالية/}).getByText('68,000 د.ع',{exact:true}).waitFor();
    await financial.getByRole('link',{name:/التحصيل الموثّق/}).getByText('0 د.ع',{exact:true}).waitFor();
    await financial.getByRole('region',{name:'حركة النقد وحدود الأرقام'}).getByText('25,000 د.ع',{exact:true}).waitFor();
    await financial.getByRole('region',{name:'تنبيهات صلاحية التشغيلات'}).waitFor();
    console.log('PASS Playwright: financial dashboard shows recorded expense, supplier dues, zero collections and cash movement from actual forms');

    let releaseOperations,seenOperations,doneOperations;
    const heldOperations=new Promise(resolve=>{releaseOperations=resolve;});
    const operationsSeen=new Promise(resolve=>{seenOperations=resolve;});
    const operationsDone=new Promise(resolve=>{doneOperations=resolve;});
    const opsSeven='**/api/reports/operations?range=7',opsNinety='**/api/reports/operations?range=90';
    await owner.route(opsSeven,async route=>{
      const response=await route.fetch(),report=await response.json();seenOperations();await heldOperations;
      try{if(!route.request().failure())await route.fulfill({response,json:{...report,period:{...report.period,expenseIqd:7000}}});}
      finally{doneOperations();}
    });
    await owner.route(opsNinety,async route=>{
      const response=await route.fetch(),report=await response.json();
      await route.fulfill({response,json:{...report,period:{...report.period,expenseIqd:90000}}});
    });
    try{
      await owner.getByRole('button',{name:'7 أيام',exact:true}).click();
      await completeWithin(operationsSeen,'delayed operations summary');
      await financial.getByText('جاري تحميل المؤشرات المالية للفترة المحددة...',{exact:true}).waitFor();
      assert.equal(await expenseFigure().count(),0,'old dashboard figures disappear during period loading');
      await owner.getByRole('button',{name:'90 يوم',exact:true}).click();
      await expenseFigure().getByText('90,000 د.ع',{exact:true}).waitFor();
      releaseOperations();await completeWithin(operationsDone,'cancelled or completed old operations summary');
      await owner.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(await financial.getByText('7,000 د.ع',{exact:true}).count(),0);
      await expenseFigure().getByText('90,000 د.ع',{exact:true}).waitFor();
    }finally{releaseOperations();await owner.unroute(opsSeven);await owner.unroute(opsNinety);}
    await owner.route(opsSeven,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'تعذر استخراج المؤشرات التجريبية مؤقتاً'})}));
    try{
      await owner.getByRole('button',{name:'7 أيام',exact:true}).click();
      await financial.getByRole('alert').getByText('تعذر استخراج المؤشرات التجريبية مؤقتاً',{exact:true}).waitFor();
      assert.equal(await expenseFigure().count(),0,'failed dashboard refresh never presents stale money figures');
    }finally{await owner.unroute(opsSeven);}
    await financial.getByRole('button',{name:'إعادة تحميل المؤشرات',exact:true}).click();
    await expenseFigure().getByText('25,000 د.ع',{exact:true}).waitFor();
    await owner.getByRole('button',{name:'30 يوم',exact:true}).click();
    await expenseFigure().getByText('25,000 د.ع',{exact:true}).waitFor();
    await owner.setViewportSize({width:390,height:844});
    assert.equal(await owner.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await captureReview(owner,'admin-financial-dashboard-mobile',financial);
    await owner.setViewportSize({width:768,height:1024});
    assert.equal(await owner.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await captureReview(owner,'admin-financial-dashboard-tablet',financial);
    await owner.setViewportSize({width:1440,height:900});
    console.log('PASS Playwright: dashboard ignores stale periods, hides failed figures, retries safely and fits mobile/tablet');
    await owner.getByRole('button', { name: 'خروج', exact: true }).first().click();
    await owner.waitForURL(/\/login(?:\?|$)/, { timeout: 15000 });
    assert.equal((await owner.evaluate(async () => (await fetch('/api/auth/me')).status)), 401);
    console.log('PASS Playwright: owner logout revokes browser access to workspace');
    await require('./product-gallery-browser.cjs').productGalleryBrowser(browser,base,receivingFixture);
    await require('./catalog-browser.cjs').catalogBrowser(browser,base);
    await require('./checkout-browser.cjs').checkoutBrowser(browser,base,{ownerEmail,ownerPassword,receivingFixture});
    await staff.close();
    if (failures.length) console.log('Browser nonfatal page errors count:', failures.length);
  } finally {
    await browser.close();
  }
}
module.exports = { playwrightBrowserSession };
