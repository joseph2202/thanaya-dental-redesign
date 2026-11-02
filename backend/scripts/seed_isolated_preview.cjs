// Seed strictly isolated disposable Thanaya preview data. NEVER touches dev.db.
const path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto');
const bcrypt=require('bcryptjs');
const {PrismaClient}=require('@prisma/client');
const database=process.env.DATABASE_URL||'';
const envRoot=process.env.THANAYA_PREVIEW_ROOT||'';
const absDb=database.startsWith('file:')?path.resolve(database.slice(5)):'';
const absRoot=envRoot?path.resolve(envRoot):'';
if(process.env.THANAYA_PREVIEW_ONLY!=='1'||
 !absRoot.includes(path.sep+'thanaya-preview-')||
 !absDb.startsWith(absRoot+path.sep)||
 absDb===path.resolve(__dirname,'../prisma/dev.db')){
 throw Error('SEED BLOCKED: a disposable thanaya-preview-* SQLite source is required');
}
const prisma=new PrismaClient();
const password=randomBytes(15).toString('base64url')+'Aa9!';
async function main(){
 if(await prisma.user.count()||await prisma.order.count()||await prisma.product.count())
  throw Error('SEED BLOCKED: preview database is not empty');
 const owner=await prisma.user.create({data:{
  name:'مدير ثنايا التجريبي',email:'preview-owner@thanaya.local',
  phone:'07800000000',password:await bcrypt.hash(password,10),role:'owner'
 }});
 const customer=await prisma.user.create({data:{
  name:'زبون تجريبي',email:'preview-customer@thanaya.local',
  phone:'07800000001',password:await bcrypt.hash(randomBytes(15).toString('base64url')+'Aa9!',10),
  role:'customer'
 }});
 await prisma.category.createMany({data:[
  {name:'معدات طب الأسنان',icon:'Stethoscope'},
  {name:'مواد حشو الأسنان',icon:'Package'},
  {name:'التعقيم والمستهلكات',icon:'ShieldCheck'}
 ]});
 const products=[];
 for(const p of [
  {name:'حزمة أدوات فحص الأسنان',description:'أدوات فحص طبي — بيانات تجريبية غير معروضة للبيع الحقيقي.',price:60000,category:'معدات طب الأسنان',brand:'THANAYA Demo',stock:16,purchaseCostIqd:34000},
  {name:'مواد حشو أسنان تدريبية',description:'منتج تجريبي مخصص لمعاينة واجهة المتجر.',price:45000,category:'مواد حشو الأسنان',brand:'THANAYA Demo',stock:28,purchaseCostIqd:23000},
  {name:'عبوة تعقيم تجريبية',description:'عبوة تجريبية للتوضيح فقط.',price:18000,category:'التعقيم والمستهلكات',brand:'THANAYA Demo',stock:24,purchaseCostIqd:8500}
 ]){
  products.push(await prisma.product.create({data:{...p,usdPrice:1,icon:'Package',published:true}}));
 }
 const supplier=await prisma.supplier.create({data:{code:'PREVIEW-DENTAL',name:'مورد تجريبي — البصرة'}});
 const purchase=await prisma.purchaseOrder.create({data:{
  requestId:randomUUID(),supplierId:supplier.id,createdById:owner.id,status:'ordered',
  lines:{create:[{productId:products[0].id,productName:products[0].name,quantity:8,unitCostIqd:34000},
   {productId:products[1].id,productName:products[1].name,quantity:12,unitCostIqd:23000}]}
 },include:{lines:true}});
 const receipt=await prisma.purchaseReceipt.create({data:{
  purchaseOrderId:purchase.id,requestId:randomUUID(),actorId:owner.id,note:'سند استلام معاينة مستقل',
  lines:{create:purchase.lines.map(line=>({
   purchaseOrderLineId:line.id,quantity:line.quantity,unitCostIqd:line.unitCostIqd
  }))}
 }});
 await prisma.purchaseOrder.update({where:{id:purchase.id},data:{receiptRevision:1,invoiceRevision:1}});
 const invoice=await prisma.supplierInvoice.create({data:{
  requestId:randomUUID(),supplierId:supplier.id,purchaseOrderId:purchase.id,
  invoiceNumber:'DEMO-2026-001',amountIqd:548000,
  invoiceDate:'2026-11-02',dueDate:'2026-12-02',
  note:'فاتورة معاينة اصطناعية مضمونة بالبيانات التجريبية',createdById:owner.id,paymentRevision:1
 }});
 await prisma.supplierPayment.create({data:{
  invoiceId:invoice.id,requestId:randomUUID(),actorId:owner.id,
  method:'bank_transfer',amountIqd:200000,reference:'DEMO-BANK-TRANSFER-001'
 }});
 const deliveredOrder=await prisma.order.create({data:{
  userId:customer.id,customerName:customer.name,
  customerPhone:customer.phone,customerAddress:'عنوان تجريبي — البصرة',
  customerCity:'البصرة',status:'delivered',
  subtotal:165000,shippingFee:5000,discountAmount:10000,total:160000,
  items:{create:[
   {productId:products[0].id,productName:products[0].name,quantity:2,price:60000,
    costSnapshots:{create:[{quantity:2,unitCostIqd:34000,source:'product_reference'}]}},
   {productId:products[1].id,productName:products[1].name,quantity:1,price:45000,
    costSnapshots:{create:[{quantity:1,unitCostIqd:23000,source:'product_reference'}]}}
  ]}
 }});
 await prisma.order.create({data:{
  userId:customer.id,customerName:'طلب قديم — بيانات غير مكتملة',
  customerPhone:'07800000001',customerAddress:'البصرة',customerCity:'البصرة',
  status:'delivered',total:45000,subtotal:45000,
  items:{create:[{productId:products[1].id,productName:products[1].name,quantity:1,price:45000}]}
 }});
 await prisma.storeExpense.create({data:{
  requestId:randomUUID(),actorId:owner.id,category:'utilities',method:'cash',
  amountIqd:25000,reference:'DEMO-ELECTRICITY-2026',note:'مصروف كهرباء تجريبي'
 }});
 await prisma.cashAdjustment.create({data:{
  requestId:randomUUID(),actorId:owner.id,direction:'contribution',
  amountIqd:50000,reference:'DEMO-OWNER-OPENING-CASH',note:'نقد تجريبي أضافه المالك'
 }});
 await prisma.orderPaymentEvent.create({data:{
  orderId:deliveredOrder.id,requestId:randomUUID(),actorId:owner.id,
  kind:'collection',method:'cash',amountIqd:60000,
  note:'تحصيل نقدي تجريبي — جزء من الطلب'
 }});
 console.log('');
 console.log('==========================================');
 console.log('THANAYA PRIVATE PREVIEW — DEMO ONLY');
 console.log('Email: preview-owner@thanaya.local');
 console.log('Password: '+password);
 console.log('==========================================');
 console.log('No real customer data, passwords, inventory, or orders were used.');
 console.log('Demo supplier receipt: '+receipt.id.slice(0,12));
}
main().catch(e=>{console.error('PREVIEW SEED FAILED:',e);process.exitCode=1})
 .finally(async()=>{await prisma.$disconnect()});
