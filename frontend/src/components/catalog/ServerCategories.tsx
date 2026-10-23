import {getPublicCatalog} from '@/lib/publicCatalog';
import CategoryGrid from '@/components/catalog/CategoryGrid';

export default async function ServerCategories(){
 try{
  const products=await getPublicCatalog();
  return <CategoryGrid products={products} variant="page"/>;
 }catch{
  return <div role="status" className="site-surface rounded-2xl border p-6 text-center">
   <p className="site-muted text-sm">تعذّر تحميل أقسام المتجر حالياً. حاول من جديد.</p>
   <a href="/categories" className="site-btn site-btn-outline mt-4">إعادة المحاولة</a>
  </div>;
 }
}
