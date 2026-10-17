const fs = require('fs');

// 1) تحديث Header.tsx - استخدام الرمز + نص
fs.writeFileSync('src/components/layout/Header.tsx', `"use client";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import Image from "next/image";

export default function Header() {
  const { totalItems } = useCart();

  return (
    <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur border-b-2 border-brand/20">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo-icon.png"
            alt="Al Thanaya"
            width={40}
            height={40}
            className="h-10 w-10"
            priority
          />
          <span className="font-black text-xl text-ink">الثنايا</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 font-bold text-ink">
          <Link href="/" className="hover:text-brand transition">الرئيسية</Link>
          <Link href="/products" className="hover:text-brand transition">المنتجات</Link>
          <Link href="/categories" className="hover:text-brand transition">التصنيفات</Link>
          <Link href="/offers" className="hover:text-brand transition">العروض</Link>
        </nav>
        <Link href="/cart" className="bg-brand text-white rounded-full px-5 py-2 font-bold relative hover:bg-brand-dark transition">
          السلة
          {totalItems > 0 && (
            <span className="absolute -top-2 -right-2 bg-ink text-white rounded-full w-6 h-6 grid place-items-center text-xs font-black border-2 border-paper">
              {totalItems}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
`);

// 2) تحديث layout.tsx - تحديث الـ favicon
fs.writeFileSync('src/app/layout.tsx', `import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";

export const metadata: Metadata = {
  title: "Al Thanaya | الثنايا - مستلزمات وأجهزة طبية",
  description:
    "متجر عراقي للمستلزمات الطبية وطب الأسنان والأجهزة: منتجات موثقة وأسعار بالدينار والدولار.",
  icons: {
    icon: '/logo-icon.png',
    shortcut: '/logo-icon.png',
    apple: '/logo-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@dawod/thmanyah-font-web@1.2.0/index.min.css"
        />
      </head>
      <body className="font-sans antialiased bg-paper text-ink">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
`);

console.log('✅ تم تحديث الهيدر والـ favicon لاستخدام الرمز');
console.log(' ملاحظة: تأكد من حفظ الصورة في: frontend/public/logo-icon.png');
