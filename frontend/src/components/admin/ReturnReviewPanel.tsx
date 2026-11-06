"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {reportsAPI,type ReturnReviewReport} from '@/lib/api';

type Range='7'|'30'|'90'|'all';
const money=(value:number)=>value.toLocaleString('en-US')+' د.ع';
const date=(value:string)=>new Date(value).toLocaleString('ar-IQ',{timeZone:'Asia/Baghdad'});
export default function ReturnReviewPanel({range}:{range:Range}){
 const [page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const [report,setReport]=useState<ReturnReviewReport|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();setBusy(true);setReport(null);setError('');
  void reportsAPI.returnReview(range,page,controller.signal).then(value=>{
   if(value.range!==range||value.page!==page)throw Error('تعذرت مطابقة فترة المرتجعات وصفحتها؛ أعد التحديث.');
   if(!controller.signal.aborted)setReport(value);
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'تعذر تحميل مراجعة المرتجعات.');})
   .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
  return()=>controller.abort();
 },[range,page,revision]);
 const current=report?.range===range&&report.page===page?report:null;
 return <section id="return-review" aria-label="مراجعة التسويات المالية للمرتجعات" aria-busy={busy}
  className="site-surface mt-6 scroll-mt-24 rounded-2xl border border-brand/25 p-4 sm:p-5">
  <header className="flex flex-wrap items-start justify-between gap-3">
   <div><h2 className="text-lg font-black">مراجعة التسويات المالية للمرتجعات</h2>
    <p className="site-muted mt-2 text-sm leading-7">سندات استلام فعلية؛ التسوية المالية تحتاج مراجعة مستقلة. لا يتحرك مال أو مخزون من هذا التقرير.</p></div>
   <button type="button" disabled={busy} className="site-btn site-btn-outline site-btn-sm" onClick={()=>setRevision(n=>n+1)}>تحديث المرتجعات</button>
  </header>
  {busy&&<p role="status" className="site-muted py-6">جاري تحميل سندات الفترة المحددة...</p>}
  {error&&<div role="alert" className="mt-4 rounded-xl border border-red-500/40 p-4 text-sm leading-7"><p>{error}</p>
   <button type="button" className="mt-2 font-bold underline" onClick={()=>{setPage(1);setRevision(n=>n+1);}}>إعادة تحميل المرتجعات من الصفحة الأولى</button></div>}
  {!busy&&!error&&current&&<>
   <p className="site-muted mt-4 text-xs leading-7">{current.explanations.period}</p>
   <p className="mt-3 rounded-xl border border-brand/25 p-3 text-sm leading-7">{current.explanations.money} {current.explanations.review}</p>
   {current.legacyWithoutEvidence>0&&<p className="mt-3 rounded-xl border border-amber-500/50 p-3 text-sm leading-7">
    يوجد {current.legacyWithoutEvidence} طلبات قديمة بحالة مرتجع بلا سند استلام مفصل، عبر كل الفترات. لا تظهر ضمن السندات أدناه؛ راجع أدلتها قبل أي تسوية.</p>}
   <p className="mt-4 font-bold">{current.total} سند استلام ضمن الفترة</p>
   {!current.rows.length?<p className="site-muted py-6 text-sm">لا توجد سندات استلام مرتجعات ضمن الفترة المختارة.</p>:<div className="mt-4 space-y-3">
    {current.rows.map(row=><details key={row.returnId} className="min-w-0 rounded-xl border border-brand/25 p-4">
     <summary className="cursor-pointer break-words text-sm font-bold leading-7">
      طلب <bdi>{row.orderId}</bdi> — {row.units} قطعة مرتجعة · {date(row.receivedAt)}
     </summary>
     <p className="site-muted mt-3 break-all text-xs leading-6">سند {row.returnId} · حالة الطلب الحالية: {row.currentOrderStatus}</p>
     <p className="mt-3 text-sm font-bold">تسوية هذا السند غير موثقة بهذا التقرير</p>
     <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      {([
       ['أعيدت للمخزون الصالح',row.restockedUnits+' قطعة'],['حجر / غير صالحة للبيع',row.quarantinedUnits+' قطعة'],
       ['قيمة البيع قبل الخصم والشحن',money(row.grossSaleValueIqd)],
       ['تكلفة البيع الأصلية',row.cost.totalHistoricalSaleCostIqd===null?'غير مكتملة':money(row.cost.totalHistoricalSaleCostIqd)],
       ['التكلفة الأصلية الموثقة جزئياً',money(row.cost.documentedPartIqd)],['قطع مجهولة التكلفة',String(row.cost.unknownUnits)]
      ] as const).map(([label,value])=><div key={label} className="min-w-0 rounded-lg border border-brand/15 p-3"><dt className="site-muted text-xs">{label}</dt><dd className="mt-2 break-words font-bold">{value}</dd></div>)}
     </dl>
     <p className="site-muted mt-3 text-xs leading-7">{current.explanations.cost}</p>
     <h3 className="mt-4 font-bold">دفتر الطلب الحالي كاملاً — لا تجمعه مع سند آخر لنفس الطلب</h3>
     <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      {([
       ['التحصيل المسجل',row.currentOrderLedger.collectedIqd],['الاسترداد المسجل',row.currentOrderLedger.refundedIqd],
       ['سقف رد البضاعة المسموح',row.currentOrderLedger.refundableCeilingIqd],['المتبقي ضمن سقف الرد',row.currentOrderLedger.refundableRemainingIqd]
      ] as const).map(([label,value])=><div key={label} className="min-w-0"><dt className="site-muted text-xs">{label}</dt><dd className="mt-1 break-words font-bold">{money(value)}</dd></div>)}
     </dl>
     {row.currentOrderLedger.refundAboveMerchandiseCeiling&&<p className="mt-3 text-sm font-bold">الاسترداد الحالي يتجاوز سقف البضاعة الحالي؛ راجع تاريخ الحركات وسبب الرد.</p>}
     <ul aria-label="بنود المرتجع" className="mt-4 space-y-2 text-sm leading-7">{row.lines.map((line,index)=><li key={index} className="break-words rounded-lg border border-brand/15 p-3">
      {line.productName||'منتج بلا اسم محفوظ'} · {line.quantity} قطعة · {line.disposition==='quarantined'?'محجورة':'أعيدت للمخزون'}
      {line.lotId&&<p className="site-muted break-all text-xs">تشغيلة <bdi>{line.lotId}</bdi></p>}
     </li>)}</ul>
     <Link href={'/admin/finance?orderId='+encodeURIComponent(row.orderId)} className="mt-4 inline-flex min-h-11 items-center font-bold underline">مراجعة سجل الطلب المالي</Link>
    </details>)}
   </div>}
   <nav aria-label="صفحات مراجعة المرتجعات" className="mt-5 flex flex-wrap items-center gap-3">
    <button type="button" disabled={page<=1} className="site-btn site-btn-outline site-btn-sm" onClick={()=>setPage(n=>n-1)}>الصفحة السابقة</button>
    <span className="text-sm">صفحة {current.page} من {current.totalPages}</span>
    <button type="button" disabled={page>=current.totalPages} className="site-btn site-btn-outline site-btn-sm" onClick={()=>setPage(n=>n+1)}>الصفحة التالية</button>
   </nav>
   <p className="site-muted mt-4 text-xs">آخر تحديث: {date(current.generatedAt)} — توقيت العراق</p>
  </>}
 </section>;
}
