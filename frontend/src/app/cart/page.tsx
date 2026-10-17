"use client";
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductMedia from '@/components/ui/ProductMedia';
import { useCart } from '@/context/CartContext';
import Link from 'next/link';

export default function CartPage() {
  const { items, removeFromCart, updateQuantity, totalPrice, clearCart } = useCart();

  if (items.length === 0) {
    return (
      <>
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-20 text-center">
          <div className="text-8xl mb-6">🛒</div>
          <h1 className="text-4xl font-black mb-4 text-ink">سلتك فارغة</h1>
          <p className="text-neutral-600 mb-8">لم تضف أي منتج بعد. تسوق الآن!</p>
          <Link href="/products" className="bg-brand text-white rounded-xl px-8 py-3 font-bold inline-block shadow-[0_10px_24px_#183f881a]">
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
      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-black mb-8 text-ink">سلة التسوق</h1>

        <div className="space-y-4 mb-8">
          {items.map((item) => (
            <div key={item.product.id} className="bg-white border border-[#dfe8f2] rounded-2xl p-5 flex flex-wrap sm:flex-nowrap items-center gap-4">
              <ProductMedia name={item.product.name} image={item.product.image} icon={item.product.icon} size={40} className="rounded-xl w-20 h-20 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-lg text-ink">{item.product.name}</h3>
                <p className="text-neutral-500 text-sm">{item.product.brand}</p>
                <p className="text-ink font-black mt-1 text-lg">{item.product.price.toLocaleString()} د.ع</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                  className="w-8 h-8 rounded-full border-2 border-brand/30 font-bold hover:bg-brand hover:text-white transition"
                >
                  -
                </button>
                <span className="font-bold w-8 text-center">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                  className="w-8 h-8 rounded-full border-2 border-brand/30 font-bold hover:bg-brand hover:text-white transition"
                >
                  +
                </button>
              </div>
              <div className="text-left">
                <p className="font-black text-lg text-ink">{(item.product.price * item.quantity).toLocaleString()} د.ع</p>
                <button
                  onClick={() => removeFromCart(item.product.id)}
                  className="text-red-600 text-sm font-bold hover:underline"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="site-surface !bg-paper2 p-6">
          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-lg text-ink">المجموع:</span>
            <span className="text-3xl font-black text-brand">{totalPrice.toLocaleString()} د.ع</span>
          </div>
          <div className="flex gap-3">
            <Link href="/checkout" className="flex-1 bg-brand text-white rounded-xl py-3 font-bold text-center shadow-[0_10px_24px_#183f881a] hover:bg-brand-dark transition">
              إتمام الطلب
            </Link>
            <button onClick={clearCart} className="bg-white border border-[#cbd8e8] rounded-xl px-6 py-3 font-bold hover:bg-paper2 transition">
              إفراغ السلة
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
