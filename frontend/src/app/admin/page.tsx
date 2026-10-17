"use client";
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import Link from 'next/link';
import { usersAPI, ordersAPI, productsAPI } from '@/lib/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ products: 0, orders: 0, users: 0, revenue: 0 });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [users, orders, products] = await Promise.all([
          usersAPI.getAll(),
          ordersAPI.getAll(),
          productsAPI.getAll(),
        ]);
        setStats({
          products: products.length,
          orders: orders.length,
          users: users.length,
          revenue: orders.reduce((sum: number, o: any) => sum + o.total, 0),
        });
      } catch (error) {
        console.error('Error loading admin data:', error);
      }
    };
    loadData();
  }, []);

  return (
    <AdminLayout>
      <h2 className="text-3xl font-black mb-8 text-ink">نظرة عامة</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border-2 border-brand/20 rounded-2xl p-6">
          <p className="text-neutral-500 text-sm mb-2">المنتجات</p>
          <p className="text-4xl font-black text-brand">{stats.products}</p>
        </div>
        <div className="bg-white border-2 border-brand/20 rounded-2xl p-6">
          <p className="text-neutral-500 text-sm mb-2">الطلبات</p>
          <p className="text-4xl font-black text-brand">{stats.orders}</p>
        </div>
        <div className="bg-white border-2 border-brand/20 rounded-2xl p-6">
          <p className="text-neutral-500 text-sm mb-2">المستخدمين</p>
          <p className="text-4xl font-black text-brand">{stats.users}</p>
        </div>
        <div className="bg-white border-2 border-brand/20 rounded-2xl p-6">
          <p className="text-neutral-500 text-sm mb-2">الإيرادات</p>
          <p className="text-2xl font-black text-brand">{stats.revenue.toLocaleString()} د.ع</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/admin/products" className="bg-white border-2 border-brand/20 rounded-2xl p-6 hover:border-brand transition">
          <h3 className="font-black text-lg mb-2 text-ink">إدارة المنتجات</h3>
          <p className="text-sm text-neutral-600">إضافة، تعديل، وحذف المنتجات</p>
        </Link>
        <Link href="/admin/orders" className="bg-white border-2 border-brand/20 rounded-2xl p-6 hover:border-brand transition">
          <h3 className="font-black text-lg mb-2 text-ink">إدارة الطلبات</h3>
          <p className="text-sm text-neutral-600">عرض وتحديث حالة الطلبات</p>
        </Link>
        <Link href="/admin/users" className="bg-white border-2 border-brand/20 rounded-2xl p-6 hover:border-brand transition">
          <h3 className="font-black text-lg mb-2 text-ink">إدارة المستخدمين</h3>
          <p className="text-sm text-neutral-600">عرض المستخدمين المسجلين</p>
        </Link>
      </div>
    </AdminLayout>
  );
}
