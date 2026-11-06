const {test}=require('node:test'),assert=require('node:assert/strict');
const {decodeSavedCart,productSnapshot}=require('../src/lib/cartState.ts');
const product={id:'synthetic-1',name:'صنف اختبار',price:40000,stock:3,image:'/logo.png',saleUnit:'box',usdPrice:30.5};
const line=(p=product,quantity=1)=>({product:p,quantity});
test('legacy valid baskets retain price, quantity, unit and image without persisting unrelated fields',()=>{
 const saved=decodeSavedCart(JSON.stringify([line({...product,published:true,purchaseCostIqd:21000,gallery:['/logo.png']},2)]));
 assert.deepEqual(saved,{items:[line(product,2)],recovered:false});
});
test('invalid JSON and non-array roots recover to an empty basket',()=>{
 for(const raw of ['','{broken','{}','null','true','42','"basket"'])assert.deepEqual(decodeSavedCart(raw),{items:[],recovered:true},raw);
 assert.deepEqual(decodeSavedCart(null),{items:[],recovered:false});
 assert.deepEqual(decodeSavedCart('[]'),{items:[],recovered:false});
});
test('malformed entries are removed while valid independent selections remain',()=>{
 const valid=line();const saved=decodeSavedCart(JSON.stringify([null,{},[],{product:null,quantity:1},valid]));
 assert.deepEqual(saved,{items:[valid],recovered:true});
});
test('duplicate product IDs keep the first requested quantity and never merge purchases',()=>{
 assert.deepEqual(decodeSavedCart(JSON.stringify([line(product,2),line(product,3)])),{items:[line(product,2)],recovered:true});
});
test('quantity bounds reject zero, negative, fractional, strings and values over 100',()=>{
 for(const quantity of [0,-1,1.5,'2',101,null])assert.equal(decodeSavedCart(JSON.stringify([line(product,quantity)])).items.length,0,String(quantity));
 assert.equal(decodeSavedCart(JSON.stringify([line({...product,stock:100},100)])).items[0].quantity,100);
});
test('corrupt product identity, price and stock cannot enter cart arithmetic',()=>{
 for(const patch of [{id:''},{id:[]},{name:''},{name:{}},{price:-1},{price:'40000'},{price:1.5},{price:1000000001},{stock:-1},{stock:null},{stock:1000001}]){
  assert.equal(productSnapshot({...product,...patch}),null,JSON.stringify(patch));
 }
});
test('zero price and stale zero-stock snapshots survive for server quote review',()=>{
 const free=line({...product,price:0,stock:0},2);
 assert.deepEqual(decodeSavedCart(JSON.stringify([free])),{items:[free],recovered:false});
});
test('unsafe optional data is omitted without discarding the valid selection',()=>{
 const parsed=productSnapshot({...product,image:'javascript:alert(1)',icon:[],category:{},saleUnit:'constructor'});
 assert.equal(parsed.image,undefined);assert.equal(parsed.icon,undefined);assert.equal(parsed.category,undefined);assert.equal(parsed.saleUnit,undefined);
 assert.equal(parsed.name,product.name);assert.equal(parsed.price,40000);
 assert.equal(productSnapshot({...product,image:'//tracker.invalid/image'}).image,undefined);
});
test('line and payload caps bound browser recovery without changing kept quantities',()=>{
 const entries=Array.from({length:51},(_,n)=>line({...product,id:'p-'+n}));
 const saved=decodeSavedCart(JSON.stringify(entries));assert.equal(saved.items.length,50);assert.equal(saved.recovered,true);
 assert.equal(saved.items[49].product.id,'p-49');
 assert.deepEqual(decodeSavedCart(' '.repeat(500001)),{items:[],recovered:true});
});
