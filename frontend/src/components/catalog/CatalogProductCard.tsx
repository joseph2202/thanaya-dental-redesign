"use client";

import {useState} from 'react';
import Link from 'next/link';
import {ArrowUpLeft,Check,ShoppingBag,ArrowLeft,Box} from 'lucide-react';
import {useCart,type Product} from '@/context/CartContext';
import ProductMedia from '@/components/ui/ProductMedia';
import {saleUnitLabel} from '@/lib/saleUnits';

export type CatalogCardProduct=Product & {
  category?:string;brand?:string;price:number;availableStock?:number;saleUnit?:string|null;
};

export default function CatalogProductCard({product}:{product:CatalogCardProduct}){
 const {addToCart}=useCart();
 const [feedback,setFeedback]=useState<{success:boolean;message:string}|null>(null);
 const available=Math.max(0,product.availableStock??product.stock);
 const hasStock=available>0;
 const saleUnit=saleUnitLabel(product.saleUnit);
 function handleAdd(){setFeedback(addToCart({...product,stock:available},1));}
 const url=`/product/${encodeURIComponent(product.id)}`;

 return <article className="signature-card group flex h-full min-w-0 flex-col overflow-hidden">
  <div className="relative m-2.5 mb-0 sm:m-3 sm:mb-0">
   <Link href={url} className="signature-card-media block focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" aria-label={`تفاصيل ${product.name}`}>
    <ProductMedia name={product.name} image={product.image} icon={product.icon} size={58}
      className={product.image?'aspect-[4/3] w-full':'aspect-[1.55] w-full'}/>
   </Link>
   <span className={`pointer-events-none absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black shadow-sm ${hasStock?'border-[#c4eddc] bg-white/95 text-[#137958]':'border-red-200 bg-red-50 text-red-700'}`}>
    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${hasStock?'bg-emerald-500':'bg-red-500'}`}/>{hasStock?'متوفر':'غير متوفر'}
   </span>
   {!product.image&&<span className="pointer-events-none absolute bottom-3 right-3 max-w-[65%] rounded-full border border-[#d1e4ee] bg-white/85 px-2.5 py-1.5 text-[10px] font-bold text-[#638695]">
     لا توجد صورة مرفوعة بعد
   </span>}
   <Link href={url} aria-label={`استكشف ${product.name}`} className="absolute bottom-3 left-3 grid h-9 w-9 place-items-center rounded-full border border-white/80 bg-white/95 text-[#267992] shadow-sm transition hover:bg-[#e7f9ff] focus-visible:outline-brand">
    <ArrowUpLeft size={17} aria-hidden="true"/>
   </Link>
  </div>

  <div className="flex min-w-0 flex-1 flex-col px-3.5 pb-3.5 pt-3.5 sm:px-4.5 sm:pb-4.5">
   <div className="thanaya-card-category flex min-w-0 items-center gap-2 text-[10px] font-extrabold text-[#167ba0] sm:text-[11px]">
    <Box size={14} className="shrink-0" aria-hidden="true"/>
    <span className="truncate">{product.category||'المستلزمات الطبية'}</span>
   </div>
   <Link href={url} className="mt-2 line-clamp-2 min-h-[3.3rem] text-sm font-black leading-[1.7] text-[#234454] transition hover:text-[#058ebf] sm:text-[15px]">
    {product.name}
   </Link>
   {product.brand&&<p className="mt-1 truncate text-[11px] font-medium text-[#6f8994]">{product.brand}</p>}
   <div className="thanaya-product-price mt-auto border-t border-[#edf3f5] pt-3.5">
    <p className="text-[10px] font-semibold text-[#8499a3]">السعر / {saleUnit}</p>
    <div className="mt-0.5 flex flex-wrap items-end gap-1.5">
     <strong className="text-xl font-black tabular-nums tracking-tight text-[#173e50] sm:text-[23px]">{product.price.toLocaleString('en-US')}</strong>
     <span className="pb-0.5 text-[11px] font-bold text-[#638594]">د.ع</span>
    </div>
    <button type="button" onClick={handleAdd} disabled={!hasStock}
      aria-label={`إضافة ${product.name} للسلة`}
      className={`signature-card-quick mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-2 text-xs font-black sm:text-sm ${hasStock?'bg-[#089bcc] text-white shadow-[0_3px_0_#087da2] hover:bg-[#0a8eba]':'cursor-not-allowed bg-[#eaf0f2] text-[#80939a]'}`}>
      {feedback?.success?<Check size={17} aria-hidden="true"/>:<ShoppingBag size={17} aria-hidden="true"/>}
      <span>{!hasStock?'غير متوفر':feedback?.success?'أُضيف للسلة':'إضافة للسلة'}</span>
      {hasStock&&!feedback?.success&&<ArrowLeft size={15} aria-hidden="true"/>}
    </button>
    {feedback&&<div role="status" aria-live="polite" className={`mt-2 text-center text-[11px] font-bold ${feedback.success?'text-emerald-800':'text-red-700'}`}>
      {feedback.success?<Link href="/cart" className="inline-flex items-center gap-1 underline underline-offset-2">عرض السلة <ArrowUpLeft size={13} aria-hidden="true"/></Link>:feedback.message}
    </div>}
   </div>
  </div>
 </article>;
}
