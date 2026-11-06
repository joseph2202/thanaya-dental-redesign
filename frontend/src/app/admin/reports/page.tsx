"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/AdminLayout';
import ReturnReviewPanel from '@/components/admin/ReturnReviewPanel';
import {reportsAPI,exportsAPI,SalesReport,CostCoverageReport} from '@/lib/api';
import {ArrowUpRight,Package,ShoppingCart,TrendingUp,AlertTriangle,FileSpreadsheet} from 'lucide-react';

const money=(v:number)=>v.toLocaleString('en-US')+' د.ع';
const periods:[SalesReport['range'],string][]=[['7','7 أيام'],['30','30 يوم'],['90','90 يوم'],['all','كل الفترة']];
const orderStates:[string,string][]=[['pending','قيد المعالجة'],['confirmed','مؤكد'],['shipped','بالطريق'],['delivered','مُسلّم'],['cancelled','ملغي'],['returned','مرتجع']];
function Metric({label,value,note}:{label:string;value:string;note?:string}){
 return <div className="rounded-2xl border border-brand/20 bg-white p-5">
  <p className="mb-3 text-xs font-bold text-neutral-600">{label}</p>
  <p className="break-words text-2xl font-black text-brand">{value}</p>
  {note&&<p className="mt-2 text-xs text-neutral-500">{note}</p>}
 </div>;
}
export default function Reports(){
 const [range,setRange]=useState<'7'|'30'|'90'|'all'>('30'),[report,setReport]=useState<SalesReport|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const [exportBusy,setExportBusy]=useState(false),[exportError,setExportError]=useState(''),[revision,setRevision]=useState(0);
 const [costs,setCosts]=useState<CostCoverageReport|null>(null);
 useEffect(()=>{
  const controller=new AbortController();setBusy(true);setError('');setReport(null);setCosts(null);
  void Promise.all([reportsAPI.overview(range,controller.signal),reportsAPI.costs(range,controller.signal)]).then(([sales,cost])=>{
   if(sales.range!==range||cost.range!==range)throw Error('تعذرت مطابقة فترة التقارير؛ أعد التحديث.');
   if(!controller.signal.aborted){setReport(sales);setCosts(cost);}
  }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'تعذر تحميل التقرير');})
   .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
  return()=>controller.abort();
 },[range,revision]);
 const current=report?.range===range&&costs?.range===range&&!busy&&!error;
 const stats=current?report.stats:null;
 const maxValue=Math.max(1,...(report?.trend.map(x=>x.value)??[0]));
 return <AdminLayout>
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
   <div><h1 className="text-3xl font-black text-ink">تقارير المبيعات والمخزون</h1><p className="mt-2 text-sm text-neutral-600">أرقام من قاعدة البيانات، حسب حالة الطلب الفعلية.</p></div>
   <div className="flex flex-wrap gap-2">
     <button type="button" disabled={exportBusy} onClick={async()=>{setExportBusy(true);setExportError('');try{await exportsAPI.download('orders',range)}catch(e){setExportError(e instanceof Error?e.message:'تعذّر تصدير Excel')}finally{setExportBusy(false)}}} className="site-btn site-btn-outline site-btn-sm"><FileSpreadsheet size={16}/>{exportBusy?'جاري التحضير...':'تصدير الطلبات Excel'}</button>
     <button disabled={busy} onClick={()=>setRevision(n=>n+1)} className="site-btn site-btn-outline site-btn-sm">تحديث البيانات</button>
   </div>
  </div>
  <div className="mb-6 flex flex-wrap gap-2">{periods.map(([key,label])=><button key={key} onClick={()=>setRange(key as '7'|'30'|'90'|'all')} aria-pressed={range===key} className={`rounded-full border px-4 py-2 text-sm font-bold ${range===key?'border-brand bg-brand text-white':'border-brand/20 bg-white text-ink'}`}>{label}</button>)}</div>
  {error&&<p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 font-bold text-red-700">{error}</p>}
  {exportError&&<p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 font-bold text-red-700">{exportError}</p>}
  {busy&&<p role="status" className="py-12 text-neutral-600">جاري تحميل التقارير...</p>}
  {current&&report&&stats&&<div>
   <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Metric label="قيمة الطلبات المُسلّمة" value={money(stats.deliveredValue)} note="قيمة الطلبات حالتها مسلّم، ليست صافي ربح أو إثبات تحصيل"/>
    <Metric label="الطلبات المُسلّمة" value={stats.deliveredOrders.toLocaleString()} note="ضمن الفترة المختارة"/>
    <Metric label="طلبات تنتظر إكمال المعالجة" value={stats.awaitingOrders.toLocaleString()} note="جديد + مؤكد + بالطريق"/>
    <Metric label="متوسط قيمة الطلب المُسلّم" value={money(stats.averageDeliveredOrderValue)}/>
    <Metric label="كل الطلبات" value={stats.orders.toLocaleString()}/>
    <Metric label="طلبات ملغاة" value={stats.cancelledOrders.toLocaleString()}/>
    <Metric label="طلبات مرتجعة" value={stats.returnedOrders.toLocaleString()}/>
    <Metric label="خصومات الطلبات المسلّمة" value={money(stats.discountsOnDelivered)}/>
    <Metric label="التوصيل ضمن الطلبات المسلّمة" value={money(stats.deliveryFeesOnDelivered)}/>
    <Metric label="المنتجات" value={stats.totalProducts.toLocaleString()}/>
    <Metric label="منتجات مخزونها 5 أو أقل" value={stats.lowStockProducts.toLocaleString()}/>
    <Metric label="منتجات نفد مخزونها" value={stats.outOfStockProducts.toLocaleString()}/>
   </div>
   {costs&&<section className="mb-6 rounded-2xl border border-brand/25 bg-paper2/30 p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <h2 className="text-lg font-black">تكلفة البضاعة وهامش المبيعات الموثّق</h2>
     <span className="rounded-full border border-brand/30 px-3 py-1 text-xs font-bold text-brand">
      تغطية تكلفة {costs.coveragePercent}%
     </span>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
     <Metric label="مبيعات البضاعة المغطاة بتكلفة" value={money(costs.coveredSalesIqd)} note="لا تشمل أجور التوصيل"/>
     <Metric label="تكلفة البضاعة الموثّقة" value={money(costs.knownCostIqd)} note="مسجلة لحظة إنشاء الطلب"/>
     <Metric label="هامش البضاعة للطلبات المغطاة" value={money(costs.knownMerchandiseMarginIqd)} note="ليس صافي ربح المتجر"/>
    </div>
    <p className="site-muted mt-4 text-sm leading-7">تم احتساب {costs.completeCostOrders} طلبات مسلّمة كاملة التكلفة من أصل {costs.unreturnedDeliveredOrders} بدون مرتجعات. توجد {costs.missingCostOrders} طلبات مجهولة التكلفة و{costs.returnedDeliveredOrders} مستبعدة بسبب مرتجعات.</p>
    <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-950">{costs.warning}</p>
   </section>}
   <div className="grid gap-5 lg:grid-cols-2">
    <section className="rounded-2xl border border-brand/20 bg-white p-5">
     <div className="mb-4 flex items-center gap-2"><TrendingUp size={20} className="text-brand"/><h2 className="text-lg font-black">قيمة الطلبات المُسلّمة يومياً</h2></div>
     <p className="mb-4 text-xs text-neutral-500">آخر {report.trendDays} يوم، بتوقيت العراق. الأيام بحسب تاريخ إنشاء الطلب؛ الأرقام للطلبات التي حالتها الآن مُسلّم.</p>
     {report.trend.every(d=>d.value===0)&&<p className="rounded-xl bg-paper2/50 px-4 py-3 text-sm text-neutral-600">ماكو طلبات مُسلّمة ضمن الأيام المعروضة، لذلك الرسم البياني فارغ حالياً.</p>}
     <div dir="ltr" className="flex h-32 items-end gap-1" role="img" aria-label="مخطط قيمة الطلبات المسلّمة لكل يوم">
      {report.trend.map(day=><div key={day.date} title={day.date+': '+money(day.value)+' ('+day.orders+' طلب)'} className="flex h-full min-w-0 flex-1 flex-col justify-end">
       <div className="min-h-[2px] w-full rounded-t-md bg-brand/80" style={{height:`${day.value/maxValue*100}%`}}/>
      </div>)}
     </div>
     <div dir="ltr" className="mt-2 flex justify-between text-xs text-neutral-500"><span>{report.trend[0]?.date||''}</span><span>{report.trend.at(-1)?.date||''}</span></div>
    </section>
    <section className="rounded-2xl border border-brand/20 bg-white p-5">
     <div className="mb-4 flex items-center gap-2"><ShoppingCart size={20} className="text-brand"/><h2 className="text-lg font-black">حالات الطلبات</h2></div>
     <div className="space-y-3">{orderStates.map(([key,label])=><div key={key} className="flex items-center justify-between rounded-lg bg-paper2/60 px-3 py-2"><span className="text-sm">{label}</span><strong>{report.statusCounts[key]||0}</strong></div>)}</div>
    </section>
    <section className="rounded-2xl border border-brand/20 bg-white p-5">
     <div className="mb-4 flex items-center gap-2"><Package size={20} className="text-brand"/><h2 className="text-lg font-black">الأكثر مبيعاً بالقطع</h2></div>
     <p className="mb-4 text-xs text-neutral-500">يعتمد على كميات المنتجات في الطلبات المُسلّمة، لا الطلبات الملغاة أو المرتجعة.</p>
     {report.topProducts.length===0?<p className="text-sm text-neutral-500">ماكو مبيعات مُسلّمة ضمن هالفترة.</p>:<div className="space-y-2">{report.topProducts.map((p,i)=><div key={p.productId} className="flex justify-between gap-4 rounded-lg bg-paper2/60 p-3 text-sm"><span>{i+1}. {p.name}</span><strong className="whitespace-nowrap">{p.units} قطعة</strong></div>)}</div>}
    </section>
    <section className="rounded-2xl border border-amber-200 bg-white p-5">
     <div className="mb-4 flex items-center gap-2"><AlertTriangle size={20} className="text-amber-700"/><h2 className="text-lg font-black">تنبيه نقص المخزون</h2></div>
     <p className="mb-4 text-xs text-neutral-500">كميات المخزون الحالية، مستقلة عن فترة التقرير.</p>
     {report.lowStock.length===0?<p className="text-sm text-neutral-500">لا توجد منتجات منخفضة المخزون حالياً.</p>:<div className="space-y-2">{report.lowStock.map(p=><div key={p.id} className="flex justify-between gap-4 rounded-lg bg-amber-50 p-3 text-sm"><span>{p.name}</span><strong className="whitespace-nowrap text-amber-800">{p.stock} قطعة</strong></div>)}</div>}
     <Link className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand underline" href="/admin/products">إدارة المخزون <ArrowUpRight size={16}/></Link>
    </section>
   </div>
   <p className="mt-6 text-xs text-neutral-500">آخر تحديث: {new Date(report.generatedAt).toLocaleString('ar-IQ')}. هامش البضاعة يظهر فقط للطلبات ذات تكلفة موثقة، ولا يعادل صافي الربح أو التحصيل النقدي.</p>
  </div>}
  <ReturnReviewPanel key={range} range={range}/>
 </AdminLayout>;
}
