import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import {ArrowUpLeft,ClipboardCheck,PackageCheck,ShieldAlert,Truck} from 'lucide-react';
export const metadata={title:'الشروط والأحكام | ثنايا',description:'معلومات تمهيدية عن الشراء والتوصيل والاسترجاع في ثنايا قبل الإطلاق.'};
const content=[
 {title:'إنشاء الطلب والأسعار',body:'تظهر الأسعار بالدينار العراقي، ويعيد النظام التحقق من المبلغ والمخزون والعروض قبل تثبيت الطلب. عند تغيّر السعر أو عدم توفر كمية، يحتاج الزبون مراجعة طلبه.'},
 {title:'التوصيل',body:'تعتمد إمكانية التوصيل وأجوره على المحافظة وإعدادات التوصيل المتاحة في وقت تأكيد الطلب. تقديم الطلب لا يضمن موعداً محدداً للتسليم ما لم تؤكده إدارة المتجر.'},
 {title:'طريقة الدفع',body:'الطريقة التشغيلية المتاحة حالياً هي الدفع النقدي عند الاستلام. خيار البطاقات ظاهر للمعاينة فقط وغير مفعّل؛ لا تتم أي خصومات إلكترونية من هذه الواجهة.'},
 {title:'الإلغاء والمرتجعات',body:'يحتفظ النظام بسجلات الطلبات والمرتجعات وتعديلات المخزون، لكن شروط قبول الإرجاع ومدده وأجوره وحقوق المستهلك يجب أن تعتمدها إدارة ثنايا وتنشرها بصيغة نهائية قبل البيع العام.'}
];
export default function TermsPage(){
 return <><Header/><main className="site-container py-8 sm:py-12" dir="rtl"><div className="mx-auto max-w-4xl">
  <span className="site-eyebrow">THANAYA / STORE INFORMATION</span>
  <h1 className="mt-2 text-3xl font-black sm:text-4xl">الشروط والأحكام</h1>
  <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm leading-7">
   <ShieldAlert className="mt-1 shrink-0 text-amber-600" size={21}/>
   <p><strong>نسخة مراجعة داخلية قبل الإطلاق.</strong> هذه معلومات تشغيلية أولية فقط، وليست الشروط القانونية النهائية؛ يلزم اعتماد سياسة بيع ومرتجعات وخصوصية رسمية قبل استقبال الزبائن.</p>
  </div>
  <div className="mt-6 space-y-3">
   {content.map((section,index)=><section key={section.title} className="site-surface rounded-2xl border p-5">
    <h2 className="flex items-center gap-2 text-lg font-black">
     {index===0?<ClipboardCheck size={21} className="text-brand"/>:index===1?<Truck size={21} className="text-brand"/>:<PackageCheck size={21} className="text-brand"/>}{section.title}
    </h2>
    <p className="site-muted mt-2 text-sm leading-8">{section.body}</p>
   </section>)}
  </div>
  <div className="mt-6 flex flex-wrap gap-3"><Link href="/privacy" className="site-btn site-btn-outline">الخصوصية <ArrowUpLeft size={16}/></Link><Link href="/" className="site-btn site-btn-primary">العودة للمتجر <ArrowUpLeft size={16}/></Link></div>
 </div></main><Footer/></>;
}