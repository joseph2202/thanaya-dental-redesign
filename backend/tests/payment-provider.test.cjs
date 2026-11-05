// Pure provider protocol tests: no DB, network, merchant account or card data.
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHmac}=require('node:crypto');
const {MockPaymentProvider}=require('../dist/lib/mockPaymentProvider');
const {ProviderError,parseProviderObservation,reconcileProviderObservation}=require('../dist/lib/paymentProvider');
function fixture(){
 const records=new Map();
 const repo={
  async createIfAbsent(record){
   const previous=[...records.values()].find(r=>r.requestId===record.requestId);
   if(previous)return structuredClone(previous);
   records.set(record.reference,structuredClone(record));return structuredClone(record);
  },
  async get(reference){return records.has(reference)?structuredClone(records.get(reference)):null;},
  async compareAndSwap(next,expected){
   if(records.get(next.reference)?.sequence!==expected)return false;
   records.set(next.reference,structuredClone(next));return true;
  }
 };
 const clock={now:Date.parse('2026-11-05T18:00:00.000Z')},secret=randomBytes(32);
 const provider=new MockPaymentProvider(repo,secret,()=>clock.now);
 const order={orderId:'ord_synthetic_001',amountIqd:50000,currency:'IQD'};
 return {provider,order,clock,secret,repo,records};
}
function code(expected){return error=>error instanceof ProviderError&&error.code===expected;}
test('server order creates a stable pending attempt; reused keys cannot change its price',async()=>{
 const {provider,order}=fixture(),key=randomUUID();
 const first=await provider.createPayment(order,key),again=await provider.createPayment(order,key);
 assert.deepEqual(first,again);assert.equal(first.payment.status,'pending');
 assert.equal(first.payment.environment,'sandbox');assert.equal(first.hostedCheckoutUrl,null);
 assert.equal(provider.capabilities.hostedCheckout,false);
 await assert.rejects(provider.createPayment({...order,amountIqd:1},key),code('request_reused'));
});
test('no card/browser paid fields, unsupported currency, fractional or unsafe IQD amounts accepted',async()=>{
 const {provider,order}=fixture();
 for(const input of [{...order,cvv:'synthetic-forbidden-field'}, {...order,paid:true},
  {...order,currency:'USD'},...[-1,0,0.5,NaN,Infinity,2_000_000_001].map(amountIqd=>({...order,amountIqd}))])
  await assert.rejects(provider.createPayment(input,randomUUID()),error=>error.status===400);
 await assert.rejects(provider.createPayment(order,'unbounded-key'),code('invalid_request_id'));
});
test('webhook signature covers the exact raw bytes and timestamp',async()=>{
 const {provider,order}=fixture();const {payment}=await provider.createPayment(order,randomUUID());
 const event=await provider.simulate(payment.reference,'paid'),signed=provider.signWebhook(event);
 assert.deepEqual(provider.verifyWebhook(signed.rawBody,signed.headers),event);
 assert.throws(()=>provider.verifyWebhook(Buffer.concat([signed.rawBody,Buffer.from(' ')]),signed.headers),code('invalid_signature'));
 assert.throws(()=>provider.verifyWebhook(signed.rawBody,{...signed.headers,'x-thanaya-mock-signature':'0'.repeat(64)}),code('invalid_signature'));
 assert.throws(()=>provider.verifyWebhook(signed.rawBody,{...signed.headers,'x-thanaya-mock-signature':'f'}),code('invalid_signature'));
});
test('stale/future, oversized, missing and other-secret webhook signatures are rejected',async()=>{
 const {provider,order,clock,repo}=fixture();const {payment}=await provider.createPayment(order,randomUUID());
 const signed=provider.signWebhook(await provider.queryPayment(payment.reference));
 clock.now+=301000;assert.throws(()=>provider.verifyWebhook(signed.rawBody,signed.headers),code('invalid_signature'));
 clock.now-=602000;assert.throws(()=>provider.verifyWebhook(signed.rawBody,signed.headers),code('invalid_signature'));
 clock.now+=301000;
 assert.throws(()=>provider.verifyWebhook(Buffer.alloc(8193),signed.headers),code('invalid_signature'));
 assert.throws(()=>provider.verifyWebhook(signed.rawBody,{}),code('invalid_signature'));
 const other=new MockPaymentProvider(repo,randomBytes(32),()=>clock.now);
 assert.throws(()=>other.verifyWebhook(signed.rawBody,signed.headers),code('invalid_signature'));
 assert.throws(()=>new MockPaymentProvider(repo,Buffer.alloc(4)),code('sandbox_unconfigured'));
});
test('valid signatures cannot smuggle card fields or switch mock into a live environment',async()=>{
 const {provider,order,clock,secret}=fixture();const {payment}=await provider.createPayment(order,randomUUID());
 const event=await provider.queryPayment(payment.reference);
 for(const [change,expected] of [[{cvv:'forbidden'},'invalid_event'],[{environment:'live'},'wrong_environment']]){
  const body=Buffer.from(JSON.stringify({...event,...change})),timestamp=String(clock.now/1000);
  const signature=createHmac('sha256',secret).update(timestamp+'.').update(body).digest('hex');
  assert.throws(()=>provider.verifyWebhook(body,{'x-thanaya-mock-timestamp':timestamp,'x-thanaya-mock-signature':signature}),code(expected));
 }
 assert.throws(()=>parseProviderObservation({...event,refundedIqd:1}),code('invalid_refund'));
});
test('authorization is distinct from payment; authenticated query recovers a missed callback',async()=>{
 const {provider,order}=fixture();let {payment}=await provider.createPayment(order,randomUUID());
 const authorized=await provider.simulate(payment.reference,'authorized');
 const signed=provider.signWebhook(authorized);
 payment=reconcileProviderObservation(payment,provider.verifyWebhook(signed.rawBody,signed.headers)).payment;
 assert.equal(payment.status,'authorized');
 await provider.simulate(payment.reference,'paid'); // lost callback
 const recovered=reconcileProviderObservation(payment,await provider.queryPayment(payment.reference));
 assert.equal(recovered.outcome,'updated');assert.equal(recovered.payment.status,'paid');
});
test('stale, duplicate and conflicting observations cannot regress or overwrite paid evidence',async()=>{
 const {provider,order}=fixture();const {payment}=await provider.createPayment(order,randomUUID());
 const old=await provider.queryPayment(payment.reference),paid=await provider.simulate(payment.reference,'paid');
 const current=reconcileProviderObservation(payment,paid).payment;
 assert.equal(reconcileProviderObservation(current,old).outcome,'stale');
 assert.equal(reconcileProviderObservation(current,paid).outcome,'duplicate');
 assert.throws(()=>reconcileProviderObservation(current,{...paid,status:'failed'}),code('conflicting_evidence'));
 assert.throws(()=>reconcileProviderObservation(current,{...paid,sequence:3,status:'cancelled'}),code('review_required'));
});
test('order, provider, environment, reference, currency and amount must match before applying any status',async()=>{
 const {provider,order}=fixture();const {payment}=await provider.createPayment(order,randomUUID());
 const event=await provider.simulate(payment.reference,'paid');
 for(const change of [{orderId:'different_order'},{provider:'other'},{environment:'live'},
  {reference:'other_ref'},{amountIqd:49999}])
  assert.throws(()=>reconcileProviderObservation(payment,{...event,...change}),code('payment_mismatch'));
 assert.throws(()=>reconcileProviderObservation(payment,{...event,currency:'USD'}),code('invalid_order'));
});
test('failed/cancelled attempts cannot be revived; a retry needs a new attempt',async()=>{
 for(const status of ['failed','cancelled']){
  const {provider,order}=fixture(),key=randomUUID();const {payment}=await provider.createPayment(order,key);
  await provider.simulate(payment.reference,status);
  await assert.rejects(provider.simulate(payment.reference,'paid'),code('review_required'));
  const next=await provider.createPayment(order,randomUUID());assert.notEqual(next.payment.reference,payment.reference);
 }
});
test('partial/full refunds are cumulative, bounded and idempotent after provider reconstruction',async()=>{
 const {provider,order,secret,clock,repo}=fixture();const {payment}=await provider.createPayment(order,randomUUID());
 await assert.rejects(provider.refund(payment.reference,1,randomUUID()),code('refund_exceeded'));
 await provider.simulate(payment.reference,'paid');const key=randomUUID();
 const partial=await provider.refund(payment.reference,20000,key);assert.equal(partial.refundedIqd,20000);
 const reconstructed=new MockPaymentProvider(repo,secret,()=>clock.now);
 assert.deepEqual(await reconstructed.refund(payment.reference,20000,key),partial);
 await assert.rejects(reconstructed.refund(payment.reference,20001,key),code('request_reused'));
 const full=await provider.refund(payment.reference,30000,randomUUID());assert.equal(full.refundedIqd,50000);
 await assert.rejects(provider.refund(payment.reference,1,randomUUID()),code('refund_exceeded'));
 assert.equal(reconcileProviderObservation(full,partial).outcome,'stale');
});
test('concurrent refunds use CAS and cannot refund more than was paid',async()=>{
 const {provider,order}=fixture();const {payment}=await provider.createPayment(order,randomUUID());
 await provider.simulate(payment.reference,'paid');const keys=[randomUUID(),randomUUID()];
 const results=await Promise.allSettled(keys.map(key=>provider.refund(payment.reference,30000,key)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const rejected=results.find(r=>r.status==='rejected');assert.equal(rejected.reason.code,'retry_query');
 assert.equal((await provider.queryPayment(payment.reference)).refundedIqd,30000);
 const remainingKey=keys[results.findIndex(r=>r.status==='rejected')];
 await assert.rejects(provider.refund(payment.reference,30000,remainingKey),code('refund_exceeded'));
});
