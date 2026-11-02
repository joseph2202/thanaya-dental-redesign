// Full-stack HTTP smoke through the REAL Next.js /api rewrite to Express.
// Runs on GitHub Actions with a throwaway SQLite database and random test users.
// No customer DB, stored credentials, production server, or external deployment.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { once } = require('node:events');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const backend = path.join(root, 'backend');
const frontend = path.join(root, 'frontend');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'thanaya-fullstack-auth-'));
const dbPath = path.join(scratch, 'test.db');
const db = 'file:' + dbPath;
const jwtSecret = randomUUID() + randomUUID();
const apiPort = 4000; // next.config.ts has an explicit loopback rewrite to this port.
let apiProcess;
let shopProcess;
let logs = '';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function availablePort() {
  const server = net.createServer();
  await new Promise((ok, reject) => server.once('error', reject).listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  await new Promise(ok => server.close(ok));
  return port;
}
async function ensureBackendPortFree() {
  const server = net.createServer();
  await new Promise((ok, reject) => server.once('error', reject).listen(apiPort, '127.0.0.1', ok));
  await new Promise(ok => server.close(ok));
}
async function ready(url, proc) {
  for (let count = 0; count < 100; count++) {
    if (proc.exitCode !== null) throw Error('test server died: ' + logs);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await delay(220);
  }
  throw Error('test server did not start: ' + url + '\n' + logs);
}
function start(command, args, cwd, env) {
  const proc = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [proc.stdout, proc.stderr]) {
    stream.on('data', chunk => { logs = (logs + String(chunk)).slice(-6000); });
  }
  return proc;
}
async function stop(proc) {
  if (!proc || proc.exitCode !== null) return;
  const exited = once(proc, 'exit');
  proc.kill('SIGTERM');
  await Promise.race([exited, delay(3000)]);
  if (proc.exitCode === null) proc.kill('SIGKILL');
}
async function jsonRequest(base, route, options = {}) {
  const response = await fetch(base + route, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
  });
  let body;
  if (response.status !== 204) {
    const content = await response.text();
    try { body = JSON.parse(content); }
    catch { throw Error(route + ' returned non-JSON ' + response.status + ': ' + content.slice(0, 140)); }
  }
  return { status: response.status, body, headers: response.headers };
}

