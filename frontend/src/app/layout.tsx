import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { AuthProvider } from "@/context/AuthContext";
import BackgroundPattern from "@/components/layout/BackgroundPattern";

export const metadata: Metadata = {
  title: "ثنايا | مستلزمات طب الأسنان والأجهزة الطبية",
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
      <body className="font-sans antialiased bg-paper text-ink relative">
        <BackgroundPattern />
        <div className="relative z-10">
          <AuthProvider>
            <CartProvider>{children}</CartProvider>
          </AuthProvider>
        </div>
      </body>
    </html>
  );
}
