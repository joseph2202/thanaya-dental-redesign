"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ShoppingBag, UserRound, LogOut, LayoutDashboard, MapPin } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const { totalItems } = useCart();
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (query) router.push('/search?q=' + encodeURIComponent(query));
  };

  const search = (mobile = false) => (
    <form onSubmit={handleSearch} role="search" className={mobile ? "flex md:hidden pb-4" : "hidden md:flex flex-1 max-w-[470px]"}>
      <div className="relative flex w-full items-center">
        <Search size={19} className="absolute right-4 text-[#8193aa]" aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث عن منتج أو ماركة أو تصنيف..."
          aria-label="البحث في المنتجات"
          className="site-input w-full pr-11 pl-20 text-sm text-ink placeholder:text-[#91a0b2]"
        />
        <button type="submit" className="absolute left-1.5 bg-brand text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-brand-dark transition">بحث</button>
      </div>
    </form>
  );

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-[#e3eaf4]">
      <div className="bg-ink text-white/80 text-[11px] hidden sm:block">
        <div className="site-container h-8 flex justify-between items-center">
          <span className="flex items-center gap-1.5"><MapPin size={12} aria-hidden="true" /> البصرة، العراق</span>
          <span>ثنايا لمستلزمات طب الأسنان والأجهزة الطبية</span>
        </div>
      </div>
      <div className="site-container">
        <div className="min-h-[76px] flex items-center justify-between gap-5">
          <Link href="/" aria-label="ثنايا، الرئيسية" className="flex items-center gap-2.5 shrink-0">
            <Image src="/brand-mark.svg" alt="" width={42} height={42} priority className="w-10 h-10 object-contain" />
            <span className="leading-tight"><strong className="block text-[25px] font-extrabold">ثنايا</strong><small className="block text-[9px] tracking-[.15em] text-brand font-bold" dir="ltr">THANAYA MEDICAL</small></span>
          </Link>
          {search()}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user ? (
              <>
                {user.role === 'admin' && <Link href="/admin" className="hidden lg:inline-flex gap-1.5 items-center text-xs font-bold hover:text-brand"><LayoutDashboard size={17} /> الإدارة</Link>}
                <Link href="/account" className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce6f1] px-3 py-2.5 text-xs font-bold hover:bg-paper2" aria-label="حسابي"><UserRound size={17} /><span className="hidden sm:inline">حسابي</span></Link>
                <button onClick={logout} className="hidden sm:inline-flex items-center gap-1 text-xs text-[#64758a] hover:text-brand" aria-label="تسجيل الخروج"><LogOut size={16} /> خروج</button>
              </>
            ) : <Link href="/login" className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce6f1] px-3 py-2.5 text-xs font-bold hover:bg-paper2"><UserRound size={17} /><span className="hidden sm:inline">دخول</span></Link>}
            <Link href="/cart" className="relative site-btn site-btn-primary !min-h-0 !px-3.5 !py-2.5 !text-xs" aria-label={`السلة، ${totalItems} منتجات`}>
              <ShoppingBag size={18} aria-hidden="true" /><span className="hidden sm:inline">السلة</span>
              {totalItems > 0 && <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-ink text-white text-[10px] grid place-items-center">{totalItems}</span>}
            </Link>
          </div>
        </div>
        {search(true)}
        <nav aria-label="التنقل الرئيسي" className="flex items-center gap-7 overflow-x-auto whitespace-nowrap text-xs sm:text-sm font-bold text-[#61738a] pb-3 sm:pb-4">
          <Link href="/" className="hover:text-brand">الرئيسية</Link>
          <Link href="/products" className="hover:text-brand">المنتجات</Link>
          <Link href="/categories" className="hover:text-brand">التصنيفات</Link>
          <Link href="/offers" className="hover:text-brand">العروض</Link>
          {user?.role === 'admin' && <Link href="/admin" className="lg:hidden hover:text-brand">الإدارة</Link>}
          {user && <button onClick={logout} className="sm:hidden hover:text-brand">خروج</button>}
        </nav>
      </div>
    </header>
  );
}
