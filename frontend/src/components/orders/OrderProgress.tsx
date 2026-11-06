import {Check,Clock3,PackageCheck,Truck,CheckCircle2,RotateCcw,XCircle} from 'lucide-react';
import {orderStatusLabels} from '@/lib/orderPresentation';
import styles from './OrderExperience.module.css';

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
   return <section aria-label="حالة الطلب" className={`${styles.theme} ${styles.progress} rounded-[20px] border p-5 sm:p-6`}>
     <div className="flex items-start gap-3">
       <span aria-hidden="true" className={`${styles.stepIcon} grid h-11 w-11 shrink-0 place-items-center rounded-2xl`}>{status==='cancelled'?<XCircle size={23}/>:<RotateCcw size={23}/>}</span>
       <div><h2 className="text-base font-black">{orderStatusLabels[status]}</h2>
         <p className={`${styles.muted} mt-1 text-sm leading-7`}>{status==='cancelled'?'الطلب حالياً ملغي. تظل تفاصيله متاحة بحسابك.':'الطلب مسجّل كمرتجع. تظل تفاصيله متاحة بحسابك.'}</p>
       </div>
     </div>
   </section>;
 }
 return <section aria-label="تقدم حالة الطلب" className={`${styles.theme} ${styles.progress} rounded-[22px] border p-5 sm:p-6`}>
   <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
     <h2 className="text-lg font-black">مراحل طلبك</h2>
     <span className={`${styles.badge} rounded-full px-3 py-1.5 text-xs font-bold`}>آخر حالة مسجّلة: {orderStatusLabels[status]||'غير معروفة'}</span>
   </div>
   {index>=0?<ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
     {stages.map((stage,i)=>{
       const Icon=stage.icon,done=i<index,active=i===index;
       return <li key={stage.id} aria-current={active?'step':undefined} className={`${styles.step} ${active?styles.stepActive:done?styles.stepDone:''} relative rounded-2xl border p-3 text-center sm:p-4`}>
         <span aria-hidden="true" className={`${active?styles.activeIcon:done?styles.doneIcon:styles.stepIcon} mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full`}>
           {done?<Check size={21} strokeWidth={2.7}/>:<Icon size={20}/>}
         </span>
         <p className="text-xs font-black leading-6 sm:text-sm">{stage.label}</p>
         <p className={`${styles.muted} mt-1 text-[11px]`}>{active?'المرحلة الحالية':done?'مكتملة':'بانتظار التحديث'}</p>
       </li>
     })}
   </ol>:<p className={`${styles.muted} text-sm`}>ما نكدر نعرض مراحل تفصيلية لهذه الحالة حالياً.</p>}
   <p className={`${styles.muted} mt-4 text-xs leading-6`}>هاي آخر حالة مسجّلة بالنظام، مو موقع المندوب المباشر. من الموظف يحدّث الطلب، راح تظهر الحالة الجديدة تلقائياً أثناء فتح الصفحة.</p>
 </section>;
}
