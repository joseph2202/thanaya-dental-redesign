"use client";

import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import Link from "next/link";
import {Banknote,ClipboardList,RefreshCw,ReceiptText,ShieldCheck} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import {payablesAPI,procurementAPI,receivingAPI,
 type PurchaseDraftRecord,type SupplierInvoiceRecord,type ReceivingSnapshot} from "@/lib/api";

const iqd=(value:number)=>value.toLocaleString("en-US")+" د.ع";
const inputClass="site-input mt-1 w-full min-w-0 px-3 py-2";

export default function SupplierPayablesPage(){
 const [purchases,setPurchases]=useState<PurchaseDraftRecord[]>([]);
 const [invoices,setInvoices]=useState<SupplierInvoiceRecord[]>([]);
 const [selectedPurchase,setSelectedPurchase]=useState("");
 const [selectedInvoice,setSelectedInvoice]=useState("");
 const [invoiceSearch,setInvoiceSearch]=useState("");
 const [receipt,setReceipt]=useState<ReceivingSnapshot|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [loadingReceipt,setLoadingReceipt]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [confirmInvoice,setConfirmInvoice]=useState(false);
 const [confirmPayment,setConfirmPayment]=useState(false);
 const [invoiceNumber,setInvoiceNumber]=useState("");
 const [invoiceAmount,setInvoiceAmount]=useState("");
 const [invoiceDate,setInvoiceDate]=useState("");
 const [dueDate,setDueDate]=useState("");
 const [invoiceNote,setInvoiceNote]=useState("");
 const [paymentAmount,setPaymentAmount]=useState("");
 const [paymentMethod,setPaymentMethod]=useState<"cash"|"bank_transfer"|"other">("bank_transfer");
 const [paymentReference,setPaymentReference]=useState("");
 const invoiceRequestId=useRef<string|null>(null);
 const paymentRequestId=useRef<string|null>(null);

 const refresh=useCallback(async(search="")=>{
  setLoading(true);setError("");
  try{
   const [data,orders]=await Promise.all([payablesAPI.list(undefined,search),procurementAPI.drafts()]);
   setInvoices(data.invoices);
   const eligible=orders.filter(order=>order.status==="ordered");
   setPurchases(eligible);
   setSelectedPurchase(current=>eligible.some(order=>order.id===current)?current:eligible[0]?.id||"");
   setSelectedInvoice(current=>data.invoices.some(invoice=>invoice.id===current)?current:data.invoices[0]?.id||"");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل فواتير الموردين");}
  finally{setLoading(false);}
 },[]);

 useEffect(()=>{void refresh()},[refresh]);
 useEffect(()=>{
  // Determine today's date in the browser only. Next production prerender may
  // not evaluate Date.now() during render or module initialization.
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Baghdad",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  // en-CA formatting varies across runtimes; use ISO pieces for a safe date.
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Baghdad",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const find=(key:string)=>parts.find(part=>part.type===key)?.value||"";
  const local=find("year")+"-"+find("month")+"-"+find("day");
  setInvoiceDate(local||today);
  setDueDate(local||today);
 },[]);

 useEffect(()=>{
  let active=true;
  setReceipt(null);
  if(!selectedPurchase)return;
  setLoadingReceipt(true);
  void receivingAPI.get(selectedPurchase).then(data=>{
   if(active)setReceipt(data);
  }).catch(e=>{
   if(active)setError(e instanceof Error?e.message:"تعذر عرض سندات الاستلام");
  }).finally(()=>{if(active)setLoadingReceipt(false)});
  return ()=>{active=false};
 },[selectedPurchase]);

 const purchase=purchases.find(x=>x.id===selectedPurchase);
 const invoice=invoices.find(x=>x.id===selectedInvoice);
 const receivedValue=receipt?.receipts.reduce((sum,r)=>
  sum+r.lines.reduce((n,line)=>n+line.quantity*line.unitCostIqd,0),0)??0;
 const alreadyBilled=invoices.filter(x=>x.purchaseOrderId===selectedPurchase).reduce((n,x)=>n+x.amountIqd,0);
 const available=Math.max(0,receivedValue-alreadyBilled);
 const totals=useMemo(()=>({
  invoiced:invoices.reduce((n,x)=>n+x.amountIqd,0),
  paid:invoices.reduce((n,x)=>n+x.paidIqd,0),
  owed:invoices.reduce((n,x)=>n+x.remainingIqd,0)
 }),[invoices]);
 const changedInvoice=()=>{
  setConfirmInvoice(false);invoiceRequestId.current=null;setNotice("");
 };
 const changedPayment=()=>{
  setConfirmPayment(false);paymentRequestId.current=null;setNotice("");
 };
 async function lookupInvoices(e:FormEvent){
  e.preventDefault();
  setLoading(true);setError("");
  try{
   const data=await payablesAPI.list(undefined,invoiceSearch.trim());
   setInvoices(data.invoices);
   setSelectedInvoice(data.invoices[0]?.id||"");
   setConfirmPayment(false);
   paymentRequestId.current=null;
   if(!data.invoices.length)setNotice("ما لگينا فاتورة مطابقة للبحث.");
   else setNotice(data.matchedInvoices+" فاتورة مطابقة للبحث.");
  }catch(err){setError(err instanceof Error?err.message:"تعذر البحث عن فاتورة");}
  finally{setLoading(false);}
 }
 async function addInvoice(e:FormEvent){
  e.preventDefault();setError("");setNotice("");
  const amount=Number(invoiceAmount);
  if(!purchase||!receipt||!Number.isSafeInteger(amount)||amount<1||amount>available){
   setError("المبلغ يجب ألا يتجاوز قيمة البضاعة الواصلة غير المفوترة");return;
  }
  if(!invoiceNumber.trim()||invoiceNote.trim().length<8||dueDate<invoiceDate){
   setError("راجع رقم فاتورة المورد والمرجع وتواريخ الفاتورة والاستحقاق");return;
  }
  if(!confirmInvoice){setConfirmInvoice(true);return;}
  setBusy(true);
  if(!invoiceRequestId.current)invoiceRequestId.current=crypto.randomUUID();
  try{
   const result=await payablesAPI.create({
    requestId:invoiceRequestId.current,purchaseOrderId:purchase.id,
    invoiceNumber:invoiceNumber.trim(),invoiceDate,dueDate,
    amountIqd:amount,note:invoiceNote.trim()
   });
   setInvoiceSearch("");
   await refresh();
   setSelectedInvoice(result.id);
   setInvoiceNumber("");setInvoiceAmount("");setInvoiceNote("");
   setConfirmInvoice(false);invoiceRequestId.current=null;
   setNotice(result.alreadyCreated?"الفاتورة كانت مسجلة مسبقاً، وما تكررت.":"تم تسجيل فاتورة المورد. لم يتم دفع أموال أو تغيير المخزون.");
  }catch(err){
   setConfirmInvoice(false);
   setError((err instanceof Error?err.message:"تعذر تسجيل الفاتورة")+
    " — تحقق من قائمة الفواتير قبل إعادة الإرسال إذا انقطع الاتصال.");
  }finally{setBusy(false);}
 }
 async function recordPayment(e:FormEvent){
  e.preventDefault();setError("");setNotice("");
  const amount=Number(paymentAmount);
  if(!invoice||!Number.isSafeInteger(amount)||amount<1||amount>invoice.remainingIqd||
     paymentReference.trim().length<8){
   setError("راجع قيمة الدفعة ومرجع الوصل، ولا تتجاوز المبلغ المتبقي.");return;
  }
  if(!confirmPayment){setConfirmPayment(true);return;}
  setBusy(true);
  if(!paymentRequestId.current)paymentRequestId.current=crypto.randomUUID();
  try{
   const result=await payablesAPI.recordPayment(invoice.id,{
    requestId:paymentRequestId.current,amountIqd:amount,
    method:paymentMethod,reference:paymentReference.trim()
   });
   await refresh(invoiceSearch.trim());
   setPaymentAmount("");setPaymentReference("");setConfirmPayment(false);
   paymentRequestId.current=null;
   setNotice(result.alreadyProcessed?"الدفعة كانت مسجلة مسبقاً.":"تم توثيق الدفعة التي سُددت خارج الموقع.");
  }catch(err){
   setConfirmPayment(false);
   setError((err instanceof Error?err.message:"تعذر توثيق الدفعة")+
    " — تحقق من سجل الدفعات قبل إعادة المحاولة.");
  }finally{setBusy(false);}
 }

 return <AdminLayout>
  <div className="space-y-5">
   <header className="flex flex-wrap items-start justify-between gap-4">
    <div>
     <div className="site-eyebrow flex items-center gap-2"><ReceiptText size={17}/> حسابات الموردين</div>
     <h1 className="mt-2 text-2xl font-black text-ink sm:text-3xl">فواتير الموردين والذمم</h1>
     <p className="site-muted mt-2 max-w-3xl text-sm leading-7">تابع الفواتير المدخلة والرصيد المطلوب، ووثّق الدفعات المسددة فعلياً. الاستلام والمحاسبة منفصلان.</p>
    </div>
    <div className="flex flex-wrap gap-2">
     <Link href="/admin/receiving" className="site-btn site-btn-outline site-btn-sm">استلام البضاعة</Link>
     <button type="button" onClick={()=>void refresh(invoiceSearch.trim())} disabled={busy||loading} className="site-btn site-btn-outline site-btn-sm"><RefreshCw size={16}/> تحديث</button>
    </div>
   </header>
   {error&&<p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</p>}
   {notice&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{notice}</p>}
   <section className="grid gap-3 sm:grid-cols-3">
    {[
     ["الفواتير المسجلة",totals.invoiced,ClipboardList],
     ["الدفعات الموثقة",totals.paid,Banknote],
     ["الذمم المتبقية",totals.owed,ReceiptText]
    ].map(([title,value,Icon])=>{
     const Glyph=Icon as typeof ReceiptText;
     return <div key={title as string} className="site-surface rounded-2xl p-4">
      <span className="site-muted flex items-center gap-2 text-xs"><Glyph size={17}/>{title as string}</span>
      <p className="mt-3 text-xl font-black text-brand">{iqd(value as number)}</p>
     </div>;
    })}
   </section>
   <p className="site-muted flex items-start gap-2 text-xs leading-6"><ShieldCheck size={16} className="mt-1 shrink-0"/>
    المجاميع تشمل جميع فواتير الموردين المسجلة؛ قائمة الاختيار تعرض أحدث 200 فقط. استلام البضاعة وحده لا ينشئ فاتورة ولا يثبت دفع مبلغ. ولا يُحوّل النظام أموالاً بنفسه.
   </p>

   <div className="grid gap-5 xl:grid-cols-2">
    <section className="site-surface rounded-2xl p-4 sm:p-5">
     <h2 className="text-lg font-black">تسجيل فاتورة مورّد</h2>
     <p className="site-muted mt-1 text-sm">لا يمكن تسجيل فاتورة بقيمة أكبر من البضاعة المستلمة غير المفوترة.</p>
     <form className="mt-4 space-y-3" onSubmit={addInvoice}>
      <label className="block text-sm font-bold">أمر الشراء
       <select className={inputClass} disabled={loading||busy}
        value={selectedPurchase} onChange={e=>{setSelectedPurchase(e.target.value);changedInvoice();}}>
        {!purchases.length&&<option value="">لا توجد أوامر شراء مرسلة</option>}
        {purchases.map(row=><option key={row.id} value={row.id}>{row.supplier.name} — {row.id.slice(0,12)}</option>)}
       </select>
      </label>
      <p className="site-muted text-xs">
       {loadingReceipt?"جاري حساب قيمة الاستلام...":receipt
        ? "قيمة البضاعة المستلمة غير المفوترة: "+iqd(available)
        : "اختَر أمر شراء مسجّلاً وله استلام فعلي"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
       <label className="block text-sm font-bold">رقم فاتورة المورد
        <input className={inputClass} maxLength={70} required placeholder="SUP-INV-2026-01"
         value={invoiceNumber} disabled={busy} onChange={e=>{setInvoiceNumber(e.target.value);changedInvoice();}}/>
       </label>
       <label className="block text-sm font-bold">القيمة بالدينار العراقي
        <input className={inputClass} type="number" min={1} max={available} step={1} required
         value={invoiceAmount} disabled={busy} onChange={e=>{setInvoiceAmount(e.target.value);changedInvoice();}}/>
       </label>
       <label className="block text-sm font-bold">تاريخ الفاتورة
        <input className={inputClass} type="date" required value={invoiceDate} disabled={busy}
         onChange={e=>{setInvoiceDate(e.target.value);changedInvoice();}}/>
       </label>
       <label className="block text-sm font-bold">تاريخ الاستحقاق
        <input className={inputClass} type="date" required value={dueDate} disabled={busy}
         onChange={e=>{setDueDate(e.target.value);changedInvoice();}}/>
       </label>
      </div>
      <label className="block text-sm font-bold">مرجع الفاتورة / ملاحظة التحقق
       <textarea className={inputClass} rows={2} maxLength={300} required minLength={8} disabled={busy}
        placeholder="رقم السند والمصدر وتاريخ الاستلام" value={invoiceNote}
        onChange={e=>{setInvoiceNote(e.target.value);changedInvoice();}}/>
      </label>
      {confirmInvoice&&<p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">
       هل تؤكد تسجيل فاتورة بقيمة {iqd(Number(invoiceAmount)||0)} على المورد {purchase?.supplier.name}؟ هذا ينشئ ذمة ولا يسددها.
      </p>}
      <button type="submit" disabled={busy||loadingReceipt||available===0||!purchase}
       className="site-btn site-btn-primary">{busy?"جاري الحفظ...":confirmInvoice?"تأكيد تسجيل الفاتورة":"مراجعة الفاتورة"}</button>
     </form>
    </section>

    <section className="site-surface min-w-0 rounded-2xl p-4 sm:p-5">
     <h2 className="text-lg font-black">دفعات الموردين الموثّقة</h2>
     <p className="site-muted mt-1 text-sm">وثّق فقط دفعة تمت خارج الموقع فعلياً، ويُفضّل رقم الوصل أو التحويل.</p>
     <form onSubmit={lookupInvoices} className="mt-4 flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-sm font-bold">ابحث برقم الفاتورة أو اسم المورد
       <input className={inputClass} maxLength={100} value={invoiceSearch}
        placeholder="رقم الفاتورة أو المورد" disabled={busy||loading}
        onChange={e=>setInvoiceSearch(e.target.value)}/>
      </label>
      <button className="site-btn site-btn-outline" type="submit" disabled={busy||loading}>بحث</button>
     </form>
     <label className="mt-4 block text-sm font-bold">فاتورة المورد
      <select className={inputClass} value={selectedInvoice} disabled={loading||busy}
       onChange={e=>{setSelectedInvoice(e.target.value);changedPayment();}}>
       {!invoices.length&&<option value="">لا توجد فواتير مسجلة</option>}
       {invoices.map(row=><option key={row.id} value={row.id}>
        {row.invoiceNumber} — {row.supplier.name} — المتبقي {iqd(row.remainingIqd)}
       </option>)}
      </select>
     </label>
     {invoice&&<div className="mt-3 grid gap-1 rounded-xl border border-brand/20 p-3 text-sm">
      <p>قيمة الفاتورة: <strong>{iqd(invoice.amountIqd)}</strong></p>
      <p>المسدّد: <strong>{iqd(invoice.paidIqd)}</strong></p>
      <p>المتبقي: <strong className="text-brand">{iqd(invoice.remainingIqd)}</strong></p>
      <p className="site-muted text-xs">تاريخ الاستحقاق: {invoice.dueDate}</p>
     </div>}
     <form className="mt-4 space-y-3" onSubmit={recordPayment}>
      <label className="block text-sm font-bold">قيمة الدفعة المؤكدة
       <input className={inputClass} type="number" step={1} min={1} max={invoice?.remainingIqd||0} required
        value={paymentAmount} disabled={busy||!invoice||invoice.remainingIqd===0}
        onChange={e=>{setPaymentAmount(e.target.value);changedPayment();}}/>
      </label>
      <label className="block text-sm font-bold">طريقة الدفع
       <select className={inputClass} disabled={busy} value={paymentMethod}
        onChange={e=>{setPaymentMethod(e.target.value as "cash"|"bank_transfer"|"other");changedPayment();}}>
        <option value="bank_transfer">تحويل مصرفي موثّق</option>
        <option value="cash">نقدي موثّق</option>
        <option value="other">طريقة أخرى موثّقة</option>
       </select>
      </label>
      <label className="block text-sm font-bold">رقم الوصل أو مرجع التحويل
       <input className={inputClass} required minLength={8} maxLength={200}
        placeholder="مثلاً: حوالة مصرفية مرجع 12345" value={paymentReference} disabled={busy}
        onChange={e=>{setPaymentReference(e.target.value);changedPayment();}}/>
      </label>
      {confirmPayment&&<p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">
       راجع الوصل: هل دفعت فعلياً {iqd(Number(paymentAmount)||0)} للمورد؟ سيُحفظ سجل محاسبي فقط.
      </p>}
      <button type="submit" className="site-btn site-btn-primary" disabled={busy||!invoice||invoice.remainingIqd===0}>
       {busy?"جاري الحفظ...":confirmPayment?"تأكيد توثيق الدفعة":"مراجعة الدفعة"}
      </button>
     </form>
     {invoice&&<div className="mt-5 space-y-2">
      <h3 className="font-black">سجل دفعات الفاتورة</h3>
      {!invoice.payments.length&&<p className="site-muted text-sm">ماكو دفعات موثقة لهالفاتورة.</p>}
      {invoice.payments.map(row=><div className="rounded-xl border border-brand/15 p-3 text-sm" key={row.id}>
       <strong>{iqd(row.amountIqd)}</strong>
       <span className="site-muted ms-2 text-xs">{new Date(row.createdAt).toLocaleDateString("ar-IQ")}</span>
       <p className="site-muted mt-1 break-words text-xs">{row.reference}</p>
      </div>)}
     </div>}
    </section>
   </div>
  </div>
 </AdminLayout>;
}
