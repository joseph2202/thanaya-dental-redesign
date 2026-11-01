"use client";
import Link from 'next/link';
import {AlertTriangle,ArrowUpLeft,RefreshCw} from 'lucide-react';
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){
 return <main className="site-container flex min-h-[60vh] items-center justify-center py-12" dir="rtl">
  <section role="alert" className="site-surface mx-auto w-full max-w-xl rounded-3xl border p-6 text-center sm:p-9">
   <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/10 text-amber-600"><AlertTriangle size={29}/></div>
   <h1 className="mt-5 text-2xl font-black">صار خلل مؤقت بعرض الصفحة</h1>
   <p className="site-muted mt-3 text-sm leading-8">قد يكون الاتصال بخدمة ثنايا غير متاح. حاول إعادة عرض الصفحة، وإذا استمر الخلل رجع إلى الرئيسية. لا تحتاج تعيد عملية شراء أو دفع من دون التأكد من حالة الطلب السابق.</p>
   <div className="mt-5 flex flex-wrap justify-center gap-3">
    <button type="button" onClick={reset} className="site-btn site-btn-primary"><RefreshCw size={17}/> إعادة المحاولة</button>
    <Link className="site-btn site-btn-outline" href="/">الرئيسية <ArrowUpLeft size={17}/></Link>
   </div>
  </section>
 </main>;
}