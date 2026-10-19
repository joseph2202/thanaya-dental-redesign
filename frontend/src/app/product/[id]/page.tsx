import { productsAPI, settingsAPI } from '@/lib/api';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductPurchaseActions from '@/components/product/ProductPurchaseActions';
import ProductMedia from '@/components/ui/ProductMedia';
import ProductGallery from '@/components/product/ProductGallery';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import {saleUnitLabel} from '@/lib/saleUnits';

export const instant = false;

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let product;
  try { product = await productsAPI.getById(id); } catch { notFound(); }
  const settings: any = await settingsAPI.getPublic().catch(() => null);
  const approximateUsd = settings?.showUsdApprox && typeof settings?.usdToIqdRate === 'number' && settings.usdToIqdRate > 0
    ? (product.price / settings.usdToIqdRate).toFixed(2) : null;
  let related: any[] = [];
  try {
    const all = await productsAPI.getAll({ category: product.category });
    related = all.filter((p: any) => p.id !== product.id).slice(0, 3);
  } catch { related = []; }

  return <><Header /><main className="site-container site-main py-9 md:py-14">
    <nav aria-label="مسار الصفحة" className="text-xs text-[#8090a4] flex flex-wrap items-center gap-2 mb-8"><Link href="/" className="hover:text-brand">الرئيسية</Link><span>/</span><Link href="/products" className="hover:text-brand">المنتجات</Link><span>/</span><span className="text-ink">{product.name}</span></nav>
    <div className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-start">
      <ProductGallery name={product.name} image={product.image} icon={product.icon} gallery={product.gallery} />
      <div className="py-2 lg:py-6">
        <span className="site-eyebrow">{product.category} {product.brand ? ` / ${product.brand}` : ''}</span>
        <h1 className="site-page-title leading-[1.35] mt-4">{product.name}</h1>
        {product.description && product.description.trim().toLowerCase() !== 'nothing' && <p className="site-muted mt-5 text-sm sm:text-base">{product.description}</p>}
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 text-sm">
          {product.sku && <div><dt className="text-[#678293]">رمز المنتج SKU</dt><dd dir="ltr" className="mt-1 font-bold text-ink">{product.sku}</dd></div>}
          {product.model && <div><dt className="text-[#678293]">الموديل</dt><dd className="mt-1 font-bold text-ink">{product.model}</dd></div>}
          {product.size && <div><dt className="text-[#678293]">القياس / الحجم</dt><dd className="mt-1 font-bold text-ink">{product.size}</dd></div>}
          <div><dt className="text-[#678293]">وحدة البيع</dt><dd className="mt-1 font-bold text-ink">{saleUnitLabel(product.saleUnit)}</dd></div>
        </dl>
        <div className="border-y border-[#d4eaf2] py-6 my-7 flex items-end justify-between gap-3"><div><span className="text-xs text-[#8495a7] block mb-2">السعر</span><strong className="text-3xl sm:text-4xl font-extrabold">{product.price.toLocaleString()} <small className="font-normal text-base">د.ع / {saleUnitLabel(product.saleUnit)}</small></strong>{approximateUsd && <span className="block text-xs text-[#8392a5] mt-2">≈ {approximateUsd} دولار (للعرض فقط)</span>}</div><span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full ${(product.availableStock??product.stock) > 0 ? 'bg-[#e9f6f1] text-success' : 'bg-red-50 text-red-700'}`}><CircleCheck size={15} /> {product.stock > 0 ? `متوفر (${product.availableStock??product.stock} ${saleUnitLabel(product.saleUnit)})` : 'نفد المخزون'}</span></div>
        {Array.isArray(product.specs)&&product.specs.length>0&&<section className="mb-6 rounded-2xl border border-[#d4eaf2] bg-white p-5"><h2 className="mb-3 text-lg font-black">المواصفات الفنية</h2><dl className="divide-y divide-[#e6eef3]">{product.specs.map((spec:{label:string;value:string},i:number)=><div key={i} className="grid gap-2 py-3 text-sm sm:grid-cols-2"><dt className="font-bold text-[#547280]">{spec.label}</dt><dd className="break-words text-ink">{spec.value}</dd></div>)}</dl></section>}
        <ProductPurchaseActions product={product} />
        <p className="text-xs text-[#8495a7] mt-6">تُعرض تفاصيل المنتج والسعر والمخزون من قائمة المتجر الحالية.</p>
      </div>
    </div>
    {related.length > 0 && <section className="site-section"><div className="flex justify-between items-end mb-7"><div><span className="site-eyebrow">MORE TO EXPLORE</span><h2 className="site-heading mt-2">منتجات من نفس القسم</h2></div><Link href={`/products?category=${encodeURIComponent(product.category)}`} className="text-brand text-xs font-bold inline-flex items-center gap-2">عرض القسم <ArrowLeft size={16} /></Link></div><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{related.map(p => <Link key={p.id} href={`/product/${p.id}`} className="site-card group"><ProductMedia name={p.name} image={p.image} icon={p.icon} size={50} className="h-40 m-3 rounded-xl" /><div className="px-5 pb-5"><h3 className="font-bold group-hover:text-brand">{p.name}</h3><p className="font-extrabold mt-2">{p.price.toLocaleString()} <small className="font-normal text-xs">د.ع</small></p></div></Link>)}</div></section>}
  </main><Footer /></>;
}
