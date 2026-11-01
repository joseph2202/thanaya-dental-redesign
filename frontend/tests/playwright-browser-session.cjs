// Headless Chrome through Playwright Core (installed only in isolated CI).
// Uses the already running temporary SQLite API and production Next.js server.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright-core');

async function playwrightBrowserSession(base) {
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

    await page.locator('button.thanaya-header-logout-link').click();
    await page.waitForURL(/\/login(?:\?|$)/, { timeout: 15000 });
    assert.equal((await page.evaluate(async () => (await fetch('/api/auth/me')).status)), 401);
    assert.equal((await context.cookies()).some(c => c.name === 'thanaya_session'), false);
    console.log('PASS Playwright: real logout and session deletion');
    await context.close();
    if (failures.length) console.log('Browser nonfatal page errors count:', failures.length);
  } finally {
    await browser.close();
  }
}
module.exports = { playwrightBrowserSession };
