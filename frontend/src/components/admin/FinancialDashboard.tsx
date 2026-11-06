"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowUpLeft,CalendarClock,HandCoins,RefreshCw} from 'lucide-react';
import {reportsAPI,type OperationalSummary,type CostCoverageReport} from '@/lib/api';

type Range='7'|'30'|'90'|'all';
type Snapshot={operations:OperationalSummary;costs:CostCoverageReport};
const money=(value:number)=>value.toLocaleString('en-US')+' د.ع';
const periods:Record<Range,string>={'7':'7 أيام','30':'30 يوم','90':'90 يوم',all:'كل الفترة'};
function Figure({title,value,note,href}:{title:string;value:string;note:string;href:string}){
 return <Link href={href} className="site-surface min-w-0 rounded-2xl border border-brand/20 p-4 transition hover:border-brand">
  <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-bold">{title}</h3><ArrowUpLeft size={16} className="shrink-0 text-brand" aria-hidden="true"/></div>
  <p className="mt-3 break-words text-xl font-black text-brand" dir="auto">{value}</p>
  <p className="site-muted mt-2 text-xs leading-6">{note}</p>
 </Link>;
}
export default function FinancialDashboard({range,refreshKey}:{range:Range;refreshKey:string}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setSnapshot(null);setError('');
  void Promise.all([reportsAPI.operations(range,controller.signal),reportsAPI.costs(range,controller.signal)])
   .then(([operations,costs])=>{
    if(operations.range!==range||costs.range!==range)throw new Error('تعذر مطابقة مؤشرات الفترة؛ أعد التحديث');
    if(!controller.signal.aborted)setSnapshot({operations,costs});
   }).catch(reason=>{
    if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'تعذر تحميل المؤشرات المالية');
   }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[range,refreshKey,revision]);
 const current=snapshot?.operations.range===range?snapshot:null;
 const operation=current?.operations,cost=current?.costs;
 return <section aria-label="المؤشرات المالية والتشغيلية" aria-busy={loading} className="space-y-4 rounded-3xl border border-brand/25 bg-paper p-4 sm:p-5">
  <header className="flex flex-wrap items-start justify-between gap-3">
   <div><h2 className="flex items-center gap-2 text-lg font-black"><HandCoins className="text-brand" size={21}/>المالية والتنبيهات التشغيلية</h2>
    <p className="site-muted mt-2 text-xs leading-6">حركات {periods[range]}، مع الذمم والصلاحية الحالية لكل الفترات.</p></div>
   <button type="button" disabled={loading} onClick={()=>setRevision(value=>value+1)} aria-label="تحديث المؤشرات المالية"
    className="site-btn site-btn-outline site-btn-sm"><RefreshCw size={16}/>تحديث</button>
  </header>
  {loading&&<p role="status" className="site-muted py-5 text-sm">جاري تحميل المؤشرات المالية للفترة المحددة...</p>}
  {error&&<div role="alert" className="rounded-xl border border-red-500/30 p-4 text-sm leading-7"><p>{error}</p>
   <button type="button" onClick={()=>setRevision(value=>value+1)} className="mt-2 font-bold text-brand underline">إعادة تحميل المؤشرات</button></div>}
  {!loading&&!error&&operation&&cost&&<>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="الأرقام المالية">
    <Figure title="التحصيل الموثّق" value={money(operation.period.collectedIqd)} note={'خلال الفترة؛ استردادات مسجلة: '+money(operation.period.refundedIqd)} href="/admin/finance"/>
    <Figure title="المصاريف التشغيلية المسجلة" value={money(operation.period.expenseIqd)} note="المدفوع خلال الفترة، بجميع طرق السداد" href="/admin/cash"/>
    <Figure title="متبقٍ لتحصيل طلبات مسلّمة" value={money(operation.receivables.dueIqd)} note={operation.receivables.orders+' طلباً بلا مرتجع، لكل الفترات'} href="/admin/finance"/>
    <Figure title="مستحقات الموردين الحالية" value={money(operation.payables.dueIqd)} note={operation.payables.invoices+' فاتورة غير مسددة بالكامل، لكل الفترات'} href="/admin/payables"/>
   </div>
   <p className="site-muted text-xs leading-6">{operation.explanations.period} صافي التحصيل بعد الاستردادات: {money(operation.period.netCollectionsIqd)}.</p>
   <div className="grid gap-4 lg:grid-cols-2">
    <section aria-label="التكلفة والهامش الموثق" className="site-surface rounded-2xl border border-brand/20 p-4">
     <h3 className="font-black">تكلفة البضاعة وهامشها الموثق</h3>
     <p className="site-muted mt-2 text-xs leading-6">طلبات مسلّمة أُنشئت خلال {periods[range]}، بلا مرتجعات وبتكلفة مكتملة.</p>
     <dl className="mt-4 space-y-3 text-sm">
      {([['مبيعات البضاعة المغطاة',cost.coveredSalesIqd],['تكلفة البضاعة الموثّقة',cost.knownCostIqd],['هامش البضاعة المغطاة',cost.knownMerchandiseMarginIqd]] as const).map(([label,value])=>
       <div key={label} className="flex flex-wrap justify-between gap-2"><dt>{label}</dt><dd className="font-black text-brand">{money(value)}</dd></div>)}
     </dl>
     <p className="site-muted mt-4 text-xs leading-6">تغطية التكلفة {cost.coveragePercent}%؛ {cost.missingCostOrders} طلبات مجهولة التكلفة و{cost.returnedDeliveredOrders} ذات مرتجع مستبعدة.</p>
     <p className="mt-2 text-xs leading-6">ليس صافي ربح؛ لا يشمل أجور التوصيل أو المصاريف وعمولات الدفع.</p>
     <Link href="/admin/reports" className="mt-3 inline-flex text-xs font-bold text-brand underline">مراجعة تغطية التكلفة</Link>
    </section>
    <section aria-label="حركة النقد وحدود الأرقام" className="site-surface rounded-2xl border border-brand/20 p-4">
     <h3 className="font-black">صافي حركة النقد المسجّلة</h3><p className="mt-3 text-xl font-black text-brand">{money(operation.period.netRecordedCashMovementIqd)}</p>
     <p className="site-muted mt-3 text-xs leading-7">{operation.explanations.cash}</p>
     <p className="mt-4 rounded-xl border border-brand/20 p-3 text-xs leading-7">رصيد الصندوق الفعلي وصافي ربح المتجر غير محسوبين هنا. يلزمان تسويات وبيانات محاسبية مكتملة.</p>
     <Link href="/admin/cash" className="mt-3 inline-flex text-xs font-bold text-brand underline">مراجعة المصاريف وحركة النقد</Link>
    </section>
   </div>
   <section aria-label="مهام المتابعة المالية" className="site-surface rounded-2xl border border-brand/20 p-4 text-sm leading-7">
    <h3 className="font-black">يحتاج متابعة</h3>
    <p className="mt-2">للموردين {operation.payables.overdueInvoices} فاتورة متأخرة بمجموع {money(operation.payables.overdueIqd)}. <Link href="/admin/payables" className="font-bold text-brand underline">راجع استحقاقاتها</Link></p>
    <p className="mt-2">استُبعدت {operation.receivables.excludedReturnOrders} طلبات مسلّمة ذات مرتجع من الذمم، و{operation.receivables.returnedOrders} طلبات بحالة مرتجع. <Link href="/admin/reports#return-review" className="font-bold text-brand underline">مراجعة التسويات المالية للمرتجعات</Link></p>
    <details className="mt-3"><summary className="cursor-pointer font-bold text-brand">كيف تُحسب الذمم؟</summary>
     <p className="site-muted mt-2 text-xs leading-7">{operation.explanations.receivables} {operation.explanations.payables}</p></details>
   </section>
   <section aria-label="تنبيهات صلاحية التشغيلات" className="site-surface rounded-2xl border border-brand/20 p-4">
    <h3 className="flex items-center gap-2 font-black"><CalendarClock size={19} className="text-brand"/>صلاحية التشغيلات الحالية</h3>
    <p className="site-muted mt-2 text-xs leading-7">{operation.expiry.expiredLots} تشغيلات منتهية ({operation.expiry.expiredUnits} قطعة)، و{operation.expiry.soonLots} قريبة من الانتهاء ({operation.expiry.soonUnits} قطعة) حتى {operation.expiry.through}. الكميات المسجلة الموجبة فقط.</p>
    {operation.expiry.lots.length?<ul className="mt-3 grid gap-3 sm:grid-cols-2">{operation.expiry.lots.map(lot=><li key={lot.id} className="min-w-0 rounded-xl border border-brand/15 p-3 text-sm">
     <p className="break-words font-bold">{lot.product.name}</p><p className="site-muted mt-1 break-words text-xs leading-6">التشغيلة {lot.code} · {lot.stock} قطعة · تنتهي {lot.expiryDate}</p>
    </li>)}</ul>:<p className="site-muted mt-3 text-sm">لا توجد تشغيلات بمخزون موجب منتهية أو تنتهي خلال 30 يوماً.</p>}
    {operation.expiry.hasMore&&<p className="site-muted mt-3 text-xs">تظهر أول {operation.expiry.limit} تشغيلات؛ المجاميع أعلاه تشمل الكل.</p>}
    <Link href="/admin/products" className="mt-3 inline-flex text-xs font-bold text-brand underline">راجع التشغيلات والمخزون المتاح للبيع</Link>
   </section>
  </>}
 </section>;
}
