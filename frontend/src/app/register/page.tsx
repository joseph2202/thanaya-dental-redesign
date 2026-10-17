"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { registerUser } from '@/lib/auth';
import { useAuth } from '@/context/AuthContext';

export default function RegisterPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    setLoading(true);

    const result = await registerUser(form.name, form.email, form.phone, form.password);
    
    if (result.user) {
      refreshUser();
      router.push('/account');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-16">
        <div className="site-surface p-8">
          <h1 className="text-3xl font-black mb-6 text-center text-ink">إنشاء حساب</h1>
          
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm font-bold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-bold mb-2 text-sm text-ink">الاسم الكامل</label>
              <input
                type="text"
                required
                minLength={3}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-[#bbdeea] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand"
                placeholder="أحمد محمد"
              />
            </div>

            <div>
              <label className="block font-bold mb-2 text-sm text-ink">البريد الإلكتروني</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-[#bbdeea] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand"
                placeholder="example@email.com"
              />
            </div>

            <div>
              <label className="block font-bold mb-2 text-sm text-ink">رقم الهاتف</label>
              <input
                type="tel"
                required
                pattern="07[0-9]{9}"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-[#bbdeea] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand"
                placeholder="07822088894"
              />
              <p className="text-xs text-neutral-500 mt-1">يجب أن يبدأ بـ 07 ويتكون من 10 أرقام</p>
            </div>

            <div>
              <label className="block font-bold mb-2 text-sm text-ink">كلمة المرور</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-[#bbdeea] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand"
                placeholder="6 أحرف على الأقل"
              />
            </div>

            <div>
              <label className="block font-bold mb-2 text-sm text-ink">تأكيد كلمة المرور</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                className="w-full border border-[#bbdeea] rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-brand"
                placeholder="أعد كتابة كلمة المرور"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="site-btn site-btn-primary w-full"
            >
              {loading ? 'جاري إنشاء الحساب...' : 'إنشاء حساب'}
            </button>
          </form>

          <p className="text-center text-sm text-neutral-600 mt-6">
            عندك حساب؟{' '}
            <Link href="/login" className="text-brand font-bold hover:underline">
              تسجيل الدخول
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
