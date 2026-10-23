"use client";

import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {
  ArrowUpLeft,BarChart3,BellRing,Boxes,CalendarDays,ChevronLeft,
  CircleCheckBig,ClipboardList,Clock3,Package,PackageCheck,RefreshCw,
  ShieldCheck,ShoppingBasket,TriangleAlert,Truck,UsersRound
} from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import {ordersAPI,reportsAPI,SalesReport} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import {shortOrderCode} from '@/lib/orderPresentation';

type ManagedOrder={
  id:string;customerName:string;createdAt:string;status:string;total:number;
};
type ManagedResponse={orders:ManagedOrder[];total:number;page:number;statusCounts:Record<string,number>};
type Range='7'|'30'|'90'|'all';

const money=(amount:number)=>amount.toLocaleString('en-US')+' د.ع';
const shortMoney=(amount:number)=>amount>=1_000_000?(amount/1_000_000).toLocaleString('en-US',{maximumFractionDigits:2})+' مليون د.ع':money(amount);
const states=[
 {key:'pending',label:'جديد',icon:Clock3,accent:'bg-amber-400',bg:'bg-amber-50 text-amber-800',hint:'يحتاج متابعة'},
 {key:'confirmed',label:'مؤكد',icon:ClipboardList,accent:'bg-sky-500',bg:'bg-sky-50 text-sky-800',hint:'بانتظار الإرسال'},
 {key:'shipped',label:'بالطريق',icon:Truck,accent:'bg-violet-500',bg:'bg-violet-50 text-violet-800',hint:'بانتظار التسليم'},
 {key:'delivered',label:'مُسلّم',icon:PackageCheck,accent:'bg-emerald-500',bg:'bg-emerald-50 text-emerald-800',hint:'مكتمل'},
 {key:'cancelled',label:'ملغي',icon:TriangleAlert,accent:'bg-red-400',bg:'bg-red-50 text-red-800',hint:'ملغي'},
 {key:'returned',label:'مرتجع',icon:Boxes,accent:'bg-slate-400',bg:'bg-slate-100 text-slate-700',hint:'مرتجع'}
] as const;
const navigation=[
 {href:'/admin/orders',title:'الطلبات',description:'مراجعة الطلبات وتغيير حالاتها',icon:ShoppingBasket},
 {href:'/admin/products',title:'المخزون',description:'المنتجات والتشغيلات والصلاحية',icon:Package},
 {href:'/admin/reports',title:'التقارير',description:'مبيعات ومخزون حسب الفترة',icon:BarChart3},
 {href:'/notifications',title:'الإشعارات',description:'متابعة إشعارات المتجر',icon:BellRing}
];

