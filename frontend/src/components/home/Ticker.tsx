import {BadgeCheck,MapPinned,SearchCheck,ShieldCheck} from 'lucide-react';

const benefits=[
 {label:'أسعار واضحة بالدينار',icon:BadgeCheck},
 {label:'مواصفات قبل الشراء',icon:SearchCheck},
 {label:'مراجعة المخزون عند الطلب',icon:ShieldCheck},
 {label:'أجور توصيل حسب المحافظة',icon:MapPinned}
];

// Infinite, CSS-only marquee. The repeated group is visual only; screen readers
// announce each useful statement once. No invented product categories or stock.
function BenefitsGroup({duplicate=false}:{duplicate?:boolean}){
 return <div className="thanaya-ticker-group" aria-hidden={duplicate?true:undefined}>
  {benefits.map(({label,icon:Icon})=><span key={label} className="thanaya-ticker-item">
   <Icon size={19} strokeWidth={1.8} className="thanaya-ticker-icon" aria-hidden="true"/>
   <span>{label}</span>
  </span>)}
 </div>;
}

export default function Ticker(){
 return <section className="thanaya-ticker" aria-label="معلومات عن التسوق في ثنايا">
  <div className="thanaya-ticker-viewport">
   <div className="thanaya-ticker-track">
    <BenefitsGroup/>
    <BenefitsGroup duplicate/>
   </div>
  </div>
 </section>;
}
