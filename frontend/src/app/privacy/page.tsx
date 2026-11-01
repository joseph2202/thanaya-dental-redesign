import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import {ArrowUpLeft,LockKeyhole,ShieldCheck,UserRound} from 'lucide-react';

export const metadata={title:'الخصوصية | ثنايا',description:'معلومات عن بيانات العملاء في متجر ثنايا. هذه النسخة قبل الإطلاق وتحتاج اعتماد سياسة نهائية.'};
const sections=[
 {title:'البيانات اللازمة للحساب والطلب',body:'عند إنشاء حساب أو طلب منتجات، يعالج المتجر بيانات مثل الاسم والبريد الإلكتروني ورقم الهاتف وعنوان التوصيل وتفاصيل الطلب. تستخدم هذه البيانات لتنفيذ تجربة الطلب والتواصل بشأنه.'},
 {title:'الحساب والدخول',body:'يستخدم المتجر رمز جلسة في المتصفح حتى يبقى الحساب مسجّلاً. ينبغي حماية جهازك وتسجيل الخروج من الأجهزة المشتركة. لا نعرض كلمة المرور بنص واضح من صفحات الموقع.'},
 {title:'المخزون والمدفوعات',body:'يمكن للموظفين المخوّلين الاطلاع على البيانات اللازمة لإدارة الطلبات والتوصيل والتحصيل. الدفع الإلكتروني بالبطاقات غير مفعّل حالياً؛ لا تُدخل رقم بطاقتك أو CVV في أي حقل من حقول ثنايا.'},
 {title:'الاحتفاظ والحقوق',body:'مدة الاحتفاظ النهائية وإجراءات طلب الاطلاع والتصحيح والحذف وآلية التواصل الرسمية يجب أن تعتمدها إدارة المتجر قبل الإطلاق العام، وفق الالتزامات القانونية المنطبقة.'}
];
export default function PrivacyPage(){
 return <><Header/><main className="site-container py-8 sm:py-12" dir="rtl">
  <div className="mx-auto max-w-4xl">
   <span className="site-eyebrow">THANAYA / TRUST CENTER</span>
   <h1 className="mt-2 text-3xl font-black sm:text-4xl">الخصوصية وحماية بيانات العملاء</h1>
   <p className="site-muted mt-3 text-sm leading-8">هذه معلومات تمهيدية توضّح طريقة عمل نسخة ثنايا الحالية. <strong>سياسة الخصوصية النهائية لم تُعتمد بعد، ولا يُعتبر هذا النص بديلاً عن المراجعة القانونية قبل الإطلاق.</strong></p>
   <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/25 bg-paper2/45 p-4 text-sm">
    <ShieldCheck size={20} className="text-brand"/><span>معلومات قبل الإطلاق — بدون ادعاءات امتثال قانوني أو ضمانات مطلقة.</span>
   </div>
   <div className="mt-6 grid gap-3">
    {sections.map((section,i)=><section key={section.title} className="site-surface rounded-2xl border p-5">
     <h2 className="flex items-center gap-2 text-lg font-black">{i===0?<UserRound size={20} className="text-brand"/>:<LockKeyhole size={19} className="text-brand"/>}{section.title}</h2>
     <p className="site-muted mt-2 text-sm leading-8">{section.body}</p>
    </section>)}
   </div>
   <Link href="/" className="site-btn site-btn-outline mt-6">العودة للمتجر <ArrowUpLeft size={16}/></Link>
  </div>
 </main><Footer/></>;
}