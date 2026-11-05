// Headless Chrome through Playwright Core (installed only in isolated CI).
// Uses the already running temporary SQLite API and production Next.js server.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { mkdir } = require('node:fs/promises');
const { chromium } = require('playwright-core');

async function captureReview(page, name) {
  const directory = process.env.THANAYA_QA_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, name + '.png') });
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
    await owner.getByRole('button', { name: 'خروج', exact: true }).first().click();
    await owner.waitForURL(/\/login(?:\?|$)/, { timeout: 15000 });
    assert.equal((await owner.evaluate(async () => (await fetch('/api/auth/me')).status)), 401);
    console.log('PASS Playwright: owner logout revokes browser access to workspace');
    await staff.close();
    if (failures.length) console.log('Browser nonfatal page errors count:', failures.length);
  } finally {
    await browser.close();
  }
}
module.exports = { playwrightBrowserSession };
