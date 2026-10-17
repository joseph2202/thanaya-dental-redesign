"use client";
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';

type Settings = {
  siteName: string;
  siteDescription: string;
  phone: string;
  email: string;
  address: string;
  workingHours: string;
};

export default function AdminSettings() {
  const [settings, setSettings] = useState<Settings>({
    siteName: 'ثنايا',
    siteDescription: 'متجر عراقي للمستلزمات الطبية وطب الأسنان والأجهزة',
    phone: '07822088894',
    email: 'info@thanaya.iq',
    address: 'البصرة - حي الخضراء - شارع مستشفى النفط',
    workingHours: 'السبت - الخميس: 12 ظهراً - 9 مساءً',
  });
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('thanaya-settings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    localStorage.setItem('thanaya-settings', JSON.stringify(settings));
    setSuccess('تم حفظ الإعدادات بنجاح');
    setTimeout(() => setSuccess(''), 3000);
    setLoading(false);
  };

  return (
    <AdminLayout>
      <h2 className="text-3xl font-black mb-8 text-ink">إعدادات الموقع</h2>

      {success && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-6 text-green-700 font-bold">
          ✅ {success}
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white border-2 border-brand/20 rounded-2xl p-6 space-y-5">
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">اسم الموقع *</label>
          <input
            type="text"
            value={settings.siteName}
            onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand"
            required
          />
        </div>

        <div>
          <label className="block font-bold mb-2 text-sm text-ink">وصف الموقع *</label>
          <textarea
            value={settings.siteDescription}
            onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand resize-none"
            rows={3}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block font-bold mb-2 text-sm text-ink">رقم الهاتف *</label>
            <input
              type="tel"
              value={settings.phone}
              onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
              className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand"
              required
            />
          </div>
          <div>
            <label className="block font-bold mb-2 text-sm text-ink">البريد الإلكتروني *</label>
            <input
              type="email"
              value={settings.email}
              onChange={(e) => setSettings({ ...settings, email: e.target.value })}
              className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand"
              required
            />
          </div>
        </div>

        <div>
          <label className="block font-bold mb-2 text-sm text-ink">العنوان *</label>
          <input
            type="text"
            value={settings.address}
            onChange={(e) => setSettings({ ...settings, address: e.target.value })}
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand"
            required
          />
        </div>

        <div>
          <label className="block font-bold mb-2 text-sm text-ink">ساعات العمل *</label>
          <input
            type="text"
            value={settings.workingHours}
            onChange={(e) => setSettings({ ...settings, workingHours: e.target.value })}
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand"
            required
          />
        </div>

        <button type="submit" disabled={loading} className="bg-brand text-white rounded-full px-8 py-3 font-bold hover:bg-brand-dark transition disabled:opacity-50">
          {loading ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
        </button>
      </form>
    </AdminLayout>
  );
}
