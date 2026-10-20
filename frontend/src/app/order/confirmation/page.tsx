"use client";
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { ordersAPI, productsAPI } from '@/lib/api';
import {useCart, Product} from '@/context/CartContext';
import {RefreshCw,ShoppingBag,ShieldCheck} from 'lucide-react';
import OrderProgress from '@/components/orders/OrderProgress';
import {orderPresentation,orderStatusLabels,orderStatusColors,shortOrderCode} from '@/lib/orderPresentation';

type Order = {
  id: string; total: number; subtotal?:number|null; shippingFee?:number|null; discountAmount?:number|null;couponCode?:string|null; status: string; createdAt: string;
  customerName: string; customerPhone: string; customerAddress: string; customerCity: string;
  items: { id: string; quantity: number; price: number; product: { id: string; name: string } }[];
};

function ConfirmationContent() {
  const id = useSearchParams().get('id') || '';
  const router = useRouter();
  const {items:currentCart,replaceCart}=useCart();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshBusy,setRefreshBusy]=useState(false);
  const [refreshError,setRefreshError]=useState('');
  const [automaticCheck,setAutomaticCheck]=useState('');
  const [automaticError,setAutomaticError]=useState(false);
  const [reorderBusy,setReorderBusy]=useState(false);
  const [reorderError,setReorderError]=useState('');
  const [askToReplace,setAskToReplace]=useState(false);

  useEffect(() => {
    if (!id) { setError('رقم الطلب مفقود'); setLoading(false); return; }
    ordersAPI.getById(id)
      .then((data: Order) => setOrder(data))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'تعذر تحميل الطلب'))
      .finally(() => setLoading(false));
  }, [id]);

  // Poll the saved order status only while this page is visible.
  // Staff/courier still need to CONFIRM delivery; polling never changes a status.
  useEffect(() => {
    if (!id || !order?.id) return;
    let alive = true;
    let checking = false;
    let lastPoll = 0;
    const syncOrder = async () => {
      if (!alive || checking || document.visibilityState !== 'visible') return;
      // Window focus and visibility-change events sometimes fire together.
      if (Date.now() - lastPoll < 10000) return;
      checking = true;
      lastPoll = Date.now();
      try {
        const latest: Order = await ordersAPI.getById(id);
        if (alive) {
          setOrder(latest);
          setAutomaticCheck(new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }));
          setAutomaticError(false);
        }
      } catch {
        // Don't replace a valid order with an error screen on transient network loss.
        if (alive) setAutomaticError(true);
      } finally {
        checking = false;
      }
    };
    const interval = window.setInterval(() => { void syncOrder(); }, 30000);
    const onFocus = () => { void syncOrder(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void syncOrder(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id, order?.id]);

  const refreshStatus = async () => {
    if(!id||refreshBusy)return;
    setRefreshBusy(true);setRefreshError('');
    try{setOrder(await ordersAPI.getById(id));setAutomaticCheck(new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }));setAutomaticError(false)}
    catch(e){setRefreshError(e instanceof Error?e.message:'تعذّر تحديث حالة الطلب')}
    finally{setRefreshBusy(false)}
  };

  const reorder = async () => {
    if(!order||reorderBusy)return;
    if(currentCart.length>0&&!askToReplace){setAskToReplace(true);return}
    setReorderBusy(true);setReorderError('');
    try{
      if(order.items.length===0||order.items.length>50)throw new Error('لا توجد منتجات قابلة لإعادة الطلب');
      const lines=order.items.map(item=>({productId:item.product.id,quantity:item.quantity}));
      // Product details come from the PUBLIC catalog; hidden products and deleted
      // products fail here. No outdated saved price or stock may enter the cart.
      const products=await Promise.all(lines.map(line=>productsAPI.getById(line.productId) as Promise<Product&{availableStock?:number}>));
      const quote=await productsAPI.quote(lines);
      if(!quote.canCheckout||quote.items.some(item=>!item.product||!item.available))
        throw new Error('بعض منتجات الطلب القديم صارت مخفية أو نافدة. تصفّح المنتجات المتاحة واختَر البدائل.');
      const prepared=products.map((product,i)=>{
        const latest=quote.items.find(item=>item.productId===lines[i].productId)?.product;
        if(!latest)throw new Error('المنتج غير متوفر حالياً');
        return {product:{...product,price:latest.price,stock:latest.availableStock},quantity:lines[i].quantity};
      });
      const replaced=replaceCart(prepared);
      if(!replaced.success)throw new Error(replaced.message);
      router.push('/cart');
    }catch(e){setReorderError(e instanceof Error?e.message:'تعذّرت إعادة تجهيز السلة')}
    finally{setReorderBusy(false);setAskToReplace(false)}
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-16" dir="rtl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/account" className="text-sm font-black text-[#507282] hover:text-brand">← الرجوع إلى حسابي</Link>
          {order&&<button type="button" onClick={refreshStatus} disabled={refreshBusy} className="inline-flex items-center gap-2 rounded-full border border-[#bcdce8] bg-white px-4 py-2.5 text-sm font-bold text-[#335c6e] transition hover:border-brand disabled:opacity-60"><RefreshCw size={16} className={refreshBusy?'animate-spin':''}/>{refreshBusy?'جاري التحديث...':'تحديث حالة الطلب'}</button>}
        </div>
        {refreshError&&<p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{refreshError}</p>}
        {order && <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#d4e9f1] bg-white/90 px-4 py-2.5 text-xs font-bold text-[#517588]">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          تتحدّث الحالة تلقائياً كل 30 ثانية أثناء فتح الصفحة
          {automaticCheck && <span className="font-normal">· آخر تحقق: {automaticCheck}</span>}
          {automaticError && <span className="text-amber-800">· تعذّر آخر تحقق، جرّب زر التحديث</span>}
        </div>}
        {loading ? <p className="text-center font-bold text-ink">جاري تحميل تفاصيل الطلب...</p> :
          error || !order ? (
            <div className="rounded-3xl bg-white border border-red-100 p-10 text-center">
              <h1 className="text-2xl font-black text-ink">تعذر عرض الطلب</h1>
              <p role="alert" className="my-5 text-red-700">{error || 'الطلب غير موجود'}</p>
              <Link href="/account" className="text-brand font-bold underline">الرجوع إلى حسابي</Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-[#d4eaf2] bg-white shadow-[0_18px_50px_#079dca10]">
              <div className="bg-[#edf7fc] px-7 py-10 text-center">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-white text-3xl shadow-sm" aria-hidden="true">{order.status==='pending'||order.status==='confirmed'||order.status==='shipped'||order.status==='delivered'?'✓':'↩'}</div>
                <h1 className="mb-3 text-3xl font-black text-ink">{orderPresentation(order.status).heading}</h1>
                <p className="text-neutral-600">{orderPresentation(order.status).message}</p>
              </div>
              <div className="space-y-6 p-5 sm:p-7">
                <OrderProgress status={order.status}/>
                <div className="flex flex-wrap justify-between gap-4 border-b border-[#d4eaf2] pb-5">
                  <div><p className="text-xs text-neutral-500">رقم الطلب</p><p className="font-black text-brand" dir="ltr">#{shortOrderCode(order.id)}</p><p className="mt-1 text-xs text-neutral-500">المعرّف الكامل موجود للمتابعة عند الحاجة</p></div>
                  <div><p className="text-xs text-neutral-500">التاريخ</p><p className="font-bold text-ink">{new Date(order.createdAt).toLocaleDateString('ar-IQ')}</p></div>
                  <div><p className="text-xs text-neutral-500">الحالة</p><p className="font-bold text-ink">{orderStatusLabels[order.status]||'حالة غير معروفة'}</p></div>
                </div>
                <section>
                  <h2 className="mb-3 text-xl font-black text-ink">عنوان التوصيل</h2>
                  <p className="text-neutral-700">{order.customerName} — {order.customerPhone}</p>
                  <p className="text-neutral-700">{order.customerAddress}، {order.customerCity}</p>
                </section>
                <section>
                  <h2 className="mb-3 text-xl font-black text-ink">تفاصيل المنتجات</h2>
                  <div className="space-y-3">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between gap-4 border-b border-[#edf0f4] pb-3 text-sm">
                        <span className="text-ink">{item.product.name} × {item.quantity}</span>
                        <span className="font-black text-ink whitespace-nowrap">{(item.price * item.quantity).toLocaleString('ar-IQ')} د.ع</span>
                      </div>
                    ))}
                  </div>
                </section>
                <div className="rounded-xl bg-[#edf7fc] p-4 space-y-2">
                  <div className="flex justify-between text-sm"><span>مجموع المنتجات</span><strong>{(order.subtotal??order.items.reduce((a,i)=>a+i.price*i.quantity,0)).toLocaleString('ar-IQ')} د.ع</strong></div>
                  {order.discountAmount!=null&&<div className="flex justify-between text-sm text-green-700"><span>كوبون {order.couponCode}</span><strong>-{order.discountAmount.toLocaleString('ar-IQ')} د.ع</strong></div>}
                  <div className="flex justify-between text-sm"><span>التوصيل</span><strong>{order.shippingFee===null||order.shippingFee===undefined?'يحدد لاحقاً':order.shippingFee.toLocaleString('ar-IQ')+' د.ع'}</strong></div>
                  <div className="flex justify-between border-t border-brand/20 pt-3 text-xl font-black"><span>الإجمالي</span><span>{order.total.toLocaleString('ar-IQ')} د.ع</span></div>
                </div>
                <p className="text-xs text-neutral-500">طريقة الدفع: عند الاستلام.</p>
                <section className="rounded-2xl border border-[#c5e2ec] bg-[#f5fbfe] p-4 sm:p-5" aria-label="إعادة تجهيز السلة">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><h2 className="text-base font-black text-[#263f4e]">تحتاج نفس المستلزمات مرة ثانية؟</h2>
                      <p className="mt-1 text-xs leading-6 text-[#688392]">نجهّز سلة جديدة بالأسعار والمخزون الحاليين، وما نؤكد شراء تلقائياً.</p>
                    </div>
                    <button type="button" disabled={reorderBusy} onClick={reorder} className="site-btn site-btn-primary site-btn-sm"><ShoppingBag size={16}/>{reorderBusy?'جاري المراجعة...':'إعادة تجهيز السلة'}</button>
                  </div>
                  {askToReplace&&<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                    <p className="font-bold text-amber-950">عندك منتجات بالسلة حالياً؛ تريد تستبدلها بمحتويات هذا الطلب؟</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={reorder} disabled={reorderBusy} className="rounded-full bg-[#059bd0] px-4 py-2 font-bold text-white disabled:opacity-60">نعم، استبدل السلة</button>
                      <button type="button" onClick={()=>setAskToReplace(false)} disabled={reorderBusy} className="rounded-full border border-[#bdced5] bg-white px-4 py-2 font-bold">إلغاء</button>
                    </div>
                  </div>}
                  {reorderError&&<p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{reorderError}</p>}
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-[#688392]"><ShieldCheck size={15}/> إعادة تجهيز السلة لا تنشئ طلباً جديداً.</p>
                </section>
                <div className="flex flex-wrap gap-3">
                  <Link href="/account" className="site-btn site-btn-primary flex-1">عرض طلباتي</Link>
                  <Link href="/products" className="site-btn site-btn-outline flex-1">متابعة التسوق</Link>
                </div>
              </div>
            </div>
          )}
      </main>
      <Footer />
    </>
  );
}
export default function ConfirmationPage() {
  return <Suspense fallback={<p className="p-12 text-center">جاري التحميل...</p>}><ConfirmationContent /></Suspense>;
}
