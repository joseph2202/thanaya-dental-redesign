"use client";

import {useState} from 'react';
import Link from 'next/link';
import {ArrowUpLeft, Check, ShoppingBag} from 'lucide-react';
import {useCart, type Product} from '@/context/CartContext';
import ProductMedia from '@/components/ui/ProductMedia';
import {saleUnitLabel} from '@/lib/saleUnits';

export type CatalogCardProduct = Product & {
  category: string;
  brand: string;
  price: number;
  availableStock?: number;
  saleUnit?: string | null;
};

export default function CatalogProductCard({product}: {product: CatalogCardProduct}) {
  const {addToCart} = useCart();
  const [feedback, setFeedback] = useState<{success:boolean; message:string} | null>(null);
  // Physical lot stock may contain expired inventory. Only sell usable units.
  const available = Math.max(0, product.availableStock ?? product.stock);
  const hasStock = available > 0;

  const handleAdd = () => {
    setFeedback(addToCart({...product, stock: available}, 1));
  };

  return <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-[22px] border border-[#cde5ed] bg-white shadow-[0_8px_24px_rgba(24,79,102,.035)] transition-colors hover:border-[#83cde4] hover:shadow-[0_16px_30px_rgba(24,79,102,.08)]">
    <div className="relative m-2 mb-0 sm:m-3 sm:mb-0">
      <Link href={`/product/${product.id}`} className="block overflow-hidden rounded-[16px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" aria-label={`عرض تفاصيل ${product.name}`}>
        <ProductMedia name={product.name} image={product.image} icon={product.icon} size={56} className="aspect-[4/3] w-full rounded-[16px] sm:aspect-[5/4]" />
      </Link>
      <span className={`pointer-events-none absolute right-2 top-2 rounded-full border px-2.5 py-1 text-[10px] font-extrabold shadow-sm ${hasStock ? 'border-emerald-100 bg-white/95 text-emerald-700' : 'border-red-100 bg-red-50 text-red-700'}`}>
        {hasStock ? 'متوفر' : 'غير متوفر'}
      </span>
    </div>

    <div className="flex min-w-0 flex-1 flex-col px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
      <p className="line-clamp-1 text-[10px] font-bold text-[#0783ad] sm:text-xs">{product.category || 'مستلزمات طبية'}</p>
      <Link href={`/product/${product.id}`} className="mt-1 line-clamp-2 min-h-[3.25rem] text-[13px] font-black leading-[1.65] text-[#254452] hover:text-brand sm:text-[15px]">
        {product.name}
      </Link>
      <p className="mt-1 line-clamp-1 text-[11px] text-[#728795]">{product.brand || 'ثنايا'}</p>
      <div className="mt-auto border-t border-[#edf2f5] pt-3">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <strong className="text-lg font-black tracking-tight text-[#16384a] sm:text-[22px]">{product.price.toLocaleString('en-US')}</strong>
          <span className="text-[10px] font-bold text-[#748a97] sm:text-xs">د.ع / {saleUnitLabel(product.saleUnit)}</span>
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_42px] gap-2">
          <button type="button" onClick={handleAdd} disabled={!hasStock}
            className="site-btn site-btn-primary site-btn-sm !min-h-[42px] min-w-0 !px-2 !text-xs"
            aria-label={`إضافة ${product.name} للسلة`}>
            {feedback?.success ? <Check size={17} aria-hidden="true"/> : <ShoppingBag size={17} aria-hidden="true"/>}
            <span>{!hasStock ? 'غير متوفر' : feedback?.success ? 'تمت الإضافة' : 'أضف للسلة'}</span>
          </button>
          <Link href={`/product/${product.id}`}
            className="grid h-[42px] w-[42px] place-items-center rounded-full border-2 border-[#d0e5ed] text-brand transition hover:bg-[#edf9fd]"
            aria-label={`تفاصيل ${product.name}`}><ArrowUpLeft size={18} aria-hidden="true"/></Link>
        </div>
        {feedback && <div role="status" aria-live="polite" className={`mt-2 text-[11px] font-bold ${feedback.success ? 'text-emerald-700' : 'text-red-700'}`}>
          {feedback.success ? <Link href="/cart" className="underline underline-offset-2">عرض السلة <ArrowUpLeft size={12} className="inline"/></Link> : feedback.message}
        </div>}
      </div>
    </div>
  </article>;
}
