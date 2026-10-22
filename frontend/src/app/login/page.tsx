"use client";
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { loginUser } from '@/lib/auth';
import { useAuth } from '@/context/AuthContext';

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await loginUser(form.email, form.password);
    
    if (result.user) {
      refreshUser();
      const redirect = searchParams.get('redirect');
      router.replace(redirect?.startsWith('/admin') && ['owner','admin','inventory','sales'].includes(result.user.role) ? redirect : ['owner','admin','inventory','sales'].includes(result.user.role) ? '/admin' : '/account');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-7 md:py-10">
        <div className="site-surface p-5 sm:p-7">
          <h1 className="text-3xl font-black mb-4 text-center text-ink">تسجيل الدخول</h1>
          
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm font-bold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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

            <button
              type="submit"
              disabled={loading}
              className="site-btn site-btn-primary w-full"
            >
              {loading ? 'جاري الدخول...' : 'دخول'}
            </button>
          </form>

          <p className="text-center text-sm text-neutral-600 mt-6">
            ما عندك حساب؟{' '}
            <Link href="/register" className="text-brand font-bold hover:underline">
              إنشاء حساب
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function LoginPage() { return <Suspense fallback={<p className="p-12 text-center">جاري التحميل...</p>}><LoginContent /></Suspense>; }
