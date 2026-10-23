import Link from 'next/link';
import {ArrowUpLeft,RefreshCw} from 'lucide-react';
import {getPublicCatalog} from '@/lib/publicCatalog';
import Products from '@/components/home/Products';
import Categories from '@/components/home/Categories';

// Requests are uncached: an order or admin update must not leave prices/stock
// stale for another visitor. Cart/checkout still use their own server quote.
export default async function HomeCatalog(){
 try{
  const catalog=await getPublicCatalog();
  return <>
   <Products products={catalog.slice(0,8)}/>
   <Categories products={catalog}/>
  </>;
 }catch{
  // Public content may be unavailable while a Mac development backend restarts.
  // Render a useful error in HTML instead of an infinite client-side skeleton.
  return <section id="featured-products" className="site-container py-10 md:py-16" aria-labelledby="catalog-unavailable-title">
   <div className="site-surface mx-auto max-w-[780px] rounded-[24px] border p-6 text-center sm:p-9">
    <h2 id="catalog-unavailable-title" className="site-heading">ما گدرنا نحمّل منتجات ثنايا حالياً.</h2>
    <p className="site-muted mt-3 text-sm leading-8">الاتصال بكتالوج المتجر تأخر أو انقطع. تگدر تعيد المحاولة بدون ما تفقد أي طلب أو بيانات.</p>
    <div className="mt-5 flex flex-wrap justify-center gap-3">
     <a href="/" className="site-btn site-btn-primary"><RefreshCw size={17}/> إعادة المحاولة</a>
     <Link href="/products" className="site-btn site-btn-outline">الكتالوج الكامل <ArrowUpLeft size={17}/></Link>
    </div>
   </div>
  </section>;
 }
}
