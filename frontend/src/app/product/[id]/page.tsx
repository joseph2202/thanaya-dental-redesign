import { productsAPI } from '@/lib/api';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import AddToCartButton from '@/components/product/AddToCartButton';
import BuyNowButton from '@/components/product/BuyNowButton';
import ProductMedia from '@/components/ui/ProductMedia';
import { ArrowLeft, CircleCheck } from 'lucide-react';

export const instant = false;

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let product;
  try { product = await productsAPI.getById(id); } catch { notFound(); }
  let related: any[] = [];
  try {
    const all = await productsAPI.getAll({ category: product.category });
    related = all.filter((p: any) => p.id !== product.id).slice(0, 3);
  } catch { related = []; }

  return <><Header /><main className="site-container site-main py-9 md:py-14">
    <nav aria-label="مسار الصفحة" className="text-xs text-[#8090a4] flex flex-wrap items-center gap-2 mb-8"><Link href="/" className="hover:text-brand">الرئيسية</Link><span>/</span><Link href="/products" className="hover:text-brand">المنتجات</Link><span>/</span><span className="text-ink">{product.name}</span></nav>
    <div className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-start">
      <ProductMedia name={product.name} image={product.image} icon={product.icon} size={160} className="aspect-square rounded-[24px] border border-[#dfebf7]" />
      <div className="py-2 lg:py-6">
        <span className="site-eyebrow">{product.category} {product.brand ? ` / ${product.brand}` : ''}</span>
        <h1 className="site-page-title leading-[1.35] mt-4">{product.name}</h1>
        {product.description && product.description.trim().toLowerCase() !== 'nothing' && <p className="site-muted mt-5 text-sm sm:text-base">{product.description}</p>}
        <div className="border-y border-[#dfe8f2] py-6 my-7 flex items-end justify-between gap-3"><div><span className="text-xs text-[#8495a7] block mb-2">السعر</span><strong className="text-3xl sm:text-4xl font-extrabold">{product.price.toLocaleString()} <small className="font-normal text-base">د.ع</small></strong>{product.usdPrice != null && <span className="block text-xs text-[#8392a5] mt-2">≈ {product.usdPrice} دولار</span>}</div><span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full ${product.stock > 0 ? 'bg-[#e9f6f1] text-success' : 'bg-red-50 text-red-700'}`}><CircleCheck size={15} /> {product.stock > 0 ? `متوفر (${product.stock} قطعة)` : 'نفد المخزون'}</span></div>
        <div className="flex gap-3 flex-wrap"><AddToCartButton product={product} /><BuyNowButton product={product} /></div>
        <p className="text-xs text-[#8495a7] mt-6">تُعرض تفاصيل المنتج والسعر والمخزون من قائمة المتجر الحالية.</p>
      </div>
    </div>
    {related.length > 0 && <section className="site-section"><div className="flex justify-between items-end mb-7"><div><span className="site-eyebrow">MORE TO EXPLORE</span><h2 className="site-heading mt-2">منتجات من نفس القسم</h2></div><Link href={`/products?category=${encodeURIComponent(product.category)}`} className="text-brand text-xs font-bold inline-flex items-center gap-2">عرض القسم <ArrowLeft size={16} /></Link></div><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{related.map(p => <Link key={p.id} href={`/product/${p.id}`} className="site-card group"><ProductMedia name={p.name} image={p.image} icon={p.icon} size={50} className="h-40 m-3 rounded-xl" /><div className="px-5 pb-5"><h3 className="font-bold group-hover:text-brand">{p.name}</h3><p className="font-extrabold mt-2">{p.price.toLocaleString()} <small className="font-normal text-xs">د.ع</small></p></div></Link>)}</div></section>}
  </main><Footer /></>;
}
