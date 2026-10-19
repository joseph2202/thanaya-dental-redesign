"use client";
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { ordersAPI } from '@/lib/api';
import {orderPresentation,orderStatusLabels,orderStatusColors,shortOrderCode} from '@/lib/orderPresentation';

type Order = {
  id: string; total: number; subtotal?:number|null; shippingFee?:number|null; discountAmount?:number|null;couponCode?:string|null; status: string; createdAt: string;
  customerName: string; customerPhone: string; customerAddress: string; customerCity: string;
  items: { id: string; quantity: number; price: number; product: { name: string } }[];
};

function ConfirmationContent() {
  const id = useSearchParams().get('id') || '';
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) { setError('رقم الطلب مفقود'); setLoading(false); return; }
    ordersAPI.getById(id)
      .then((data: Order) => setOrder(data))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'تعذر تحميل الطلب'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-16" dir="rtl">
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
              <div className="space-y-6 p-7">
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
