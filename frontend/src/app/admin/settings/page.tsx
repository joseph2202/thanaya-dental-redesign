"use client";
import { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { settingsAPI,uploadAPI } from '@/lib/api';
import {ImagePlus,Eye,EyeOff,Trash2} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

type Settings = {
  siteName:string;siteDescription:string;phone:string;email:string;address:string;workingHours:string;
  usdToIqdRate:number|null;showUsdApprox:boolean;revision:number;
  bannerEnabled:boolean;bannerEyebrow:string;bannerTitle:string;bannerDescription:string;
  bannerButtonLabel:string;bannerButtonHref:string;bannerImage:string|null;
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
  const [uploadingBanner,setUploadingBanner]=useState(false);
  async function load(){
    setLoading(true);setError('');
    try{setSettings(await settingsAPI.getAdmin());}
    catch(e){setError(e instanceof Error?e.message:'تعذر تحميل الإعدادات');}
    finally{setLoading(false);}
  }
  useEffect(()=>{if(user?.role==='owner')load();else setLoading(false);},[user?.role]);
  async function uploadBannerImage(file:File|undefined){
    if(!file)return;
    if(file.size>5*1024*1024){setError('الصورة لازم تكون أقل من 5MB');return;}
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('استخدم JPG أو PNG أو WebP');return;}
    setUploadingBanner(true);setError('');setSuccess('');
    try{
      const result=await uploadAPI.uploadImage(file);
      setSettings(previous=>previous?{...previous,bannerImage:result.url}:previous);
      setSuccess('انرفعت الصورة؛ اضغط حفظ إعدادات المتجر حتى ينحفظ البنر.');
    }catch(e){setError(e instanceof Error?e.message:'تعذّر رفع الصورة');}
    finally{setUploadingBanner(false);}
  }
  async function save(e:React.FormEvent){
    e.preventDefault();if(!settings||uploadingBanner)return;
    setBusy(true);setError('');setSuccess('');
    try{const updated=await settingsAPI.save(settings);setSettings(updated);setSuccess('حُفظت إعدادات ثنايا بقاعدة البيانات بنجاح');}
    catch(e){setError(e instanceof Error?e.message:'تعذر الحفظ');}
    finally{setBusy(false);}
  }
  if(user?.role!=='owner')return <AdminLayout><p className="site-surface p-6">تعديل إعدادات المتجر الرئيسية متاح للمالك فقط.</p></AdminLayout>;
  return <AdminLayout>
    <div className="mb-4"><span className="site-eyebrow">THANAYA / SETTINGS</span>
      <h1 className="mt-2 text-3xl font-black text-ink">إعدادات ثنايا</h1>
      <p className="mt-2 text-sm text-neutral-600">تنحفظ الإعدادات على السيرفر، وتكون متاحة على الأجهزة الأخرى. سعر الطلبات القديمة لا يتغيّر.</p>
    </div>
    {error&&<div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{error}<button type="button" onClick={load} className="mr-4 underline">إعادة التحميل</button></div>}
    {success&&<div role="status" className="mb-5 rounded-xl bg-green-50 p-4 font-bold text-green-700">{success}</div>}
    {loading?<p>جاري تحميل الإعدادات...</p>:settings&&<form onSubmit={save} className="grid gap-4">
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
          <input type="number" min={1} max={1000000} step={1} className="w-full rounded-xl border border-brand/25 p-3" value={settings.usdToIqdRate??''} placeholder="مثلاً 1660 دينار للدولار" onChange={e=>setSettings({...settings,usdToIqdRate:e.target.value===''?null:Number(e.target.value)})}/>
        </label>
        <label className="mt-5 flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={settings.showUsdApprox} onChange={e=>setSettings({...settings,showUsdApprox:e.target.checked})}/>عرض المقابل التقريبي بالدولار بصفحة المنتج</label>
        {settings.usdToIqdRate!==null && (settings.usdToIqdRate<1000 || settings.usdToIqdRate>3000) && <p role="alert" className="mt-3 text-sm font-bold text-red-700">هذا السعر يختلف كثيراً عن المثال 1660. تأكد من المبلغ قبل الحفظ، لكن تگدر تعتمده إذا مقصود.</p>}
        {settings.usdToIqdRate&&settings.usdToIqdRate>0&&<p className="mt-5 rounded-xl bg-paper2 p-4 text-sm">مثال للعرض: 25,000 د.ع ≈ {(25000/settings.usdToIqdRate).toFixed(2)} دولار. هذا لا يغيّر سعر المنتج أو الطلب.</p>}
      </section>

      <section className="site-surface p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><span className="site-eyebrow">THANAYA / BANNER</span>
            <h2 className="mt-1 text-xl font-black">البنر الإعلاني بالرئيسية</h2>
            <p className="mt-2 text-sm leading-7 text-neutral-600">غيّر النص والزر أو ارفع صورة. إذا ماكو صورة راح يبقى التصميم الأزرق. التعديل متاح للمالك فقط.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={settings.bannerEnabled} onChange={e=>setSettings({...settings,bannerEnabled:e.target.checked})} />
            {settings.bannerEnabled?<><Eye size={17}/> البنر ظاهر</>:<><EyeOff size={17}/> البنر مخفي</>}
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold">عبارة صغيرة فوق العنوان
            <input required maxLength={50} value={settings.bannerEyebrow} onChange={e=>setSettings({...settings,bannerEyebrow:e.target.value})} className="site-input mt-2 w-full px-4"/>
          </label>
          <label className="text-sm font-bold">نص الزر
            <input required maxLength={30} value={settings.bannerButtonLabel} onChange={e=>setSettings({...settings,bannerButtonLabel:e.target.value})} className="site-input mt-2 w-full px-4"/>
          </label>
          <label className="text-sm font-bold md:col-span-2">عنوان البنر
            <input required maxLength={90} value={settings.bannerTitle} onChange={e=>setSettings({...settings,bannerTitle:e.target.value})} className="site-input mt-2 w-full px-4"/>
          </label>
          <label className="text-sm font-bold md:col-span-2">الوصف
            <textarea required maxLength={300} rows={2} value={settings.bannerDescription} onChange={e=>setSettings({...settings,bannerDescription:e.target.value})} className="site-input mt-2 w-full px-4 py-3"/>
          </label>
          <label className="text-sm font-bold">الصفحة التي يفتحها الزر
            <select className="site-input mt-2 w-full px-4" value={settings.bannerButtonHref} onChange={e=>setSettings({...settings,bannerButtonHref:e.target.value})}>
              <option value="/products">كل المنتجات</option>
              <option value="/categories">التصنيفات</option>
              <option value="/offers">العروض</option>
              <option value="/account">حسابي</option>
            </select>
          </label>
          <div>
            <label htmlFor="banner-upload" className="mb-2 block text-sm font-bold">صورة البنر (اختيارية)</label>
            <label htmlFor="banner-upload" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-brand/30 bg-[#f2fbff] px-4 text-sm font-bold text-[#087fa7] hover:bg-[#e4f6fc]">
              <ImagePlus size={18}/>{uploadingBanner?'جاري رفع الصورة...':'رفع صورة جديدة'}
            </label>
            <input id="banner-upload" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||uploadingBanner} className="sr-only" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void uploadBannerImage(file)}}/>
            {settings.bannerImage&&<button type="button" disabled={busy||uploadingBanner} onClick={()=>setSettings({...settings,bannerImage:null})} className="mr-2 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-red-700 hover:underline">
              <Trash2 size={16}/> إزالة الصورة
            </button>}
            <p className="mt-2 text-xs leading-6 text-neutral-500">JPG أو PNG أو WebP، حتى 5MB. الأفضل صورة أفقية بدون كتابة داخلها حتى ما يتكرر الكلام على الموبايل.</p>
          </div>
        </div>
        <div className="relative mt-5 overflow-hidden rounded-[22px] bg-[linear-gradient(120deg,#007cae,#04a5d1)] px-5 py-6 text-white sm:px-8">
          {settings.bannerImage&&<>
            <img src={settings.bannerImage} alt="معاينة صورة البنر المختارة" className="pointer-events-none absolute inset-0 h-full w-full object-cover"/>
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,91,126,.80),rgba(0,116,160,.88))]" aria-hidden="true"/>
          </>}
          <div className="relative">
            <span className="text-xs font-bold tracking-wider text-white/85">{settings.bannerEyebrow}</span>
            <h3 className="mt-2 text-xl font-black leading-snug sm:text-2xl">{settings.bannerTitle}</h3>
            <p className="mt-2 text-sm leading-7 text-white/85">{settings.bannerDescription}</p>
            <span className="mt-3 inline-flex rounded-full border-2 border-white bg-white px-5 py-2 text-xs font-black text-[#204759]">{settings.bannerButtonLabel}</span>
          </div>
        </div>
        <p className="mt-2 text-xs font-bold text-neutral-500">هاي معاينة قبل الحفظ. الزبائن ما يشوفون تغييراتك إلا بعد الضغط على «حفظ إعدادات المتجر».</p>
      </section>
      <div className="flex flex-wrap items-center gap-4"><button disabled={busy||uploadingBanner} type="submit" className="site-btn site-btn-primary">{busy?'جاري الحفظ...':'حفظ إعدادات المتجر'}</button><span className="text-xs text-neutral-500">إصدار الإعدادات: {settings.revision}</span></div>
    </form>}
  </AdminLayout>;
}
