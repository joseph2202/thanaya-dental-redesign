import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import CategoryGrid from '@/components/catalog/CategoryGrid';

export default function CategoriesPage() {
  return <><Header /><main className="site-container site-main py-5 md:py-8"><div className="thanaya-category-hero mb-5 rounded-[26px] border border-[#d0eaf5] bg-[linear-gradient(110deg,#e5f7fd,#ffffff)] px-5 py-6 md:px-9 md:py-7"><span className="site-eyebrow">THANAYA / CATEGORIES</span><h1 className="thanaya-category-hero-title mt-2 text-3xl font-black md:text-5xl">تصفّح الأقسام بسهولة.</h1><p className="thanaya-category-hero-description site-muted mt-3 text-sm">كل قسم مرتبط بمنتجات المتجر الحقيقية، حتى توصل لاحتياجك بأسرع وقت.</p></div><CategoryGrid variant="page" /></main><Footer /></>;
}
