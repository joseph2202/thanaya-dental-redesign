import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import {ArrowUpLeft,House,SearchX} from 'lucide-react';
export default function NotFound(){
 return <><Header/><main className="site-container flex min-h-[55vh] items-center justify-center py-12" dir="rtl">
  <div className="site-surface mx-auto w-full max-w-xl rounded-3xl border p-6 text-center sm:p-9">
   <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-brand/10 text-brand"><SearchX size={30}/></div>
   <p className="site-eyebrow mt-5">THANAYA / 404</p>
   <h1 className="mt-2 text-3xl font-black">هاي الصفحة مو موجودة</h1>
   <p className="site-muted mt-3 text-sm leading-8">يمكن الرابط تغير أو الصفحة انحذفت. تگدر ترجع للمتجر وتستمر تتصفح بدون ما تفقد سلتك.</p>
   <div className="mt-6 flex flex-wrap justify-center gap-3">
    <Link href="/" className="site-btn site-btn-primary"><House size={18}/> الرئيسية</Link>
    <Link href="/products" className="site-btn site-btn-outline">تصفّح المنتجات <ArrowUpLeft size={18}/></Link>
   </div>
  </div>
 </main><Footer/></>;
}