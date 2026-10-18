"use client";
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { usersAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);
  const [roleError, setRoleError] = useState('');
  const [roleHistory, setRoleHistory] = useState<any[]>([]);
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

  const changeRole = async (id: string, role: string) => {
    const target = users.find(u => u.id === id);
    if (!target || !window.confirm(`تغيير صلاحية ${target.name} من ${target.role} إلى ${role}؟`)) return;
    setRoleBusy(id); setRoleError('');
    try {
      await usersAPI.updateRole(id, role);
      await loadUsers();
      setRoleHistory(await usersAPI.roleHistory());
    } catch (error) { setRoleError(error instanceof Error ? error.message : 'تعذر التغيير'); }
    finally { setRoleBusy(null); }
  };

  useEffect(() => {
    if (currentUser?.role === 'owner') usersAPI.roleHistory().then(setRoleHistory).catch(() => {});
  }, [currentUser?.role]);

  const roleLabel: Record<string,string> = { owner:'المالك',admin:'مدير',inventory:'المخزون',sales:'المبيعات',customer:'زبون' };
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
      <h2 className="text-3xl font-black mb-3 text-ink">إدارة المستخدمين والصلاحيات</h2>
      <p className="text-sm text-neutral-600 mb-6">المالك فقط يغيّر صلاحيات الموظفين المسجلين. لا تشارك كلمة مرورك مع أي موظف.</p>
      {roleError && <p className="mb-4 rounded-xl bg-red-50 p-3 text-red-700" role="alert">{roleError}</p>}
      
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
                      {roleLabel[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink">{user.orders?.length || 0}</td>
                  <td className="px-4 py-3 text-sm text-neutral-500">
                    {new Date(user.createdAt).toLocaleDateString('ar-IQ')}
                  </td>
                  {currentUser?.role === 'owner' && user.id !== currentUser.id && user.role !== 'owner' && <td className="px-4 py-3"><select aria-label={`صلاحية ${user.name}`} disabled={roleBusy === user.id} value={user.role} onChange={e=>changeRole(user.id,e.target.value)} className="rounded-xl border border-brand/30 bg-white px-3 py-2 text-sm"><option value="customer">زبون</option><option value="sales">المبيعات</option><option value="inventory">المخزون</option><option value="admin">مدير</option></select></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
