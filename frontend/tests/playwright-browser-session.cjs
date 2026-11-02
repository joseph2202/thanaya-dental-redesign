// Headless Chrome through Playwright Core (installed only in isolated CI).
// Uses the already running temporary SQLite API and production Next.js server.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright-core');

async function playwrightBrowserSession(base, { ownerEmail, ownerPassword }) {
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
