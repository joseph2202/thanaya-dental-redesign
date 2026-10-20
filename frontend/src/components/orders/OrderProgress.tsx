import {Check,Clock3,PackageCheck,Truck,CheckCircle2,RotateCcw,XCircle} from 'lucide-react';
import {orderStatusLabels} from '@/lib/orderPresentation';

// A status overview, NOT a timestamped shipment-tracking or live courier feed.
const stages=[
 {id:'pending',label:'استلام الطلب',icon:Clock3},
 {id:'confirmed',label:'تأكيد الطلب',icon:CheckCircle2},
 {id:'shipped',label:'بالطريق',icon:Truck},
 {id:'delivered',label:'تم التسليم',icon:PackageCheck},
];

export default function OrderProgress({status}:{status:string}){
 const index=stages.findIndex(s=>s.id===status);
 if(status==='cancelled'||status==='returned'){
   return <section aria-label="حالة الطلب" className="rounded-[20px] border border-[#d8eaf0] bg-[#f8fbfd] p-5 sm:p-6">
     <div className="flex items-start gap-3">
       <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[#4e6573]">{status==='cancelled'?<XCircle size={23}/>:<RotateCcw size={23}/>}</span>
       <div><h2 className="text-base font-black">{orderStatusLabels[status]}</h2>
         <p className="mt-1 text-sm leading-7 text-[#5a7685]">{status==='cancelled'?'الطلب حالياً ملغي. تظل تفاصيله متاحة بحسابك.':'الطلب مسجّل كمرتجع. تظل تفاصيله متاحة بحسابك.'}</p>
       </div>
     </div>
   </section>;
 }
 return <section aria-label="تقدم حالة الطلب" className="rounded-[22px] border border-[#d5e9f2] bg-[#f7fcfe] p-5 sm:p-6">
   <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
     <h2 className="text-lg font-black">مراحل طلبك</h2>
     <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#32778d]">آخر حالة مسجّلة: {orderStatusLabels[status]||'غير معروفة'}</span>
   </div>
   {index>=0?<ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
     {stages.map((stage,i)=>{
       const Icon=stage.icon,done=i<index,active=i===index,upcoming=i>index;
       return <li key={stage.id} aria-current={active?'step':undefined} className={`relative rounded-2xl border p-3 text-center sm:p-4 ${active?'border-[#059bd0] bg-[#e6f7fc] shadow-[0_8px_24px_rgba(5,155,208,.1)]':done?'border-[#b6e6d6] bg-[#f0fcf7]':'border-[#e2e9ee] bg-white'}`}>
         <span className={`mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full ${active?'bg-[#059bd0] text-white':done?'bg-[#d7f4e8] text-[#11775a]':'bg-[#f0f4f7] text-[#96a9b4]'}`}>
           {done?<Check size={21} strokeWidth={2.7}/>:<Icon size={20}/>}
         </span>
         <p className={`text-xs font-black leading-6 sm:text-sm ${upcoming?'text-[#8296a2]':'text-[#244958]'}`}>{stage.label}</p>
         <p className="mt-1 text-[11px] text-[#6f8490]">{active?'المرحلة الحالية':done?'مكتملة':'بانتظار التحديث'}</p>
       </li>
     })}
   </ol>:<p className="text-sm text-[#5d7885]">ما نكدر نعرض مراحل تفصيلية لهذه الحالة حالياً.</p>}
   <p className="mt-4 text-xs leading-6 text-[#6e8895]">هذا عرض لآخر حالة مسجّلة بالنظام، مو تتبّع مباشر لموقع المندوب. حدّث الصفحة للحصول على آخر تغيير.</p>
 </section>;
}
