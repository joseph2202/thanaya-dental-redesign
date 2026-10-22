"use client";
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductMedia from '@/components/ui/ProductMedia';
import {useCart} from '@/context/CartContext';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {productsAPI,CartQuote} from '@/lib/api';
import {Trash2,Minus,Plus,ArrowUpLeft,ShieldCheck,ShoppingBag,Truck,ArrowRight,LockKeyhole,PackageCheck} from 'lucide-react';
import {saleUnitLabel} from '@/lib/saleUnits';
import SiteActionDialog from '@/components/ui/SiteActionDialog';

const amount=(value:number)=>value.toLocaleString('en-US')+' د.ع';

export default function CartPage(){
 const {items,removeFromCart,updateQuantity,totalPrice,clearCart}=useCart();
 const [message,setMessage]=useState('');
 const [confirmClear,setConfirmClear]=useState(false);
 const [quote,setQuote]=useState<CartQuote|null>(null);
 const [quoteError,setQuoteError]=useState('');
 const [quoteLoading,setQuoteLoading]=useState(false);
 const signature=JSON.stringify(items.map(item=>[item.product.id,item.quantity]));

 useEffect(()=>{
  if(items.length===0){setQuote(null);setQuoteLoading(false);return;}
  let cancelled=false;
  setQuote(null);setQuoteError('');setQuoteLoading(true);
  productsAPI.quote(items.map(item=>({productId:item.product.id,quantity:item.quantity})))
   .then(data=>{if(!cancelled)setQuote(data)})
   .catch(e=>{if(!cancelled)setQuoteError(e instanceof Error?e.message:'تعذر التحقق من السلة')})
   .finally(()=>{if(!cancelled)setQuoteLoading(false)});
  return ()=>{cancelled=true};
 // Recalculate only when basket identity or item quantity changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[signature]);

 function adjust(id:string,quantity:number){
  const current=items.find(item=>item.product.id===id);
  if(!current)return;
  if(quantity<current.quantity){
   const result=updateQuantity(id,quantity);
   setMessage(result.success?'':result.message);
   return;
  }
  const line=quote?.items.find(item=>item.productId===id);
  if(quoteLoading||quoteError||!line?.product){setMessage('نراجع توفر المنتج حالياً. حاول بعد اكتمال تحديث السلة.');return;}
  if(quantity>line.product.availableStock){
   setMessage(`المتاح حالياً ${line.product.availableStock} ${saleUnitLabel(line.product.saleUnit)} فقط`);
   return;
  }
  const result=updateQuantity(id,quantity);
  setMessage(result.success?'':result.message);
 }

 if(items.length===0)return <><Header/>
  <main className="site-container site-main flex min-h-[65vh] items-center justify-center py-12">
   <div className="signature-detail-sheet mx-auto w-full max-w-[580px] px-5 py-12 text-center sm:px-12">
    <div className="mx-auto grid h-20 w-20 place-items-center rounded-[27px] bg-[#e7f7fc] text-brand"><ShoppingBag size={38} strokeWidth={1.5}/></div>
    <span className="site-eyebrow mt-6 block" dir="ltr">YOUR THANAYA CART</span>
    <h1 className="mt-3 text-3xl font-black text-[#244454] sm:text-4xl">سلتك بانتظار أول اختيار</h1>
    <p className="mx-auto mt-4 max-w-sm text-sm leading-8 text-[#6c8692]">تصفّح مستلزمات العيادة، وشوف الأسعار والتفاصيل، وأضف المنتجات اللي تحتاجها.</p>
    <Link href="/products" className="site-btn site-btn-primary mt-7">استكشف المنتجات <ArrowUpLeft size={18}/></Link>
   </div>
  </main><Footer/></>;

 const canCheckout=Boolean(quote?.canCheckout&&!quoteLoading&&!quoteError);
 const productsCount=items.reduce((sum,item)=>sum+item.quantity,0);
 const subtotal=quote?.subtotal??totalPrice;

 return <><Header/>
  <SiteActionDialog open={confirmClear} title="إفراغ سلة التسوق؟"
   description="راح تنحذف المنتجات من سلتك فقط، وما راح يتغير مخزون المتجر أو أي طلب سابق."
   confirmLabel="إفراغ السلة" destructive
   onConfirm={()=>{setConfirmClear(false);clearCart()}} onClose={()=>setConfirmClear(false)}/>
  <main className="site-container site-main pb-10 pt-6 md:pt-8">
   <nav aria-label="مسار الصفحة" className="mb-5 flex items-center gap-2 text-xs font-semibold text-[#6e8e9d]">
    <Link href="/" className="hover:text-brand">الرئيسية</Link><ArrowRight size={13}/><span className="font-black text-[#254656]">سلة التسوق</span>
   </nav>
   <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div><span className="site-eyebrow" dir="ltr">THANAYA / YOUR ORDER</span>
     <h1 className="signature-section-heading mt-2">تجهيز طلبك، بكل سهولة.</h1>
     <p className="site-muted mt-2 text-sm">راجع تفاصيل المنتجات والكميات؛ نؤكد السعر والمخزون من المتجر قبل إتمام الطلب.</p>
    </div>
    <span className="inline-flex items-center gap-2 rounded-full border border-[#cce4ed] bg-white px-4 py-2.5 text-xs font-black text-[#386c81]">
     <ShoppingBag size={17} className="text-brand"/>{productsCount} {productsCount===1?'قطعة':'قطع'} في السلة
    </span>
   </div>
   <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(335px,.43fr)] lg:gap-7">
    <section aria-label="المنتجات المضافة للسلة" className="min-w-0 space-y-3.5">
     <div className="flex items-center justify-between px-1"><h2 className="text-lg font-black text-[#234757]">منتجاتك المختارة</h2><button type="button" onClick={()=>setConfirmClear(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:underline"><Trash2 size={15}/> إفراغ السلة</button></div>
     {items.map(item=>{
      const line=quote?.items.find(q=>q.productId===item.product.id);
      const price=line?.product?.price??item.product.price;
      const unit=saleUnitLabel(line?.product?.saleUnit??item.product.saleUnit);
      const max=line?.product?.availableStock??0;
      return <article key={item.product.id} className="signature-detail-sheet grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-4 p-3.5 sm:grid-cols-[112px_minmax(0,1fr)] sm:p-5">
       <Link href={`/product/${encodeURIComponent(item.product.id)}`} className="block min-w-0 rounded-xl focus-visible:outline-brand" aria-label={`عرض ${item.product.name}`}>
        <ProductMedia name={item.product.name} image={item.product.image} icon={item.product.icon} size={44} className="aspect-square w-full rounded-xl"/>
       </Link>
       <div className="flex min-w-0 flex-col">
        <span className="text-[10px] font-black text-[#1290b8]">{item.product.category||'مستلزمات طبية'}</span>
        <Link href={`/product/${encodeURIComponent(item.product.id)}`} className="mt-1 line-clamp-2 text-sm font-black leading-6 text-[#244653] hover:text-brand sm:text-base">{item.product.name}</Link>
        <p className="mt-1 text-[11px] text-[#718e9b]">{item.product.brand||'بدون ماركة محددة'} · {unit}</p>
        <strong className="mt-2 text-base font-black tabular-nums text-[#1d4b60]">{amount(price)}</strong>
       </div>
       <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#e9f1f5] pt-3 sm:pt-4">
        <div className="flex items-center gap-2">
         <div className="flex items-center overflow-hidden rounded-xl border border-[#c8e2eb] bg-[#f5fbfd]">
          <button type="button" aria-label={`تقليل كمية ${item.product.name}`} disabled={item.quantity<=1} onClick={()=>adjust(item.product.id,item.quantity-1)} className="grid h-10 w-10 place-items-center text-[#177c9c] transition hover:bg-[#e1f5fc] disabled:opacity-30"><Minus size={17}/></button>
          <output aria-live="polite" className="min-w-10 text-center text-sm font-black tabular-nums">{item.quantity}</output>
          <button type="button" aria-label={`زيادة كمية ${item.product.name}`} disabled={quoteLoading||!line?.product||item.quantity>=max} onClick={()=>adjust(item.product.id,item.quantity+1)} className="grid h-10 w-10 place-items-center text-[#177c9c] transition hover:bg-[#e1f5fc] disabled:opacity-30"><Plus size={17}/></button>
         </div>
         <span className="hidden text-[11px] font-semibold text-[#77909b] sm:inline">الكمية</span>
        </div>
        <div className="flex items-center gap-3">
         <strong className="text-sm font-black tabular-nums text-[#1f4a5b] sm:text-base">{amount(price*item.quantity)}</strong>
         <button type="button" onClick={()=>removeFromCart(item.product.id)} aria-label={`حذف ${item.product.name} من السلة`} className="grid h-10 w-10 place-items-center rounded-xl border border-red-100 bg-red-50 text-red-700 transition hover:bg-red-100"><Trash2 size={16}/></button>
        </div>
       </div>
      </article>;
     })}
     {message&&<p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">{message}</p>}
     {quoteLoading&&<p role="status" className="rounded-xl bg-sky-50 p-3 text-sm text-[#24647b]">جاري التحقق من الأسعار والكميات الحالية...</p>}
     {quoteError&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{quoteError}</p>}
     {quote?.items.some(line=>!line.available)&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>تحتاج السلة إلى مراجعة:</strong>{quote.items.filter(line=>!line.available).map(line=><p className="mt-1" key={line.productId}>{line.product?.name||'منتج محذوف'}: {line.product?`المتاح ${line.product.availableStock} ${saleUnitLabel(line.product.saleUnit)}، والمطلوب ${line.quantity}`:'لم يعد متوفراً'}</p>)}</div>}
     {quote&&quote.items.some(line=>{const item=items.find(i=>i.product.id===line.productId);return line.product&&item&&line.product.price!==item.product.price})&&
      <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-900">تغيّر سعر منتج في المتجر؛ تم عرض السعر المُحدّث، راجعه قبل المتابعة.</p>}
     <Link href="/products" className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-black text-[#158ab3] hover:underline">تريد تضيف منتجات أخرى؟ <ArrowUpLeft size={16}/></Link>
    </section>

    <aside className="signature-cart-summary min-w-0 p-5 sm:p-6 lg:sticky lg:top-28" aria-labelledby="cart-summary-title">
     <span className="site-eyebrow" dir="ltr">ORDER SUMMARY</span>
     <h2 id="cart-summary-title" className="mt-2 text-xl font-black text-[#254756]">ملخص طلبك</h2>
     <div className="mt-5 space-y-4 border-y border-[#e5eef2] py-5 text-sm">
      <div className="flex justify-between gap-3"><span className="text-[#64818f]">المنتجات ({productsCount})</span><strong className="text-[#284c5b] tabular-nums">{amount(subtotal)}</strong></div>
      <div className="flex justify-between gap-3"><span className="text-[#64818f]">الخصم</span><span className="text-[12px] font-bold text-[#6d8794]">يُحسب عند إدخال الكوبون</span></div>
      <div className="flex justify-between gap-3"><span className="flex items-center gap-2 text-[#64818f]"><Truck size={16} aria-hidden="true"/> التوصيل</span><span className="text-[12px] font-bold text-[#6d8794]">حسب المحافظة عند الطلب</span></div>
     </div>
     <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold text-[#63818e]">مجموع المنتجات</p><p className="mt-1 text-[11px] text-[#88a0aa]">{quote?'محدّث من المتجر':'تقديري لحين التحقق'}</p></div>
      <strong className="text-[clamp(1.5rem,2.6vw,2rem)] font-black tabular-nums text-[#174d65]">{amount(subtotal)}</strong>
     </div>
     {canCheckout?<Link href="/checkout" className="site-btn site-btn-primary mt-6 w-full">المتابعة لإتمام الطلب <ArrowUpLeft size={18}/></Link>:
      <span aria-disabled="true" className="site-btn site-btn-primary mt-6 w-full opacity-55">بانتظار التحقق من السلة</span>}
     <p className="mt-4 flex items-start gap-2 text-[11px] leading-6 text-[#6a8b99]"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#098db9]"/> السعر النهائي وأجور التوصيل تتأكد عند إتمام الطلب، قبل اعتماد العملية.</p>
     <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#e9f0f3] pt-5 text-[11px] font-bold text-[#678593]">
      <span className="flex items-center gap-1.5"><LockKeyhole size={15} className="text-[#0a91bd]"/> مراجعة آمنة</span>
      <span className="flex items-center gap-1.5"><PackageCheck size={15} className="text-[#0a91bd]"/> توفر مُتحقق منه</span>
     </div>
    </aside>
   </div>
  </main><Footer/></>;
}
