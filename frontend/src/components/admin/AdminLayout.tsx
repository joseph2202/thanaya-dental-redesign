"use client";

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useRouter,usePathname} from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,Package,ShoppingBag,Users,Shapes,TicketPercent,Settings,Truck,
  ArrowRight,LogOut,Bell,ChartNoAxesCombined,HandCoins,Warehouse,Menu,X,ExternalLink
} from 'lucide-react';
import {useAuth} from '@/context/AuthContext';
import ThemeToggle from '@/components/theme/ThemeToggle';

const navItems = [
  {href:'/admin',label:'لوحة التحكم',icon:LayoutDashboard},
  {href:'/admin/products',label:'المنتجات والمخزون',icon:Package},
  {href:'/admin/orders',label:'الطلبات',icon:ShoppingBag},
  {href:'/admin/reports',label:'التقارير',icon:ChartNoAxesCombined},
  {href:'/admin/finance',label:'التحصيل والاسترداد',icon:HandCoins},
  {href:'/admin/procurement',label:'الموردون والمشتريات',icon:Warehouse},
  {href:'/notifications',label:'الإشعارات',icon:Bell},
  {href:'/admin/users',label:'المستخدمون',icon:Users},
  {href:'/admin/categories',label:'التصنيفات',icon:Shapes},
  {href:'/admin/coupons',label:'الكوبونات',icon:TicketPercent},
  {href:'/admin/settings',label:'الإعدادات',icon:Settings},
  {href:'/admin/delivery',label:'التوصيل',icon:Truck},
];

