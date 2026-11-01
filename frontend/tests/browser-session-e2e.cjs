// Real Chromium E2E: registration, reload, IDOR, CSRF, owner admin, upload, XLSX, logout.
// All data and uploads live in a disposable /tmp SQLite fixture. Never runs against dev.db.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const backend = path.join(root, 'backend');
const frontend = path.join(root, 'frontend');
const temp = mkdtempSync(path.join(os.tmpdir(), 'thanaya-chromium-e2e-'));
const url = 'file:' + path.join(temp, 'browser.db');
const key = randomUUID() + randomUUID();
const port = 4000; // Next's existing /api rewrite uses 127.0.0.1:4000.
let api, site, browser, prisma;
let logs = '';

const delay = ms => new Promise(done => setTimeout(done, ms));
async function freePort() {
  const socket = net.createServer();
  await new Promise((ok, fail) => socket.once('error', fail).listen(0, '127.0.0.1', ok));
  const n = socket.address().port;
  await new Promise(ok => socket.close(ok));
  return n;
}
async function assertBackendFree() {
  const socket = net.createServer();
  await new Promise((ok, fail) => socket.once('error', fail).listen(port, '127.0.0.1', ok));
  await new Promise(ok => socket.close(ok));
}
function start(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', chunk => { logs = (logs + String(chunk)).slice(-7000); });
  return child;
}
async function waitReady(address, child) {
  for (let attempt = 0; attempt < 95; attempt++) {
    if (child.exitCode !== null) throw Error('server exited: ' + logs);
    try {
      const res = await fetch(address, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {}
    await delay(230);
  }
  throw Error('server never became ready: ' + address + '\n' + logs);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const done = once(child, 'exit');
  child.kill('SIGTERM');
  await Promise.race([done, delay(3000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
async function browserRegister(page, email) {
  await page.goto(page.baseURL + '/register');
  await page.getByPlaceholder('أحمد محمد').fill('Browser E2E Customer');
  await page.getByPlaceholder('example@email.com').fill(email);
  await page.getByPlaceholder('07822088894').fill('07812345678');
  await page.getByPlaceholder('8 أحرف على الأقل').fill('BrowserSecure#2026');
  await page.getByPlaceholder('أعد كتابة كلمة المرور').fill('BrowserSecure#2026');
  await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).click();
  await page.waitForURL('**/account', { timeout: 20000 });
  await page.getByRole('heading', { name: /أهلاً/ }).waitFor({ timeout: 16000 });
}
async function browserLogin(page, email, password) {
  await page.goto(page.baseURL + '/login');
  await page.getByPlaceholder('example@email.com').fill(email);
  await page.getByPlaceholder('6 أحرف على الأقل').fill(password);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await page.waitForURL(/\/(?:admin|account)(?:$|[/?])/, { timeout: 20000 });
}
async function checkCookieStorage(page) {
  const names = await page.context().cookies();
  const session = names.find(x => x.name === 'thanaya_session');
  const csrf = names.find(x => x.name === 'thanaya_csrf');
  assert.ok(session && csrf, 'real Chromium must persist both authentication cookies');
  assert.equal(session.httpOnly, true, 'session cookie is invisible to browser JS');
  assert.equal(csrf.httpOnly, false, 'CSRF proof is readable for safe header');
  assert.equal(session.sameSite, 'Lax');
  const exposed = await page.evaluate(() => ({
    jsSession: document.cookie.includes('thanaya_session'),
    oldToken: localStorage.getItem('thanaya-token'),
    oldUser: localStorage.getItem('thanaya-current-user'),
  }));
  assert.equal(exposed.jsSession, false, 'document.cookie cannot see the session JWT');
  assert.equal(exposed.oldToken, null, 'no bearer JWT can be stored in localStorage');
  assert.equal(exposed.oldUser, null, 'do not trust locally stored roles');
}
async function apiFromBrowser(page, pathname, options = {}) {
  return page.evaluate(async ({ pathname, options }) => {
    const response = await fetch(pathname, { credentials: 'same-origin', ...options });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('json') ? await response.json() : null;
    return { status: response.status, data, type };
  }, { pathname, options });
}

async function run() {
  if (process.env.NODE_ENV !== 'test' || !url.startsWith('file:' + temp + path.sep)) {
    throw Error('Refusing to test any database except the new disposable SQLite fixture');
  }
  await assertBackendFree(); // Cannot hit a locally running real shop on :4000.
  const webPort = await freePort();
  const base = 'http://127.0.0.1:' + webPort;
  const env = {
    ...process.env, NODE_ENV: 'test', DATABASE_URL: url, JWT_SECRET: key,
    THANAYA_UPLOAD_DIR: path.join(temp, 'uploaded'),
    CORS_ALLOWED_ORIGINS: base, PORT: String(port),
  };
  const migration = spawnSync(path.join(backend, 'node_modules/.bin/prisma'),
    ['db', 'push', '--skip-generate'], { cwd: backend, env, encoding: 'utf8', timeout: 90000 });
  if (migration.status !== 0) throw Error('Temporary database failed to initialize: ' + (migration.stderr || migration.stdout));

  // Seed owner role only in disposable SQLite, not in the user's Mac database.
  const { PrismaClient } = require(path.join(backend, 'node_modules/@prisma/client'));
  const bcrypt = require(path.join(backend, 'node_modules/bcryptjs'));
  prisma = new PrismaClient({ datasources: { db: { url } } });
  const ownerEmail = 'e2e.owner.' + randomUUID() + '@test.invalid';
  const ownerPassword = 'OwnerOnly#2026';
  await prisma.user.create({
    data: { name: 'Browser Test Owner', email: ownerEmail, phone: '07812345679',
      password: await bcrypt.hash(ownerPassword, 10), role: 'owner' }
  });
  await prisma.$disconnect();
  prisma = null;

  api = start(process.execPath, ['dist/index.js'], backend, env);
  await waitReady('http://127.0.0.1:' + port + '/api/health', api);
  site = start(process.execPath,
    [path.join(frontend, 'node_modules/next/dist/bin/next'), 'start',
      '--hostname', '127.0.0.1', '--port', String(webPort)],
    frontend, { ...env, NODE_ENV: 'production' });
  await waitReady(base + '/terms', site);

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const customer = await context1.newPage();
  customer.baseURL = base;
  const customerEmail = 'browser.one.' + randomUUID() + '@test.invalid';
  await browserRegister(customer, customerEmail);
  await checkCookieStorage(customer);
  console.log('PASS Browser: registration and HttpOnly cookie persisted');

  await customer.reload();
  await customer.getByRole('heading', { name: /أهلاً/ }).waitFor({ timeout: 16000 });
  assert.equal((await apiFromBrowser(customer, '/api/orders/mine')).status, 200);
  console.log('PASS Browser: session restores after full page reload');

  await customer.getByRole('button', { name: 'إضافة عنوان', exact: true }).click();
  await customer.getByLabel('اسم العنوان (مثل البيت أو العيادة)').fill('E2E clinic');
  await customer.getByLabel('اسم المستلم').fill('E2E Customer');
  await customer.getByLabel('رقم الموبايل').fill('07812345678');
  await customer.getByLabel('المحافظة').selectOption('البصرة');
  await customer.getByLabel('العنوان التفصيلي').fill('اختبار معزول لعنوان عيادة بالبصرة');
  await customer.getByRole('button', { name: 'حفظ العنوان', exact: true }).click();
  await customer.getByText('انحفظ العنوان بنجاح').waitFor({ timeout: 14000 });
  const ownAddresses = await apiFromBrowser(customer, '/api/addresses');
  assert.equal(ownAddresses.status, 200);
  assert.equal(ownAddresses.data.length, 1);
  const addressId = ownAddresses.data[0].id;
  console.log('PASS Browser: saved address form and CSRF write flow');

  const noProof = await apiFromBrowser(customer, '/api/addresses', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'forged' }),
  });
  assert.equal(noProof.status, 403);
  const crossSite = await apiFromBrowser(customer, '/api/addresses', {
    method: 'POST', headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json',
      'X-Thanaya-CSRF': 'fake' }, body: JSON.stringify({ label: 'forged' }),
  });
  assert.equal(crossSite.status, 403);
  console.log('PASS Browser: CSRF and forged-origin writes rejected');

  const context2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const stranger = await context2.newPage();
  stranger.baseURL = base;
  await browserRegister(stranger, 'browser.two.' + randomUUID() + '@test.invalid');
  const strangersAddresses = await apiFromBrowser(stranger, '/api/addresses');
  assert.equal(strangersAddresses.status, 200);
  assert.deepEqual(strangersAddresses.data, []);
  const forbiddenEdit = await apiFromBrowser(stranger, '/api/addresses/' + addressId, {
    method: 'DELETE',
    headers: { 'X-Thanaya-CSRF': await stranger.evaluate(() =>
      document.cookie.split('; ').find(x => x.startsWith('thanaya_csrf='))?.split('=')[1] || '') },
  });
  assert.equal(forbiddenEdit.status, 404, 'a second real browser may not delete another customer address');
  await stranger.goto(base + '/admin');
  await stranger.waitForURL(url => !url.pathname.startsWith('/admin'), { timeout: 18000 });
  assert.equal((await apiFromBrowser(stranger, '/api/exports/inventory')).status, 403);
  console.log('PASS Browser: independent customer cookie isolation, mobile viewport and admin guard');

  // Logout must clear both cookies in a real browser, not just clear client UI.
  await customer.goto(base + '/account');
  await customer.getByRole('button', { name: 'خروج', exact: true }).first().click();
  await customer.waitForURL(/\/login(?:\?|$)/, { timeout: 18000 });
  const afterLogoutCookies = await context1.cookies();
  assert.equal(afterLogoutCookies.some(x => x.name === 'thanaya_session'), false);
  await customer.reload();
  const unauthorized = await apiFromBrowser(customer, '/api/auth/me');
  assert.equal(unauthorized.status, 401);
  console.log('PASS Browser: real logout removes session, reload remains unauthenticated');

  const staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const owner = await staffContext.newPage();
  owner.baseURL = base;
  await browserLogin(owner, ownerEmail, ownerPassword);
  await owner.goto(base + '/admin');
  await owner.getByText('لوحة التحكم', { exact: true }).first().waitFor({ timeout: 16000 });
  await checkCookieStorage(owner);
  await owner.reload();
  await owner.getByText('لوحة التحكم', { exact: true }).first().waitFor({ timeout: 16000 });
  await owner.goto(base + '/admin/orders');
  await owner.getByRole('button', { name: 'تصدير كل الطلبات Excel' }).waitFor({ timeout: 16000 });
  const [download] = await Promise.all([
    owner.waitForEvent('download', { timeout: 18000 }),
    owner.getByRole('button', { name: 'تصدير كل الطلبات Excel' }).click(),
  ]);
  assert.match(download.suggestedFilename(), /\.xlsx$/i);
  console.log('PASS Browser: owner login, dashboard reload and XLSX export download');

  // Upload is performed by a real Chromium fetch with browser-owned credentials.
  // This exercises multipart CSRF + role authorization without adding a fake catalog item.
  const upload = await owner.evaluate(async () => {
    const csrf = document.cookie.split('; ').find(x => x.startsWith('thanaya_csrf='))?.split('=')[1];
    const raw = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO//lz8AAAAASUVORK5CYII=');
    const bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0));
    const form = new FormData();
    form.append('image', new File([bytes], 'test.png', { type: 'image/png' }));
    const response = await fetch('/api/upload', {
      method: 'POST', credentials: 'same-origin', headers: { 'X-Thanaya-CSRF': csrf }, body: form
    });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(upload.status, 200, JSON.stringify(upload.body));
  assert.match(upload.body.url, /^\/uploads\/[0-9a-f-]{36}\.png$/);
  assert.equal((await owner.request.get(base + upload.body.url)).status(), 200);
  console.log('PASS Browser: owner authenticated multipart image upload and media delivery');

  await owner.goto(base + '/admin');
  await owner.getByRole('button', { name: 'خروج', exact: true }).first().click();
  await owner.waitForURL(/\/login(?:\?|$)/, { timeout: 18000 });
  assert.equal((await apiFromBrowser(owner, '/api/auth/me')).status, 401);
  console.log('PASS Browser: owner logout removes privileged session');

  await context1.close(); await context2.close(); await staffContext.close();
  console.log('ALL CHROMIUM BROWSER SECURITY E2E CHECKS PASSED (TEMP DB ONLY)');
}

run().catch(err => {
  console.error('BROWSER E2E FAILED: ', err?.stack || err);
  console.error('SERVER LOG TAIL: ', logs);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => {});
  await stop(site); await stop(api);
  if (prisma) await prisma.$disconnect();
  rmSync(temp, { recursive: true, force: true });
});
