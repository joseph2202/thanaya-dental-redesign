import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Phone, Clock3, Camera, Send, ArrowUpLeft } from 'lucide-react';

export default function Footer() {
  return <footer className="bg-ink text-white mt-16">
    <div className="site-container py-14 md:py-20 grid sm:grid-cols-2 lg:grid-cols-[1.35fr_.75fr_1fr_.75fr] gap-10 lg:gap-12">
      <div>
        <Link href="/" className="inline-flex items-center gap-3"><Image src="/brand-mark.svg" alt="" width={42} height={42} className="w-10 h-10" /><span><strong className="block text-[25px] leading-none">ثنايا</strong><small className="text-brand-light text-[10px] tracking-wider" dir="ltr">THANAYA MEDICAL</small></span></Link>
        <p className="text-white/65 text-sm leading-8 max-w-[260px] mt-5">متجر عراقي للمستلزمات الطبية وطب الأسنان والأجهزة. تجربة واضحة لاختيار احتياجاتك.</p>
      </div>
      <div><h2 className="font-bold text-sm mb-5">استكشف</h2><nav className="grid gap-3 text-white/65 text-sm"><Link href="/products" className="hover:text-white">المنتجات</Link><Link href="/categories" className="hover:text-white">التصنيفات</Link><Link href="/offers" className="hover:text-white">العروض</Link><Link href="/cart" className="hover:text-white">السلة</Link></nav></div>
      <div><h2 className="font-bold text-sm mb-5">تواصل معنا</h2><div className="grid gap-4 text-white/65 text-sm leading-7"><p className="flex gap-3"><MapPin size={17} className="text-brand-light shrink-0 mt-1" /> <span>البصرة - حي الخضراء<br />شارع مستشفى النفط</span></p><a href="tel:07822088894" className="flex items-center gap-3 hover:text-white"><Phone size={17} className="text-brand-light" /><span dir="ltr">0782 208 8894</span></a><p className="flex gap-3"><Clock3 size={17} className="text-brand-light shrink-0 mt-1" /><span>السبت - الخميس<br />12 ظهراً - 9 مساءً</span></p></div></div>
      <div><h2 className="font-bold text-sm mb-5">تابعنا</h2><div className="flex gap-2"><a href="https://instagram.com/althanaya_dentalsupply" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-10 h-10 rounded-xl bg-white/10 grid place-items-center hover:bg-brand"><Camera size={18} /></a><a href="https://t.me/althanayadentalsupply" target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="w-10 h-10 rounded-xl bg-white/10 grid place-items-center hover:bg-brand"><Send size={18} /></a></div><Link href="/products" className="inline-flex items-center gap-2 text-brand-light text-xs mt-7 hover:text-white">تصفّح المنتجات <ArrowUpLeft size={15} /></Link></div>
    </div>
    <div className="border-t border-white/10"><div className="site-container py-5 flex flex-wrap justify-between items-center gap-3 text-white/45 text-xs"><span>© 2026 ثنايا — جميع الحقوق محفوظة</span><div className="flex gap-5"><Link href="/privacy" className="hover:text-white">سياسة الخصوصية</Link><Link href="/terms" className="hover:text-white">الشروط والأحكام</Link></div></div></div>
  </footer>;
}
