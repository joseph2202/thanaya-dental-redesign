// Integration tests against a THROWAWAY SQLite database, never backend/prisma/dev.db.
// Run from backend: npm run test:orders
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const backendDir = path.resolve(__dirname, '..');
const dbDir = mkdtempSync(path.join(os.tmpdir(), 'thanaya-orders-test-'));
const databaseUrl = 'file:' + path.join(dbDir, 'isolated.db');
const jwtSecret = randomUUID() + randomUUID();
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, JWT_SECRET: jwtSecret };
let apiServer;
let prisma;

const customer = {
  name: 'مشتري تجريبي',
  phone: '07812345678',
  address: 'البصرة، شارع تجريبي رقم 12',
  city: 'البصرة'
};

async function portAvailable() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function ready(url) {
  for (let attempt = 0; attempt < 70; attempt++) {
    if (apiServer.exitCode !== null) throw new Error('Test API server exited unexpectedly');
    try {
      const response = await fetch(url + '/api/health', { signal: AbortSignal.timeout(800) });
      if (response.ok) return;
    } catch { /* wait for startup */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Test API server failed to start within 14 seconds');
}

async function request(base, route, method = 'GET', body, token) {
  const response = await fetch(base + route, {
    method,
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  return { status: response.status, body: await response.json() };
}

function credentials(jwt, user) {
  return jwt.sign({ userId: user.id, role: user.role }, jwtSecret, { expiresIn: '1h' });
}

async function product(name, stock, price) {
  return prisma.product.create({
    data: { name, description: 'منتج للاختبار فقط', price, usdPrice: 1, category: 'اختبار', brand: 'Test', icon: 'Package', stock }
  });
}

async function check(label, work) {
  await work();
  console.log('  PASS:', label);
}

async function main() {
  console.log('Starting isolated order integration checks (never touches your real database)');
  const cli = path.join(backendDir, 'node_modules', '.bin', 'prisma');
  const push = spawnSync(cli, ['db', 'push', '--skip-generate'], {
    cwd: backendDir, env, encoding: 'utf8', timeout: 90000
  });
  if (push.status !== 0) {
    throw new Error('Failed to initialize isolated DB:\n' + (push.stderr || push.stdout));
  }

  process.env.DATABASE_URL = databaseUrl;
  const { PrismaClient } = require('@prisma/client');
  const jwt = require('jsonwebtoken');
  prisma = new PrismaClient();

  const [alice, bob, admin] = await Promise.all([
    prisma.user.create({ data: { name: 'Alice test', email: 'alice@integration.invalid', phone: '07812345678', password: 'unused', role: 'customer' } }),
    prisma.user.create({ data: { name: 'Bob test', email: 'bob@integration.invalid', phone: '07812345679', password: 'unused', role: 'customer' } }),
    prisma.user.create({ data: { name: 'Admin test', email: 'admin@integration.invalid', phone: '07812345670', password: 'unused', role: 'admin' } })
  ]);
  const aliceToken = credentials(jwt, alice);
  const bobToken = credentials(jwt, bob);
  const adminToken = credentials(jwt, admin);

  const port = await portAvailable();
  const base = 'http://127.0.0.1:' + port;
  let logs = '';
  apiServer = spawn(process.execPath, ['dist/index.js'], { cwd: backendDir, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [apiServer.stdout, apiServer.stderr]) {
    stream.on('data', chunk => { logs = (logs + chunk.toString()).slice(-12000); });
  }
  try {
    await ready(base);

    await check('two customers cannot both buy the last unit', async () => {
      const item = await product('Last piece', 1, 25000);
      const body = { items: [{ productId: item.id, quantity: 1 }], customer };
      const [one, two] = await Promise.all([
        request(base, '/api/orders', 'POST', { ...body, requestId: randomUUID() }, aliceToken),
        request(base, '/api/orders', 'POST', { ...body, requestId: randomUUID() }, bobToken)
      ]);
      assert.deepEqual([one.status, two.status].sort(), [201, 409], JSON.stringify([one, two]));
      assert.equal(await prisma.order.count({ where: { items: { some: { productId: item.id } } } }), 1);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stock, 0);
    });

    await check('retry reuses original order, never decrements twice', async () => {
      const item = await product('Retry piece', 3, 11000);
      const body = { requestId: randomUUID(), items: [{ productId: item.id, quantity: 2 }], customer };
      const first = await request(base, '/api/orders', 'POST', body, aliceToken);
      const replay = await request(base, '/api/orders', 'POST', body, aliceToken);
      assert.equal(first.status, 201, JSON.stringify(first));
      assert.equal(replay.status, 200, JSON.stringify(replay));
      assert.equal(first.body.id, replay.body.id);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stock, 1);
      const changed = await request(base, '/api/orders', 'POST', { ...body, customer: { ...customer, city: 'بغداد' } }, aliceToken);
      assert.equal(changed.status, 409);
    });

    await check('server ignores forged totals, prices, and user IDs', async () => {
      const item = await product('Trusted price', 3, 19000);
      const forged = {
        requestId: randomUUID(), customer, userId: bob.id, total: 1,
        items: [{ productId: item.id, quantity: 2, product: { id: item.id, price: 1 } }]
      };
      const created = await request(base, '/api/orders', 'POST', forged, aliceToken);
      assert.equal(created.status, 201, JSON.stringify(created));
      assert.equal(created.body.total, 38000);
      assert.equal(created.body.userId, alice.id);
      assert.equal(created.body.items[0].price, 19000);
      const forbidden = await request(base, '/api/orders/' + created.body.id, 'GET', undefined, bobToken);
      assert.equal(forbidden.status, 403);
      const mine = await request(base, '/api/orders/mine', 'GET', undefined, bobToken);
      assert.equal(mine.status, 200);
      assert.equal(mine.body.some(order => order.id === created.body.id), false);
      const anonymous = await request(base, '/api/orders/mine');
      assert.equal(anonymous.status, 401);
    });

    await check('cancelling once restores stock exactly once', async () => {
      const item = await product('Cancel piece', 2, 15000);
      const created = await request(base, '/api/orders', 'POST', {
        requestId: randomUUID(), customer, items: [{ productId: item.id, quantity: 1 }]
      }, aliceToken);
      assert.equal(created.status, 201, JSON.stringify(created));
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stock, 1);
      const path = '/api/orders/' + created.body.id + '/status';
      const first = await request(base, path, 'PATCH', { status: 'cancelled' }, adminToken);
      const second = await request(base, path, 'PATCH', { status: 'cancelled' }, adminToken);
      assert.equal(first.status, 200, JSON.stringify(first));
      assert.equal(second.status, 409, JSON.stringify(second));
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stock, 2);
    });

    await check('delivered return restores stock exactly once', async () => {
      const item = await product('Returned piece', 1, 22000);
      const created = await request(base, '/api/orders', 'POST', {
        requestId: randomUUID(), customer, items: [{ productId: item.id, quantity: 1 }]
      }, bobToken);
      assert.equal(created.status, 201, JSON.stringify(created));
      const route = '/api/orders/' + created.body.id + '/status';
      for (const status of ['confirmed', 'shipped', 'delivered', 'returned']) {
        const result = await request(base, route, 'PATCH', { status }, adminToken);
        assert.equal(result.status, 200, JSON.stringify(result));
      }
      const repeated = await request(base, route, 'PATCH', { status: 'returned' }, adminToken);
      assert.equal(repeated.status, 409);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stock, 1);
    });

    await check('invalid quantities never create orders', async () => {
      const item = await product('Invalid count', 4, 12000);
      const before = await prisma.order.count();
      const result = await request(base, '/api/orders', 'POST', {
        requestId: randomUUID(), customer, items: [{ productId: item.id, quantity: -5 }]
      }, aliceToken);
      assert.equal(result.status, 400);
      assert.equal(await prisma.order.count(), before);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stock, 4);
    });

    await check('stock ledger reconciles sales, cancellation and returns', async () => {
      const all = await prisma.inventoryMovement.findMany();
      const sales = all.filter(entry => entry.reason === 'order_placed');
      const cancels = all.filter(entry => entry.reason === 'order_cancelled');
      const returns = all.filter(entry => entry.reason === 'order_returned');
      assert.ok(sales.length >= 4, 'sale movements missing');
      assert.ok(cancels.length >= 1, 'cancellation movements missing');
      assert.ok(returns.length >= 1, 'return movements missing');
      for (const entry of all) assert.equal(entry.before + entry.delta, entry.after);
    });

    await check('orders management API requires staff and applies filters/paging',async()=>{
      const adminView=await request(base,'/api/orders/manage?page=1&status=all&search=','GET',undefined,adminToken);
      assert.equal(adminView.status,200,JSON.stringify(adminView));
      assert.ok(adminView.body.total>=4);
      assert.equal(adminView.body.pageSize,20);
      assert.ok(Array.isArray(adminView.body.orders));
      const customerView=await request(base,'/api/orders/manage','GET',undefined,aliceToken);
      assert.equal(customerView.status,403);
      const pendingView=await request(base,'/api/orders/manage?status=pending&search=Alice','GET',undefined,adminToken);
      assert.equal(pendingView.status,200);
      assert.ok(pendingView.body.orders.every(o=>o.status==='pending'&&o.customerName.includes('Alice')));
      const invalid=await request(base,'/api/orders/manage?page=0','GET',undefined,adminToken);
      assert.equal(invalid.status,400);
      const invalidFilter=await request(base,'/api/orders/manage?status=unpaid','GET',undefined,adminToken);
      assert.equal(invalidFilter.status,400);
      const secondPage=await request(base,'/api/orders/manage?page=2','GET',undefined,adminToken);
      assert.equal(secondPage.status,200);
      assert.equal(secondPage.body.orders.length,0);
    });
    await check('notifications are owner-scoped, persist on orders and status changes',async()=>{
      const before=await prisma.notification.count();
      const product1=await product('Notifications purchase',2,17000);
      const customerOrder=await request(base,'/api/orders','POST',{
        requestId:randomUUID(),items:[{productId:product1.id,quantity:1}],customer
      },aliceToken);
      assert.equal(customerOrder.status,201,JSON.stringify(customerOrder));
      assert.ok((await prisma.notification.count())>before,'staff should be notified of new order');
      const adminInbox=await request(base,'/api/notifications','GET',undefined,adminToken);
      assert.equal(adminInbox.status,200,JSON.stringify(adminInbox));
      const ownerInboxItem=adminInbox.body.items.find(n=>n.orderId===customerOrder.body.id);
      assert.ok(ownerInboxItem,'staff should see assigned new order');
      const aliceInbox=await request(base,'/api/notifications','GET',undefined,aliceToken);
      assert.equal(aliceInbox.status,200);
      assert.ok(!aliceInbox.body.items.some(n=>n.id===ownerInboxItem.id),'customer must not read staff notices');
      const forbidden=await request(base,'/api/notifications/'+ownerInboxItem.id+'/read','PATCH',undefined,aliceToken);
      assert.equal(forbidden.status,404);
      const marked=await request(base,'/api/notifications/'+ownerInboxItem.id+'/read','PATCH',undefined,adminToken);
      assert.equal(marked.status,200);
      const status=await request(base,'/api/orders/'+customerOrder.body.id+'/status','PATCH',{status:'confirmed'},adminToken);
      assert.equal(status.status,200);
      const own=await request(base,'/api/notifications','GET',undefined,aliceToken);
      assert.equal(own.status,200);
      assert.ok(own.body.items.some(n=>n.kind==='order_status'&&n.orderId===customerOrder.body.id));
      const anon=await request(base,'/api/notifications');
      assert.equal(anon.status,401);
      const low=await product('Low stock alert',2,1000);
      const stock=await request(base,'/api/notifications','GET',undefined,adminToken);
      assert.ok(stock.body.lowStock.some(p=>p.id===low.id),'live low stock warning');
      assert.equal(own.body.lowStock.length,0,'customer should not see stock alerts');
    });
    await check('report metrics exclude cancelled and returned orders and require admin',async()=>{
      const customerForbidden=await request(base,'/api/reports/overview?range=30','GET',undefined,aliceToken);
      assert.equal(customerForbidden.status,403);
      const anonymous=await request(base,'/api/reports/overview?range=30','GET');
      assert.equal(anonymous.status,401);
      const badRange=await request(base,'/api/reports/overview?range=0','GET',undefined,adminToken);
      assert.equal(badRange.status,400);
      const item=await product('Reporting item',7,13000);
      const delivered=await request(base,'/api/orders','POST',{requestId:randomUUID(),customer,items:[{productId:item.id,quantity:2}]},aliceToken);
      assert.equal(delivered.status,201);
      for (const status of ['confirmed','shipped','delivered']){
        const response=await request(base,'/api/orders/'+delivered.body.id+'/status','PATCH',{status},adminToken);
        assert.equal(response.status,200,JSON.stringify(response));
      }
      const before=await request(base,'/api/reports/overview?range=all','GET',undefined,adminToken);
      assert.equal(before.status,200,JSON.stringify(before));
      assert.ok(before.body.stats.deliveredValue>=26000);
      assert.ok(before.body.topProducts.some(p=>p.productId===item.id&&p.units===2));
      assert.ok(before.body.stats.totalProducts>=1);
      assert.equal(before.body.trend.length,30);
      const returned=await request(base,'/api/orders/'+delivered.body.id+'/status','PATCH',{status:'returned'},adminToken);
      assert.equal(returned.status,200);
      const after=await request(base,'/api/reports/overview?range=all','GET',undefined,adminToken);
      assert.equal(after.status,200);
      assert.equal(after.body.stats.deliveredValue,before.body.stats.deliveredValue-26000);
      assert.equal(after.body.stats.deliveredOrders,before.body.stats.deliveredOrders-1);
      assert.ok(!after.body.topProducts.some(p=>p.productId===item.id));
      assert.ok(after.body.stats.returnedOrders>=1);
      const week=await request(base,'/api/reports/overview?range=7','GET',undefined,adminToken);
      assert.equal(week.status,200);
      assert.equal(week.body.trend.length,7);
    });
    await check('cart quote reads current prices and detects unavailable products without changing stock',async()=>{
      const p=await product('Quoted item',3,21000);
      const ok=await request(base,'/api/products/quote','POST',{items:[{productId:p.id,quantity:2}]});
      assert.equal(ok.status,200);
      assert.equal(ok.body.subtotal,42000);
      assert.equal(ok.body.canCheckout,true);
      assert.equal(ok.body.items[0].product.price,21000);
      const unavailable=await request(base,'/api/products/quote','POST',{items:[{productId:p.id,quantity:4}]});
      assert.equal(unavailable.status,200);
      assert.equal(unavailable.body.canCheckout,false);
      const missing=await request(base,'/api/products/quote','POST',{items:[{productId:'missing-product',quantity:1}]});
      assert.equal(missing.status,200);
      assert.equal(missing.body.canCheckout,false);
      assert.equal(missing.body.items[0].product,null);
      const invalid=await request(base,'/api/products/quote','POST',{items:[{productId:p.id,quantity:2},{productId:p.id,quantity:1}]});
      assert.equal(invalid.status,400);
      const remain=await prisma.product.findUnique({where:{id:p.id}});
      assert.equal(remain.stock,3);
    });
    await check('checkout attempt recovery is authenticated and cannot reveal another customer order',async()=>{
      const p=await product('Retry recovery',2,15000);
      const requestId=randomUUID();
      const created=await request(base,'/api/orders','POST',{
        requestId,items:[{productId:p.id,quantity:1}],customer
      },aliceToken);
      assert.equal(created.status,201);
      const recovered=await request(base,'/api/orders/attempt/'+requestId,'GET',undefined,aliceToken);
      assert.equal(recovered.status,200);
      assert.equal(recovered.body.id,created.body.id);
      const stranger=await request(base,'/api/orders/attempt/'+requestId,'GET',undefined,bobToken);
      assert.equal(stranger.status,404);
      const anonymous=await request(base,'/api/orders/attempt/'+requestId);
      assert.equal(anonymous.status,401);
      const invalid=await request(base,'/api/orders/attempt/not-a-uuid','GET',undefined,aliceToken);
      assert.equal(invalid.status,400);
      const after=await prisma.product.findUnique({where:{id:p.id}});
      assert.equal(after.stock,1,'recovery must never change stock');
    });
    console.log('\\nALL 12 CHECKS PASSED. Database was isolated and will be deleted.');
  } catch (error) {
    console.error('\nORDER INTEGRATION FAILED. Server output:\n' + logs);
    throw error;
  }
}

main()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    if (apiServer && apiServer.exitCode === null) apiServer.kill('SIGTERM');
    if (prisma) await prisma.$disconnect();
    rmSync(dbDir, { recursive: true, force: true });
  });
