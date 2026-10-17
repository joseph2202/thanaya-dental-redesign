"use client";
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { ordersAPI } from '@/lib/api';

type Order = {
  id: string; total: number; status: string; createdAt: string;
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
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-white text-3xl shadow-sm">✓</div>
                <h1 className="mb-3 text-3xl font-black text-ink">تم استلام طلبك بنجاح!</h1>
                <p className="text-neutral-600">طلبك قيد المعالجة، وراح نتواصل وياك لتأكيد التوصيل.</p>
              </div>
              <div className="space-y-6 p-7">
                <div className="flex flex-wrap justify-between gap-4 border-b border-[#d4eaf2] pb-5">
                  <div><p className="text-xs text-neutral-500">رقم الطلب</p><p className="font-black text-brand break-all">{order.id}</p></div>
                  <div><p className="text-xs text-neutral-500">التاريخ</p><p className="font-bold text-ink">{new Date(order.createdAt).toLocaleDateString('ar-IQ')}</p></div>
                  <div><p className="text-xs text-neutral-500">الحالة</p><p className="font-bold text-ink">{order.status === 'pending' ? 'قيد المعالجة' : order.status}</p></div>
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
                <div className="flex justify-between rounded-xl bg-[#edf7fc] p-4 text-xl font-black text-ink">
                  <span>مجموع المنتجات</span><span>{order.total.toLocaleString('ar-IQ')} د.ع</span>
                </div>
                <p className="text-xs text-neutral-500">الدفع عند الاستلام. أجور التوصيل يتم تحديدها لاحقاً.</p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/account" className="flex-1 rounded-xl bg-brand px-6 py-3 text-center font-bold text-white">عرض طلباتي</Link>
                  <Link href="/products" className="flex-1 rounded-xl border border-[#d4eaf2] px-6 py-3 text-center font-bold text-ink">متابعة التسوق</Link>
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
