"use client";
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { categoriesAPI } from '@/lib/api';

export default function AdminCategories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [newCategory, setNewCategory] = useState({ name: '', icon: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await categoriesAPI.getAll();
      setCategories(data);
    } catch (error) {
      console.error('فشل تحميل التصنيفات:', error);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.name.trim()) return;
    
    setLoading(true);
    try {
      await categoriesAPI.create(newCategory);
      await loadCategories();
      setNewCategory({ name: '', icon: '' });
      setSuccess('تم إضافة التصنيف بنجاح');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      alert('فشل إضافة التصنيف');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا التصنيف؟')) {
      try {
        await categoriesAPI.delete(id);
        await loadCategories();
      } catch (error) {
        alert('فشل حذف التصنيف');
      }
    }
  };

  return (
    <AdminLayout>
      <h2 className="text-3xl font-black mb-8 text-ink">إدارة التصنيفات</h2>

      {success && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-6 text-green-700 font-bold">
          ✅ {success}
        </div>
      )}

      <form onSubmit={handleAdd} className="bg-white border-2 border-brand/20 rounded-2xl p-6 mb-6">
        <h3 className="font-black text-lg mb-4 text-ink">➕ إضافة تصنيف جديد</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block font-bold mb-2 text-sm text-ink">اسم التصنيف *</label>
            <input
              type="text"
              placeholder="مثال: طب الأسنان"
              value={newCategory.name}
              onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
              className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand"
              required
            />
          </div>
          <div>
            <label className="block font-bold mb-2 text-sm text-ink">الأيقونة (Emoji)</label>
            <input
              type="text"
              placeholder=""
              value={newCategory.icon}
              onChange={(e) => setNewCategory({ ...newCategory, icon: e.target.value })}
              className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand"
            />
          </div>
        </div>
        <button type="submit" disabled={loading} className="mt-4 bg-brand text-white rounded-full px-6 py-2 font-bold hover:bg-brand-dark transition disabled:opacity-50">
          {loading ? 'جاري الإضافة...' : 'إضافة التصنيف'}
        </button>
      </form>

      <div className="bg-white border-2 border-brand/20 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-paper2">
            <tr>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">الأيقونة</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">الاسم</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id} className="border-t border-brand/10 hover:bg-paper2/50">
                <td className="px-4 py-3 text-2xl">{cat.icon}</td>
                <td className="px-4 py-3 font-bold text-ink">{cat.name}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="text-xs bg-red-50 text-red-600 rounded-lg px-3 py-1 font-bold hover:bg-red-100"
                  >
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
