"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductMedia from '@/components/ui/ProductMedia';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { ordersAPI, couponsAPI, deliveryAPI, DeliveryConfig, productsAPI, CartQuote, addressesAPI, SavedAddress } from '@/lib/api';
import Link from 'next/link';

const cities = [
  'بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء',
  'الأنبار', 'بابل', 'ديالى', 'ذي قار', 'صلاح الدين', 'كركوك',
  'ميسان', 'المثنى', 'واسط', 'دهوك', 'السليمانية', 'حلبجة'
];

export default function CheckoutPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { items, totalPrice, clearCart } = useCart();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    city: 'بغداد',
  });
  const [savedAddresses,setSavedAddresses] = useState<SavedAddress[]>([]);
  const [savedChoice,setSavedChoice] = useState('');
  const [addressesLoading,setAddressesLoading] = useState(true);
  const [addressesError,setAddressesError] = useState('');
  const [delivery,setDelivery] = useState<DeliveryConfig|null>(null);
  const [quote,setQuote]=useState<CartQuote|null>(null);
  const [quoteLoading,setQuoteLoading]=useState(true);
  const [quoteError,setQuoteError]=useState('');
  const [priceAcknowledged,setPriceAcknowledged]=useState(false);
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
  // Cart changes invalidate old coupon and inventory/price quotes.
  const basketSignature=JSON.stringify(items.map(i=>[i.product.id,i.quantity]));
  useEffect(()=>{setCoupon(null);setPriceAcknowledged(false);setQuote(null);setQuoteError('');
    if(!items.length){setQuoteLoading(false);return;}
    let cancelled=false;setQuoteLoading(true);
    productsAPI.quote(items.map(i=>({productId:i.product.id,quantity:i.quantity}))).then(q=>{if(!cancelled)setQuote(q)}).catch(e=>{if(!cancelled)setQuoteError(e instanceof Error?e.message:'تعذر مراجعة الأسعار')}).finally(()=>{if(!cancelled)setQuoteLoading(false)});
    return ()=>{cancelled=true};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[basketSignature]);
  const serverSubtotal=quote?.subtotal??totalPrice;
  const priceChanged=Boolean(quote?.items.some(q=>{const old=items.find(i=>i.product.id===q.productId);return !!q.product&&!!old&&old.product.price!==q.product.price}));

  // حماية الصفحة - redirect للـ login إذا ما كان مسجل
  useEffect(() => {
    if (!authLoading && !user) router.push('/login?redirect=/checkout');
  }, [user, router, authLoading]);

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

  // Saved addresses prefill delivery details; the order still records an immutable
  // snapshot of the visible form, so editing the address book never rewrites old orders.
  useEffect(() => {
    if (!user) return;
    let active=true;
    setAddressesLoading(true);setAddressesError('');
    addressesAPI.getMine().then(addresses=>{
      if(!active)return;
      setSavedAddresses(addresses);
      const defaultAddress=addresses.find(a=>a.isDefault);
      if(defaultAddress){
        setSavedChoice(defaultAddress.id);
        setForm(current=>current.address.trim()?current:{
          name:defaultAddress.name,phone:defaultAddress.phone,
          city:defaultAddress.city,address:defaultAddress.address
        });
      }
    }).catch(e=>{if(active)setAddressesError(e instanceof Error?e.message:'تعذّر جلب العناوين المحفوظة')})
      .finally(()=>{if(active)setAddressesLoading(false)});
    return ()=>{active=false};
  },[user]);

  const selectSavedAddress=(id:string)=>{
    setSavedChoice(id);
    const picked=savedAddresses.find(a=>a.id===id);
    if(picked)setForm({name:picked.name,phone:picked.phone,city:picked.city,address:picked.address});
  };

  if (authLoading || !user) return null;

  if (items.length === 0) {
    return (
      <>
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-9 text-center">
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
    if(submitting)return;
    if(deliveryLoading||deliveryError||deliveryUnavailable||!delivery){setSubmitError('تأكد من توفر التوصيل لهذه المحافظة قبل إتمام الطلب');return;}
    if(quoteLoading||quoteError||!quote?.canCheckout){setSubmitError('راجع السلة والأسعار والكميات قبل التأكيد');return;}
    if(priceChanged&&!priceAcknowledged){setSubmitError('تغيّر سعر أحد المنتجات. وافق على السعر الجديد أولاً');return;}
    setSubmitting(true);

    setSubmitError('');
    try {
      const lines = items.map(item => ({ productId:item.product.id, quantity:item.quantity }));
      const fingerprint=JSON.stringify({lines:[...lines].sort((a,b)=>a.productId.localeCompare(b.productId)),customer:form,couponCode:coupon?.code??null});
      const saved=sessionStorage.getItem('thanaya-checkout-attempt');
      let attempt:{fingerprint:string;requestId:string}|null=null;
      try{attempt=saved?JSON.parse(saved):null}catch{attempt=null}
      const complete=(id:string)=>{sessionStorage.removeItem('thanaya-checkout-attempt');clearCart();router.push('/order/confirmation?id='+encodeURIComponent(id))};
      if(attempt&&attempt.fingerprint===fingerprint){
        try{const recovered=await ordersAPI.recoverAttempt(attempt.requestId);complete(recovered.id);return}
        catch(e){if((e as Error&{status?:number}).status!==404)throw e}
      }
      // Confirm again against current server data, not localStorage amounts.
      const [fresh,latestDelivery]=await Promise.all([productsAPI.quote(lines),deliveryAPI.getPublic()]);
      setQuote(fresh);setDelivery(latestDelivery);
      if(!fresh.canCheckout){setSubmitError('المخزون تغيّر؛ عد إلى السلة وعدّل الكميات');return}
      if(fresh.subtotal!==quote.subtotal){
        setPriceAcknowledged(false);
        setCoupon(null);
        setSubmitError('تغيّر سعر المنتج أثناء المراجعة. راجع المبلغ الجديد وطبّق الكوبون من جديد');
        return;
      }
      const updatedRate=latestDelivery.rates.find(r=>r.province===form.city);
      if(latestDelivery.enabled&& !updatedRate?.available){setSubmitError('التوصيل لهذه المحافظة لم يعد متاحاً');return}
      if(latestDelivery.enabled!==delivery.enabled||(latestDelivery.enabled&&(updatedRate?.fee??0)!==fee)){
        setSubmitError('تغيّرت إعدادات أجور التوصيل. راجع المبلغ الجديد واضغط تأكيد مرة ثانية');
        return;
      }
      if(coupon){
        const latestCoupon=await couponsAPI.preview(coupon.code,lines);
        if(latestCoupon.discount!==coupon.discount||latestCoupon.subtotal!==fresh.subtotal){
          setCoupon(latestCoupon);
          setSubmitError('تغيّر مبلغ الخصم. راجع الإجمالي الجديد ثم أكد مرة ثانية');
          return;
        }
      }
      if(!attempt||attempt.fingerprint!==fingerprint){
        attempt={fingerprint,requestId:crypto.randomUUID()};
        sessionStorage.setItem('thanaya-checkout-attempt',JSON.stringify(attempt));
      }
      try{
        const order=await ordersAPI.create({items:lines,customer:form,requestId:attempt.requestId,couponCode:coupon?.code??null});
        complete(order.id);
      }catch(e){
        // If checkout was committed but the network response was lost, recover safely.
        try{
          const recovered=await ordersAPI.recoverAttempt(attempt.requestId);
          complete(recovered.id);
        }catch{
          throw e; // Keep the attempt ID for safe retry.
        }
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'تعذر تأكيد الطلب، حاول مجدداً');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Header />
      <main className="site-container py-5 md:py-8">
        <h1 className="text-3xl font-black mb-5 text-ink">إتمام الطلب</h1>

        <div className="grid md:grid-cols-2 gap-5">
          <form onSubmit={handleSubmit} className="bg-white border border-[#d4eaf2] rounded-2xl p-4 sm:p-5 space-y-4 h-fit">
            <h2 className="text-2xl font-black mb-4 text-ink">بيانات التوصيل</h2>
            {addressesLoading&&<p role="status" className="text-sm text-neutral-600">جاري تحميل عناوينك المحفوظة...</p>}
            {addressesError&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">العناوين المحفوظة غير متاحة حالياً؛ تكدر تدخل العنوان يدوياً. {addressesError}</p>}
            {savedAddresses.length>0&&<div className="rounded-2xl border border-[#cce7f1] bg-[#f1faff] p-4">
              <label htmlFor="checkout-saved-address" className="block text-sm font-black">اختَر عنواناً محفوظاً (اختياري)</label>
              <select id="checkout-saved-address" value={savedChoice} onChange={e=>selectSavedAddress(e.target.value)} className="mt-2 w-full rounded-xl border border-[#bbdeea] bg-white px-4 py-3 text-sm font-bold">
                <option value="">إدخال العنوان يدوياً</option>
                {savedAddresses.map(a=><option key={a.id} value={a.id}>{a.label} — {a.city}{a.isDefault?' (افتراضي)':''}</option>)}
              </select>
              <p className="mt-2 text-xs leading-6 text-[#587380]">تكدر تعدّل بيانات المستلم أدناه لهذا الطلب بدون تغيير العنوان المحفوظ.</p>
            </div>}

            <div>
              <label className="block font-bold mb-2 text-sm text-ink">الاسم الكامل</label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => {setForm({ ...form, name: e.target.value });setSavedChoice('')}}
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
                  onChange={(e) => {setForm({ ...form, phone: e.target.value });setSavedChoice('')}}
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
                onChange={(e) => {setForm({ ...form, city: e.target.value });setSavedChoice('')}}
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
                onChange={(e) => {setForm({ ...form, address: e.target.value });setSavedChoice('')}}
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

            {quoteLoading&&<p role="status" className="text-sm text-sky-700">جاري التأكد من سعر المنتجات والمخزون...</p>}
            {quoteError&&<p role="alert" className="text-sm font-bold text-red-700">{quoteError}</p>}
            {quote&&!quote.canCheckout&&<div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">المخزون غير كافٍ لبعض المنتجات أو أحدها غير متوفر. <Link className="font-bold underline" href="/cart">راجع السلة</Link></div>}
            {priceChanged&&<label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><input type="checkbox" className="mt-1" checked={priceAcknowledged} onChange={e=>setPriceAcknowledged(e.target.checked)}/><span>تغيّر سعر أحد المنتجات. راجعت المبلغ الجديد وأوافق على المتابعة.</span></label>}
            {submitError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{submitError}</p>}
            <button
              type="submit"
              disabled={submitting || items.length === 0 || deliveryLoading || !!deliveryError || !delivery || deliveryUnavailable || quoteLoading || !!quoteError || !quote?.canCheckout || (priceChanged&&!priceAcknowledged)}
              className="site-btn site-btn-primary site-btn-lg w-full"
            >
              {submitting ? 'جاري تأكيد الطلب...' : 'تأكيد الطلب'}
            </button>
          </form>

          <div className="site-surface !bg-paper2 p-4 sm:p-5 h-fit">
            <h2 className="text-2xl font-black mb-4 text-ink">ملخص الطلب</h2>

            <div className="space-y-3 mb-6">
              {items.map((item) => (
                <div key={item.product.id} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-brand/20">
                  <ProductMedia name={item.product.name} image={item.product.image} icon={item.product.icon} size={28} className="w-12 h-12 rounded-lg flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate text-ink">{item.product.name}</p>
                    <p className="text-xs text-neutral-500">{item.quantity} × {(quote?.items.find(q=>q.productId===item.product.id)?.product?.price??item.product.price).toLocaleString()} د.ع</p>
                  </div>
                  <p className="font-black text-sm text-ink">{((quote?.items.find(q=>q.productId===item.product.id)?.product?.price??item.product.price)*item.quantity).toLocaleString()}</p>
                </div>
              ))}
            </div>

            <div className="border-t-2 border-brand/30 pt-4 space-y-2">
              <div className="flex justify-between">
                <span className="font-bold text-ink">المجموع الفرعي</span>
                <span className="font-black text-ink">{serverSubtotal.toLocaleString()} د.ع</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-ink">الشحن</span>
                <span className="font-black text-brand">{deliveryLoading?'جاري التحميل':deliveryError?'غير متاح للتحقق':delivery?.enabled?(deliveryUnavailable?'غير متاح':fee===0?'مجاني':fee.toLocaleString()+' د.ع'):'يحدد لاحقاً'}</span>
              </div>
              {coupon&&<div className="flex justify-between text-green-700"><span className="font-bold">الخصم ({coupon.code})</span><span className="font-black">-{coupon.discount.toLocaleString()} د.ع</span></div>}
              <div className="flex justify-between text-xl pt-2 border-t border-brand/20">
                <span className="font-black text-ink">الإجمالي</span>
                <span className="font-black text-2xl text-brand">{(serverSubtotal-(coupon?.discount??0)+fee).toLocaleString()} د.ع</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
