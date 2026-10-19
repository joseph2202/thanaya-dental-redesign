"use client";
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductMedia from '@/components/ui/ProductMedia';
import { useCart } from '@/context/CartContext';
import Link from 'next/link';
import {useState} from 'react';
import {Trash2,Minus,Plus,ArrowUpLeft,ShieldCheck} from 'lucide-react';

export default function CartPage() {
  const { items, removeFromCart, updateQuantity, totalPrice, clearCart } = useCart();
  const [message,setMessage]=useState('');
  const adjust=(id:string,quantity:number)=>{const result=updateQuantity(id,quantity);setMessage(result.success?'':result.message)};

  if (items.length === 0) {
    return (
      <>
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-20 text-center">
          <div className="text-8xl mb-6">🛒</div>
          <h1 className="text-4xl font-black mb-4 text-ink">سلتك فارغة</h1>
          <p className="text-neutral-600 mb-8">لم تضف أي منتج بعد. تسوق الآن!</p>
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
      <main className="site-container site-main py-9 md:py-12">
        <div className="mb-8 rounded-[24px] border border-[#cce7f1] bg-[linear-gradient(100deg,#e6f7fd,#fff)] px-7 py-8"><span className="site-eyebrow">THANAYA / CART</span><h1 className="mt-2 text-3xl font-black text-ink md:text-4xl">سلة التسوق</h1><p className="site-muted mt-2 text-sm">راجع منتجاتك وكمياتها قبل تأكيد الطلب.</p></div>

        <div className="space-y-4 mb-8">
          {items.map((item) => (
            <div key={item.product.id} className="bg-white border border-[#dfe8f2] rounded-2xl p-4 sm:p-5 shadow-sm grid grid-cols-[72px_minmax(0,1fr)] sm:grid-cols-[90px_minmax(0,1fr)_auto] gap-4 items-start">
              <ProductMedia name={item.product.name} image={item.product.image} icon={item.product.icon} size={40} className="rounded-xl w-[72px] h-[72px] sm:w-[90px] sm:h-[90px] shrink-0" />
              <div className="min-w-0">
                <Link href={`/product/${item.product.id}`} className="block font-bold text-base sm:text-lg text-ink hover:text-brand">{item.product.name}</Link>
                <p className="text-neutral-500 text-sm">{item.product.brand}</p>
                <p className="text-ink font-black mt-1 text-lg">{item.product.price.toLocaleString()} د.ع</p>
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
                <p className="font-black text-lg text-ink">{(item.product.price * item.quantity).toLocaleString()} د.ع</p>
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
        <div className="site-surface !bg-[#e9f8fd] p-5 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-lg text-ink">المجموع:</span>
            <span className="text-3xl font-black text-brand">{totalPrice.toLocaleString()} د.ع</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/checkout" className="site-btn site-btn-primary flex-1">
              إتمام الطلب
            </Link>
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
