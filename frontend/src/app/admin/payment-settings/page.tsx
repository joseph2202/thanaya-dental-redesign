import Link from 'next/link';
import AdminLayout from '@/components/admin/AdminLayout';
import {ArrowUpLeft,Banknote,BadgeCheck,CreditCard,FileClock,KeyRound,LockKeyhole,ShieldAlert,ShieldCheck,Webhook} from 'lucide-react';

export const metadata={title:'طرق الدفع | ثنايا — إدارة المتجر'};

// Read-only operating status. Never expose a fake payment-enabled toggle;
// card readiness MUST be tied to a backend-verified provider configuration
// and a signed, idempotent payment confirmation webhook in a future release.
export default function PaymentSettings(){
 const requirements=[
  {icon:KeyRound,title:'ربط مزود دفع معتمد',description:'حساب تاجر حقيقي، بيئة اختبار ومفاتيح محفوظة خارج قاعدة المتجر، لا في المتصفح.'},
  {icon:CreditCard,title:'نموذج مستضاف أو ترميز البطاقات',description:'إدخال رقم البطاقة والتاريخ والرمز الأمني عبر المزود فقط، وليس على خوادم ثنايا.'},
  {icon:Webhook,title:'تحقق الخادم من الدفع',description:'توقيع callbacks والتحقق من المبلغ والعملة ومعرّف الطلب ومنع تكرار الإشعار.'},
  {icon:FileClock,title:'استرداد وتسوية قابلة للتدقيق',description:'ربط المعاملات المالية بمراجع المزود ومراجعة حالات الفشل والرد والتسويات.'}
 ];
 return <AdminLayout>
  <div className="space-y-6 pb-10" dir="rtl">
   <header className="flex flex-wrap items-start justify-between gap-3">
    <div>
     <span className="site-eyebrow">THANAYA / PAYMENT OPERATIONS</span>
     <h1 className="mt-2 text-3xl font-black">إدارة طرق الدفع</h1>
     <p className="site-muted mt-2 max-w-2xl text-sm leading-7">تابع طرق الدفع الحالية ومتطلبات إضافة الدفع الإلكتروني.</p>
    </div>
    <Link href="/admin/finance" className="site-btn site-btn-outline">سجل التحصيل والاسترداد <ArrowUpLeft size={17}/></Link>
   </header>
   <div className="grid gap-4 md:grid-cols-2">
    <article className="site-surface rounded-3xl border border-emerald-500/30 p-5">
     <div className="flex items-start justify-between gap-3">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600"><Banknote size={25}/></span>
      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-700">متاح الآن</span>
     </div>
     <h2 className="mt-4 text-xl font-black">الدفع النقدي عند الاستلام</h2>
     <p className="site-muted mt-2 text-sm leading-7">يسجّل الزبون طلبه ويدفع عند الاستلام. وثّق المبلغ عند قبضه فعلياً.</p>
     <p className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-700"><BadgeCheck size={16}/> لا حاجة إلى بوابة دفع إلكترونية</p>
    </article>
    <article className="site-surface rounded-3xl border border-amber-500/35 p-5">
     <div className="flex items-start justify-between gap-3">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-600"><CreditCard size={25}/></span>
      <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-700">غير مفعّل</span>
     </div>
     <h2 className="mt-4 text-xl font-black">الدفع بالبطاقات الائتمانية وبطاقات الخصم</h2>
     <p className="site-muted mt-2 text-sm leading-7">بانتظار ربط مزود دفع معتمد. لا يمكن الدفع بالبطاقة حالياً.</p>
     <p className="mt-3 flex items-center gap-2 text-xs font-bold text-amber-700"><ShieldAlert size={16}/> لا تضف بيانات بطاقات إلى الطلبات أو الملاحظات</p>
    </article>
   </div>
   <section className="site-surface rounded-3xl border p-5 sm:p-7">
    <div className="flex items-start gap-3">
     <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand"><ShieldCheck size={23}/></span>
     <div><h2 className="text-xl font-black">متطلبات تفعيل البطاقة مستقبلاً</h2>
      <p className="site-muted mt-2 text-sm leading-7">قبول أنواع البطاقات يعتمد على مزوّد الدفع المتعاقد معه، ولا يمكن ضمان قبول كل البطاقات مسبقاً.</p></div>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
     {requirements.map(item=><div key={item.title} className="rounded-2xl border border-brand/20 bg-paper2/40 p-4">
      <div className="flex items-center gap-2"><item.icon size={18} className="text-brand"/><h3 className="font-black">{item.title}</h3></div>
      <p className="site-muted mt-2 text-sm leading-7">{item.description}</p>
     </div>)}
    </div>
    <p className="site-muted mt-4 flex items-start gap-2 text-xs leading-6"><LockKeyhole size={16} className="mt-1 shrink-0"/>
     إدارة المفاتيح وبيانات البطاقات تتم عبر مزوّد الدفع المخصّص، ولا تُدخل في ملاحظات الطلب.
    </p>
   </section>
  </div>
 </AdminLayout>;
}
