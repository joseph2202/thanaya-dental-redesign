"use client";
import { useEffect, useState } from "react";
import { settingsAPI } from "@/lib/api";
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Phone, Clock3, Camera, Send, ArrowUpLeft } from 'lucide-react';

export default function Footer({ compact = false }: { compact?: boolean }) {
  const [settings,setSettings]=useState<any>(null);
  useEffect(()=>{settingsAPI.getPublic().then(setSettings).catch(()=>{});},[]);
  const safePhone=settings?.phone||'07822088894';
  return <footer className={`thanaya-site-footer bg-[#20313b] text-white ${compact ? "mt-0" : "mt-7 md:mt-9"}`}>
    <div className={`site-container grid sm:grid-cols-2 lg:grid-cols-[1.35fr_.75fr_1fr_.75fr] ${compact ? "py-7 md:py-9 gap-5 lg:gap-7" : "py-8 md:py-11 gap-6 lg:gap-8"}`}>
      <div>
        <Link href="/" className="inline-flex items-center gap-3"><Image src="/logo-icon.png" alt="" width={42} height={42} className="w-10 h-10" /><span><strong className="block text-[25px] leading-none">{settings?.siteName||"ثنايا"}</strong><small className="text-brand-light text-[10px] tracking-wider" dir="ltr">THANAYA MEDICAL</small></span></Link>
        <p className="text-white/65 text-sm leading-7 max-w-[320px] mt-3">{settings?.siteDescription||"متجر عراقي للمستلزمات الطبية وطب الأسنان والأجهزة. تجربة واضحة لاختيار احتياجاتك."}</p>
      </div>
      <div><h2 className="font-bold text-sm mb-3">استكشف</h2><nav className="grid gap-2 text-white/65 text-sm"><Link href="/products" className="hover:text-white">المنتجات</Link><Link href="/categories" className="hover:text-white">التصنيفات</Link><Link href="/offers" className="hover:text-white">العروض</Link><Link href="/cart" className="hover:text-white">السلة</Link></nav></div>
      <div><h2 className="font-bold text-sm mb-3">تواصل معنا</h2><div className="grid gap-2.5 text-white/65 text-sm leading-7"><p className="flex gap-3"><MapPin size={17} className="text-brand-light shrink-0 mt-1" /> <span>{settings?.address||"البصرة - حي الخضراء - شارع مستشفى النفط"}</span></p><a href={"tel:"+safePhone.replace(/[^+\d]/g,"")} className="flex items-center gap-3 hover:text-white"><Phone size={17} className="text-brand-light" /><span dir="ltr">{safePhone}</span></a><p className="flex gap-3"><Clock3 size={17} className="text-brand-light shrink-0 mt-1" /><span>{settings?.workingHours||"السبت - الخميس: 12 ظهراً - 9 مساءً"}</span></p></div></div>
      <div><h2 className="font-bold text-sm mb-3">تابعنا</h2><div className="flex gap-2"><a href="https://instagram.com/althanaya_dentalsupply" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-10 h-10 rounded-xl bg-white/10 grid place-items-center hover:bg-brand"><Camera size={18} /></a><a href="https://t.me/althanayadentalsupply" target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="w-10 h-10 rounded-xl bg-white/10 grid place-items-center hover:bg-brand"><Send size={18} /></a></div><Link href="/products" className="inline-flex items-center gap-2 text-brand-light text-xs mt-4 hover:text-white">تصفّح المنتجات <ArrowUpLeft size={15} /></Link></div>
    </div>
    <div className="border-t border-white/10"><div className="site-container py-3.5 flex flex-wrap justify-between items-center gap-3 text-white/45 text-xs"><span>© 2026 ثنايا — جميع الحقوق محفوظة</span><div className="flex gap-5"><Link href="/privacy" className="hover:text-white">سياسة الخصوصية</Link><Link href="/terms" className="hover:text-white">الشروط والأحكام</Link></div></div></div>
  </footer>;
}
