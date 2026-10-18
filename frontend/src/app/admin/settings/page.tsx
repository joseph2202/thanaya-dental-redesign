"use client";
import { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { settingsAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

type Settings = {
  siteName:string;siteDescription:string;phone:string;email:string;address:string;workingHours:string;
  usdToIqdRate:number|null;showUsdApprox:boolean;revision:number;
};
const fields: {key:keyof Settings;label:string;type?:string;multiline?:boolean}[]=[
  {key:'siteName',label:'اسم المتجر'},{key:'siteDescription',label:'وصف المتجر',multiline:true},
  {key:'phone',label:'هاتف المتجر'},{key:'email',label:'البريد الإلكتروني',type:'email'},
  {key:'address',label:'العنوان'},{key:'workingHours',label:'ساعات العمل'}
];
export default function AdminSettings(){
  const {user}=useAuth();
  const [settings,setSettings]=useState<Settings|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const [loading,setLoading]=useState(true);
  async function load(){
    setLoading(true);setError('');
    try{setSettings(await settingsAPI.getAdmin());}
    catch(e){setError(e instanceof Error?e.message:'تعذر تحميل الإعدادات');}
    finally{setLoading(false);}
  }
  useEffect(()=>{if(user?.role==='owner')load();else setLoading(false);},[user?.role]);
  async function save(e:React.FormEvent){
    e.preventDefault();if(!settings)return;
    setBusy(true);setError('');setSuccess('');
    try{const updated=await settingsAPI.save(settings);setSettings(updated);setSuccess('حُفظت إعدادات ثنايا بقاعدة البيانات بنجاح');}
    catch(e){setError(e instanceof Error?e.message:'تعذر الحفظ');}
    finally{setBusy(false);}
  }
  if(user?.role!=='owner')return <AdminLayout><p className="site-surface p-6">تعديل إعدادات المتجر الرئيسية متاح للمالك فقط.</p></AdminLayout>;
  return <AdminLayout>
    <div className="mb-7"><span className="site-eyebrow">THANAYA / SETTINGS</span>
      <h1 className="mt-2 text-3xl font-black text-ink">إعدادات ثنايا</h1>
      <p className="mt-2 text-sm text-neutral-600">تنحفظ الإعدادات على السيرفر، وتكون متاحة على الأجهزة الأخرى. سعر الطلبات القديمة لا يتغيّر.</p>
    </div>
    {error&&<div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{error}<button type="button" onClick={load} className="mr-4 underline">إعادة التحميل</button></div>}
    {success&&<div role="status" className="mb-5 rounded-xl bg-green-50 p-4 font-bold text-green-700">{success}</div>}
    {loading?<p>جاري تحميل الإعدادات...</p>:settings&&<form onSubmit={save} className="grid gap-6">
      <section className="site-surface p-6"><h2 className="mb-5 text-xl font-black">معلومات المتجر</h2>
        <div className="grid gap-5 md:grid-cols-2">{fields.map(field=><label key={field.key} className={field.multiline?'md:col-span-2':''}>
          <span className="mb-2 block text-sm font-bold">{field.label}</span>
          {field.multiline?<textarea required maxLength={600} rows={3} className="w-full rounded-xl border border-brand/25 p-3" value={String(settings[field.key]??'')} onChange={e=>setSettings({...settings,[field.key]:e.target.value})}/>:
          <input required type={field.type||'text'} className="w-full rounded-xl border border-brand/25 p-3" value={String(settings[field.key]??'')} onChange={e=>setSettings({...settings,[field.key]:e.target.value})}/>}
        </label>)}</div>
      </section>
      <section className="site-surface p-6">
        <h2 className="mb-2 text-xl font-black">العملات وسعر الصرف</h2>
        <p className="mb-5 text-sm text-neutral-600">الدينار هو عملة الشراء. الدولار مجرد قيمة تقريبية للعرض، وليس سعراً مستقلاً للدفع.</p>
        <label className="block max-w-md"><span className="mb-2 block text-sm font-bold">سعر دولار واحد بالدينار العراقي (يدوي)</span>
          <input type="number" min={1000} max={3000} step={1} className="w-full rounded-xl border border-brand/25 p-3" value={settings.usdToIqdRate??''} placeholder="مثلاً 1660 دينار للدولار" onChange={e=>setSettings({...settings,usdToIqdRate:e.target.value===''?null:Number(e.target.value)})}/>
        </label>
        <label className="mt-5 flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={settings.showUsdApprox} onChange={e=>setSettings({...settings,showUsdApprox:e.target.checked})}/>عرض المقابل التقريبي بالدولار بصفحة المنتج</label>
        {settings.usdToIqdRate!==null && (settings.usdToIqdRate<1000 || settings.usdToIqdRate>3000) && <p role="alert" className="mt-3 text-sm font-bold text-red-700">سعر الصرف المسجل غير منطقي. تأكد من كتابة السعر الكامل للدولار (مثال 1660)، ثم احفظ.</p>}
        {settings.usdToIqdRate&&settings.usdToIqdRate>0&&<p className="mt-5 rounded-xl bg-paper2 p-4 text-sm">مثال للعرض: 25,000 د.ع ≈ {(25000/settings.usdToIqdRate).toFixed(2)} دولار. هذا لا يغيّر سعر المنتج أو الطلب.</p>}
      </section>
      <div className="flex flex-wrap items-center gap-4"><button disabled={busy} type="submit" className="site-btn site-btn-primary">{busy?'جاري الحفظ...':'حفظ إعدادات المتجر'}</button><span className="text-xs text-neutral-500">إصدار الإعدادات: {settings.revision}</span></div>
    </form>}
  </AdminLayout>;
}
