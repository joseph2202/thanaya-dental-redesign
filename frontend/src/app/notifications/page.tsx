"use client";
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {notificationsAPI,NotificationInbox} from '@/lib/api';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import AdminLayout from '@/components/admin/AdminLayout';

export default function NotificationsPage(){
 const {user,isLoading}=useAuth();
 const [inbox,setInbox]=useState<NotificationInbox|null>(null);
 const [busy,setBusy]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const staff=user&&['owner','admin','inventory','sales'].includes(user.role);
 const load=useCallback(async()=>{setLoading(true);setError('');try{setInbox(await notificationsAPI.get())}catch(e){setError(e instanceof Error?e.message:'تعذر تحميل التنبيهات')}finally{setLoading(false)}},[]);
 useEffect(()=>{if(user)load();else if(!isLoading)setLoading(false)},[user,isLoading,load]);
 async function mark(id:string){setBusy(id);try{await notificationsAPI.read(id);await load()}catch(e){setError(e instanceof Error?e.message:'تعذر تحديث التنبيه')}finally{setBusy(null)}}
 const body=<div className="mx-auto max-w-5xl">
  <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-black text-ink">مركز الإشعارات</h1><p className="mt-2 text-sm text-neutral-600">طلبات جديدة، تغيرات حالة الطلبات، وتنبيهات المخزون للموظفين.</p></div><button onClick={load} disabled={loading} className="site-btn site-btn-outline site-btn-sm">تحديث</button></div>
  {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
  {staff&&inbox?.lowStock.length? <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="mb-3 font-black text-amber-900">تنبيهات المخزون ({inbox.lowStock.length})</h2>
   <div className="grid gap-2 sm:grid-cols-2">{inbox.lowStock.map(p=><div key={p.id} className="flex justify-between gap-2 rounded-xl bg-white p-3 text-sm"><span className="font-bold">{p.name}</span><span className="font-black text-amber-800">{p.stock} قطعة</span></div>)}</div><Link href="/admin/products" className="mt-3 inline-block text-sm font-bold text-brand underline">إدارة المخزون</Link></section>:null}
  <section className="overflow-hidden rounded-2xl border border-brand/20 bg-white"><div className="flex justify-between border-b border-brand/10 p-5"><h2 className="font-black">إشعاراتي</h2><span className="text-sm font-bold text-brand">غير مقروء: {inbox?.unread??0}</span></div>
  {loading?<p className="p-6">جاري التحميل...</p>:inbox?.items.length?inbox.items.map(n=><div key={n.id} className={`flex flex-wrap items-start justify-between gap-3 border-b border-brand/10 p-5 ${n.readAt?'':'bg-sky-50/50'}`}>
   <div className="min-w-0 flex-1"><p className="font-black">{n.title}</p><p className="mt-2 text-sm text-neutral-700">{n.message}</p><p className="mt-2 text-xs text-neutral-500">{new Date(n.createdAt).toLocaleString('ar-IQ')}</p>
    {n.orderId&&<Link className="mt-2 inline-block text-sm font-bold text-brand underline" href={staff?'/admin/orders':'/order/confirmation?id='+encodeURIComponent(n.orderId)}>عرض الطلب</Link>}
   </div>{!n.readAt&&<button disabled={busy===n.id} onClick={()=>mark(n.id)} className="site-btn site-btn-outline site-btn-sm">تمت القراءة</button>}
  </div>):<p className="p-6 text-sm text-neutral-600">لا توجد إشعارات جديدة حالياً.</p>}</section>
  <p className="mt-4 text-xs text-neutral-500">هذه إشعارات داخل الموقع؛ لا تُرسل رسائل خارجية أو إشعارات للجهاز عند إغلاق المتصفح.</p>
 </div>;
 if(isLoading)return <p className="p-10">جاري تحميل الحساب...</p>;
 if(!user)return <><Header/><main className="mx-auto max-w-3xl p-10"><p>سجّل الدخول لعرض إشعاراتك.</p><Link href="/login?redirect=/notifications" className="text-brand underline">تسجيل الدخول</Link></main><Footer/></>;
 return staff?<AdminLayout>{body}</AdminLayout>:<><Header/><main className="site-container py-5 md:py-8">{body}</main><Footer/></>;
}
