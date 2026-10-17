"use client";
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { usersAPI } from '@/lib/api';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await usersAPI.getAll();
      setUsers(data);
    } catch (error) {
      console.error('فشل تحميل المستخدمين:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-20">
          <p className="text-neutral-600">جاري تحميل المستخدمين...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h2 className="text-3xl font-black mb-8 text-ink">إدارة المستخدمين</h2>
      
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث عن مستخدم بالاسم أو البريد..."
          className="w-full max-w-md border-2 border-brand/30 rounded-xl px-4 py-2 font-bold focus:outline-none focus:border-brand"
        />
      </div>

      {filteredUsers.length === 0 ? (
        <div className="bg-white border-2 border-brand/20 rounded-2xl p-12 text-center">
          <div className="text-6xl mb-4">👥</div>
          <p className="text-neutral-600">لا يوجد مستخدمين مسجلين</p>
        </div>
      ) : (
        <div className="bg-white border-2 border-brand/20 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-paper2">
              <tr>
                <th className="px-4 py-3 text-right font-black text-sm text-ink">الاسم</th>
                <th className="px-4 py-3 text-right font-black text-sm text-ink">البريد</th>
                <th className="px-4 py-3 text-right font-black text-sm text-ink">الهاتف</th>
                <th className="px-4 py-3 text-right font-black text-sm text-ink">الدور</th>
                <th className="px-4 py-3 text-right font-black text-sm text-ink">عدد الطلبات</th>
                <th className="px-4 py-3 text-right font-black text-sm text-ink">تاريخ التسجيل</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-t border-brand/10 hover:bg-paper2/50">
                  <td className="px-4 py-3 font-bold text-sm text-ink">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-ink">{user.email}</td>
                  <td className="px-4 py-3 text-sm text-ink" dir="ltr">{user.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-bold ${user.role === 'admin' ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-700'}`}>
                      {user.role === 'admin' ? 'أدمن' : 'عميل'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink">{user.orders?.length || 0}</td>
                  <td className="px-4 py-3 text-sm text-neutral-500">
                    {new Date(user.createdAt).toLocaleDateString('ar-IQ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
