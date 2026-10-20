"use client";
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Search,SlidersHorizontal,X} from 'lucide-react';
type FormValues={search:string;category:string;brand:string;sort:string;minPrice:string;maxPrice:string;inStock:boolean};
export default function CatalogFilters({initial,categories,brands}:{initial:FormValues;categories:[string,number][];brands:string[]}){
 const router=useRouter();
 const [form,setForm]=useState(initial),[error,setError]=useState(''),[expanded,setExpanded]=useState(false);
 const update=(key:Exclude<keyof FormValues,'inStock'>,value:string)=>setForm(f=>({...f,[key]:value}));
 function submit(event:React.FormEvent){
  event.preventDefault();setError('');
  const min=form.minPrice.trim(),max=form.maxPrice.trim();
  const valid=(n:string)=>!n||(/^\d+$/.test(n)&&Number.isSafeInteger(Number(n))&&Number(n)<=1000000000);
  if(!valid(min)||!valid(max)){setError('السعر لازم يكون رقماً صحيحاً بالدينار العراقي');setExpanded(true);return;}
  if(min&&max&&Number(min)>Number(max)){setError('الحد الأدنى للسعر أكبر من الحد الأعلى');setExpanded(true);return;}
  const query=new URLSearchParams();
  for(const key of ['search','category','brand','sort','minPrice','maxPrice'] as const){
   const value=form[key].trim();
   if(value)query.set(key,value);
  }
  if(form.inStock)query.set('inStock','1');
  router.push('/products'+(query.size?'?'+query.toString():''));
 }
 const input='site-input w-full min-w-0 px-3 py-2 text-sm';
 return <form onSubmit={submit} aria-label="البحث وتصفية المنتجات" className="site-surface p-4 lg:p-5 h-fit lg:sticky lg:top-28">
   <div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-black"><SlidersHorizontal size={18} className="text-brand"/> تصفية المنتجات</h2><button className="rounded-lg border border-brand/20 px-3 py-2 text-xs font-bold lg:hidden" type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'إخفاء':'إظهار الفلاتر'}</button></div>
   <label className="mb-2 block text-xs font-bold text-neutral-600" htmlFor="catalog-query">ابحث بالاسم أو الماركة</label>
   <div className="relative"><input id="catalog-query" name="search" maxLength={100} value={form.search} onChange={e=>update('search',e.target.value)} placeholder="مثلاً: أدوات الأسنان" className={input+' pl-10'}/><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand"/></div>
   <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-[#cce7f1] bg-[#f5fbfe] px-3 py-3 text-sm font-bold text-[#2e5264]"><input type="checkbox" checked={form.inStock} onChange={e=>setForm(f=>({...f,inStock:e.target.checked}))} className="h-4 w-4 accent-[#059BD0]" />المتوفر حالياً فقط</label>
   <div className={expanded?'mt-4 space-y-4':'mt-4 hidden space-y-4 lg:block'}>
    <div><label htmlFor="catalog-category" className="mb-2 block text-xs font-bold text-neutral-600">القسم</label><select id="catalog-category" value={form.category} onChange={e=>update('category',e.target.value)} className={input}><option value="">كل الأقسام</option>{categories.map(([name,count])=><option key={name} value={name}>{name} ({count})</option>)}</select></div>
    <div><label htmlFor="catalog-brand" className="mb-2 block text-xs font-bold text-neutral-600">الماركة</label><select id="catalog-brand" value={form.brand} onChange={e=>update('brand',e.target.value)} className={input}><option value="">كل الماركات</option>{brands.map(name=><option key={name} value={name}>{name}</option>)}</select></div>
    <fieldset><legend className="mb-2 text-xs font-bold text-neutral-600">نطاق السعر بالدينار العراقي</legend><div className="grid grid-cols-2 gap-2"><label className="text-xs text-neutral-600">من<input inputMode="numeric" pattern="[0-9]*" name="minPrice" value={form.minPrice} onChange={e=>update('minPrice',e.target.value)} placeholder="0" className={input+' mt-1'}/></label><label className="text-xs text-neutral-600">إلى<input inputMode="numeric" pattern="[0-9]*" name="maxPrice" value={form.maxPrice} onChange={e=>update('maxPrice',e.target.value)} placeholder="500000" className={input+' mt-1'}/></label></div></fieldset>
    <div><label htmlFor="catalog-sort" className="mb-2 block text-xs font-bold text-neutral-600">الترتيب</label><select id="catalog-sort" value={form.sort} onChange={e=>update('sort',e.target.value)} className={input}><option value="">الأحدث</option><option value="price-asc">السعر: الأقل أولاً</option><option value="price-desc">السعر: الأعلى أولاً</option><option value="name">حسب الاسم</option></select></div>
   </div>
   {error&&<p role="alert" className="mt-3 text-xs font-bold text-red-700">{error}</p>}
   <div className="mt-4 flex flex-wrap gap-2"><button type="submit" className="site-btn site-btn-primary site-btn-sm flex-1"><Search size={16}/> عرض النتائج</button><button type="button" onClick={()=>{setForm({search:'',category:'',brand:'',sort:'',minPrice:'',maxPrice:'',inStock:false});setError('');router.push('/products')}} className="site-btn site-btn-outline site-btn-sm" aria-label="مسح جميع الفلاتر"><X size={16}/></button></div>
  </form>;
}
