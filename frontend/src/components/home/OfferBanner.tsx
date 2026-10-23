"use client";

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowUpLeft,Boxes,ShoppingBag} from 'lucide-react';
import {settingsAPI} from '@/lib/api';

type Banner = {
 bannerEnabled:boolean;bannerEyebrow:string;bannerTitle:string;bannerDescription:string;
 bannerButtonLabel:string;bannerButtonHref:string;bannerImage:string|null;
};

const fallback:Banner={
 bannerEnabled:true,bannerEyebrow:'THANAYA / BASRA',bannerTitle:'احتياجات عيادتك، أسهل مع ثنايا.',
 bannerDescription:'تصفّح مستلزمات طب الأسنان والأجهزة الطبية، ورتّب احتياجاتك من الأقسام الموجودة في المتجر.',
 bannerButtonLabel:'ابدأ التصفّح',bannerButtonHref:'/products',bannerImage:null
};
const allowedLinks=['/products','/categories','/offers','/account'];

export default function OfferBanner(){
 const [banner,setBanner]=useState<Banner>(fallback);
 useEffect(()=>{
  let alive=true;
  settingsAPI.getPublic().then((result:Partial<Banner>)=>{
    if(!alive||!result||typeof result!=='object')return;
    setBanner({
      bannerEnabled:typeof result.bannerEnabled==='boolean'?result.bannerEnabled:fallback.bannerEnabled,
      bannerEyebrow:typeof result.bannerEyebrow==='string'?result.bannerEyebrow:fallback.bannerEyebrow,
      bannerTitle:typeof result.bannerTitle==='string'?result.bannerTitle:fallback.bannerTitle,
      bannerDescription:typeof result.bannerDescription==='string'?result.bannerDescription:fallback.bannerDescription,
      bannerButtonLabel:typeof result.bannerButtonLabel==='string'?result.bannerButtonLabel:fallback.bannerButtonLabel,
      bannerButtonHref:typeof result.bannerButtonHref==='string'&&allowedLinks.includes(result.bannerButtonHref)?result.bannerButtonHref:fallback.bannerButtonHref,
      bannerImage:typeof result.bannerImage==='string'&&/^\/uploads\/[0-9]+-[0-9]+\.(?:jpg|jpeg|png|webp)$/i.test(result.bannerImage)?result.bannerImage:null
    });
  }).catch(()=>{/* Keep the default banner when the server is briefly offline. */});
  return ()=>{alive=false};
 },[]);
 if(!banner.bannerEnabled)return null;
 return <section aria-label="إعلان ثنايا" className="site-container py-4 md:py-5">
   <div className="thanaya-offer-banner relative grid items-center gap-5 overflow-hidden rounded-[24px] bg-[linear-gradient(120deg,#007cae,#04a5d1)] px-6 py-7 text-white md:grid-cols-[1fr_auto] sm:px-10 sm:py-8">
     {banner.bannerImage && <>
       <img src={banner.bannerImage} alt="" aria-hidden="true" loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
       <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,91,126,.80),rgba(0,116,160,.88))]" />
     </>}
     <div className="pointer-events-none absolute -left-[75px] -top-[95px] h-72 w-72 rounded-full border-[48px] border-white/[.06]" aria-hidden="true" />
     <div className="relative min-w-0">
       <span className="text-xs font-bold tracking-widest text-white/85">{banner.bannerEyebrow}</span>
       <h2 className="mt-3 text-[clamp(1.65rem,3.2vw,2.65rem)] font-black leading-[1.3] tracking-[-.035em] text-white">{banner.bannerTitle}</h2>
       <p className="mt-2 max-w-2xl text-sm leading-7 text-white/85">{banner.bannerDescription}</p>
     </div>
     <div className="relative flex items-center gap-3">
       <Boxes size={32} className="hidden text-white/35 lg:block" aria-hidden="true" />
       <Link href={banner.bannerButtonHref} className="site-btn site-btn-outline site-btn-sm">
         {banner.bannerButtonLabel}<ArrowUpLeft size={18} aria-hidden="true"/>
       </Link>
       <ShoppingBag size={23} className="hidden text-white/35 lg:block" aria-hidden="true" />
     </div>
   </div>
 </section>;
}
