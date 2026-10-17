"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { useAuth } from '@/context/AuthContext';
import { getOrders } from '@/lib/orders';

export default function AccountPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    setOrders(getOrders());
  }, [user, router]);

  if (!user) return null;

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-black mb-8 text-ink">حسابي</h1>

        <div className="grid md:grid-cols-3 gap-6">
          {/* معلومات المستخدم */}
          <div className="md:col-span-1">
            <div className="site-surface p-6">
              <h2 className="font-black text-lg mb-4 text-ink">معلوماتي</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-neutral-500">الاسم</p>
                  <p className="font-bold text-ink">{user.name}</p>
                </div>
                <div>
                  <p className="text-neutral-500">البريد</p>
                  <p className="font-bold text-ink">{user.email}</p>
                </div>
                <div>
                  <p className="text-neutral-500">الهاتف</p>
                  <p className="font-bold text-ink">{user.phone}</p>
                </div>
              </div>
            </div>
          </div>

          {/* الطلبات */}
          <div className="md:col-span-2">
            <div className="site-surface p-6">
              <h2 className="font-black text-lg mb-4 text-ink">طلباتي ({orders.length})</h2>
              
              {orders.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4"></div>
                  <p className="text-neutral-600 mb-4">ما عندك طلبات بعد</p>
                  <Link href="/products" className="bg-brand text-white rounded-xl px-6 py-2 font-bold inline-block">
                    تسوق الآن
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <div key={order.id} className="border-2 border-brand/20 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-black text-brand">{order.id}</span>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                          {order.status === 'pending' ? 'قيد المعالجة' : order.status}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600">
                        {order.items.length} منتج · {order.total.toLocaleString()} د.ع
                      </p>
                      <p className="text-xs text-neutral-400 mt-1">
                        {new Date(order.createdAt).toLocaleDateString('ar-IQ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
