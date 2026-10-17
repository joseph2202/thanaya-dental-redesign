import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import CategoryGrid from '@/components/catalog/CategoryGrid';

export default function CategoriesPage() {
  return <><Header /><main className="site-container site-main py-9 md:py-12"><div className="mb-10 rounded-[26px] border border-[#d0eaf5] bg-[linear-gradient(110deg,#e5f7fd,#ffffff)] px-7 py-9 md:px-12"><span className="site-eyebrow">THANAYA / CATEGORIES</span><h1 className="mt-2 text-3xl font-black md:text-5xl">تصفّح الأقسام بسهولة.</h1><p className="site-muted mt-3 text-sm">كل قسم مرتبط بمنتجات المتجر الحقيقية، حتى توصل لاحتياجك بأسرع وقت.</p></div><CategoryGrid variant="page" /></main><Footer /></>;
}