async function main() {
  if (process.env.NODE_ENV !== 'test' || !dbPath.startsWith(scratch + path.sep)) {
    throw Error('Full-stack smoke is restricted to an isolated temporary database');
  }
  // Hard-fail if some other server is already running on the Next.js rewrite port:
  // never test against (or accidentally mutate) a real local store.
  await ensureBackendPortFree();
  const webPort = await availablePort();
  const base = 'http://127.0.0.1:' + webPort;
  const runEnv = {
    ...process.env,
    DATABASE_URL: db,
    JWT_SECRET: jwtSecret,
    NODE_ENV: 'test',
    THANAYA_UPLOAD_DIR: path.join(scratch, 'uploads'),
    CORS_ALLOWED_ORIGINS: base,
    PORT: String(apiPort),
  };
  const prisma = spawnSync(path.join(backend, 'node_modules/.bin/prisma'),
    ['db', 'push', '--skip-generate'], {
      cwd: backend, env: runEnv, timeout: 90000, encoding: 'utf8'
    });
  if (prisma.status !== 0) throw Error('Isolated Prisma initialization failed: ' + (prisma.stderr || prisma.stdout));

  // Seed an owner only in disposable SQLite for browser permission checks.
  const { PrismaClient } = require(path.join(backend, 'node_modules', '@prisma', 'client'));
  const bcrypt = require(path.join(backend, 'node_modules', 'bcryptjs'));
  const ownerEmail = 'e2e-owner-' + randomUUID() + '@test.invalid';
  const ownerPassword = 'IsolatedOwner#2026';
  let receivingFixture;
  const prismaClient = new PrismaClient({ datasources: { db: { url: db } } });
  try {
    const owner = await prismaClient.user.create({ data: {
      name: 'Browser Test Owner',
      email: ownerEmail,
      phone: '07811111111',
      password: await bcrypt.hash(ownerPassword, 10),
      role: 'owner'
    } });
    const supplier = await prismaClient.supplier.create({
      data: { code: 'CI-BROWSER-RECEIPT', name: 'Isolated test supplier' }
    });
    const regular = await prismaClient.product.create({ data: {
      name: 'Browser Receipt Plain Product',
      description: 'disposable browser fixture', price: 40000, usdPrice: 1,
      category: 'Dental', brand: 'CI', icon: 'Package', stock: 3
    } });
    const tracked = await prismaClient.product.create({ data: {
      name: 'Browser Receipt Tracked Product',
      description: 'disposable browser fixture', price: 90000, usdPrice: 1,
      category: 'Dental', brand: 'CI', icon: 'Package', stock: 0, lotTracking: true
    } });
    const purchase = await prismaClient.purchaseOrder.create({ data: {
      requestId: randomUUID(), supplierId: supplier.id, createdById: owner.id,
      status: 'ordered',
      lines: { create: [
        { productId: regular.id, productName: regular.name, quantity: 5, unitCostIqd: 21000 },
        { productId: tracked.id, productName: tracked.name, quantity: 2, unitCostIqd: 56000 }
      ] }
    } });
    receivingFixture = {
      purchaseId: purchase.id, plainId: regular.id, trackedId: tracked.id
    };
  } finally {
    await prismaClient.$disconnect();
  }

  apiProcess = start(process.execPath, ['dist/index.js'], backend, runEnv);
  await ready('http://127.0.0.1:' + apiPort + '/api/health', apiProcess);

  // Next.js is the only site origin the test client ever contacts.
  shopProcess = start(process.execPath,
    [path.join(frontend, 'node_modules/next/dist/bin/next'), 'start',
      '--hostname', '127.0.0.1', '--port', String(webPort)],
    frontend, { ...runEnv, NODE_ENV: 'production' });
  await ready(base + '/terms', shopProcess);

  const html = await fetch(base + '/login', { signal: AbortSignal.timeout(12000) });
  assert.equal(html.status, 200, 'storefront must render behind Next.js');
  assert.equal(html.headers.get('x-frame-options'), 'DENY');
  const registration = await jsonRequest(base, '/api/auth/register', {
    method: 'POST',
    headers: { Origin: base, 'X-Thanaya-Auth-Mode': 'cookie', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Full stack tester', email: 'fullstack.' + randomUUID() + '@test.invalid',
      phone: '07812345678', password: 'StrongPassword!2026',
    }),
  });
  assert.equal(registration.status, 200, JSON.stringify(registration.body));
  assert.equal(registration.body.user.role, 'customer');
  assert.equal('token' in registration.body, false, 'browser must never receive JWT in JSON');
  const setCookies = registration.headers.getSetCookie();
  assert.equal(setCookies.length, 2, 'Next.js must forward both session and CSRF cookies');
  const sessionCookie = setCookies.find(v => v.startsWith('thanaya_session='));
  const csrfCookie = setCookies.find(v => v.startsWith('thanaya_csrf='));
  assert.ok(sessionCookie && csrfCookie, 'both cookies must survive same-origin reverse proxy');
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /SameSite=Lax/i);
  assert.doesNotMatch(csrfCookie, /HttpOnly/i);
  const cookie = [sessionCookie, csrfCookie].map(v => v.split(';')[0]).join('; ');
  const csrf = csrfCookie.split(';')[0].split('=')[1];
  assert.ok(csrf);

  const me = await jsonRequest(base, '/api/auth/me', { headers: { Cookie: cookie } });
  assert.equal(me.status, 200, 'session cookie must pass through Next rewrite on reload');
  assert.equal(me.body.id, registration.body.user.id);
  const mine = await jsonRequest(base, '/api/orders/mine', { headers: { Cookie: cookie } });
  assert.equal(mine.status, 200, 'private orders must authenticate using cookie');
  assert.deepEqual(mine.body, []);

  const address = {
    label: 'Test address', name: 'Full Stack Tester', phone: '07812345678',
    city: 'البصرة', address: 'عنوان اختبار آمن لا يخص أي زبون',
  };
  const write = headers => jsonRequest(base, '/api/addresses', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(address),
  });
  assert.equal((await write({})).status, 403, 'unsafe cookie mutation needs CSRF proof');
  assert.equal((await write({ 'X-Thanaya-CSRF': 'wrong' })).status, 403);
  assert.equal((await write({ 'Origin': 'https://attacker.invalid', 'X-Thanaya-CSRF': csrf })).status, 403);
  const saved = await write({ 'X-Thanaya-CSRF': csrf });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  assert.equal(saved.body.userId, registration.body.user.id);
  const after = await jsonRequest(base, '/api/addresses', { headers: { Cookie: cookie } });
  assert.equal(after.status, 200);
  assert.equal(after.body.length, 1);

  // A customer cookie must never escalate to staff-only exports or operations.
  assert.equal((await jsonRequest(base, '/api/exports/inventory', { headers: { Cookie: cookie } })).status, 403);
  const logout = await jsonRequest(base, '/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base, 'X-Thanaya-CSRF': csrf },
  });
  assert.equal(logout.status, 204);
  assert.equal(logout.headers.getSetCookie().length, 2, 'logout clears both cookie names');
  assert.equal((await jsonRequest(base, '/api/auth/me')).status, 401,
    'browser with cleared cookies has no session');
  // A stolen stateless JWT is *not* revoked by this logout. Document this caveat.
  console.log('PASS: full-stack Next rewrite, HttpOnly cookie, customer isolation, CSRF, logout');

  // Exercise an actual headless Chrome tab with React forms and real cookies.
  // Reuses the disposable SQLite database and isolated Next/API servers above.
  await require('./playwright-browser-session.cjs').playwrightBrowserSession(base, { ownerEmail, ownerPassword, receivingFixture });
}

main().catch(error => { console.error(error, logs); process.exitCode = 1; })
  .finally(async () => {
    await stop(shopProcess);
    await stop(apiProcess);
    rmSync(scratch, { recursive: true, force: true });
  });
