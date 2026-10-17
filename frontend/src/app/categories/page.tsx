import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import CategoryGrid from '@/components/catalog/CategoryGrid';

export default function CategoriesPage() {
  return <><Header /><main className="site-container site-main py-14 md:py-20"><span className="site-eyebrow">EXPLORE THANAYA</span><h1 className="site-page-title mt-2">تصفّح حسب احتياجك.</h1><p className="site-muted mt-3 mb-10">كل قسم يعرض المنتجات الموجودة حاليًا ويودّيك إلها مباشرة.</p><CategoryGrid variant="page" /></main><Footer /></>;
}
