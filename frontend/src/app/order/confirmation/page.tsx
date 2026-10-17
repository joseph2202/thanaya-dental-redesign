"use client";
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { getOrder } from '@/lib/orders';
import Link from 'next/link';
import Image from 'next/image';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('id') || '';
  const order = getOrder(orderId);

  if (!order) {
    return (
      <>
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl font-black mb-4 text-ink">الطلب غير موجود</h1>
          <Link href="/products" className="bg-brand text-white rounded-xl px-8 py-3 font-bold inline-block">
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
      <main className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="text-8xl mb-6">✅</div>
        <h1 className="text-4xl md:text-5xl font-black mb-4 text-ink">تم تأكيد طلبك!</h1>
        <p className="text-neutral-600 mb-8">شكراً لك، راح نتواصل معك قريباً لتأكيد التفاصيل.</p>

        <div className="bg-white border-2 border-brand/30 rounded-2xl p-8 text-right max-w-2xl mx-auto mb-8">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="Thanaya"
              width={120}
              height={40}
              className="h-10 w-auto"
            />
          </div>
          <div className="flex justify-between items-center mb-4 pb-4 border-b-2 border-brand/30">
            <span className="font-bold text-ink">رقم الطلب:</span>
            <span className="font-black text-xl text-brand">{order.id}</span>
          </div>

          <div className="space-y-2 mb-4">
            <p className="font-bold text-ink">الاسم: <span className="font-normal">{order.customer.name}</span></p>
            <p className="font-bold text-ink">الهاتف: <span className="font-normal">{order.customer.phone}</span></p>
            <p className="font-bold text-ink">العنوان: <span className="font-normal">{order.customer.address}، {order.customer.city}</span></p>
          </div>

          <div className="border-t-2 border-brand/30 pt-4">
            <p className="font-bold mb-2 text-ink">المنتجات ({order.items.length}):</p>
            <ul className="space-y-1 text-sm">
              {order.items.map((item) => (
                <li key={item.product.id} className="flex justify-between">
                  <span className="text-ink">{item.product.name} × {item.quantity}</span>
                  <span className="font-bold text-ink">{(item.product.price * item.quantity).toLocaleString()} د.ع</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t-2 border-brand/30 mt-4 pt-4 flex justify-between items-center">
            <span className="font-black text-lg text-ink">الإجمالي:</span>
            <span className="font-black text-2xl text-brand">{order.total.toLocaleString()} د.ع</span>
          </div>
        </div>

        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/products" className="bg-brand text-white rounded-xl px-8 py-3 font-bold shadow-[0_10px_24px_#183f881a]">
            تسوق المزيد
          </Link>
          <Link href="/" className="bg-white border border-[#cbd8e8] rounded-xl px-8 py-3 font-bold hover:bg-paper2 transition">
            الرئيسية
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={
      <>
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-20 text-center">
          <p>جاري التحميل...</p>
        </main>
        <Footer />
      </>
    }>
      <ConfirmationContent />
    </Suspense>
  );
}
