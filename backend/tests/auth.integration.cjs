// These security checks use a throwaway SQLite database in /tmp, NEVER dev.db.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, readdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');

const cwd = path.resolve(__dirname, '..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'thanaya-auth-'));
const url = 'file:' + path.join(scratch, 'isolated.db');
const secret = randomUUID() + randomUUID();
const uploadDir = path.join(scratch, 'isolated-uploads');
const env = { ...process.env, DATABASE_URL: url, JWT_SECRET: secret, NODE_ENV: 'test', THANAYA_UPLOAD_DIR: uploadDir };
let server, prisma;

async function openPort() {
  const s = net.createServer();
  await new Promise((ok, fail) => s.once('error', fail).listen(0, '127.0.0.1', ok));
  const n = s.address().port;
  await new Promise(ok => s.close(ok));
  return n;
}

async function request(base, route, method = 'GET', body, token, origin) {
  const result = await fetch(base + route, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  return { status: result.status, body: await result.json(), headers: result.headers };
}

async function ready(base) {
  for (let n = 0; n < 70; n++) {
    if (server.exitCode !== null) throw Error('Server exited unexpectedly');
    try { if ((await fetch(base + '/api/health', { signal: AbortSignal.timeout(800) })).ok) return; }
    catch {}
    await new Promise(ok => setTimeout(ok, 200));
  }
  throw Error('API failed to start');
}

async function main() {
  const command = spawnSync(path.join(cwd, 'node_modules/.bin/prisma'), [
    'db', 'push', '--skip-generate'
  ], { cwd, env, encoding: 'utf8', timeout: 90000 });
  if (command.status !== 0) throw Error(command.stderr || command.stdout);

  // Critical: set the current Node process environment as well as the child
  // API process. Otherwise PrismaClient may silently use backend/.env (dev.db).
  process.env.DATABASE_URL = url;
  if (process.env.DATABASE_URL !== env.DATABASE_URL || !url.startsWith('file:' + scratch + path.sep)) {
    throw Error('Refusing to run auth tests outside the isolated temporary database');
  }
  const { PrismaClient } = require('@prisma/client');
  const bcrypt = require('bcryptjs');
  // Pin the URL a second time at the Prisma constructor, independent of .env.
  prisma = new PrismaClient({ datasources: { db: { url } } });
  if (await prisma.user.count() !== 0) {
    throw Error('Auth test database must be empty before creating fixtures');
  }
  await prisma.user.create({
    data: {
      name: 'Legacy owner', email: 'Legacy.Owner@Test.invalid', phone: '07812345678',
      password: await bcrypt.hash('legacy6', 10), role: 'owner'
    }
  });

  // Weak production signing secrets must stop startup; never test this on a live process.
  const { getJwtSecret } = require('../dist/config/auth');
  const previousNodeEnv = process.env.NODE_ENV;
  const previousJwtSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'short-unsafe-secret';
    assert.throws(() => getJwtSecret(), /at least 32 bytes/, 'weak production secret must fail closed');
    process.env.JWT_SECRET = secret;
    assert.equal(getJwtSecret(), secret, 'strong production secret is accepted');
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
  console.log('PASS: production secrets are checked without affecting local development');

  const port = await openPort();
  const base = 'http://127.0.0.1:' + port;
  let logs = '';
  server = spawn(process.execPath, ['dist/index.js'], {
    cwd, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  for (const output of [server.stdout, server.stderr]) {
    output.on('data', chunk => { logs = (logs + chunk.toString()).slice(-4000); });
  }
  try { await ready(base); } catch (e) { throw Error(e.message + '\n' + logs); }

  const expected = async (message, route, method, body, status, token) => {
    const actual = await request(base, route, method, body, token);
    assert.equal(actual.status, status, message + ': ' + JSON.stringify(actual.body));
    console.log('PASS:', message);
    return actual;
  };

  await expected('missing signup fields rejected', '/api/auth/register', 'POST', {}, 400);
  await expected('weak new password rejected', '/api/auth/register', 'POST',
    { name: 'New Tester', email: 'newuser@example.test', phone: '07812345678', password: '123456' }, 400);
  await expected('invalid phone rejected', '/api/auth/register', 'POST',
    { name: 'New Tester', email: 'newuser@example.test', phone: '123', password: 'LongerPass2026' }, 400);
  await expected('malformed login rejected without crashing', '/api/auth/login', 'POST', {}, 400);

  const registration = await expected('valid signup with normalized email', '/api/auth/register', 'POST',
    { name: 'New Tester', email: ' NewUser@Example.test ', phone: '07812345678', password: 'LongerPass2026' }, 200);
  assert.equal(registration.body.user.email, 'newuser@example.test');
  assert.equal(registration.body.user.role, 'customer');
  assert.equal(registration.headers.get('cache-control'), 'no-store',
    'auth responses must never be HTTP-cached');
  assert.equal(await prisma.user.count(), 2);

  await expected('duplicate signup rejected', '/api/auth/register', 'POST',
    { name: 'Other Tester', email: 'newuser@example.test', phone: '07812345678', password: 'LongerPass2026' }, 400);

  const login = await expected('new account can sign in', '/api/auth/login', 'POST',
    { email: 'newuser@example.test', password: 'LongerPass2026' }, 200);
  await expected('token can refresh account securely', '/api/auth/me', 'GET', undefined, 200, login.body.token);
  const jwt = require('jsonwebtoken');
  const alternateAlgorithmToken = jwt.sign(
    { userId: registration.body.user.id, role: 'owner' }, secret,
    { algorithm: 'HS384', expiresIn: '1h' }
  );
  await expected('HS384 token rejected for session validation',
    '/api/auth/me', 'GET', undefined, 401, alternateAlgorithmToken);
  await expected('HS384 token rejected for staff-only API',
    '/api/users', 'GET', undefined, 401, alternateAlgorithmToken);
  await expected('HS384 token rejected for customer orders',
    '/api/orders/mine', 'GET', undefined, 401, alternateAlgorithmToken);
  await expected('HS384 token rejected for saved addresses',
    '/api/addresses', 'GET', undefined, 401, alternateAlgorithmToken);
  await expected('HS384 token rejected for notifications',
    '/api/notifications', 'GET', undefined, 401, alternateAlgorithmToken);
  console.log('PASS: staff cannot be elevated using unsupported JWT signing algorithms');
  await expected('missing session is unauthorized', '/api/auth/me', 'GET', undefined, 401);

  const legacy = await expected('legacy owner with short existing password can still sign in',
    '/api/auth/login', 'POST', { email: 'Legacy.Owner@Test.invalid', password: 'legacy6' }, 200);
  assert.equal(legacy.body.user.role, 'owner');

  // All test uploads go under scratch, never a real backend/uploads directory.
  const postImage = async (token, bytes, mime) => {
    const data = new FormData();
    data.append('image', new Blob([bytes], { type: mime }), 'image.png');
    const result = await fetch(base + '/api/upload', {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      body: data,
      signal: AbortSignal.timeout(12000),
    });
    return { status: result.status, body: await result.json(), headers: result.headers };
  };
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO//lz8AAAAASUVORK5CYII=',
    'base64'
  );
  assert.equal((await postImage(null, tinyPng, 'image/png')).status, 401,
    'unauthenticated uploads must be blocked');
  assert.equal((await postImage(login.body.token, tinyPng, 'image/png')).status, 403,
    'regular customers must not upload catalog images');

  const spoofedImage = await postImage(legacy.body.token, Buffer.from('not a real png'), 'image/png');
  assert.equal(spoofedImage.status, 400, 'files spoofing an image MIME type must be rejected');
  assert.equal(readdirSync(uploadDir).length, 0,
    'rejected image must be deleted from isolated upload directory');

  const validImage = await postImage(legacy.body.token, tinyPng, 'image/png');
  assert.equal(validImage.status, 200, JSON.stringify(validImage.body));
  assert.match(validImage.body.url, /^\/uploads\/[0-9a-f-]{36}\.png$/,
    'image URL must be same-origin, opaque and independent from local server ports');
  const imagePath = path.join(uploadDir, path.basename(validImage.body.url));
  assert.deepEqual(readFileSync(imagePath), tinyPng, 'uploaded bytes match source image');
  const publiclyServed = await fetch(base + validImage.body.url);
  assert.equal(publiclyServed.status, 200);
  assert.match(publiclyServed.headers.get('content-type') || '', /^image\/png/);
  console.log('PASS: upload access control, signature validation and isolated same-origin image URL');


  for (let attempt = 1; attempt <= 10; attempt++) {
    const result = await request(base, '/api/auth/login', 'POST',
      { email: 'newuser@example.test', password: 'badpassword' });
    assert.equal(result.status, 401, 'failed login #' + attempt);
  }
  console.log('PASS: first 10 incorrect passwords are rejected');
  const locked = await request(base, '/api/auth/login', 'POST',
    { email: 'newuser@example.test', password: 'LongerPass2026' });
  assert.equal(locked.status, 429, 'repeated guesses must be throttled');
  assert.ok(Number(locked.headers.get('retry-after')) > 0);
  console.log('PASS: subsequent attempt is throttled with Retry-After');

  await expected('other user can still sign in after unrelated lockout',
    '/api/auth/login', 'POST', { email: 'Legacy.Owner@Test.invalid', password: 'legacy6' }, 200);

  const foreign = await request(base, '/api/health', 'GET', undefined, undefined, 'https://untrusted.example');
  assert.equal(foreign.headers.get('access-control-allow-origin'), null,
    'untrusted origins must not be granted CORS');
  const unknownRoute = await request(base, '/api/unknown-private-service', 'GET');
  assert.equal(unknownRoute.status, 404);
  assert.equal(typeof unknownRoute.body.error, 'string');
  assert.equal(/backend|prisma|stack|terminal|trace/i.test(unknownRoute.body.error), false,
    'API error responses must not expose internal development information');
  console.log('PASS: unknown API routes return safe public errors');
  const publicHealth=await request(base,'/api/health','GET');
  assert.notEqual(publicHealth.headers.get('cache-control'),'no-store',
    'public health endpoint does not require private cache policy');
  const privateOrders=await request(base,'/api/orders/mine','GET',undefined,login.body.token);
  assert.equal(privateOrders.headers.get('cache-control'),'no-store',
    'private customer orders must not be cached');
  const trusted = await request(base, '/api/health', 'GET', undefined, undefined, 'http://localhost:3000');
  assert.equal(trusted.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(trusted.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(trusted.headers.get('x-frame-options'), 'DENY');
  console.log('PASS: CORS is restricted and baseline security headers are present');

  assert.equal(await prisma.user.count(), 2, 'tests should never mutate live DB');
  console.log('ALL AUTH SECURITY CHECKS PASSED — isolated database will be removed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (server && server.exitCode === null) server.kill('SIGTERM');
  if (prisma) await prisma.$disconnect();
  rmSync(scratch, { recursive: true, force: true });
});
