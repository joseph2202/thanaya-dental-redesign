"use client";
import {useEffect,useState} from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import {deliveryAPI,DeliveryConfig} from '@/lib/api';
import {parseThousandsIqd,formatThousandsIqd,formatFullIqd} from '@/lib/money-entry';
import {useAuth} from '@/context/AuthContext';

export default function AdminDelivery(){
 const {user}=useAuth();
 const [config,setConfig]=useState<DeliveryConfig|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const load=async()=>{setLoading(true);setError('');try{setConfig(await deliveryAPI.getAdmin())}catch(e){setError(e instanceof Error?e.message:'فشل تحميل التوصيل')}finally{setLoading(false)}};
 useEffect(()=>{if(user?.role==='owner')load();else setLoading(false)},[user?.role]);
 async function save(e:React.FormEvent){e.preventDefault();if(!config)return;setBusy(true);setSuccess('');setError('');
 try{const saved=await deliveryAPI.save(config);setConfig(saved);setSuccess('تم حفظ أجور التوصيل فعلياً في قاعدة البيانات')}
 catch(e){setError(e instanceof Error?e.message:'فشل الحفظ')}finally{setBusy(false)}}
 if(user?.role!=='owner')return <AdminLayout><p className="site-surface p-6">إعدادات التوصيل متاحة للمالك فقط.</p></AdminLayout>;
 return <AdminLayout>
 <h1 className="text-3xl font-black mb-3 text-ink">التوصيل للمحافظات العراقية</h1>
 <p className="text-sm text-neutral-600 mb-4">حدد المحافظات المتاحة وأجورها بالدينار. الأسعار أدناه ليست أسعاراً افتراضية: تبدأ بصفر والتوصيل مغلق حتى تضبطه وتفعّله بنفسك.</p>
 {error&&<div role="alert" className="rounded-xl bg-red-50 text-red-700 p-4 mb-5">{error} <button onClick={load} className="underline">إعادة التحميل</button></div>}
 {success&&<p role="status" className="rounded-xl bg-green-50 text-green-700 p-4 mb-5">{success}</p>}
 {loading?<p>جاري تحميل المحافظات...</p>:config&&<form onSubmit={save} className="space-y-6">
 <section className="site-surface p-5">
 <label className="flex items-center gap-3 font-black"><input type="checkbox" checked={config.enabled} onChange={e=>setConfig({...config,enabled:e.target.checked})}/>تفعيل احتساب أجور التوصيل في الطلبات الجديدة</label>
 <p className="text-xs text-neutral-600 mt-2">إذا غير مفعل، يبقى سير الشراء السابق كما هو. إذا فعلته، الزبون يگدر يطلب فقط للمحافظات المسموحة.</p>
 </section>
 <section className="site-surface p-5"><h2 className="text-xl font-black mb-4">المحافظات وأجور الشحن</h2>
 <div className="grid gap-3 md:grid-cols-2">{config.rates.map((rate,index)=><div key={rate.province} className="rounded-xl border border-brand/20 bg-white p-3 flex flex-wrap gap-4 items-center justify-between">
 <label className="flex gap-2 items-center font-bold text-sm"><input type="checkbox" checked={rate.available} onChange={e=>setConfig({...config,rates:config.rates.map((r,i)=>i===index?{...r,available:e.target.checked}:r)})}/>{rate.province}</label>
 <label className="text-xs font-bold flex items-center gap-2">أجرة التوصيل (ألف د.ع)
 <input className="w-28 border rounded-lg px-3 py-2 text-sm" aria-label={'أجرة '+rate.province} type="number" min="0" max="1000" step="0.001" value={formatThousandsIqd(rate.fee)} onChange={e=>{const value=parseThousandsIqd(e.target.value);if(value!==null)setConfig({...config,rates:config.rates.map((r,i)=>i===index?{...r,fee:value}:r)})}}/><span className="text-xs text-brand">{formatFullIqd(rate.fee)}</span></label>
 </div>)}</div>
 </section>
 <button disabled={busy} type="submit" className="site-btn site-btn-primary">{busy?'جاري الحفظ...':'حفظ أجور التوصيل'}</button>
 <span className="text-xs text-neutral-500 mr-3">إصدار {config.revision}</span>
 </form>}
 </AdminLayout>
}