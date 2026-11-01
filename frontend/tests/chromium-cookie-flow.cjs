// Actual Chrome UI smoke with CDP + Node 22's native WebSocket.
// Runs inside existing full-stack test, with its throwaway SQLite backend.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const net = require('node:net');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function randomPort() {
  const socket = net.createServer();
  await new Promise((ok, fail) => socket.once('error', fail).listen(0, '127.0.0.1', ok));
  const n = socket.address().port;
  await new Promise(ok => socket.close(ok));
  return n;
}
async function chromiumCookieFlow(base) {
  const candidates = [process.env.CHROME_BIN, 'google-chrome-stable', 'google-chrome', 'chromium'].filter(Boolean);
  const binary = candidates.map(x => spawnSync('which', [x], { encoding: 'utf8' }))
    .find(x => x.status === 0)?.stdout.trim();
  if (!binary) throw Error('This CI runner has no Chrome/Chromium executable');
  const port = await randomPort();
  const profile = mkdtempSync(path.join(os.tmpdir(), 'thanaya-cdp-'));
  let chrome, ws;
  try {
    chrome = spawn(binary, [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
      '--no-first-run', '--disable-background-networking', '--remote-allow-origins=*',
      '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let log = '';
    chrome.stderr.on('data', data => { log = (log + data).slice(-1500); });
    let address;
    for (let i = 0; i < 80; i++) {
      if (chrome.exitCode !== null) throw Error('Chrome crashed ' + log);
      try {
        const v = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
        if (v.webSocketDebuggerUrl) { address = v.webSocketDebuggerUrl; break; }
      } catch {}
      await pause(160);
    }
    if (!address) throw Error('Chrome debugging endpoint unavailable: ' + log);
    ws = new WebSocket(address);
    await new Promise((ok, fail) => {
      ws.addEventListener('open', ok, { once: true });
      ws.addEventListener('error', fail, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    ws.addEventListener('message', evt => {
      let msg;
      try { msg = JSON.parse(String(evt.data)); } catch { return; }
      if (!msg.id || !pending.has(msg.id)) return;
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) fail(Error('CDP: ' + msg.error.message));
      else ok(msg.result);
    });
    const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
      const id = ++nextId;
      pending.set(id, { ok, fail });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      ws.send(JSON.stringify(message));
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); fail(Error('CDP timeout: ' + method)); }
      }, 18000).unref();
    });
    const target = await send('Target.createTarget', { url: base + '/register' });
    const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const sid = attached.sessionId;
    await send('Runtime.enable', {}, sid);
    await send('Page.enable', {}, sid);
    const evalJS = async source => {
      const r = await send('Runtime.evaluate', {
        expression: source, awaitPromise: true, returnByValue: true
      }, sid);
      if (r.exceptionDetails) throw Error('Browser JS: ' +
        (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result?.value;
    };
    const checkEventually = async (expression, what, duration = 20000) => {
      for (let ms = 0; ms < duration; ms += 180) {
        try { if (await evalJS(expression)) return; } catch {}
        await pause(180);
      }
      throw Error('Browser timeout waiting for ' + what + ': ' +
        (await evalJS('location.href').catch(() => '?')) + ' / ' +
        (await evalJS('document.body?.innerText.slice(0,400)').catch(() => '?')));
    };

    await checkEventually("document.querySelector('form input[type=email]') !== null", 'register form');
    await pause(900);
    const email = 'chrome.' + randomUUID() + '@test.invalid';
    const password = 'SafePassword#2026';
    const fill = async (selector, value, position = 0) => {
      const code = "(() => { const inputs = document.querySelectorAll(" +
        JSON.stringify(selector) + "); const el = inputs[" + position + "]; " +
        "if (!el) throw Error('Missing input'); " +
        "const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; " +
        "setter.call(el," + JSON.stringify(value) + "); " +
        "el.dispatchEvent(new Event('input',{bubbles:true})); " +
        "el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()";
      await evalJS(code);
    };
    await fill('form input[type=text]', 'Browser QA Customer');
    await fill('form input[type=email]', email);
    await fill('form input[type=tel]', '07812345678');
    await fill('form input[type=password]', password, 0);
    await fill('form input[type=password]', password, 1);
    await evalJS("document.querySelector('form button[type=submit]').click()");
    await checkEventually("location.pathname === '/account' && document.body.innerText.includes('أهلاً')",
      'new customer account', 25000);
    const cookies = await evalJS("({ csrf:document.cookie.includes('thanaya_csrf='), session:document.cookie.includes('thanaya_session='), token:localStorage.getItem('thanaya-token') })");
    assert.deepEqual(cookies, { csrf: true, session: false, token: null });
    console.log('PASS Chrome UI: registration and hidden session JWT');
    await send('Page.reload', { ignoreCache: true }, sid);
    await checkEventually("location.pathname === '/account' && document.body.innerText.includes('أهلاً')",
      'session recovery after reload', 23000);
    console.log('PASS Chrome UI: session survives browser page reload');
    const apiStatus = await evalJS("(async()=>{ " +
      "const own=await fetch('/api/orders/mine'); " +
      "const denied=await fetch('/api/addresses',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); " +
      "const csrf=document.cookie.split('; ').find(x=>x.startsWith('thanaya_csrf='))?.split('=')[1]; " +
      "const valid=await fetch('/api/addresses',{method:'POST',headers:{'Content-Type':'application/json','X-Thanaya-CSRF':csrf}," +
      "body:JSON.stringify({label:'Browser clinic',name:'Browser Tester',phone:'07812345678',city:'البصرة',address:'عنوان اختبار معزول'})}); " +
      "const list=await fetch('/api/addresses'); " +
      "return {own:own.status,denied:denied.status,valid:valid.status,count:(await list.json()).length}; })()");
    assert.deepEqual(apiStatus, { own: 200, denied: 403, valid: 201, count: 1 });
    console.log('PASS Chrome: private data and browser-origin CSRF checks');
    await evalJS("document.querySelector('button.thanaya-header-logout-link').click()");
    await checkEventually("location.pathname === '/login'", 'logout redirect');
    const response = await evalJS("(async()=>(await fetch('/api/auth/me')).status)()");
    assert.equal(response, 401);
    console.log('PASS Chrome UI: logout clears cookie and blocks authentication');
  } finally {
    if (ws) ws.close();
    if (chrome && chrome.exitCode === null) chrome.kill('SIGTERM');
    rmSync(profile, { recursive: true, force: true });
  }
}
module.exports = { chromiumCookieFlow };
