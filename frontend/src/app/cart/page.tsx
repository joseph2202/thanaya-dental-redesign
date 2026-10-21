"use client";
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductMedia from '@/components/ui/ProductMedia';
import { useCart } from '@/context/CartContext';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {productsAPI,CartQuote} from '@/lib/api';
import {Trash2,Minus,Plus,ArrowUpLeft,ShieldCheck} from 'lucide-react';
import {saleUnitLabel} from '@/lib/saleUnits';

export default function CartPage() {
  const { items, removeFromCart, updateQuantity, totalPrice, clearCart } = useCart();
  const [message,setMessage]=useState('');
  const [quote,setQuote]=useState<CartQuote|null>(null);
  const [quoteError,setQuoteError]=useState('');
  const [quoteLoading,setQuoteLoading]=useState(false);
  const signature=JSON.stringify(items.map(item=>[item.product.id,item.quantity]));
  useEffect(()=>{
    if(items.length===0){setQuote(null);return;}
    let cancelled=false;
    setQuote(null);setQuoteError('');setQuoteLoading(true);
    productsAPI.quote(items.map(item=>({productId:item.product.id,quantity:item.quantity})))
      .then(data=>{if(!cancelled)setQuote(data)})
      .catch(e=>{if(!cancelled)setQuoteError(e instanceof Error?e.message:'تعذر التحقق من السلة')})
      .finally(()=>{if(!cancelled)setQuoteLoading(false)});
    return ()=>{cancelled=true};
  // Quote recalculates whenever the basket identity or quantity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature]);
  const adjust=(id:string,quantity:number)=>{
    const line=quote?.items.find(item=>item.productId===id);
    if(!line?.product){setMessage('المنتج لم يعد متوفراً. احذفه من السلة');return;}
    if(quantity>line.product.availableStock){setMessage('المتاح حالياً '+line.product.availableStock+' '+saleUnitLabel(line.product.saleUnit)+' فقط');return;}
    const result=updateQuantity(id,quantity);setMessage(result.success?'':result.message)
  };

  if (items.length === 0) {
    return (
      <>
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-9 text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h1 className="text-4xl font-black mb-4 text-ink">سلتك فارغة</h1>
          <p className="text-neutral-600 mb-5">لم تضف أي منتج بعد. تسوق الآن!</p>
          <Link href="/products" className="site-btn site-btn-primary">
            تصفح المنتجات
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="site-container site-main py-5 md:py-8">
        <div className="mb-5 rounded-[24px] border border-[#cce7f1] bg-[linear-gradient(100deg,#e6f7fd,#fff)] px-5 py-5 md:px-7"><span className="site-eyebrow">THANAYA / CART</span><h1 className="mt-2 text-3xl font-black text-ink md:text-4xl">سلة التسوق</h1><p className="site-muted mt-2 text-sm">راجع منتجاتك وكمياتها قبل تأكيد الطلب.</p></div>

        <div className="space-y-3 mb-5">
          {items.map((item) => (
            <div key={item.product.id} className="bg-white border border-[#dfe8f2] rounded-2xl p-4 sm:p-5 shadow-sm grid grid-cols-[72px_minmax(0,1fr)] sm:grid-cols-[90px_minmax(0,1fr)_auto] gap-4 items-start">
              <ProductMedia name={item.product.name} image={item.product.image} icon={item.product.icon} size={40} className="rounded-xl w-[72px] h-[72px] sm:w-[90px] sm:h-[90px] shrink-0" />
              <div className="min-w-0">
                <Link href={`/product/${item.product.id}`} className="block font-bold text-base sm:text-lg text-ink hover:text-brand">{item.product.name}</Link>
                <p className="text-neutral-500 text-sm">{item.product.brand} · {saleUnitLabel(quote?.items.find(q=>q.productId===item.product.id)?.product?.saleUnit??item.product.saleUnit)}</p>
                <p className="text-ink font-black mt-1 text-lg">{(quote?.items.find(q=>q.productId===item.product.id)?.product?.price??item.product.price).toLocaleString()} د.ع</p>
              </div>
              <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
                <button aria-label="تقليل الكمية" disabled={item.quantity <= 1}
                  onClick={() => adjust(item.product.id, item.quantity - 1)}
                  className="w-10 h-10 rounded-full border-2 border-brand/30 font-bold hover:bg-brand hover:text-white transition disabled:opacity-30"
                >
                  -
                </button>
                <span className="font-bold w-8 text-center">{item.quantity}</span>
                <button
                  aria-label="زيادة الكمية" onClick={() => adjust(item.product.id, item.quantity + 1)}
                  className="w-8 h-8 rounded-full border-2 border-brand/30 font-bold hover:bg-brand hover:text-white transition"
                >
                  +
                </button>
              </div>
              <div className="col-span-2 flex items-center justify-between gap-3 border-t border-brand/10 pt-3 sm:col-span-3 sm:pt-2 text-left">
                <p className="font-black text-lg text-ink">{((quote?.items.find(q=>q.productId===item.product.id)?.product?.price??item.product.price)*item.quantity).toLocaleString()} د.ع</p>
                <button
                  onClick={() => removeFromCart(item.product.id)}
                  className="inline-flex items-center gap-1 text-red-600 text-sm font-bold hover:underline"
                >
                  <Trash2 size={16} /> حذف
                </button>
              </div>
            </div>
          ))}
        </div>

        {message&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 font-bold text-red-700">{message}</p>}
        {quoteLoading&&<p role="status" className="mb-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">جاري التأكد من الأسعار والكميات الحالية...</p>}
        {quoteError&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 font-bold text-red-700">{quoteError}</p>}
        {quote?.items.some(line=>!line.available)&&<div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>يرجى مراجعة السلة:</strong>{quote.items.filter(line=>!line.available).map(line=><p className="mt-1" key={line.productId}>{line.product?.name||'منتج محذوف'}: {line.product?`المتاح ${line.product.availableStock} ${saleUnitLabel(line.product.saleUnit)}، والمطلوب ${line.quantity}`:'لم يعد متوفراً'}</p>)}</div>}
        {quote&&quote.items.some(line=>{const item=items.find(i=>i.product.id===line.productId);return line.product&&item&&line.product.price!==item.product.price})&&<p role="status" className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-900">تغيّر سعر أحد المنتجات. المجموع المعتمد حالياً موضح بالأسفل؛ راجع السعر قبل المتابعة.</p>}
        <div className="site-surface !bg-[#e9f8fd] p-5 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-lg text-ink">المجموع:</span>
            <span className="text-3xl font-black text-brand">{(quote?.subtotal??totalPrice).toLocaleString()} د.ع</span>
          </div>
          <p className="mb-4 text-xs text-neutral-600">المجموع قبل الكوبون وأجور التوصيل. يتم احتساب المبلغ النهائي والتحقق من المخزون مجدداً عند تأكيد الطلب.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            {quote?.canCheckout&&!quoteLoading?<Link href="/checkout" className="site-btn site-btn-primary flex-1">إتمام الطلب</Link>:<span aria-disabled="true" className="site-btn site-btn-primary flex-1 opacity-50 cursor-not-allowed">راجع السلة قبل إتمام الطلب</span>}
            <button onClick={() => {if(window.confirm("تريد تفرّغ السلة بالكامل؟"))clearCart()}} className="site-btn site-btn-outline">
              إفراغ السلة
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
