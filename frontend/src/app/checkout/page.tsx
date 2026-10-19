"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductMedia from '@/components/ui/ProductMedia';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { ordersAPI, couponsAPI, deliveryAPI, DeliveryConfig } from '@/lib/api';
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
  const [delivery,setDelivery] = useState<DeliveryConfig|null>(null);
  const [deliveryError,setDeliveryError] = useState('');
  const [deliveryLoading,setDeliveryLoading] = useState(true);
  useEffect(()=>{deliveryAPI.getPublic().then(data=>{setDelivery(data);setDeliveryError('')}).catch(()=>setDeliveryError('تعذر التحقق من أجور التوصيل. حاول مجدداً')).finally(()=>setDeliveryLoading(false))},[]);
  const provinceRate=delivery?.rates.find(rate=>rate.province===form.city);
  const deliveryUnavailable=Boolean(delivery?.enabled&&!provinceRate?.available);
  const fee=delivery?.enabled?provinceRate?.fee??0:0;
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [couponInput,setCouponInput]=useState('');
  const [coupon,setCoupon]=useState<{code:string;subtotal:number;discount:number;totalAfterDiscount:number}|null>(null);
  const [couponBusy,setCouponBusy]=useState(false);
  const [couponError,setCouponError]=useState('');
  async function verifyCoupon(e:React.FormEvent){
    e.preventDefault();setCouponError('');setCouponBusy(true);
    try{
      const q=await couponsAPI.preview(couponInput,items.map(i=>({productId:i.product.id,quantity:i.quantity})));
      setCoupon(q);
    }catch(err){setCoupon(null);setCouponError(err instanceof Error?err.message:'تعذر التحقق من الكوبون')}
    finally{setCouponBusy(false)}
  }
  // A changed cart invalidates the old coupon quote.
  const basketSignature=JSON.stringify(items.map(i=>[i.product.id,i.quantity]));
  useEffect(()=>{setCoupon(null)},[basketSignature]);

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
          <Link href="/products" className="site-btn site-btn-primary">
            تصفح المنتجات
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(deliveryLoading||deliveryError||deliveryUnavailable||!delivery){setSubmitError('تأكد من توفر التوصيل لهذه المحافظة قبل إتمام الطلب');return;}
    setSubmitting(true);

    setSubmitError('');
    try {
      const lines = items.map((item) => ({ productId: item.product.id, quantity: item.quantity }));
      // Reuse one identifier after network failures, but not for a changed basket/address.
      const fingerprint = JSON.stringify({ lines: [...lines].sort((a, b) => a.productId.localeCompare(b.productId)), customer: form, couponCode:coupon?.code??null });
      const saved = sessionStorage.getItem('thanaya-checkout-attempt');
      let attempt: { fingerprint: string; requestId: string } | null = null;
      try { attempt = saved ? JSON.parse(saved) : null; } catch { /* replace corrupt data */ }
      if (!attempt || attempt.fingerprint !== fingerprint) {
        attempt = { fingerprint, requestId: crypto.randomUUID() };
        sessionStorage.setItem('thanaya-checkout-attempt', JSON.stringify(attempt));
      }
      const order = await ordersAPI.create({ items: lines, customer: form, requestId: attempt.requestId, couponCode:coupon?.code??null });
      sessionStorage.removeItem('thanaya-checkout-attempt');
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
          <form onSubmit={handleSubmit} className="bg-white border border-[#d4eaf2] rounded-2xl p-6 space-y-5 h-fit">
            <h2 className="text-2xl font-black mb-4 text-ink">بيانات التوصيل</h2>

            <div>
              <label className="block font-bold mb-2 text-sm text-ink">الاسم الكامل</label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-[#bbdeea] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand"
                placeholder="مثال: أحمد محمد"
              />
            </div>

            <div>
              <label className="block font-bold mb-2 text-sm text-ink">رقم الهاتف</label>
              <div className="flex gap-2">
                <span className="bg-paper2 border border-[#bbdeea] rounded-xl px-4 py-3 font-bold text-ink">+964</span>
                <input
                  required
                  type="tel"
                  pattern="07[0-9]{9}"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="flex-1 border border-[#bbdeea] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand"
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
                className="w-full border border-[#bbdeea] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand bg-white"
              >
                {cities.map((c) => (
                  <option key={c} value={c}>{c}{delivery?.enabled && !delivery.rates.find(r=>r.province===c)?.available?' — غير متاح':''}</option>
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
                className="w-full border border-[#bbdeea] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand resize-none"
                placeholder="المنطقة، الشارع، أقرب نقطة دالة..."
              />
            </div>

            {deliveryLoading&&<p className="text-sm text-neutral-600">جاري التأكد من توفر التوصيل...</p>}
            {deliveryError&&<p role="alert" className="text-sm font-bold text-red-700">{deliveryError}</p>}
            {deliveryUnavailable&&<p role="alert" className="text-sm font-bold text-red-700">التوصيل غير متاح حالياً إلى {form.city}. اختر محافظة متاحة.</p>}
            <div className="rounded-xl border border-brand/20 bg-paper2 p-4">
              <h3 className="font-black mb-2">رمز خصم (اختياري)</h3>
              <div className="flex gap-2">
                <input value={couponInput} onChange={e=>{setCouponInput(e.target.value.toUpperCase());setCoupon(null);setCouponError('')}} placeholder="أدخل رمز الخصم" className="min-w-0 flex-1 rounded-xl border border-brand/30 p-3" maxLength={32} />
                <button type="button" disabled={couponBusy||!couponInput.trim()} onClick={verifyCoupon} className="site-btn site-btn-outline site-btn-sm">{couponBusy?'جاري...':'تطبيق'}</button>
              </div>
              {couponError&&<p role="alert" className="mt-2 text-sm font-bold text-red-700">{couponError}</p>}
              {coupon&&<div className="mt-2 flex justify-between gap-2 text-sm"><span className="font-bold text-green-700">كوبون {coupon.code} · خصم {coupon.discount.toLocaleString()} د.ع</span><button type="button" className="underline" onClick={()=>{setCoupon(null);setCouponInput('')}}>إزالة</button></div>}
            </div>
            <div className="bg-paper2 border border-[#bbdeea] rounded-xl p-4">
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
              disabled={submitting || items.length === 0 || deliveryLoading || !!deliveryError || !delivery || deliveryUnavailable}
              className="site-btn site-btn-primary site-btn-lg w-full"
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
                <span className="font-black text-brand">{deliveryLoading?'جاري التحميل':deliveryError?'غير متاح للتحقق':delivery?.enabled?(deliveryUnavailable?'غير متاح':fee===0?'مجاني':fee.toLocaleString()+' د.ع'):'يحدد لاحقاً'}</span>
              </div>
              {coupon&&<div className="flex justify-between text-green-700"><span className="font-bold">الخصم ({coupon.code})</span><span className="font-black">-{coupon.discount.toLocaleString()} د.ع</span></div>}
              <div className="flex justify-between text-xl pt-2 border-t border-brand/20">
                <span className="font-black text-ink">الإجمالي</span>
                <span className="font-black text-2xl text-brand">{(totalPrice-(coupon?.discount??0)+fee).toLocaleString()} د.ع</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
