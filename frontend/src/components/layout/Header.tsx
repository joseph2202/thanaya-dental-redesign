"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, ShoppingBag, UserRound, LogOut, LayoutDashboard, Menu, X } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";

const navigation = [
  { href: "/", label: "الرئيسية" },
  { href: "/products", label: "المنتجات" },
  { href: "/categories", label: "التصنيفات" },
  { href: "/offers", label: "العروض" },
];

export default function Header() {
  const { totalItems } = useCart();
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      setMenuOpen(false);
      router.push("/search?q=" + encodeURIComponent(query));
    }
  };

  const search = (mobile = false) => (
    <form
      onSubmit={handleSearch}
      role="search"
      className={mobile ? "w-full xl:hidden" : "hidden min-w-0 flex-1 xl:block"}
    >
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7e9aaa]" aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث عن منتج، ماركة، تصنيف..."
          aria-label="ابحث في ثنايا"
          className="h-[44px] w-full min-w-0 rounded-full border border-[#b8dfed] bg-[#f9fdff] pr-10 pl-[78px] text-xs text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-sm"
        />
        <button type="submit" className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-[#079dca] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#007ba6]">
          بحث
        </button>
      </div>
    </form>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-[#dceaf1] border-t-[3px] border-t-[#05a2d0] bg-white/95 shadow-[0_4px_22px_rgba(5,64,102,.035)] backdrop-blur-xl">
      <div className="site-container">
        <div className="flex min-h-[72px] items-center gap-4 py-2 xl:gap-6">
          <Link href="/" aria-label="ثنايا — الصفحة الرئيسية" className="flex shrink-0 items-center gap-2">
            <Image src="/logo-icon.png" width={42} height={42} priority alt="" className="h-11 w-11 object-contain" />
            <span className="leading-tight">
              <strong className="block text-[25px] font-black text-[#192a37]">ثنايا</strong>
              <small className="block text-[8px] font-black tracking-[.15em] text-[#069bca]" dir="ltr">THANAYA MEDICAL</small>
            </span>
          </Link>

          {search(false)}

          <nav aria-label="التنقل الرئيسي" className="hidden shrink-0 items-center gap-4 xl:flex 2xl:gap-5">
            {navigation.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap text-[13px] font-bold transition hover:text-brand ${active ? "text-[#048dbb]" : "text-[#34495c]"}`}>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mr-auto flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {user ? (
              <>
                {user.role === "admin" && (
                  <Link href="/admin" className="hidden items-center gap-1 text-xs font-bold text-[#37546d] hover:text-brand 2xl:inline-flex" aria-label="لوحة الإدارة">
                    <LayoutDashboard size={16} /> الإدارة
                  </Link>
                )}
                <Link href="/account" aria-label="حسابي" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#d5e8ef] px-3 text-xs font-bold text-ink transition hover:bg-[#eaf7fc]">
                  <UserRound size={17} /> <span className="hidden sm:inline">حسابي</span>
                </Link>
                <button type="button" onClick={logout} className="hidden items-center gap-1 text-xs font-semibold text-[#5b7385] hover:text-brand lg:inline-flex">
                  <LogOut size={15} /> خروج
                </button>
              </>
            ) : (
              <Link href="/login" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#d4e6ef] px-3.5 text-xs font-bold text-ink transition hover:bg-[#ecf8fc]">
                <UserRound size={16} /> دخول
              </Link>
            )}

            <Link href="/cart" className="relative inline-flex h-10 items-center gap-1.5 rounded-full bg-[#079dca] px-3.5 text-xs font-bold text-white shadow-[0_8px_22px_rgba(4,159,206,.2)] transition hover:bg-brand-dark" aria-label={`السلة، ${totalItems} منتجات`}>
              <ShoppingBag size={17} /> <span className="hidden sm:inline">السلة</span>
              {totalItems > 0 && <span className="absolute -left-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-[#18364d] px-1 text-[10px] text-white">{totalItems}</span>}
            </Link>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full border border-[#d5e8ef] text-ink xl:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        <div className="pb-3 xl:hidden">{search(true)}</div>
      </div>

      {menuOpen && (
        <nav id="mobile-navigation" aria-label="قائمة التنقل" className="border-t border-[#e5eff4] bg-white px-5 py-3 xl:hidden">
          <div className="mx-auto grid max-w-[1220px] grid-cols-2 gap-2 sm:grid-cols-4">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                className={`rounded-xl px-4 py-3 text-center text-sm font-bold ${pathname === item.href ? "bg-[#e7f7fc] text-brand" : "bg-[#f6fbfe] text-[#24445a]"}`}>
                {item.label}
              </Link>
            ))}
            {user?.role === "admin" && <Link href="/admin" onClick={() => setMenuOpen(false)} className="rounded-xl bg-[#f6fbfe] px-4 py-3 text-center text-sm font-bold">الإدارة</Link>}
            {user && <button type="button" onClick={() => { logout(); setMenuOpen(false); }} className="rounded-xl bg-[#f6fbfe] px-4 py-3 text-sm font-bold">خروج</button>}
          </div>
        </nav>
      )}
    </header>
  );
}
