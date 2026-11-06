"use client";
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { ordersAPI, productsAPI } from '@/lib/api';
import {useCart, Product} from '@/context/CartContext';
import {RefreshCw,ShoppingBag,ShieldCheck,Printer} from 'lucide-react';
import OrderProgress from '@/components/orders/OrderProgress';
import styles from '@/components/orders/OrderExperience.module.css';
import {orderPresentation,orderStatusLabels,orderStatusColors,shortOrderCode} from '@/lib/orderPresentation';

type Order = {
  id: string; total: number; subtotal?:number|null; shippingFee?:number|null; discountAmount?:number|null;couponCode?:string|null; status: string; createdAt: string;
  customerName: string; customerPhone: string; customerAddress: string; customerCity: string;
  items: { id: string; quantity: number; price: number; productName?:string|null;returnLines?:{quantity:number}[];product: { id: string; name: string } }[];
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
      <main className={`${styles.theme} ${styles.page} mx-auto max-w-4xl px-4 py-6 md:py-8`} dir="rtl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/account" className={`${styles.link} inline-flex min-h-11 items-center text-sm font-black`}>← الرجوع إلى حسابي</Link>
          {order&&<Link href={"/order/invoice?id="+encodeURIComponent(order.id)} target="_blank" rel="noopener noreferrer" className={`${styles.secondaryButton} inline-flex items-center gap-1.5 rounded-full border px-3 text-xs font-black`}><Printer size={15} aria-hidden="true"/> طباعة / حفظ PDF</Link>}
          {order&&<button type="button" onClick={refreshStatus} disabled={refreshBusy} className={`${styles.secondaryButton} inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold disabled:opacity-60`}><RefreshCw size={16} aria-hidden="true" className={refreshBusy?'animate-spin':''}/>{refreshBusy?'جاري التحديث...':'تحديث حالة الطلب'}</button>}
        </div>
        {refreshError&&<p role="alert" className={`${styles.warning} mb-4 rounded-xl p-3 text-sm`}>{refreshError}</p>}
        {order && <div role="status" className={`${styles.status} mb-4 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold`}>
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          تتحدّث الحالة تلقائياً كل 30 ثانية أثناء فتح الصفحة
          {automaticCheck && <span className="font-normal">· آخر تحقق: {automaticCheck}</span>}
          {automaticError && <span>· تعذّر آخر تحقق، جرّب زر التحديث</span>}
        </div>}
        {loading ? <p className="text-center font-bold">جاري تحميل تفاصيل الطلب...</p> :
          error || !order ? (
            <div className={`${styles.panel} rounded-3xl border p-10 text-center`}>
              <h1 className="text-2xl font-black">تعذر عرض الطلب</h1>
              <p role="alert" className={`${styles.error} my-5 rounded-xl p-3`}>{error || 'الطلب غير موجود'}</p>
              <Link href="/account" className={`${styles.link} font-bold underline`}>الرجوع إلى حسابي</Link>
            </div>
          ) : (
            <div className={`${styles.panel} overflow-hidden rounded-3xl border shadow-[0_18px_50px_#079dca10]`}>
              <div className={`${styles.hero} px-5 py-6 text-center sm:px-7`}>
                <div className={`${styles.badge} mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full text-3xl shadow-sm`} aria-hidden="true">{order.status==='pending'||order.status==='confirmed'||order.status==='shipped'||order.status==='delivered'?'✓':'↩'}</div>
                <h1 className="mb-3 text-3xl font-black">{orderPresentation(order.status).heading}</h1>
                <p className={styles.muted}>{orderPresentation(order.status).message}</p>
              </div>
              <div className="space-y-4 p-4 sm:p-6">
                <OrderProgress status={order.status}/>
                <div className={`${styles.divider} flex flex-wrap justify-between gap-4 border-b pb-5`}>
                  <div><p className={`${styles.muted} text-xs`}>رقم الطلب</p><p className={`${styles.link} font-black`} dir="ltr">#{shortOrderCode(order.id)}</p><p className={`${styles.muted} mt-1 text-xs`}>المعرّف الكامل موجود للمتابعة عند الحاجة</p></div>
                  <div><p className={`${styles.muted} text-xs`}>التاريخ</p><p className="font-bold">{new Date(order.createdAt).toLocaleDateString('ar-IQ')}</p></div>
                  <div><p className={`${styles.muted} text-xs`}>الحالة</p><p className="font-bold">{orderStatusLabels[order.status]||'حالة غير معروفة'}</p></div>
                </div>
                <section>
                  <h2 className="mb-3 text-xl font-black">عنوان التوصيل</h2>
                  <p className={styles.muted}>{order.customerName} — {order.customerPhone}</p>
                  <p className={styles.muted}>{order.customerAddress}، {order.customerCity}</p>
                </section>
                <section>
                  <h2 className="mb-3 text-xl font-black">تفاصيل المنتجات</h2>
                  <div className="space-y-3">
                    {order.items.map((item) => (
                      <div key={item.id} className={`${styles.divider} flex justify-between gap-4 border-b pb-3 text-sm`}>
                        <span className="min-w-0">{item.productName||item.product.name} × {item.quantity}{(item.returnLines?.length||0)>0&&<small className={`${styles.warning} mr-1 rounded px-1`}>(مرجع {item.returnLines?.reduce((sum,line)=>sum+line.quantity,0)})</small>}</span>
                        <span className="font-black whitespace-nowrap">{(item.price * item.quantity).toLocaleString('ar-IQ')} د.ع</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section aria-label="ملخص الطلب المؤكد" className={`${styles.summary} rounded-xl p-4`}><dl className="space-y-2">
                  <div className={`${styles.row} text-sm`}><dt>مجموع المنتجات</dt><dd>{(order.subtotal??order.items.reduce((a,i)=>a+i.price*i.quantity,0)).toLocaleString('ar-IQ')} د.ع</dd></div>
                  {order.discountAmount!=null&&<div className={`${styles.row} ${styles.success} text-sm`}><dt>كوبون {order.couponCode}</dt><dd>-{order.discountAmount.toLocaleString('ar-IQ')} د.ع</dd></div>}
                  <div className={`${styles.row} text-sm`}><dt>التوصيل</dt><dd>{order.shippingFee===null||order.shippingFee===undefined?'يحدد لاحقاً':order.shippingFee.toLocaleString('ar-IQ')+' د.ع'}</dd></div>
                  <div className={`${styles.row} ${styles.divider} border-t pt-3 text-xl font-black`}><dt>الإجمالي</dt><dd>{order.total.toLocaleString('ar-IQ')} د.ع</dd></div>
                </dl></section>
                <p className={`${styles.muted} text-xs`}>طريقة الدفع: عند الاستلام.</p>
                <section className={`${styles.reorder} rounded-2xl border p-4 sm:p-5`} aria-label="إعادة تجهيز السلة">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><h2 className="text-base font-black">تحتاج نفس المستلزمات مرة ثانية؟</h2>
                      <p className={`${styles.muted} mt-1 text-xs leading-6`}>نجهّز سلة جديدة بالأسعار والمخزون الحاليين، وما نؤكد شراء تلقائياً.</p>
                    </div>
                    <button type="button" disabled={reorderBusy} onClick={reorder} className={`site-btn site-btn-sm ${styles.primaryButton}`}><ShoppingBag size={16} aria-hidden="true"/>{reorderBusy?'جاري المراجعة...':'إعادة تجهيز السلة'}</button>
                  </div>
                  {askToReplace&&<div className={`${styles.warning} mt-4 rounded-xl border p-4 text-sm`}>
                    <p className="font-bold">عندك منتجات بالسلة حالياً؛ تريد تستبدلها بمحتويات هذا الطلب؟</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={reorder} disabled={reorderBusy} className={`${styles.primaryButton} rounded-full border px-4 py-2 font-bold disabled:opacity-60`}>نعم، استبدل السلة</button>
                      <button type="button" onClick={()=>setAskToReplace(false)} disabled={reorderBusy} className={`${styles.secondaryButton} rounded-full border px-4 py-2 font-bold disabled:opacity-60`}>إلغاء</button>
                    </div>
                  </div>}
                  {reorderError&&<p role="alert" className={`${styles.error} mt-3 rounded-xl px-4 py-3 text-sm font-bold`}>{reorderError}</p>}
                  <p className={`${styles.muted} mt-3 flex items-center gap-1.5 text-xs`}><ShieldCheck size={15} aria-hidden="true"/> إعادة تجهيز السلة لا تنشئ طلباً جديداً.</p>
                </section>
                <div className="flex flex-wrap gap-3">
                  <Link href="/account" className={`site-btn ${styles.primaryButton} flex-1`}>عرض طلباتي</Link>
                  <Link href="/products" className={`site-btn ${styles.secondaryButton} flex-1`}>متابعة التسوق</Link>
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
