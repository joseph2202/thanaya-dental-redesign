// Check security headers on a locally started production Next.js build.
// Runs only against loopback in CI, no API/backend access or customer database.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const cwd = path.resolve(__dirname, '..');
const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
let server;
let logs = '';

async function availablePort() {
  const socket = net.createServer();
  await new Promise((ok, fail) => socket.once('error', fail).listen(0, '127.0.0.1', ok));
  const port = socket.address().port;
  await new Promise(ok => socket.close(ok));
  return port;
}

async function ready(base) {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (server.exitCode !== null) throw Error('Next server exited early: ' + logs);
    try {
      const response = await fetch(base + '/terms', { signal: AbortSignal.timeout(1000) });
      if (response.status < 500) return;
    } catch {}
    await new Promise(ok => setTimeout(ok, 250));
  }
  throw Error('Next server did not become ready: ' + logs);
}

async function main() {
  if (process.env.NODE_ENV !== 'test') throw Error('Run header checks with NODE_ENV=test on an isolated runner');
  const port = await availablePort();
  const base = 'http://127.0.0.1:' + port;
  server = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const output of [server.stdout, server.stderr]) {
    output.on('data', data => { logs = (logs + String(data)).slice(-5000); });
  }
  await ready(base);
  for (const route of ['/terms', '/privacy', '/admin/payment-settings', '/checkout']) {
    const response = await fetch(base + route, { redirect: 'manual', signal: AbortSignal.timeout(12000) });
    assert.ok(response.status < 500, route + ' returned ' + response.status);
    assert.equal(response.headers.get('x-frame-options'), 'DENY', route);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', route);
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', route);
    const policy = response.headers.get('content-security-policy') || '';
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"]) {
      assert.ok(policy.includes(directive), route + ' missing CSP ' + directive);
    }
    if (route.startsWith('/admin/') || route === '/checkout') {
      const cacheControl = response.headers.get('cache-control') || '';
      assert.ok(cacheControl.includes('no-store'), route + ' may be cached: ' + cacheControl);
    }
    console.log('PASS: Next security headers ' + route);
  }
}

main().catch(err => { console.error(err, '\n' + logs); process.exitCode = 1; })
  .finally(() => { if (server && server.exitCode === null) server.kill('SIGTERM'); });
