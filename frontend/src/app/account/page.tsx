"use client";
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {ArrowUpLeft,PackageOpen,CalendarDays} from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import {useAuth} from '@/context/AuthContext';
import {ordersAPI} from '@/lib/api';
import {orderStatusColors,orderStatusLabels,shortOrderCode} from '@/lib/orderPresentation';

type CustomerOrder={id:string;status:string;total:number;createdAt:string;items:{quantity:number}[]};

export default function AccountPage(){
 const router=useRouter();
 const {user,isLoading:authLoading}=useAuth();
 const [orders,setOrders]=useState<CustomerOrder[]>([]);
 const [loading,setLoading]=useState(true);
 const [loadError,setLoadError]=useState('');

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

 if(authLoading||!user)return null;
 return <><Header/><main className="site-container site-main py-9 md:py-12">
  <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
   <div><span className="site-eyebrow">THANAYA / MY ACCOUNT</span><h1 className="site-page-title mt-1">حسابي</h1><p className="site-muted mt-1 text-sm">معلوماتك وطلباتك بمكان واحد.</p></div>
   <Link href="/notifications" className="site-btn site-btn-outline site-btn-sm">إشعاراتي</Link>
  </div>
  <div className="grid items-start gap-6 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
   <aside className="site-surface p-5 sm:p-6"><h2 className="mb-5 text-lg font-black">معلوماتي</h2>
    <dl className="space-y-4 text-sm">
     <div><dt className="text-neutral-500">الاسم</dt><dd className="mt-1 font-bold">{user.name}</dd></div>
     <div><dt className="text-neutral-500">البريد الإلكتروني</dt><dd className="mt-1 break-all font-bold" dir="ltr">{user.email}</dd></div>
     <div><dt className="text-neutral-500">الهاتف</dt><dd className="mt-1 font-bold" dir="ltr">{user.phone}</dd></div>
    </dl>
   </aside>
   <section className="site-surface min-w-0 p-5 sm:p-6" aria-labelledby="orders-title">
    <h2 id="orders-title" className="mb-5 text-xl font-black">طلباتي {!loading&&!loadError&&<span className="text-brand">({orders.length})</span>}</h2>
    {loading?<p role="status" className="py-10 text-center text-neutral-600">جاري تحميل طلباتك...</p>
     :loadError?<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{loadError}</p>
     :orders.length===0?<div className="flex flex-col items-center gap-4 py-10 text-center"><PackageOpen size={40} className="text-brand"/><p className="text-neutral-600">ما عندك طلبات بعد.</p><Link href="/products" className="site-btn site-btn-primary site-btn-sm">تسوّق الآن</Link></div>
     :<div className="space-y-3">{orders.map(order=>{
      const units=order.items.reduce((sum,item)=>sum+item.quantity,0);
      return <Link href={'/order/confirmation?id='+encodeURIComponent(order.id)} key={order.id} className="group block rounded-2xl border border-[#d5e9f2] bg-white p-4 transition-colors hover:border-brand hover:bg-[#f8fdff] sm:p-5" aria-label={'تفاصيل الطلب '+shortOrderCode(order.id)}>
       <div className="flex flex-wrap items-center justify-between gap-3">
        <div><span className="block text-xs font-bold text-neutral-500">رقم الطلب المختصر</span><strong className="mt-1 block text-base font-black text-brand sm:text-lg" dir="ltr">#{shortOrderCode(order.id)}</strong></div>
        <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${orderStatusColors[order.status]||'bg-neutral-100 text-neutral-800'}`}>{orderStatusLabels[order.status]||'حالة غير معروفة'}</span>
       </div>
       <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[#e8f0f4] pt-3">
        <div><p className="text-sm font-black">{order.total.toLocaleString('en-US')} د.ع</p><p className="mt-1 text-xs text-neutral-500">{order.items.length} نوع · {units} قطعة</p><p className="mt-1 inline-flex items-center gap-1.5 text-xs text-neutral-500"><CalendarDays size={14}/>{new Date(order.createdAt).toLocaleDateString('ar-IQ')}</p></div>
        <span className="inline-flex items-center gap-1 text-sm font-bold text-brand group-hover:underline">عرض التفاصيل <ArrowUpLeft size={16}/></span>
       </div>
      </Link>
     })}</div>}
   </section>
  </div>
 </main><Footer/></>;
}
