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
    await check('product gallery and specs are validated and old products stay compatible',async()=>{
      const existing=await product('Legacy product',2,20000);
      const old=await request(base,'/api/products/'+existing.id);
      assert.equal(old.status,200);
      assert.deepEqual(old.body.gallery,[]);
      assert.deepEqual(old.body.specs,[]);
      const updated=await request(base,'/api/products/'+existing.id,'PUT',{
        gallery:['http://localhost:4000/uploads/front.webp','http://localhost:4000/uploads/side.webp'],
        specs:[{label:'الموديل',value:'DP-20'},{label:'الضمان',value:'سنة'}]
      },adminToken);
      assert.equal(updated.status,200,JSON.stringify(updated));
      assert.equal(updated.body.gallery.length,2);
      assert.equal(updated.body.specs[0].value,'DP-20');
      const publicRead=await request(base,'/api/products/'+existing.id);
      assert.deepEqual(publicRead.body.gallery,updated.body.gallery);
      const invalid=await request(base,'/api/products/'+existing.id,'PUT',{specs:[{label:'x',value:''}]},adminToken);
      assert.equal(invalid.status,400);
      const unauthorized=await request(base,'/api/products/'+existing.id,'PUT',{gallery:[]},aliceToken);
      assert.equal(unauthorized.status,403);
      const stored=await prisma.product.findUniqueOrThrow({where:{id:existing.id}});
      assert.equal(stored.stock,2);
      assert.equal(stored.price,20000);
    });

    await check('SKU uniqueness, optional model and size, sale units and historical stock safety',async()=>{
      const payload = {
        name:'Dental box',description:'Valid product',price:24000,usdPrice:17,
        category:'Dental',brand:'Thanaya',icon:'Package',image:null,gallery:[],specs:[],
        badge:null,sku:'dnt-box-001',model:'TM-20',size:'20 ml',saleUnit:'box',stock:3
      };
      const made=await request(base,'/api/products','POST',payload,adminToken);
      assert.equal(made.status,201,JSON.stringify(made));
      assert.equal(made.body.sku,'DNT-BOX-001');
      assert.equal(made.body.saleUnit,'box');
      assert.equal(made.body.model,'TM-20');
      const read=await request(base,'/api/products/'+made.body.id);
      assert.equal(read.body.size,'20 ml');
      const matched=await request(base,'/api/products?search=DNT-BOX-001');
      assert.equal(matched.status,200);
      assert(matched.body.some(p=>p.id===made.body.id));
      const quoted=await request(base,'/api/products/quote','POST',{items:[{productId:made.body.id,quantity:1}]});
      assert.equal(quoted.body.items[0].product.saleUnit,'box');

      const duplicate=await request(base,'/api/products','POST',{...payload,sku:'DNT-BOX-001',stock:0},adminToken);
      assert.equal(duplicate.status,409,JSON.stringify(duplicate));
      const badSku=await request(base,'/api/products/'+made.body.id,'PUT',{sku:'bad sku'},adminToken);
      assert.equal(badSku.status,400);
      const badUnit=await request(base,'/api/products/'+made.body.id,'PUT',{saleUnit:'crate'},adminToken);
      assert.equal(badUnit.status,400);
      const blocked=await request(base,'/api/products/'+made.body.id,'PUT',{saleUnit:'piece'},adminToken);
      assert.equal(blocked.status,409,'Changing units must not reinterpret existing stock or history');
      const prohibited=await request(base,'/api/products/'+made.body.id,'PUT',{sku:'CUSTOMER'},aliceToken);
      assert.equal(prohibited.status,403);
      const legacy=await product('Older stock',0,4000);
      const legacyRead=await request(base,'/api/products/'+legacy.id);
      assert.equal(legacyRead.status,200);
      assert.equal(legacyRead.body.sku,null);
      assert.equal(legacyRead.body.saleUnit,null);
      const safeChange=await request(base,'/api/products/'+legacy.id,'PUT',{saleUnit:'set',sku:'SET-9'},adminToken);
      assert.equal(safeChange.status,200,JSON.stringify(safeChange));
      assert.equal(safeChange.body.saleUnit,'set');
      assert.equal((await prisma.product.findUniqueOrThrow({where:{id:made.body.id}})).stock,3);
    });

    await check('batch expiries enforce FEFO checkout and restore exact lots without affecting legacy stock',async()=>{
      const tracked=await product('Sterile materials',0,12000);
      const old=await product('Old catalog stock',2,3000);
      const cannot=await request(base,'/api/products/'+old.id+'/enable-lots','POST',{},adminToken);
      assert.equal(cannot.status,409);
      const guestEnable=await request(base,'/api/products/'+tracked.id+'/enable-lots','POST',{},aliceToken);
      assert.equal(guestEnable.status,403);
      const enabled=await request(base,'/api/products/'+tracked.id+'/enable-lots','POST',{},adminToken);
      assert.equal(enabled.status,200,JSON.stringify(enabled));
      const future1=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
      const future2=new Date(Date.now()+90*86400000).toISOString().slice(0,10);
      const past=new Date(Date.now()-10*86400000).toISOString().slice(0,10);
      const bad=await request(base,'/api/products/'+tracked.id+'/lots','POST',{code:'BAD',expiryDate:past,quantity:10},adminToken);
      assert.equal(bad.status,400);
      const first=await request(base,'/api/products/'+tracked.id+'/lots','POST',{code:'LOT-A',expiryDate:future1,quantity:2},adminToken);
      assert.equal(first.status,201,JSON.stringify(first));
      const second=await request(base,'/api/products/'+tracked.id+'/lots','POST',{code:'LOT-B',expiryDate:future2,quantity:3},adminToken);
      assert.equal(second.status,201,JSON.stringify(second));
      const duplicate=await request(base,'/api/products/'+tracked.id+'/lots','POST',{code:'LOT-A',expiryDate:future1,quantity:1},adminToken);
      assert.equal(duplicate.status,409);
      const general=await request(base,'/api/products/'+tracked.id+'/stock-adjustment','POST',{delta:1,reason:'Wrong mode'},adminToken);
      assert.equal(general.status,409);
      const quote=await request(base,'/api/products/quote','POST',{items:[{productId:tracked.id,quantity:4}]});
      assert.equal(quote.status,200);
      assert.equal(quote.body.items[0].product.availableStock,5);
      const requestId=randomUUID();
      const created=await request(base,'/api/orders','POST',{requestId,customer,items:[{productId:tracked.id,quantity:4}]},aliceToken);
      assert.equal(created.status,201,JSON.stringify(created));
      assert.equal((await prisma.productLot.findUniqueOrThrow({where:{id:first.body.id}})).stock,0);
      assert.equal((await prisma.productLot.findUniqueOrThrow({where:{id:second.body.id}})).stock,1);
      const used=await prisma.orderItemLot.findMany({where:{orderItemId:created.body.items[0].id}});
      assert.deepEqual(used.map(x=>x.quantity).sort(),[2,2]);
      const returned=await request(base,'/api/orders/'+created.body.id+'/status','PATCH',{status:'cancelled'},adminToken);
      assert.equal(returned.status,200,JSON.stringify(returned));
      assert.equal((await prisma.productLot.findUniqueOrThrow({where:{id:first.body.id}})).stock,2);
      assert.equal((await prisma.productLot.findUniqueOrThrow({where:{id:second.body.id}})).stock,3);
      // Simulate expiry of one existing lot after receiving it.
      await prisma.productLot.update({where:{id:first.body.id},data:{expiryDate:past}});
      const publicItem=await request(base,'/api/products/'+tracked.id);
      assert.equal(publicItem.body.stock,5,'physical total stays correct');
      assert.equal(publicItem.body.availableStock,3,'expired lots are never offered for checkout');
      const unavailable=await request(base,'/api/products/quote','POST',{items:[{productId:tracked.id,quantity:4}]});
      assert.equal(unavailable.body.canCheckout,false);
      const blocked=await request(base,'/api/orders','POST',{requestId:randomUUID(),customer,items:[{productId:tracked.id,quantity:4}]},bobToken);
      assert.equal(blocked.status,409);
      assert.equal((await prisma.product.findUniqueOrThrow({where:{id:tracked.id}})).stock,5);
      const restricted=await request(base,'/api/products/'+tracked.id+'/lots/'+first.body.id+'/adjust','POST',{delta:-1,reason:'Expired stock disposal'},aliceToken);
      assert.equal(restricted.status,403);
      const disposal=await request(base,'/api/products/'+tracked.id+'/lots/'+first.body.id+'/adjust','POST',{delta:-1,reason:'Expired stock disposal'},adminToken);
      assert.equal(disposal.status,200,JSON.stringify(disposal));
      assert.equal((await prisma.product.findUniqueOrThrow({where:{id:tracked.id}})).stock,4);
      const legacy=await request(base,'/api/products/'+old.id);
      assert.equal(legacy.body.availableStock,2);
      assert.equal(legacy.body.lotTracking,false);
    });
    await check('unpublished products stay in admin inventory but cannot be discovered or purchased',async()=>{
      const hidden=await product('Private sample item',7,12000);
      const publicBefore=await request(base,'/api/products/'+hidden.id);
      assert.equal(publicBefore.status,200);
      const noAuth=await request(base,'/api/products/manage');
      assert.equal(noAuth.status,401);
      const forbidden=await request(base,'/api/products/'+hidden.id+'/visibility','PATCH',{published:false},aliceToken);
      assert.equal(forbidden.status,403);
      const malformed=await request(base,'/api/products/'+hidden.id+'/visibility','PATCH',{published:'false'},adminToken);
      assert.equal(malformed.status,400);
      const hide=await request(base,'/api/products/'+hidden.id+'/visibility','PATCH',{published:false},adminToken);
      assert.equal(hide.status,200,JSON.stringify(hide));
      assert.equal(hide.body.published,false);
      const listed=await request(base,'/api/products');
      assert.equal(listed.status,200);
      assert.equal(listed.body.some(p=>p.id===hidden.id),false);
      const detail=await request(base,'/api/products/'+hidden.id);
      assert.equal(detail.status,404);
      const quote=await request(base,'/api/products/quote','POST',{items:[{productId:hidden.id,quantity:1}]});
      assert.equal(quote.status,200);
      assert.equal(quote.body.canCheckout,false);
      const checkout=await request(base,'/api/orders','POST',{items:[{productId:hidden.id,quantity:1}],customer,requestId:randomUUID()},aliceToken);
      assert.equal(checkout.status,400);
      const manage=await request(base,'/api/products/manage','GET',undefined,adminToken);
      assert.equal(manage.status,200);
      assert.equal(manage.body.find(p=>p.id===hidden.id).published,false);
      assert.equal((await prisma.product.findUniqueOrThrow({where:{id:hidden.id}})).stock,7);
      const visible=await request(base,'/api/products/'+hidden.id+'/visibility','PATCH',{published:true},adminToken);
      assert.equal(visible.status,200);
      assert.equal((await request(base,'/api/products/'+hidden.id)).status,200);
    });
    await check('saved delivery addresses are private, limited, and do not change old orders',async()=>{
      const snapshot=await prisma.order.findFirst({where:{userId:alice.id},select:{id:true,customerAddress:true}});
      const noAuth=await request(base,'/api/addresses');
      assert.equal(noAuth.status,401);
      const bad=await request(base,'/api/addresses','POST',{label:'بيت',name:'Test',phone:'999',city:'البصرة',address:'العشار شارع 1'},aliceToken);
      assert.equal(bad.status,400);
      const first=await request(base,'/api/addresses','POST',{label:'العيادة',name:'مستلم تجريبي',phone:'07812345678',city:'البصرة',address:'شارع العيادة الاختباري رقم 2'},aliceToken);
      assert.equal(first.status,201,JSON.stringify(first));
      assert.equal(first.body.isDefault,true);
      const second=await request(base,'/api/addresses','POST',{label:'بيت',name:'مستلم ثانٍ',phone:'07812345678',city:'بغداد',address:'عنوان اختباري شارع 33'},aliceToken);
      assert.equal(second.status,201,JSON.stringify(second));
      assert.equal(second.body.isDefault,false);
      const bobRead=await request(base,'/api/addresses','GET',undefined,bobToken);
      assert.equal(bobRead.status,200);
      assert.equal(bobRead.body.length,0);
      const bobUpdate=await request(base,'/api/addresses/'+first.body.id,'PUT',{label:'تزوير',name:'مستلم جديد',phone:'07812345678',city:'البصرة',address:'شارع غير مسموح'},bobToken);
      assert.equal(bobUpdate.status,404);
      const bobDefault=await request(base,'/api/addresses/'+first.body.id+'/default','POST',{},bobToken);
      assert.equal(bobDefault.status,404);
      const bobDelete=await request(base,'/api/addresses/'+first.body.id,'DELETE',undefined,bobToken);
      assert.equal(bobDelete.status,404);
      const changeDefault=await request(base,'/api/addresses/'+second.body.id+'/default','POST',{},aliceToken);
      assert.equal(changeDefault.status,200);
      assert.equal(changeDefault.body.isDefault,true);
      const updated=await request(base,'/api/addresses/'+second.body.id,'PUT',{label:'عنوان معدل',name:'مستلم جديد',phone:'07812345678',city:'النجف',address:'العنوان بعد التعديل في النجف'},aliceToken);
      assert.equal(updated.status,200);
      assert.equal(updated.body.city,'النجف');
      for(let i=0;i<3;i++){
        const created=await request(base,'/api/addresses','POST',{label:'إضافي '+i,name:'مستلم اختبار',phone:'07812345678',city:'البصرة',address:'عنوان اختبار رقم '+i},aliceToken);
        assert.equal(created.status,201,JSON.stringify(created));
      }
      const over=await request(base,'/api/addresses','POST',{label:'سادس',name:'مستلم اختبار',phone:'07812345678',city:'البصرة',address:'العنوان السادس'},aliceToken);
      assert.equal(over.status,409);
      const deleteDefault=await request(base,'/api/addresses/'+second.body.id,'DELETE',undefined,aliceToken);
      assert.equal(deleteDefault.status,200);
      const read=await request(base,'/api/addresses','GET',undefined,aliceToken);
      assert.equal(read.status,200);
      assert.equal(read.body.length,4);
      assert.equal(read.body.filter(a=>a.isDefault).length,1);
      if(snapshot){
        const unchanged=await prisma.order.findUniqueOrThrow({where:{id:snapshot.id},select:{customerAddress:true}});
        assert.equal(unchanged.customerAddress,snapshot.customerAddress);
      }
    });
    await check('owner can manage audited home banner while customers cannot',async()=>{
      const owner=await prisma.user.create({data:{name:'Owner test',email:'owner@integration.invalid',phone:'07812345671',password:'unused',role:'owner'}});
      const ownerToken=credentials(jwt,owner);
      const defaults=await request(base,'/api/settings/public');
      assert.equal(defaults.status,200);
      assert.equal(defaults.body.bannerEnabled,true);
      assert.equal(defaults.body.bannerButtonHref,'/products');
      const adminGet=await request(base,'/api/settings','GET',undefined,adminToken);
      assert.equal(adminGet.status,403);
      const ownerGet=await request(base,'/api/settings','GET',undefined,ownerToken);
      assert.equal(ownerGet.status,200,JSON.stringify(ownerGet));
      const initial=ownerGet.body;
      const updated={...initial,bannerEnabled:true,bannerTitle:'عرض خاص لمستلزمات الأسنان',bannerDescription:'اختر احتياجات العيادة',bannerEyebrow:'THANAYA / OFFERS',
        bannerButtonLabel:'شوف العروض',bannerButtonHref:'/offers',bannerImage:null};
      const denied=await request(base,'/api/settings','PUT',updated,aliceToken);
      assert.equal(denied.status,403);
      const badLink=await request(base,'/api/settings','PUT',{...updated,bannerButtonHref:'https://evil.example'},ownerToken);
      assert.equal(badLink.status,400);
      const badImage=await request(base,'/api/settings','PUT',{...updated,bannerImage:'https://evil.example/tracker.svg'},ownerToken);
      assert.equal(badImage.status,400);
      const saved=await request(base,'/api/settings','PUT',updated,ownerToken);
      assert.equal(saved.status,200,JSON.stringify(saved));
      assert.equal(saved.body.bannerTitle,updated.bannerTitle);
      const publicRead=await request(base,'/api/settings/public');
      assert.equal(publicRead.status,200);
      assert.equal(publicRead.body.bannerTitle,updated.bannerTitle);
      assert.equal(publicRead.body.bannerButtonHref,'/offers');
      const stale=await request(base,'/api/settings','PUT',updated,ownerToken);
      assert.equal(stale.status,409);
      const changes=await prisma.storeSettingsChange.findMany({where:{actorId:owner.id}});
      assert.equal(changes.length,1);
      const off=await request(base,'/api/settings','PUT',{...saved.body,bannerEnabled:false},ownerToken);
      assert.equal(off.status,200);
      assert.equal((await request(base,'/api/settings/public')).body.bannerEnabled,false);
    });
    await check('Excel exports are authorized XLSX archives and do not mutate data',async()=>{
      const none=await request(base,'/api/exports/orders?range=all');
      assert.equal(none.status,401);
      const customer=await request(base,'/api/exports/orders?range=all','GET',undefined,aliceToken);
      assert.equal(customer.status,403);
      const bad=await request(base,'/api/exports/orders?range=invalid','GET',undefined,adminToken);
      assert.equal(bad.status,400);
      const count=await prisma.order.count();
      const stock=(await prisma.product.aggregate({_sum:{stock:true}}))._sum.stock;
      for(const pathname of ['/api/exports/orders?range=all','/api/exports/inventory']){
        const response=await fetch(base+pathname,{headers:{Authorization:'Bearer '+adminToken},signal:AbortSignal.timeout(15000)});
        assert.equal(response.status,200,pathname);
        assert.match(response.headers.get('content-type')||'',/spreadsheetml/);
        assert.match(response.headers.get('content-disposition')||'',/\.xlsx/);
        const buf=Buffer.from(await response.arrayBuffer());
        assert.equal(buf.readUInt32LE(0),0x04034b50);
        assert.ok(buf.includes(Buffer.from('xl/workbook.xml')));
        assert.ok(buf.includes(Buffer.from('xl/worksheets/sheet1.xml')));
        assert.ok(buf.includes(Buffer.from('xl/worksheets/sheet2.xml')));
      }
      assert.equal(await prisma.order.count(),count);
      assert.equal((await prisma.product.aggregate({_sum:{stock:true}}))._sum.stock,stock);
    });
    await check('audited private purchase costs never change historical orders or inventory',async()=>{
      const legacy=await product('Cost metadata test',4,120000);
      const initialOrders=await prisma.order.count(),initialStock=legacy.stock;
      const forbidden=await request(base,'/api/products/'+legacy.id+'/purchase-cost','PATCH',{purchaseCostIqd:65000,expectedRevision:0},aliceToken);
      assert.equal(forbidden.status,403);
      const valid=await request(base,'/api/products/'+legacy.id+'/purchase-cost','PATCH',{purchaseCostIqd:65000,expectedRevision:0},adminToken);
      assert.equal(valid.status,200,JSON.stringify(valid));
      assert.equal(valid.body.purchaseCostIqd,65000);
      assert.equal(valid.body.costRevision,1);
      const stale=await request(base,'/api/products/'+legacy.id+'/purchase-cost','PATCH',{purchaseCostIqd:1,expectedRevision:0},adminToken);
      assert.equal(stale.status,409);
      const invalid=await request(base,'/api/products/'+legacy.id+'/purchase-cost','PATCH',{purchaseCostIqd:-5,expectedRevision:1},adminToken);
      assert.equal(invalid.status,400);
      const publicDetail=await request(base,'/api/products/'+legacy.id);
      assert.equal(publicDetail.status,200);
      assert.equal(Object.hasOwn(publicDetail.body,'purchaseCostIqd'),false,'retail customers must never see purchase costs');
      assert.equal(Object.hasOwn(publicDetail.body,'costRevision'),false);
      const publicList=await request(base,'/api/products');
      assert.equal(Object.hasOwn(publicList.body.find(p=>p.id===legacy.id),'purchaseCostIqd'),false);
      const staff=await request(base,'/api/products/manage','GET',undefined,adminToken);
      assert.equal(staff.body.find(p=>p.id===legacy.id).purchaseCostIqd,65000);
      const history=await request(base,'/api/products/'+legacy.id+'/purchase-cost/history','GET',undefined,adminToken);
      assert.equal(history.status,200);
      assert.equal(history.body.length,1);
      assert.equal(history.body[0].beforeCostIqd,null);
      assert.equal(history.body[0].afterCostIqd,65000);
      assert.equal(await prisma.order.count(),initialOrders);
      assert.equal((await prisma.product.findUniqueOrThrow({where:{id:legacy.id}})).stock,initialStock);

      const tracked=await product('Cost lot test',0,45000);
      assert.equal((await request(base,'/api/products/'+tracked.id+'/enable-lots','POST',{},adminToken)).status,200);
      const future=new Date(Date.now()+100*86400000).toISOString().slice(0,10);
      const received=await request(base,'/api/products/'+tracked.id+'/lots','POST',{code:'PRICE-LOT',quantity:5,expiryDate:future},adminToken);
      assert.equal(received.status,201,JSON.stringify(received));
      const assign=await request(base,'/api/products/'+tracked.id+'/lots/'+received.body.id+'/purchase-cost','PATCH',{purchaseCostIqd:22000,expectedRevision:0},adminToken);
      assert.equal(assign.status,200,JSON.stringify(assign));
      assert.equal(assign.body.costRevision,1);
      const lotRead=await request(base,'/api/products/'+tracked.id+'/lots','GET',undefined,adminToken);
      assert.equal(lotRead.body.lots[0].purchaseCostIqd,22000);
      const customerLot=await request(base,'/api/products/'+tracked.id+'/lots','GET',undefined,aliceToken);
      assert.equal(customerLot.status,403);
      const order=await request(base,'/api/orders','POST',{items:[{productId:tracked.id,quantity:1}],customer,requestId:randomUUID()},aliceToken);
      assert.equal(order.status,201,JSON.stringify(order));
      const noRetro=await request(base,'/api/products/'+tracked.id+'/lots/'+received.body.id+'/purchase-cost','PATCH',{purchaseCostIqd:20000,expectedRevision:1},adminToken);
      assert.equal(noRetro.status,409,'sold lots need financial adjustments, not silent cost rewriting');
      assert.equal((await prisma.productLot.findUniqueOrThrow({where:{id:received.body.id}})).stock,4);
    });
    console.log('\\nALL 20 CHECKS PASSED. Database was isolated and will be deleted.');
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
