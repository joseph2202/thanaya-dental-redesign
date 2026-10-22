"use client";
import {useState} from 'react';
import {Minus,Plus,ShoppingBag,ArrowUpLeft} from 'lucide-react';
import {useCart,Product} from '@/context/CartContext';
import {useAuth} from '@/context/AuthContext';
import {useRouter} from 'next/navigation';
import {saleUnitLabel} from '@/lib/saleUnits';

export default function ProductPurchaseActions({product}:{product:Product & {availableStock?: number}}){
 const {addToCart}=useCart(),{user}=useAuth(),router=useRouter();
 const available=Math.max(0,product.availableStock??product.stock);
 const max=Math.min(100,available);
 const [quantity,setQuantity]=useState(1),[message,setMessage]=useState(''),[error,setError]=useState(false);
 function putInCart(goToCheckout:boolean){
  const result=addToCart({...product,stock:available},quantity);
  setMessage(result.message);setError(!result.success);
  if(result.success&&goToCheckout)router.push(user?'/checkout':'/login?redirect=/checkout');
 }
 return <>
 <div className="rounded-[22px] border border-[#d4eaf2] bg-white p-4 sm:p-5">
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
   <div><strong className="block text-sm text-[#234352]">الكمية المطلوبة</strong><p className="mt-1 text-xs text-neutral-500">الحد المتوفر حالياً: {available} {saleUnitLabel(product.saleUnit)}</p></div>
   <div className="flex items-center overflow-hidden rounded-full border border-[#b7deec] bg-[#f6fbfd]">
    <button type="button" aria-label="تقليل الكمية" disabled={quantity<=1||max===0} onClick={()=>setQuantity(q=>Math.max(1,q-1))} className="grid h-11 w-12 place-items-center text-brand hover:bg-[#e2f5fb] disabled:opacity-40"><Minus size={18}/></button>
    <output aria-live="polite" className="min-w-10 text-center text-lg font-black">{max===0?0:quantity}</output>
    <button type="button" aria-label="زيادة الكمية" disabled={quantity>=max} onClick={()=>setQuantity(q=>Math.min(max,q+1))} className="grid h-11 w-12 place-items-center text-brand hover:bg-[#e2f5fb] disabled:opacity-40"><Plus size={18}/></button>
   </div>
  </div>
  <div className="hidden gap-3 sm:grid sm:grid-cols-2">
   <button type="button" onClick={()=>putInCart(false)} disabled={max===0} className="site-btn site-btn-primary w-full"><ShoppingBag size={18}/>{max===0?'نفد المخزون':'أضف للسلة'}</button>
   <button type="button" onClick={()=>putInCart(true)} disabled={max===0} className="site-btn site-btn-outline w-full">اشتري الآن <ArrowUpLeft size={18}/></button>
  </div>
  {message&&<p role="status" className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${error?'bg-red-50 text-red-700':'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
 </div>
 <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#b8dfe9] bg-white/95 px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_rgba(21,67,91,.13)] backdrop-blur-lg sm:hidden" aria-label="خيارات شراء المنتج">
  <div className="mx-auto max-w-lg">
   <div className="mb-2 flex items-center justify-between gap-3">
    <span className="text-xs font-bold text-[#68838f]">الإجمالي × {quantity} {saleUnitLabel(product.saleUnit)}</span>
    <strong className="text-lg font-black text-[#1d465a]">{(product.price*(max===0?0:quantity)).toLocaleString("en-US")} د.ع</strong>
   </div>
   <div className="grid grid-cols-2 gap-2">
    <button type="button" disabled={max===0} onClick={()=>putInCart(false)} className="site-btn site-btn-primary site-btn-sm min-w-0 !px-2">
     <ShoppingBag size={16} aria-hidden="true"/>{max===0?"غير متوفر":"أضف للسلة"}
    </button>
    <button type="button" disabled={max===0} onClick={()=>putInCart(true)} className="site-btn site-btn-outline site-btn-sm min-w-0 !px-2">
     اشتري الآن <ArrowUpLeft size={16} aria-hidden="true"/>
    </button>
   </div>
  </div>
 </div>
 </>;
}
