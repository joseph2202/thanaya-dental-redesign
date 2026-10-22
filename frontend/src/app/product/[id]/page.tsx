import {productsAPI,settingsAPI} from '@/lib/api';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductPurchaseActions from '@/components/product/ProductPurchaseActions';
import ProductGallery from '@/components/product/ProductGallery';
import CatalogProductCard from '@/components/catalog/CatalogProductCard';
import {ArrowUpLeft,ChevronLeft,ShieldCheck,PackageCheck,Truck,CheckCircle2,Info,Layers3} from 'lucide-react';
import {saleUnitLabel} from '@/lib/saleUnits';

export const instant=false;

export default async function ProductPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 let product;
 try{product=await productsAPI.getById(id);}
 catch(error){
  if(error instanceof Error&&(error as Error&{status?:number}).status===404)notFound();
  throw error;
 }
 const settings:any=await settingsAPI.getPublic().catch(()=>null);
 const approximateUsd=settings?.showUsdApprox&&typeof settings?.usdToIqdRate==='number'&&settings.usdToIqdRate>0
  ?(product.price/settings.usdToIqdRate).toFixed(2):null;
 let related:any[]=[];
 try{
  const products=await productsAPI.getAll({category:product.category});
  related=products.filter((p:any)=>p.id!==product.id).slice(0,3);
 }catch{related=[];}
 const stock=Math.max(0,product.availableStock??product.stock);
 const available=stock>0;
 const unit=saleUnitLabel(product.saleUnit);
 const details=[
  product.sku?{label:'رمز المنتج (SKU)',value:product.sku,latin:true}:null,
  product.model?{label:'الموديل',value:product.model}:null,
  product.size?{label:'القياس / الحجم',value:product.size}:null,
  {label:'وحدة البيع',value:unit},
  product.brand?{label:'الماركة',value:product.brand}:null,
  {label:'التصنيف',value:product.category}
 ].filter((item):item is {label:string;value:string;latin?:boolean}=>Boolean(item));

 return <><Header/>
  <main className="site-container site-main pb-36 pt-5 sm:pb-10 md:pt-7">
   <nav aria-label="مسار الصفحة" className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#7894a2]">
    <Link href="/" className="hover:text-brand">الرئيسية</Link><ChevronLeft size={13} aria-hidden="true"/>
    <Link href="/products" className="hover:text-brand">المنتجات</Link><ChevronLeft size={13} aria-hidden="true"/>
    <span className="max-w-[280px] truncate text-[#234654]">{product.name}</span>
   </nav>
   <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.07fr)_minmax(0,.93fr)] lg:gap-7">
    <section aria-label={`صور ${product.name}`} className="min-w-0 rounded-[27px] border border-[#c8e4ed] bg-[linear-gradient(160deg,#f0f9fc,#fff)] p-3.5 shadow-[0_14px_38px_rgba(18,78,101,.045)] sm:p-5">
     <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1.5">
      <span className="inline-flex items-center gap-2 text-[11px] font-black text-[#397991]"><Layers3 size={16} aria-hidden="true"/> معرض المنتج</span>
      <span className="rounded-full border border-[#d5ebf3] bg-white/80 px-3 py-1.5 text-[10px] font-bold text-[#60808e]">THANAYA / CATALOG</span>
     </div>
     <ProductGallery name={product.name} image={product.image} icon={product.icon} gallery={product.gallery}/>
     {!product.image&&<p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-[#637f8b]"><Info size={14} className="mt-0.5 shrink-0" aria-hidden="true"/> لم تُرفع صورة فوتوغرافية لهذا المنتج بعد؛ الأيقونة توضيحية فقط.</p>}
    </section>
    <section className="signature-detail-sheet min-w-0 p-5 sm:p-7 lg:sticky lg:top-28">
     <p className="flex flex-wrap items-center gap-2 text-xs font-black text-[#1688ae]"><span>{product.category}</span>{product.brand&&<><span className="text-[#b9d5df]">/</span><span>{product.brand}</span></>}</p>
     <h1 className="mt-3 text-[clamp(1.85rem,3.4vw,3.25rem)] font-black leading-[1.35] tracking-[-.045em] text-[#1f4050]">{product.name}</h1>
     {product.description&&product.description.trim().toLowerCase()!=='nothing'&&
      <p className="mt-3 whitespace-pre-line text-sm leading-8 text-[#647e8b] sm:text-[15px]">{product.description}</p>}
     <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#d2e7ee] bg-[#f2fafc] p-4 sm:p-5">
      <div><p className="text-[11px] font-bold text-[#70909e]">السعر / {unit}</p>
       <p className="mt-1 flex items-baseline gap-2 text-[#174457]"><strong className="text-[clamp(1.8rem,3.2vw,2.65rem)] font-black tabular-nums tracking-tight">{product.price.toLocaleString('en-US')}</strong><span className="text-sm font-black">د.ع</span></p>
       {approximateUsd&&<span className="mt-1 block text-[11px] text-[#6f8994]">≈ {approximateUsd} دولار، قيمة تقريبية للعرض فقط</span>}
      </div>
      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black ${available?'border-[#c0e9d7] bg-[#e8f7f0] text-[#137557]':'border-red-200 bg-red-50 text-red-700'}`}>
       <span className={`h-2 w-2 rounded-full ${available?'bg-emerald-500':'bg-red-500'}`}/>{available?`متوفر · ${stock} ${unit}`:'غير متوفر حالياً'}
      </span>
     </div>
     <div className="mt-5"><ProductPurchaseActions product={product}/></div>
     <div className="mt-5 grid gap-3 border-t border-[#e3eff3] pt-4 sm:grid-cols-2">
      <p className="flex items-center gap-2 text-xs font-bold text-[#537789]"><ShieldCheck size={19} className="shrink-0 text-[#0799c8]" aria-hidden="true"/> أسعار واضحة بالدينار العراقي</p>
      <p className="flex items-center gap-2 text-xs font-bold text-[#537789]"><Truck size={19} className="shrink-0 text-[#0799c8]" aria-hidden="true"/> التوصيل حسب المحافظة المتاحة</p>
      <p className="flex items-center gap-2 text-xs font-bold text-[#537789]"><PackageCheck size={19} className="shrink-0 text-[#0799c8]" aria-hidden="true"/> حالة المخزون محدّثة من المتجر</p>
      <p className="flex items-center gap-2 text-xs font-bold text-[#537789]"><CheckCircle2 size={19} className="shrink-0 text-[#0799c8]" aria-hidden="true"/> نؤكد الأسعار والكميات عند الطلب</p>
     </div>
    </section>
   </div>

   <div className="mt-7 grid items-start gap-5 lg:grid-cols-2 lg:gap-7">
    <section className="signature-detail-sheet p-5 sm:p-7" aria-labelledby="product-details-title">
     <span className="site-eyebrow" dir="ltr">THE DETAILS</span>
     <h2 id="product-details-title" className="mt-2 text-xl font-black text-[#234451]">تفاصيل المنتج</h2>
     <dl className="mt-4 divide-y divide-[#e8f0f4]">
      {details.map(item=><div key={item.label} className="grid grid-cols-[minmax(110px,.6fr)_minmax(0,1fr)] gap-3 py-3 text-sm">
       <dt className="font-bold text-[#6d8997]">{item.label}</dt>
       <dd dir={item.latin?'ltr':undefined} className="break-words font-black text-[#254858]">{item.value}</dd>
      </div>)}
     </dl>
    </section>
    <section className="signature-detail-sheet p-5 sm:p-7" aria-labelledby="product-specs-title">
     <span className="site-eyebrow" dir="ltr">TECHNICAL INFORMATION</span>
     <h2 id="product-specs-title" className="mt-2 text-xl font-black text-[#234451]">المواصفات الفنية</h2>
     {Array.isArray(product.specs)&&product.specs.length>0?
      <dl className="mt-4 divide-y divide-[#e8f0f4]">{product.specs.map((s:{label:string;value:string},i:number)=>
       <div key={i} className="grid grid-cols-[minmax(110px,.6fr)_minmax(0,1fr)] gap-3 py-3 text-sm">
        <dt className="font-bold text-[#6d8997]">{s.label}</dt><dd className="break-words font-semibold text-[#254858]">{s.value}</dd>
       </div>)}</dl>:
      <p className="mt-4 rounded-xl bg-[#f3f9fb] px-4 py-5 text-sm leading-8 text-[#668491]">المواصفات التفصيلية لهذا المنتج لم تُضف بعد. تواصل مع المتجر للتأكد من التفاصيل الفنية قبل الشراء.</p>}
    </section>
   </div>
   {related.length>0&&<section className="site-section" aria-labelledby="related-products-title">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
     <div><span className="site-eyebrow" dir="ltr">EXPLORE MORE</span><h2 id="related-products-title" className="signature-section-heading mt-2">قد يناسب عيادتك أيضاً</h2></div>
     <Link href={`/products?category=${encodeURIComponent(product.category)}`} className="inline-flex items-center gap-2 text-xs font-black text-brand">استكشف القسم <ArrowUpLeft size={16}/></Link>
    </div>
    <div className="grid gap-4 min-[390px]:grid-cols-2 lg:grid-cols-3">{related.map(p=><CatalogProductCard key={p.id} product={p}/>)}</div>
   </section>}
  </main><Footer/></>;
}
