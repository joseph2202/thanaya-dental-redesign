import {BadgeCheck,MapPinned,SearchCheck,ShieldCheck} from 'lucide-react';

const benefits=[
 {label:'أسعار واضحة بالدينار',icon:BadgeCheck},
 {label:'مواصفات قبل الشراء',icon:SearchCheck},
 {label:'مراجعة المخزون عند الطلب',icon:ShieldCheck},
 {label:'أجور توصيل حسب المحافظة',icon:MapPinned}
];

// Do not advertise categories the store has not actually stocked yet.
// Catalog categories are generated from real products in CategoryGrid.
export default function Ticker(){
 return <section aria-label="معلومات عن التسوق في ثنايا" className="border-b border-[#cde7f0] bg-[#e9f7fb]">
  <div className="site-container grid grid-cols-2 gap-x-4 gap-y-3 py-3 sm:gap-x-6 lg:grid-cols-4">
   {benefits.map(({label,icon:Icon})=><p key={label} className="flex min-w-0 items-center gap-2 text-[11px] font-bold leading-5 text-[#3c6b7b] sm:text-xs">
    <Icon size={17} strokeWidth={1.8} className="shrink-0 text-[#088eb9]" aria-hidden="true"/><span>{label}</span>
   </p>)}
  </div>
 </section>;
}
