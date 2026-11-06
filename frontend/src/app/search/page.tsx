import {productsAPI} from '@/lib/api';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import CatalogProductCard, {type CatalogCardProduct} from '@/components/catalog/CatalogProductCard';
import Link from 'next/link';
import {Search} from 'lucide-react';

export const instant=false;
type SearchParams={q?:string|string[]};

export default async function SearchPage({searchParams}:{searchParams:Promise<SearchParams>}){
 const params=await searchParams;
 const query=typeof params.q==='string'?params.q.trim():'';
 const tooLong=query.length>100;
 let results:CatalogCardProduct[]=[];
 let failed=false;
 if(query&&!tooLong){
  try{
   const data:unknown=await productsAPI.getAll({search:query});
   if(!Array.isArray(data))throw new Error('Unexpected catalog result');
   results=data as CatalogCardProduct[];
  }catch{failed=true;}
 }
 const heading=tooLong?'كلمة البحث طويلة جداً':failed?'تعذّر الاتصال بالمتجر حالياً':
  !query?'ابحث عن منتجك':results.length===0?'ما لقينا منتجات تطابق بحثك':'';
 const details=tooLong?'استخدم حتى 100 حرف بالبحث.':failed?'جرّب البحث مرة ثانية بعد قليل.':
  !query?'تگدر تبحث بالاسم، القسم، الماركة، الموديل أو رمز المنتج SKU.':'جرّب اسم المنتج أو رمز SKU أو كلمة أقصر.';

 return <><Header/>
  <main className="site-container site-main py-5 md:py-8">
   <span className="site-eyebrow">SEARCH / THANAYA</span>
   <h1 className="site-page-title mt-2">نتائج البحث</h1>
   <p className="site-muted mt-2 mb-5" role="status">
    {tooLong?'يرجى تقصير عبارة البحث.':failed?'تعذّر تحميل نتائج البحث.':
     query?results.length+' نتيجة لـ «'+query+'»':'اكتب اسم المنتج أو الماركة أو SKU من شريط البحث.'}
   </p>
   {results.length>0&&!tooLong&&!failed?
    <div className="grid gap-3 min-[390px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
     {results.map(product=><CatalogProductCard key={product.id} product={product}/>)}
    </div>:
    <div className="site-surface mx-auto max-w-2xl px-5 py-10 text-center sm:p-12">
     <Search size={28} className="mx-auto mb-4 text-brand" aria-hidden="true"/>
     <h2 className="site-heading text-2xl">{heading}</h2>
     <p className="site-muted mt-2 mb-5 text-sm">{details}</p>
     <Link href="/products" className="site-btn site-btn-outline">تصفّح المنتجات</Link>
    </div>}
  </main><Footer/></>;
}
