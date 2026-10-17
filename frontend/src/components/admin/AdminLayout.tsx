"use client";
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { LayoutDashboard, Package, ShoppingBag, Users, Shapes, TicketPercent, Settings, ArrowRight, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const navItems = [
  { href: '/admin', label: 'نظرة عامة', icon: LayoutDashboard },
  { href: '/admin/products', label: 'المنتجات', icon: Package },
  { href: '/admin/orders', label: 'الطلبات', icon: ShoppingBag },
  { href: '/admin/users', label: 'المستخدمين', icon: Users },
  { href: '/admin/categories', label: 'التصنيفات', icon: Shapes },
  { href: '/admin/coupons', label: 'الكوبونات', icon: TicketPercent },
  { href: '/admin/settings', label: 'الإعدادات', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();

  useEffect(() => {
    if (!user) router.push('/login?redirect=/admin');
    else if (!isAdmin) router.push('/');
  }, [user, isAdmin, router]);

  if (!user || !isAdmin) return null;
  const current = navItems.find(n => n.href === pathname);

  return <div className="min-h-screen bg-paper lg:flex">
    <aside className="bg-ink text-white lg:w-64 lg:min-h-screen lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col">
      <div className="px-5 py-6 border-b border-white/10 flex items-center gap-3"><Image src="/logo-icon.png" alt="" width={37} height={37} className="w-9 h-9" /><span><strong className="block text-lg">ثنايا</strong><small className="text-white/55 text-[10px]">لوحة الإدارة</small></span></div>
      <nav aria-label="إدارة المتجر" className="p-3 flex lg:block gap-1 overflow-x-auto lg:overflow-visible whitespace-nowrap lg:space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${pathname === href ? 'bg-brand text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}><Icon size={18} aria-hidden="true" />{label}</Link>)}
      </nav>
      <div className="p-5 border-t border-white/10 mt-auto hidden lg:grid gap-3 text-xs"><Link href="/" className="flex items-center gap-2 text-white/65 hover:text-white"><ArrowRight size={16} /> عرض الموقع</Link><button onClick={logout} className="flex items-center gap-2 text-white/65 hover:text-white"><LogOut size={16} /> خروج</button></div>
    </aside>
    <div className="flex-1 min-w-0"><div className="bg-white border-b border-[#e3eaf4] px-5 md:px-9 py-5 flex items-center justify-between"><div><small className="site-eyebrow !text-[10px]">THANAYA / ADMIN</small><p className="font-bold">{current?.label || 'لوحة الإدارة'}</p></div><Link href="/" className="text-brand text-sm font-bold lg:hidden">عرض المتجر</Link></div><main className="max-w-7xl mx-auto p-5 md:p-9">{children}</main></div>
  </div>;
}