export default function AdminLayout({children}:{children:ReactNode}){
  const router=useRouter();
  const pathname=usePathname();
  const {user,isAdmin,logout,isLoading}=useAuth();
  const [menuOpen,setMenuOpen]=useState(false);
  const menuRef=useRef<HTMLDialogElement>(null);

  const visibleItems=navItems.filter(item=>{
    if(item.href==='/admin/delivery')return user?.role==='owner';
    if(user?.role==='owner'||user?.role==='admin')return true;
    if(user?.role==='inventory')return ['/admin','/admin/products','/notifications'].includes(item.href);
    if(user?.role==='sales')return ['/admin','/admin/orders','/notifications'].includes(item.href);
    return false;
  });
  const current=visibleItems.find(item=>item.href===pathname);
  const quickItems=visibleItems.filter(item=>
    ['/admin','/admin/orders','/admin/products','/notifications'].includes(item.href));

  useEffect(()=>{
    if(isLoading)return;
    if(!user)router.replace('/login?redirect=/admin');
    else if(!isAdmin)router.replace('/');
    else if(user.role==='inventory'&&!['/admin','/admin/products','/notifications'].includes(pathname))router.replace('/admin/products');
    else if(user.role==='sales'&&!['/admin','/admin/orders','/notifications'].includes(pathname))router.replace('/admin/orders');
  },[user,isAdmin,isLoading,router,pathname]);

  // The mobile menu is a real native dialog: ESC, focus trapping and backdrop
  // work without a third-party modal, and switching pages always closes it.
  useEffect(()=>{setMenuOpen(false);},[pathname]);
  useEffect(()=>{
    const element=menuRef.current;
    if(!element)return;
    if(menuOpen&&!element.open)element.showModal();
    if(!menuOpen&&element.open)element.close();
  },[menuOpen]);

  if(isLoading)return <div className="site-main flex flex-col items-center justify-center gap-3 p-8 text-center text-sm text-ink" role="status">
    <p>جاري التحقق من صلاحيات الإدارة...</p>
    <Link href="/login?redirect=/admin" className="font-bold text-brand underline underline-offset-4">إذا بقيت هذه الرسالة، اضغط هنا لتسجيل الدخول</Link>
  </div>;
  if(!user||!isAdmin)return null;

  const nav=(close:boolean)=>visibleItems.map(({href,label,icon:Icon})=>
    <Link key={href} href={href} onClick={close?()=>setMenuOpen(false):undefined}
      aria-current={pathname===href?'page':undefined}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold transition ${pathname===href?'bg-brand text-white':'text-white/75 hover:bg-white/10 hover:text-white'}`}>
      <Icon size={19} aria-hidden="true"/>{label}
    </Link>);

  return <div className="thanaya-admin-shell min-h-screen bg-paper lg:flex">
    <aside className="thanaya-admin-sidebar hidden bg-ink text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col print:hidden">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <Image src="/logo-icon.png" alt="" width={37} height={37} className="h-9 w-9"/>
        <span><strong className="block text-lg">ثنايا</strong><small className="text-[10px] text-white/55">مساحة إدارة المتجر</small></span>
      </div>
      <nav aria-label="إدارة المتجر" className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {nav(false)}
      </nav>
      <div className="grid gap-3 border-t border-white/10 p-5 text-xs">
        <Link href="/" className="flex items-center gap-2 text-white/70 hover:text-white"><ArrowRight size={16}/> عرض الموقع</Link>
        <button type="button" onClick={logout} className="flex items-center gap-2 text-white/70 hover:text-white"><LogOut size={16}/> خروج</button>
      </div>
    </aside>

    <dialog ref={menuRef} dir="rtl" onClose={()=>setMenuOpen(false)}
      onClick={event=>{if(event.target===event.currentTarget)setMenuOpen(false);}}
      aria-label="قائمة إدارة ثنايا"
      className="fixed inset-y-0 right-0 left-auto z-[110] m-0 h-dvh w-[min(88vw,340px)] max-h-none max-w-none border-none bg-[#20313b] p-0 text-white shadow-[-22px_0_60px_rgba(0,0,0,.22)] backdrop:bg-[#0f2d3b]/55 lg:hidden">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/15 px-5 py-4">
          <div><p className="font-black">إدارة ثنايا</p><p className="mt-1 text-xs text-white/60">{user.name}</p></div>
          <button type="button" onClick={()=>setMenuOpen(false)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/25" aria-label="إغلاق قائمة الإدارة"><X size={21}/></button>
        </div>
        <nav aria-label="روابط لوحة الإدارة" className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {nav(true)}
        </nav>
        <div className="grid gap-2 border-t border-white/15 p-4">
          <Link href="/" onClick={()=>setMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold text-white/80"><ExternalLink size={18}/> عرض المتجر</Link>
          <button type="button" onClick={()=>{setMenuOpen(false);logout();}} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold text-white/80"><LogOut size={18}/> تسجيل الخروج</button>
        </div>
      </div>
    </dialog>

    <div className="min-w-0 flex-1">
      <div className="thanaya-admin-header sticky top-0 z-30 border-b border-[#d9e9ef] bg-white/95 px-4 py-3 backdrop-blur-md md:px-7 print:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={()=>setMenuOpen(true)} aria-label="فتح قائمة الإدارة"
              aria-expanded={menuOpen} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#bbdfea] text-[#1f6079] lg:hidden">
              <Menu size={22}/>
            </button>
            <div className="min-w-0">
              <small className="site-eyebrow !text-[10px]">THANAYA / ADMIN</small>
              <p className="truncate font-black text-[#233e4d]">{current?.label||'لوحة الإدارة'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2"><ThemeToggle compact/><Link href="/" className="shrink-0 text-xs font-black text-brand hover:underline lg:hidden">عرض المتجر</Link></div>
          <span className="hidden text-xs font-bold text-[#6e8791] lg:block">{user.name}</span>
        </div>
        <nav aria-label="الوصول السريع" className="mt-3 flex gap-2 overflow-x-auto pb-0.5 lg:hidden">
          {quickItems.map(item=><Link key={item.href} href={item.href}
            aria-current={pathname===item.href?'page':undefined}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold ${pathname===item.href?'border-brand bg-[#e8f7fc] text-[#047ca7]':'border-[#d0e4ec] bg-white text-[#5b7b88]'}`}>
            {item.label}
          </Link>)}
        </nav>
      </div>
      <main className="mx-auto max-w-[1480px] min-w-0 p-4 md:p-6 print:max-w-none print:p-0">{children}</main>
    </div>
  </div>;
}
