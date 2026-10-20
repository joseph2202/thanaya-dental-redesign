import Link from 'next/link';
import {ArrowUpLeft,Search,ShoppingBag,ClipboardList,MapPinned,ShieldCheck} from 'lucide-react';

const steps=[
 {number:'01',title:'دوّر على اللي تحتاجه',description:'استكشف المنتجات حسب القسم والماركة وشوف المواصفات والأسعار بالدينار.',icon:Search},
 {number:'02',title:'جهّز سلتك براحتك',description:'اختَر الكميات، وراجع السعر والمخزون المتاح قبل تأكيد الطلب.',icon:ShoppingBag},
 {number:'03',title:'تابع طلبك من حسابك',description:'شوف حالة الطلب المسجّلة، واحتفظ بعناوين التوصيل للطلبات القادمة.',icon:ClipboardList}
];

export default function ShoppingSteps(){
 return <section className="site-container py-8 md:py-12" aria-labelledby="how-to-shop-title">
   <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
     <div><p className="site-eyebrow">WHY THANAYA</p><h2 id="how-to-shop-title" className="site-heading mt-1">من اختيار المنتج، لحد متابعة الطلب.</h2>
       <p className="site-muted mt-1 text-sm">ثلاث خطوات بسيطة حتى تجهّز احتياجات عيادتك.</p>
     </div>
     <Link href="/products" className="inline-flex items-center gap-2 text-sm font-black text-brand hover:underline">تصفّح المنتجات <ArrowUpLeft size={17}/></Link>
   </div>
   <div className="grid gap-4 md:grid-cols-3">
     {steps.map(step=>{
       const Icon=step.icon;
       return <article key={step.number} className="relative overflow-hidden rounded-[22px] border border-[#c8e4ee] bg-white px-5 py-6 shadow-[0_10px_30px_rgba(32,80,108,.035)] sm:px-6">
         <div className="mb-5 flex items-center justify-between">
           <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e5f6fc] text-[#0497c7]"><Icon size={24}/></span>
           <span className="text-3xl font-black tracking-tight text-[#d7edf5]" dir="ltr">{step.number}</span>
         </div>
         <h3 className="text-lg font-black text-[#243d4a]">{step.title}</h3>
         <p className="mt-2 text-sm leading-7 text-[#627b87]">{step.description}</p>
       </article>;
     })}
   </div>
   <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#cce5ec] bg-[#eaf7fb] px-5 py-4 text-[#3c6b7c]">
     <p className="inline-flex items-center gap-2 text-sm font-bold"><ShieldCheck size={19} className="text-brand"/> أسعار ومخزون تتحقق منها أنظمة المتجر عند إتمام الطلب</p>
     <Link href="/account" className="inline-flex items-center gap-1.5 text-sm font-black text-[#047ba8] hover:underline"><MapPinned size={17}/> حسابي وعناويني <ArrowUpLeft size={15}/></Link>
   </div>
 </section>;
}
