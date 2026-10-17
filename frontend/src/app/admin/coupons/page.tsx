"use client";
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { couponsAPI } from '@/lib/api';

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [newCoupon, setNewCoupon] = useState({ code: '', discount: 0 });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    try {
      const data = await couponsAPI.getAll();
      setCoupons(data);
    } catch (error) {
      console.error('فشل تحميل الكوبونات:', error);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCoupon.code.trim() || newCoupon.discount <= 0) return;
    
    setLoading(true);
    try {
      await couponsAPI.create(newCoupon);
      await loadCoupons();
      setNewCoupon({ code: '', discount: 0 });
      setSuccess('تم إضافة الكوبون بنجاح');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      alert('فشل إضافة الكوبون');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await couponsAPI.toggle(id);
      await loadCoupons();
    } catch (error) {
      alert('فشل تحديث حالة الكوبون');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا الكوبون؟')) {
      try {
        await couponsAPI.delete(id);
        await loadCoupons();
      } catch (error) {
        alert('فشل حذف الكوبون');
      }
    }
  };

  return (
    <AdminLayout>
      <h2 className="text-3xl font-black mb-8 text-ink">إدارة الكوبونات</h2>

      {success && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-6 text-green-700 font-bold">
          ✅ {success}
        </div>
      )}

      <form onSubmit={handleAdd} className="bg-white border-2 border-brand/20 rounded-2xl p-6 mb-6">
        <h3 className="font-black text-lg mb-4 text-ink">➕ إضافة كوبون جديد</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block font-bold mb-2 text-sm text-ink">كود الكوبون *</label>
            <input
              type="text"
              placeholder="مثال: THANAYA20"
              value={newCoupon.code}
              onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })}
              className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand"
              required
            />
          </div>
          <div>
            <label className="block font-bold mb-2 text-sm text-ink">نسبة الخصم % *</label>
            <input
              type="number"
              placeholder="20"
              value={newCoupon.discount || ''}
              onChange={(e) => setNewCoupon({ ...newCoupon, discount: Number(e.target.value) })}
              className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand"
              required
              min="1"
              max="100"
            />
          </div>
        </div>
        <button type="submit" disabled={loading} className="mt-4 bg-brand text-white rounded-full px-6 py-2 font-bold hover:bg-brand-dark transition disabled:opacity-50">
          {loading ? 'جاري الإضافة...' : 'إضافة الكوبون'}
        </button>
      </form>

      <div className="bg-white border-2 border-brand/20 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-paper2">
            <tr>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">الكود</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">الخصم</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">الحالة</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((coupon) => (
              <tr key={coupon.id} className="border-t border-brand/10 hover:bg-paper2/50">
                <td className="px-4 py-3 font-bold text-brand">{coupon.code}</td>
                <td className="px-4 py-3 text-ink">{coupon.discount}%</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggle(coupon.id)}
                    className={`text-xs px-3 py-1 rounded-full font-bold transition ${coupon.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {coupon.active ? 'نشط' : 'معطل'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(coupon.id)}
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
