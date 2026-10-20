"use client";
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {ArrowUpLeft,PackageOpen,CalendarDays,MapPinned,ShoppingBag,PackageCheck,Clock3,Search,ClipboardList,UserRound,ArrowLeft} from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import {useAuth} from '@/context/AuthContext';
import {ordersAPI} from '@/lib/api';
import AddressBook from '@/components/account/AddressBook';
import {orderStatusColors,orderStatusLabels,shortOrderCode} from '@/lib/orderPresentation';

type CustomerOrder={id:string;status:string;total:number;createdAt:string;items:{quantity:number;product?:{name:string}}[]};
const options=[
 {value:'all',label:'كل الطلبات'},
 {value:'pending',label:'قيد المعالجة'},
 {value:'confirmed',label:'مؤكدة'},
 {value:'shipped',label:'بالطريق'},
 {value:'delivered',label:'مسلّمة'},
 {value:'cancelled',label:'ملغية'},
 {value:'returned',label:'مرتجعة'}
];

export default function AccountPage(){
 const router=useRouter();
 const {user,isLoading:authLoading}=useAuth();
 const [orders,setOrders]=useState<CustomerOrder[]>([]);
 const [loading,setLoading]=useState(true);
 const [loadError,setLoadError]=useState('');
 const [statusFilter,setStatusFilter]=useState('all');
 const [search,setSearch]=useState('');

 useEffect(()=>{
  if(authLoading)return;
  if(!user){router.replace('/login?redirect=/account');return}
  let active=true;
  setLoading(true);setLoadError('');
  ordersAPI.getMine().then((rows:CustomerOrder[])=>{if(active)setOrders(rows)})
   .catch((err:unknown)=>{if(active)setLoadError(err instanceof Error?err.message:'تعذر تحميل الطلبات')})
   .finally(()=>{if(active)setLoading(false)});
  return ()=>{active=false};
 },[user,authLoading,router]);

 // Lightweight refresh of the signed-in customer's order summary.
 // Does not mutate orders; staff status changes appear without a page reload.
 useEffect(() => {
   if (authLoading || !user) return;
   let active=true;
   let fetching=false;
   let lastCheck=0;
   const refresh = async () => {
     if (!active || fetching || document.visibilityState !== 'visible') return;
     if (Date.now()-lastCheck < 10000) return;
     fetching=true;
     lastCheck=Date.now();
     try {
       const rows:CustomerOrder[]=await ordersAPI.getMine();
       if(active)setOrders(rows);
     } catch {
       // Keep the last valid list on a temporary network error.
     } finally {fetching=false}
   };
   const interval=window.setInterval(()=>{void refresh()},60000);
   const onFocus=()=>{void refresh()};
   const onVisible=()=>{if(document.visibilityState==='visible')void refresh()};
   window.addEventListener('focus',onFocus);
   document.addEventListener('visibilitychange',onVisible);
   return ()=>{
     active=false;window.clearInterval(interval);
     window.removeEventListener('focus',onFocus);
     document.removeEventListener('visibilitychange',onVisible);
   };
 },[user,authLoading]);

 if(authLoading||!user)return null;
 const activeCount=orders.filter(order=>['pending','confirmed','shipped'].includes(order.status)).length;
 const deliveredCount=orders.filter(order=>order.status==='delivered').length;
 const q=search.trim().toLowerCase();
 const filtered=orders.filter(order=>
  (statusFilter==='all'||order.status===statusFilter) &&
  (!q||order.id.toLowerCase().includes(q)||shortOrderCode(order.id).toLowerCase().includes(q)||
    order.items.some(i=>(i.product?.name||'').toLowerCase().includes(q)))
 );

 return <><Header/><main className="site-container site-main py-5 md:py-8">
   <header className="relative overflow-hidden rounded-[28px] border border-[#cce8f1] bg-[linear-gradient(115deg,#e0f5fb_0%,#f4fbfe_66%,#fff_100%)] px-5 py-6 sm:px-7 sm:py-7">
     <div className="absolute -left-8 -top-16 h-44 w-44 rounded-full border-[30px] border-[#9bdcec]/15" aria-hidden="true"/>
     <div className="relative flex flex-wrap items-center justify-between gap-4">
       <div><span className="site-eyebrow">THANAYA / MY ACCOUNT</span>
         <h1 className="mt-2 text-3xl font-black text-[#243c48] sm:text-4xl">أهلاً {user.name} 👋</h1>
         <p className="mt-2 text-sm leading-7 text-[#597783]">طلباتك وعناوينك وكل احتياجات عيادتك بمكان واحد.</p>
       </div>
       <Link href="/products" className="site-btn site-btn-primary site-btn-sm"><ShoppingBag size={17}/> تسوّق المنتجات</Link>
     </div>
     <div className="relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
       <div className="rounded-2xl border border-white/90 bg-white/85 p-4">
         <ClipboardList size={19} className="text-brand"/><p className="mt-3 text-2xl font-black">{loading?'—':orders.length}</p><p className="text-xs font-bold text-[#678190]">جميع طلباتي</p>
       </div>
       <div className="rounded-2xl border border-white/90 bg-white/85 p-4">
         <Clock3 size={19} className="text-brand"/><p className="mt-3 text-2xl font-black">{loading?'—':activeCount}</p><p className="text-xs font-bold text-[#678190]">طلبات جارية</p>
       </div>
       <div className="col-span-2 rounded-2xl border border-white/90 bg-white/85 p-4 sm:col-span-1">
         <PackageCheck size={19} className="text-emerald-600"/><p className="mt-3 text-2xl font-black">{loading?'—':deliveredCount}</p><p className="text-xs font-bold text-[#678190]">طلبات تم تسليمها</p>
       </div>
     </div>
   </header>
   <div className="my-3 flex flex-wrap items-center gap-3">
     <a href="#my-orders" className="inline-flex items-center gap-2 rounded-full border border-[#bedfeb] bg-white px-4 py-2.5 text-sm font-bold text-[#275466] hover:border-brand"><ClipboardList size={16}/> طلباتي</a>
     <a href="#saved-addresses" className="inline-flex items-center gap-2 rounded-full border border-[#bedfeb] bg-white px-4 py-2.5 text-sm font-bold text-[#275466] hover:border-brand"><MapPinned size={16}/> العناوين المحفوظة</a>
     <Link href="/notifications" className="inline-flex items-center gap-2 rounded-full border border-[#bedfeb] bg-white px-4 py-2.5 text-sm font-bold text-[#275466] hover:border-brand">إشعاراتي <ArrowUpLeft size={15}/></Link>
   </div>
   <div className="flex flex-col gap-4">
     <aside className="site-surface p-4 sm:p-5">
       <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><UserRound size={19} className="text-brand"/> معلومات حسابي</h2>
       <dl className="grid gap-3 text-sm sm:grid-cols-3 sm:gap-6">
         <div><dt className="text-neutral-500">الاسم</dt><dd className="mt-1 font-bold">{user.name}</dd></div>
         <div><dt className="text-neutral-500">البريد الإلكتروني</dt><dd className="mt-1 break-all text-right font-bold" dir="ltr">{user.email}</dd></div>
         <div><dt className="text-neutral-500">الهاتف</dt><dd className="mt-1 text-right font-bold" dir="ltr">{user.phone}</dd></div>
       </dl>
       <div className="mt-3 rounded-xl bg-[#eef8fb] px-3 py-2 text-xs leading-6 text-[#5c7b89]">احفظ عناوين توصيلك للطلبات القادمة. <a href="#saved-addresses" className="font-bold text-[#047ba8] underline">إدارة العناوين</a></div>
     </aside>
     <section id="my-orders" className="site-surface min-w-0 scroll-mt-28 p-5 sm:p-6" aria-labelledby="orders-title">
       <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
         <h2 id="orders-title" className="text-xl font-black">طلباتي {!loading&&!loadError&&<span className="text-brand">({orders.length})</span>}</h2>
         <span className="text-xs font-bold text-[#6c8390]">الطلبات تتحدّث تلقائياً أثناء فتح الصفحة</span>
       </div>
       {orders.length>0&&<div className="mb-5 space-y-3">
         <label className="relative block">
           <span className="sr-only">ابحث عن رقم الطلب أو اسم منتج</span>
           <Search size={17} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#78a3b5]"/>
           <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث برقم الطلب أو باسم المنتج..." className="site-input w-full pr-10 pl-4 text-sm"/>
         </label>
         <div className="flex flex-wrap gap-2" aria-label="تصفية طلباتي حسب الحالة">
           {options.map(opt=><button key={opt.value} type="button" aria-pressed={statusFilter===opt.value} onClick={()=>setStatusFilter(opt.value)}
             className={`rounded-full border px-3 py-2 text-xs font-bold transition ${statusFilter===opt.value?'border-[#059bd0] bg-[#059bd0] text-white':'border-[#d0e4ed] bg-[#f8fcfd] text-[#456579] hover:border-brand'}`}>{opt.label}</button>)}
         </div>
       </div>}
       {loading?<p role="status" className="py-10 text-center text-neutral-600">جاري تحميل طلباتك...</p>
        :loadError?<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{loadError}</p>
        :orders.length===0?<div className="flex flex-col items-center gap-4 py-10 text-center"><PackageOpen size={40} className="text-brand"/><p className="text-neutral-600">ما عندك طلبات بعد.</p><Link href="/products" className="site-btn site-btn-primary site-btn-sm">تسوّق الآن</Link></div>
        :filtered.length===0?<div className="rounded-2xl bg-[#f4fafc] p-8 text-center"><p className="font-bold">ماكو طلبات تطابق بحثك.</p><button type="button" onClick={()=>{setStatusFilter('all');setSearch('')}} className="mt-3 text-sm font-bold text-brand underline">عرض كل طلباتي</button></div>
        :<div className="grid gap-3 lg:grid-cols-2">{filtered.map((order,index)=>{
           const units=order.items.reduce((sum,item)=>sum+item.quantity,0);
           return <Link href={'/order/confirmation?id='+encodeURIComponent(order.id)} key={order.id} className={`group block rounded-2xl border border-[#d5e9f2] bg-white p-4 transition-colors hover:border-brand hover:bg-[#f8fdff] sm:p-5 ${filtered.length%2===1 && index===filtered.length-1 ? "lg:col-span-2" : ""}`} aria-label={'تفاصيل الطلب '+shortOrderCode(order.id)}>
             <div className="flex flex-wrap items-center justify-between gap-3">
               <div><span className="block text-[11px] font-bold text-neutral-500">رقم الطلب</span><strong className="mt-1 block text-base font-black text-brand sm:text-lg" dir="ltr">#{shortOrderCode(order.id)}</strong></div>
               <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${orderStatusColors[order.status]||'bg-neutral-100 text-neutral-800'}`}>{orderStatusLabels[order.status]||'حالة غير معروفة'}</span>
             </div>
             <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[#e8f0f4] pt-3">
               <div><p className="text-base font-black">{order.total.toLocaleString('en-US')} د.ع</p>
                 <p className="mt-1 text-xs text-neutral-500">{order.items.length} نوع · {units} قطعة</p>
                 <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-neutral-500"><CalendarDays size={14}/>{new Date(order.createdAt).toLocaleDateString('ar-IQ')}</p>
               </div>
               <span className="inline-flex items-center gap-1 text-sm font-bold text-brand group-hover:underline">تتبع وتفاصيل الطلب <ArrowUpLeft size={16}/></span>
             </div>
           </Link>
        })}</div>}
     </section>
   </div>
   <AddressBook />
 </main><Footer/></>;
}