function Metric({icon:Icon,title,value,note,href,accent}:{icon:typeof Package;title:string;value:string;note:string;href:string;accent:string}){
 return <Link href={href} className="thanaya-dashboard-metric group min-w-0 rounded-[20px] border border-[#cee8f0] bg-white p-4 transition hover:border-brand hover:shadow-[0_8px_26px_rgba(7,91,123,.07)] sm:p-5">
   <div className="flex items-start justify-between gap-2">
     <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accent}`}><Icon size={20} aria-hidden="true"/></div>
     <ArrowUpLeft size={17} className="text-[#a1bfca] transition group-hover:text-brand" aria-hidden="true"/>
   </div>
   <p className="thanaya-dashboard-metric-label mt-3 text-xs font-bold text-[#65818d]">{title}</p>
   <p className="thanaya-dashboard-metric-value mt-1 break-words text-[clamp(1.3rem,2.6vw,2rem)] font-black tracking-tight text-[#203e4c]" dir="auto">{value}</p>
   <p className="thanaya-dashboard-metric-note mt-1 text-[11px] leading-5 text-[#7a939e]">{note}</p>
 </Link>;
}

export default function AdminDashboard(){
 const {user,isLoading}=useAuth();
 const isManager=user?.role==='owner'||user?.role==='admin';
 const [range,setRange]=useState<Range>('30');
 const [report,setReport]=useState<SalesReport|null>(null);
 const [recent,setRecent]=useState<ManagedOrder[]>([]);
 const [refreshing,setRefreshing]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);

 const load=useCallback(async(alive:()=>boolean)=>{
   setRefreshing(true);setError('');
   try{
     const [nextReport,nextOrders]=await Promise.all([
       reportsAPI.overview(range),
       ordersAPI.manage({page:1,status:'all',search:''}) as Promise<ManagedResponse>
     ]);
     if(alive()){setReport(nextReport);setRecent(nextOrders.orders.slice(0,5));setLoaded(true);}
   }catch(e){
     if(alive())setError(e instanceof Error?e.message:'تعذّر تحميل لوحة الإدارة');
   }finally{
     if(alive()){setRefreshing(false);setLoaded(true);}
   }
 },[range]);

 useEffect(()=>{
   if(isLoading||!isManager)return;
   let live=true,activeRequest=false;
   const sync=async()=>{if(!live||activeRequest)return;activeRequest=true;try{await load(()=>live)}finally{activeRequest=false}};
   void sync();
   const interval=window.setInterval(()=>{if(document.visibilityState==='visible')void sync()},60_000);
   const onVisible=()=>{if(document.visibilityState==='visible')void sync()};
   document.addEventListener('visibilitychange',onVisible);
   return ()=>{live=false;window.clearInterval(interval);document.removeEventListener('visibilitychange',onVisible)};
 },[isLoading,isManager,load,revision]);

 const currentTotal=useMemo(()=>report?Object.values(report.statusCounts).reduce((s,n)=>s+n,0):0,[report]);
 const maxDaily=Math.max(1,...(report?.trend.map(d=>d.value)??[0]));
 const hasSales=Boolean(report?.trend.some(d=>d.value>0));
 const dateLabel=report?new Date(report.generatedAt).toLocaleString('ar-IQ',{dateStyle:'medium',timeStyle:'short'}):'—';

 if(user?.role==='inventory'||user?.role==='sales'){
   const inventory=user.role==='inventory';
   return <AdminLayout>
     <div className="thanaya-admin-welcome rounded-3xl border border-[#d0e8f1] bg-[linear-gradient(125deg,#e6f7fd,#fff)] p-6 sm:p-8">
       <span className="site-eyebrow">THANAYA / WORKSPACE</span>
       <h1 className="mt-2 text-2xl font-black sm:text-3xl">أهلاً {user.name}</h1>
       <p className="mt-2 text-sm text-[#587786]">واجهة عملك حسب الصلاحيات الممنوحة لحسابك.</p>
       <Link className="site-btn site-btn-primary mt-5" href={inventory?'/admin/products':'/admin/orders'}>
         {inventory?'إدارة المخزون':'إدارة الطلبات'} <ArrowUpLeft size={17}/>
       </Link>
     </div>
   </AdminLayout>;
 }
 return <AdminLayout>
   <div className="space-y-5 print:space-y-3">
     <header className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(120deg,#193849_0%,#075f80_60%,#048ebd_100%)] p-5 text-white sm:p-7 print:border print:border-[#c4dce7] print:bg-none print:bg-white print:p-4 print:text-[#263f4c]">
       <div className="pointer-events-none absolute -left-14 -top-20 h-64 w-64 rounded-full border-[42px] border-white/[.05] print:hidden" aria-hidden="true"/>
       <div className="relative flex flex-wrap items-start justify-between gap-4">
         <div>
           <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[.15em] text-cyan-100/85 print:text-[#21647c]"><ShieldCheck size={15}/> THANAYA ADMIN DASHBOARD</div>
           <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">لوحة التحكم</h1>
           <p className="mt-2 max-w-2xl text-sm leading-7 text-white/75 print:text-[#496b79]">متابعة الطلبات ومؤشرات الأداء وتنبيهات المخزون من مكان واحد، اعتماداً على البيانات المسجلة في المتجر.</p>
         </div>
         <div className="flex flex-wrap items-center gap-2 print:hidden">
           <Link href="/admin/orders" className="thanaya-admin-hero-action inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-xs font-black text-[#0b5675] hover:bg-cyan-50">افتح الطلبات <ArrowUpLeft size={16}/></Link>
           <button onClick={()=>setRevision(v=>v+1)} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-60">
             <RefreshCw size={16} className={refreshing?'animate-spin':''}/>{refreshing?'جاري التحديث':'تحديث الآن'}
           </button>
         </div>
       </div>
       <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/20 pt-4 print:mt-3 print:border-[#d6e9f1] print:pt-2">
         <div className="flex items-center gap-2 text-xs text-white/85 print:text-[#496b79]">
           <CalendarDays size={16}/> آخر تحديث: {dateLabel}
         </div>
         <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/85 print:hidden">تحديث تلقائي كل دقيقة عند فتح الصفحة</span>
       </div>
     </header>

     <div className="flex flex-wrap items-center justify-between gap-3">
       <h2 className="thanaya-admin-overview-heading text-lg font-black text-[#203e4c]">ملخص أداء المتجر <span className="text-xs font-normal text-[#718d9a]">— الفترة المختارة</span></h2>
       <div className="thanaya-admin-range inline-flex flex-wrap items-center gap-1 rounded-full border border-[#cfe4ee] bg-white p-1" aria-label="فترة التقرير">
         {([['7','7 أيام'],['30','30 يوم'],['90','90 يوم'],['all','الكل']] as const).map(([value,label])=>
           <button key={value} aria-pressed={range===value} disabled={refreshing} onClick={()=>setRange(value)} className={`rounded-full px-3 py-2 text-xs font-bold transition disabled:opacity-60 ${range===value?'bg-brand text-white':'text-[#506f80] hover:bg-[#edf7fb]'}`}>{label}</button>
         )}
       </div>
     </div>
     {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
       <span>{error}</span><button onClick={()=>setRevision(x=>x+1)} className="underline">إعادة المحاولة</button>
     </div>}
     {!loaded&&!report?<p role="status" className="rounded-2xl border border-[#d4e8ef] bg-white p-8 text-center text-[#587483]">جاري تحميل لوحة ثنايا...</p>:null}
     {report&&<>
       <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 print:grid-cols-4 print:gap-2">
         <Metric icon={Clock3} title="تحتاج متابعة" value={report.stats.awaitingOrders.toLocaleString('en-US')} note="جديد + مؤكد + بالطريق" href="/admin/orders" accent="bg-amber-100 text-amber-700"/>
         <Metric icon={CircleCheckBig} title="قيمة الطلبات المُسلّمة" value={shortMoney(report.stats.deliveredValue)} note="ليست إثبات تحصيل ولا صافي ربح" href="/admin/reports" accent="bg-emerald-100 text-emerald-700"/>
         <Metric icon={ShoppingBasket} title="الطلبات ضمن الفترة" value={report.stats.orders.toLocaleString('en-US')} note={report.stats.deliveredOrders+' منها حالتها مُسلّم'} href="/admin/orders" accent="bg-sky-100 text-sky-700"/>
         <Metric icon={Package} title="منتجات مسجّلة" value={report.stats.totalProducts.toLocaleString('en-US')} note="تشمل المخفية من واجهة الزبون" href="/admin/products" accent="bg-indigo-100 text-indigo-700"/>
       </div>
       <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(310px,1fr)] print:grid-cols-2 print:gap-3">
         <section className="min-w-0 rounded-[23px] border border-[#cfe7f0] bg-white p-4 sm:p-5" aria-labelledby="trend-label">
           <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
             <div><span className="site-eyebrow">SALES SNAPSHOT</span><h2 id="trend-label" className="mt-1 text-lg font-black">حركة الطلبات المُسلّمة</h2><p className="mt-1 text-xs leading-6 text-[#748b97]">حسب تاريخ إنشاء الطلب وبتوقيت العراق. يعرض آخر {report.trendDays} يوماً.</p></div>
             <Link href="/admin/reports" className="inline-flex items-center gap-1.5 text-xs font-black text-brand hover:underline">التقرير الكامل <ArrowUpLeft size={15}/></Link>
           </div>
           {hasSales?<div className="relative">
             <div role="img" aria-label="رسم أعمدة لقيمة الطلبات المسلّمة يومياً" dir="ltr" className="flex h-40 items-end gap-[3px] border-b border-[#dcecf2] pb-1 sm:h-52">
               {report.trend.map(day=><div key={day.date} title={day.date+' · '+money(day.value)+' · '+day.orders+' طلب'} className="group flex h-full min-w-0 flex-1 flex-col justify-end">
                 <div className={`min-h-[2px] w-full rounded-t bg-[linear-gradient(180deg,#04b4dd,#0484b3)] transition-opacity group-hover:opacity-70 ${day.value===0?'opacity-20':''}`} style={{height:(day.value===0?2:Math.max(5,100*day.value/maxDaily))+'%'}}/>
               </div>)}
             </div>
             <div dir="ltr" className="mt-2 flex justify-between text-[11px] text-[#7992a1]"><span>{report.trend[0]?.date}</span><span>{report.trend.at(-1)?.date}</span></div>
           </div>:<div className="grid min-h-44 place-items-center rounded-xl border border-dashed border-[#c5e0ec] bg-[#f6fbfd] p-5 text-center">
             <div><BarChart3 size={30} className="mx-auto text-[#79bcd4]"/><p className="mt-2 text-sm font-bold text-[#36596d]">ماكو طلبات مُسلّمة ضمن أيام الرسم</p><p className="mt-1 text-xs text-[#758f9b]">راح يظهر المخطط تلقائياً بعد تسجيل طلبات مُسلّمة.</p></div>
           </div>}
           <p className="mt-4 rounded-lg bg-[#f0f8fb] px-3 py-2 text-[11px] leading-6 text-[#527384]">القيمة المعروضة مرتبطة بحالة الطلب، ولا تعني أن المبلغ انقبض فعلياً. صافي الربح يحتاج تسجيل تكلفة شراء المنتجات.</p>
         </section>
         <section className="min-w-0 rounded-[23px] border border-[#cfe7f0] bg-white p-4 sm:p-5" aria-labelledby="pipeline-label">
           <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><span className="site-eyebrow">ORDER PIPELINE</span><h2 id="pipeline-label" className="mt-1 text-lg font-black">مراحل الطلبات</h2></div><Link href="/admin/orders" className="text-xs font-bold text-brand hover:underline">إدارة <ChevronLeft size={15} className="inline"/></Link></div>
           <div className="space-y-3">
             {states.map(item=>{const count=report.statusCounts[item.key]||0;const Icon=item.icon;return <div key={item.key} className="flex items-center gap-3">
               <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${item.bg}`}><Icon size={17}/></div>
               <div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-xs font-bold"><span>{item.label}</span><span>{count}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#edf3f6]"><div className={`h-full rounded-full ${item.accent}`} style={{width:(currentTotal?100*count/currentTotal:0)+'%'}}/></div></div>
             </div>})}
           </div>
         </section>
       </div>
       <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] print:grid-cols-2 print:gap-3">
         <section className="min-w-0 rounded-[23px] border border-[#cfe7f0] bg-white p-4 sm:p-5" aria-labelledby="latest-label">
           <div className="mb-4 flex items-center justify-between gap-3"><div><span className="site-eyebrow">LATEST ACTIVITY</span><h2 id="latest-label" className="mt-1 text-lg font-black">آخر الطلبات</h2></div><Link href="/admin/orders" className="text-xs font-black text-brand hover:underline">الكل <ArrowUpLeft size={15} className="inline"/></Link></div>
           {recent.length>0?<div className="divide-y divide-[#e7f1f5]">
             {recent.map(order=>{const state=states.find(s=>s.key===order.status);return <Link href="/admin/orders" key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-[#f8fcfd]">
               <div className="min-w-0"><p className="text-xs font-black text-[#047da9]" dir="ltr">#{shortOrderCode(order.id)}</p><p className="mt-1 max-w-60 truncate text-sm font-bold text-[#284551]">{order.customerName}</p><p className="mt-1 text-[11px] text-[#8699a2]">{new Date(order.createdAt).toLocaleString('ar-IQ',{dateStyle:'short',timeStyle:'short'})}</p></div>
               <div className="text-left"><p className="text-sm font-black text-[#284551]">{money(order.total)}</p><span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${state?.bg??'bg-gray-100 text-gray-700'}`}>{state?.label??order.status}</span></div>
             </Link>})}
           </div>:<p className="rounded-xl bg-[#f2f9fc] p-5 text-center text-sm text-[#607f8e]">ماكو طلبات بعد.</p>}
         </section>
         <section className="min-w-0 rounded-[23px] border border-[#cfe7f0] bg-white p-4 sm:p-5" aria-labelledby="stock-label">
           <div className="mb-4 flex items-center justify-between gap-3"><div><span className="site-eyebrow">STOCK WATCH</span><h2 id="stock-label" className="mt-1 text-lg font-black">تنبيهات المخزون</h2></div><Link href="/admin/products" className="text-xs font-black text-brand hover:underline">الجرد <ArrowUpLeft size={15} className="inline"/></Link></div>
           <div className="mb-3 grid grid-cols-2 gap-2">
             <div className="rounded-xl bg-amber-50 p-3"><TriangleAlert size={17} className="text-amber-700"/><p className="mt-2 text-2xl font-black text-amber-900">{report.stats.lowStockProducts}</p><p className="text-[11px] text-amber-800">مخزون 5 أو أقل</p></div>
             <div className="rounded-xl bg-rose-50 p-3"><Boxes size={17} className="text-rose-700"/><p className="mt-2 text-2xl font-black text-rose-900">{report.stats.outOfStockProducts}</p><p className="text-[11px] text-rose-800">مخزون صفر</p></div>
           </div>
           {report.lowStock.length?<div className="divide-y divide-[#e7f1f5]">
             {report.lowStock.slice(0,4).map(p=><div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
               <span className="min-w-0 truncate text-sm font-bold text-[#365662]">{p.name}</span>
               <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${p.stock===0?'bg-red-100 text-red-700':'bg-amber-100 text-amber-800'}`}>{p.stock} قطعة</span>
             </div>)}
           </div>:<div className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CircleCheckBig size={17} className="ml-1 inline"/> ماكو منتجات منخفضة المخزون حسب حد التقرير.</div>}
           <p className="mt-3 text-[11px] leading-6 text-[#8296a1]">الأرقام تشمل المنتجات المخفية وتعتمد على كمية المخزون المسجلة؛ تواريخ الصلاحية تُراجع ضمن إدارة التشغيلات.</p>
         </section>
       </div>
     </>}
     <section className="rounded-[23px] border border-[#cfe7f0] bg-white p-4 sm:p-5" aria-labelledby="shortcuts-label">
       <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><span className="site-eyebrow">QUICK ACTIONS</span><h2 id="shortcuts-label" className="mt-1 text-lg font-black">أماكن عملك اليومية</h2></div><span className="text-xs text-[#8497a1]">اختصارات لصلاحيات الإدارة</span></div>
       <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
         {navigation.map(item=>{const Icon=item.icon;return <Link key={item.href} href={item.href} className="group flex items-center gap-3 rounded-xl border border-[#dcebf1] bg-[#f8fbfd] p-3 transition hover:border-brand hover:bg-[#eaf8fc]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e2f4fa] text-[#0589b7]"><Icon size={20}/></span><span className="min-w-0 flex-1"><strong className="block text-sm text-[#2b4858]">{item.title}</strong><small className="mt-1 block text-[11px] text-[#758e99]">{item.description}</small></span><ArrowUpLeft size={15} className="text-[#85abbc] transition group-hover:text-brand"/></Link>})}
       </div>
     </section>
     <p className="pb-1 text-center text-xs leading-6 text-[#738b98]">نسخة العمليات الأولى: التقارير والأوامر مرتبطة ببيانات المتجر الحالية؛ الفواتير وإثبات الدفع وصافي الربح ستضاف بمراحل مستقلة.</p>
   </div>
 </AdminLayout>;
}
