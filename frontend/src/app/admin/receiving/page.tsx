"use client";

import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import Link from "next/link";
import {ClipboardCheck,PackageCheck,RefreshCw,TriangleAlert,Warehouse} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import {procurementAPI,receivingAPI,type PurchaseDraftRecord,type ReceivingSnapshot} from "@/lib/api";

type ReceiveDraft = {quantity:string;lotCode:string;expiryDate:string};
const empty = ():ReceiveDraft => ({quantity:"",lotCode:"",expiryDate:""});
const number = (value:number) => value.toLocaleString("en-US");
const iqd = (value:number) => number(value)+" د.ع";
const textInput = "site-input mt-1 w-full min-w-0 px-3 py-2";

export default function ReceivingAdminPage(){
 const [orders,setOrders]=useState<PurchaseDraftRecord[]>([]);
 const [orderId,setOrderId]=useState("");
 const [snapshot,setSnapshot]=useState<ReceivingSnapshot|null>(null);
 const [lines,setLines]=useState<Record<string,ReceiveDraft>>({});
 const [note,setNote]=useState("");
 const [loading,setLoading]=useState(true);
 const [detailsLoading,setDetailsLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [review,setReview]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const requestId=useRef<string|null>(null);

 const loadOrders=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const list=await procurementAPI.drafts();
   const ordered=list.filter(order=>order.status==="ordered");
   setOrders(ordered);
   const preferred=new URLSearchParams(window.location.search).get("orderId");
   setOrderId(current=>ordered.some(order=>order.id===current)?current:
    ordered.find(order=>order.id===preferred)?.id||ordered[0]?.id||"");
  }catch(e){
   setError(e instanceof Error?e.message:"تعذر تحميل أوامر الشراء");
  }finally{setLoading(false);}
 },[]);

 useEffect(()=>{void loadOrders()},[loadOrders]);

 const loadSnapshot=useCallback(async(id:string)=>{
  if(!id){setSnapshot(null);setLines({});return;}
  setDetailsLoading(true);setError("");setReview(false);
  try{
   const data=await receivingAPI.get(id);
   setSnapshot(data);
   setLines(Object.fromEntries(data.lines.map(line=>[line.id,empty()])));
   setNote("");
   requestId.current=null;
  }catch(e){
   setSnapshot(null);
   setError(e instanceof Error?e.message:"تعذر تحميل سند الشراء");
  }finally{setDetailsLoading(false);}
 },[]);
 useEffect(()=>{void loadSnapshot(orderId)},[orderId,loadSnapshot]);

 const chosen=useMemo(()=>{
  if(!snapshot)return [];
  return snapshot.lines.flatMap(line=>{
   const draft=lines[line.id]||empty();
   const quantity=Number(draft.quantity);
   if(draft.quantity.trim()===""||quantity===0)return [];
   return [{line,draft,quantity}];
  });
 },[lines,snapshot]);
 const total=chosen.reduce((sum,row)=>sum+row.quantity*row.line.unitCostIqd,0);
 const complete=snapshot?.complete===true;
 const canSave=Boolean(snapshot&&snapshot.status==="ordered"&&!complete&&!loading&&!detailsLoading&&!busy);
 const change=(id:string,field:keyof ReceiveDraft,value:string)=>{
  requestId.current=null;setReview(false);setNotice("");
  setLines(previous=>({...previous,[id]:{...(previous[id]||empty()),[field]:value}}));
 };
 const validate=()=>{
  if(!snapshot||!canSave)return "سند الاستلام غير متاح";
  if(note.trim().length<8||note.trim().length>300)
   return "اكتب رقم سند الاستلام أو المرجع، من 8 إلى 300 حرف";
  if(chosen.length===0)return "اختَر منتجاً واحداً على الأقل وحدد الكمية المستلمة";
  if(chosen.some(row=>!Number.isSafeInteger(row.quantity)||row.quantity<1||row.quantity>row.line.remainingQuantity))
   return "كمية الاستلام يجب أن تكون صحيحة ولا تتجاوز المتبقي";
  if(chosen.some(row=>row.line.lotTracking&&(!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/.test(row.draft.lotCode.trim())||!/^\d{4}-\d{2}-\d{2}$/.test(row.draft.expiryDate))))
   return "المنتج الذي يتتبع التشغيلات يحتاج رقم تشغيلة صالح وتاريخ انتهاء";
  if(chosen.some(row=>!row.line.lotTracking&&(row.draft.lotCode||row.draft.expiryDate)))
   return "لا تدخل بيانات تشغيلة لمنتج لا يتتبع التشغيلات";
  return "";
 };
 const submit=async(e:FormEvent)=>{
  e.preventDefault();setError("");setNotice("");
  const invalid=validate();
  if(invalid){setError(invalid);setReview(false);return;}
  if(!review){setReview(true);return;}
  if(!snapshot)return;
  if(!requestId.current)requestId.current=crypto.randomUUID();
  const payload={
   requestId:requestId.current,expectedRevision:snapshot.receiptRevision,
   note:note.trim(),
   lines:chosen.map(row=>({
    purchaseOrderLineId:row.line.id,quantity:row.quantity,
    ...(row.line.lotTracking?{lotCode:row.draft.lotCode.trim().toUpperCase(),
      expiryDate:row.draft.expiryDate}:{})
   }))
  };
  setBusy(true);
  try{
   const result=await receivingAPI.receive(snapshot.id,payload);
   // Always re-read authoritative server state after a confirmed write.
   await loadSnapshot(snapshot.id);
   setNotice(result.alreadyProcessed
    ?"سند الاستلام محفوظ مسبقاً؛ لم تتكرر إضافة المخزون.":"تم تسجيل البضاعة وتحديث المخزون بنجاح.");
  }catch(e){
   setReview(false);
   setError((e instanceof Error?e.message:"تعذر توثيق الاستلام")+
    " — إذا كان الاتصال انقطع بعد الضغط، حدّث السجل وتحقق من سند الاستلام قبل إعادة المحاولة.");
   // Retain requestId for safe idempotent replay while the form is unchanged.
  }finally{setBusy(false);}
 };

 return <AdminLayout>
  <div className="space-y-5">
   <header className="flex flex-wrap items-start justify-between gap-3">
    <div>
     <div className="site-eyebrow flex items-center gap-2"><Warehouse size={15}/> المخزون / المشتريات</div>
     <h1 className="mt-2 text-2xl font-black text-ink sm:text-3xl">استلام البضاعة من الموردين</h1>
     <p className="site-muted mt-2 max-w-2xl text-sm leading-7">سجّل الكميات التي وصلت فعلياً؛ رصيد المخزون يتحدّث فقط بعد تأكيد السند.</p>
    </div>
    <div className="flex gap-2">
     <Link className="site-btn site-btn-outline site-btn-sm" href="/admin/procurement">أوامر الشراء</Link>
     <button type="button" className="site-btn site-btn-outline site-btn-sm" disabled={loading||busy}
      onClick={()=>{void loadOrders();if(orderId)void loadSnapshot(orderId)}}><RefreshCw size={16}/> تحديث</button>
    </div>
   </header>
   {error&&<p role="alert" className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p>}
   {notice&&<p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">{notice}</p>}
   <section className="site-surface rounded-2xl p-4 sm:p-5">
    <label className="block text-sm font-bold" htmlFor="receiving-order">أمر الشراء المرسل للمورد</label>
    <select id="receiving-order" className={textInput} value={orderId} disabled={loading||busy}
      onChange={e=>{setOrderId(e.target.value);setNotice("");requestId.current=null;}}>
     {!orders.length&&<option value="">ماكو أوامر شراء جاهزة للاستلام</option>}
     {orders.map(order=><option value={order.id} key={order.id}>
      {order.supplier.name} — {number(order.totalIqd)} د.ع — {order.id.slice(0,12)}
     </option>)}
    </select>
    {loading&&<p role="status" className="site-muted mt-2 text-sm">جاري تحميل أوامر الشراء...</p>}
    {!loading&&!orders.length&&<p className="site-muted mt-3 text-sm">وثّق إرسال أمر شراء معتمد إلى المورد حتى يظهر هنا.</p>}
   </section>
   {detailsLoading&&<p role="status" className="site-muted">جاري تحميل الكميات المستلمة...</p>}
   {snapshot&&!detailsLoading&&<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
    <form onSubmit={submit} className="site-surface min-w-0 space-y-5 rounded-2xl p-4 sm:p-6">
     <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-black">سند الاستلام</h2>
       <p className="site-muted mt-1 text-xs">رقم مراجعة الاستلام: {number(snapshot.receiptRevision)}</p></div>
      <span className={"rounded-full px-3 py-1 text-xs font-black "+(complete?"bg-emerald-100 text-emerald-900":"bg-amber-100 text-amber-900")}>
       {complete?"مستلم بالكامل":"استلام جزئي متاح"}
      </span>
     </div>
     {snapshot.lines.map(line=>{
      const draft=lines[line.id]||empty();
      return <fieldset key={line.id} disabled={!canSave||line.remainingQuantity===0}
       className="min-w-0 space-y-3 rounded-xl border border-brand/20 p-3 sm:p-4">
       <legend className="px-1 font-black">{line.productName}</legend>
       <div className="grid gap-2 text-xs sm:grid-cols-3">
        <span>المطلوب: <strong>{number(line.quantity)}</strong></span>
        <span>المستلم: <strong>{number(line.receivedQuantity)}</strong></span>
        <span>المتبقي: <strong>{number(line.remainingQuantity)}</strong></span>
       </div>
       <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-bold">الكمية الواصلة
         <input className={textInput} type="number" min={0} max={line.remainingQuantity} step={1}
          inputMode="numeric" value={draft.quantity} placeholder="0"
          onChange={e=>change(line.id,"quantity",e.target.value)}/></label>
        {line.lotTracking&&<>
         <label className="text-xs font-bold">رقم التشغيلة
          <input className={textInput} maxLength={80} value={draft.lotCode}
           placeholder="LOT-001" onChange={e=>change(line.id,"lotCode",e.target.value)}/></label>
         <label className="text-xs font-bold">تاريخ انتهاء الصلاحية
          <input className={textInput} type="date" value={draft.expiryDate}
           onChange={e=>change(line.id,"expiryDate",e.target.value)}/></label>
        </>}
       </div>
       <p className="site-muted text-xs">تكلفة الشراء المعتمدة: {iqd(line.unitCostIqd)} للوحدة</p>
      </fieldset>
     })}
     {!complete&&<label className="block text-sm font-bold">مرجع سند الاستلام أو رقم فاتورة التوريد
      <textarea className={textInput} rows={3} maxLength={300} minLength={8} value={note}
       disabled={!canSave} placeholder="مثلاً: سند تسليم المورد رقم 1254 وتاريخ الاستلام"
       onChange={e=>{setNote(e.target.value);setReview(false);requestId.current=null}}/>
     </label>}
     {review&&<div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="flex items-center gap-2 font-black"><TriangleAlert size={18}/> راجع قبل التثبيت</p>
      <p className="mt-2 leading-7">ستُضاف {number(chosen.reduce((sum,row)=>sum+row.quantity,0))} قطعة فعلية إلى المخزون من {chosen.length} منتجات، بقيمة شراء {iqd(total)}. لا يُنشئ السند دفعة مالية للمورد.</p>
     </div>}
     {!complete&&<div className="flex flex-wrap gap-2">
      <button type="submit" disabled={!canSave} className="site-btn site-btn-primary">
       <ClipboardCheck size={18}/>{busy?"جاري الحفظ...":review?"تأكيد الاستلام وتحديث المخزون":"مراجعة سند الاستلام"}
      </button>
      {review&&<button type="button" onClick={()=>setReview(false)} disabled={busy}
       className="site-btn site-btn-outline">تعديل الكميات</button>}
     </div>}
    </form>
    <aside className="space-y-4">
     <section className="site-surface rounded-2xl p-4">
      <h2 className="flex items-center gap-2 text-base font-black"><PackageCheck size={18}/> ملخص الطلب</h2>
      <p className="site-muted mt-2 text-sm">{snapshot.lines.filter(l=>l.remainingQuantity===0).length} من {snapshot.lines.length} بنود مكتملة</p>
      <p className="mt-3 text-xl font-black text-brand">{number(snapshot.lines.reduce((n,l)=>n+l.remainingQuantity,0))} قطعة متبقية</p>
      <p className="site-muted mt-2 text-xs leading-6">الاستلام يحرّك المخزون والتشغيلات، لكنه لا يسجل فاتورة مالية أو تسوية مع المورد.</p>
     </section>
     <section className="site-surface rounded-2xl p-4">
      <h2 className="mb-3 text-base font-black">سندات الاستلام السابقة</h2>
      {!snapshot.receipts.length?<p className="site-muted text-sm">ماكو سندات سابقة لهذا الطلب.</p>:
       <ol className="space-y-3">{snapshot.receipts.map(receipt=><li key={receipt.id} className="rounded-xl border border-brand/15 p-3 text-sm">
        <strong>{new Date(receipt.createdAt).toLocaleString("ar-IQ")}</strong>
        <p className="site-muted mt-1 break-words text-xs">{receipt.note}</p>
        <p className="mt-2 text-xs">عدد القطع: {number(receipt.lines.reduce((sum,line)=>sum+line.quantity,0))}</p>
       </li>)}</ol>}
     </section>
    </aside>
   </div>}
  </div>
 </AdminLayout>;
}
