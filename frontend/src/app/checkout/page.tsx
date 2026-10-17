"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductMedia from '@/components/ui/ProductMedia';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { ordersAPI } from '@/lib/api';
import Link from 'next/link';

const cities = [
  'بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء',
  'الأنبار', 'بابل', 'ديالى', 'ذي قار', 'صلاح الدين', 'كركوك',
  'ميسان', 'المثنى', 'واسط', 'دهوك', 'السليمانية', 'حلبجة'
];

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { items, totalPrice, clearCart } = useCart();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    city: 'بغداد',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // حماية الصفحة - redirect للـ login إذا ما كان مسجل
  useEffect(() => {
    if (!user) {
      router.push('/login?redirect=/checkout');
    }
  }, [user, router]);

  // ملء البيانات تلقائياً من الحساب
  useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        phone: user.phone,
        address: '',
        city: 'بغداد',
      });
    }
  }, [user]);

  if (!user) {
    return null;
  }

  if (items.length === 0) {
    return (
      <>
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl font-black mb-4 text-ink">السلة فارغة</h1>
          <p className="text-neutral-600 mb-8">أضف منتجات قبل إتمام الطلب.</p>
          <Link href="/products" className="bg-brand text-white rounded-xl px-8 py-3 font-bold inline-block shadow-[0_10px_24px_#183f881a]">
            تصفح المنتجات
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    setSubmitError('');
    try {
      const order = await ordersAPI.create({
        items: items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
        customer: form,
      });
      clearCart();
      router.push('/order/confirmation?id=' + encodeURIComponent(order.id));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'تعذر تأكيد الطلب، حاول مجدداً');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-black mb-8 text-ink">إتمام الطلب</h1>

        <div className="grid md:grid-cols-2 gap-8">
          <form onSubmit={handleSubmit} className="bg-white border border-[#dfe8f2] rounded-2xl p-6 space-y-5 h-fit">
            <h2 className="text-2xl font-black mb-4 text-ink">بيانات التوصيل</h2>

            <div>
              <label className="block font-bold mb-2 text-sm text-ink">الاسم الكامل</label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-[#d4e0ed] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand"
                placeholder="مثال: أحمد محمد"
              />
            </div>

            <div>
              <label className="block font-bold mb-2 text-sm text-ink">رقم الهاتف</label>
              <div className="flex gap-2">
                <span className="bg-paper2 border border-[#d4e0ed] rounded-xl px-4 py-3 font-bold text-ink">+964</span>
                <input
                  required
                  type="tel"
                  pattern="07[0-9]{9}"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="flex-1 border border-[#d4e0ed] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand"
                  placeholder="7822088894"
                />
              </div>
              <p className="text-xs text-neutral-500 mt-1">مثال: 07822088894 أو 07712345678</p>
            </div>

            <div>
              <label className="block font-bold mb-2 text-sm text-ink">المحافظة</label>
              <select
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full border border-[#d4e0ed] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand bg-white"
              >
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold mb-2 text-sm text-ink">العنوان التفصيلي</label>
              <textarea
                required
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={3}
                className="w-full border border-[#d4e0ed] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand resize-none"
                placeholder="المنطقة، الشارع، أقرب نقطة دالة..."
              />
            </div>

            <div className="bg-paper2 border border-[#d4e0ed] rounded-xl p-4">
              <h3 className="font-black mb-2 text-ink">طريقة الدفع</h3>
              <div className="flex items-center gap-3">
                <span className="text-2xl">💵</span>
                <div>
                  <p className="font-bold text-ink">الدفع عند الاستلام</p>
                  <p className="text-sm text-neutral-600">تدفع نقداً عند استلام الطلب</p>
                </div>
              </div>
            </div>

            {submitError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{submitError}</p>}
            <button
              type="submit"
              disabled={submitting || items.length === 0}
              className="w-full bg-brand text-white rounded-xl py-4 font-black text-lg shadow-[0_10px_24px_#183f881a] hover:bg-brand-dark transition disabled:opacity-50"
            >
              {submitting ? 'جاري تأكيد الطلب...' : 'تأكيد الطلب'}
            </button>
          </form>

          <div className="site-surface !bg-paper2 p-6 h-fit">
            <h2 className="text-2xl font-black mb-4 text-ink">ملخص الطلب</h2>

            <div className="space-y-3 mb-6">
              {items.map((item) => (
                <div key={item.product.id} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-brand/20">
                  <ProductMedia name={item.product.name} image={item.product.image} icon={item.product.icon} size={28} className="w-12 h-12 rounded-lg flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate text-ink">{item.product.name}</p>
                    <p className="text-xs text-neutral-500">{item.quantity} × {item.product.price.toLocaleString()} د.ع</p>
                  </div>
                  <p className="font-black text-sm text-ink">{(item.product.price * item.quantity).toLocaleString()}</p>
                </div>
              ))}
            </div>

            <div className="border-t-2 border-brand/30 pt-4 space-y-2">
              <div className="flex justify-between">
                <span className="font-bold text-ink">المجموع الفرعي</span>
                <span className="font-black text-ink">{totalPrice.toLocaleString()} د.ع</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-ink">الشحن</span>
                <span className="font-black text-brand">يحدد لاحقاً</span>
              </div>
              <div className="flex justify-between text-xl pt-2 border-t border-brand/20">
                <span className="font-black text-ink">الإجمالي</span>
                <span className="font-black text-2xl text-brand">{totalPrice.toLocaleString()} د.ع</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
