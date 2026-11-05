"use client";

import {useRef,useState} from 'react';
import {X,ZoomIn} from 'lucide-react';
import ProductMedia from '@/components/ui/ProductMedia';

export default function ProductGallery({name,image,icon,gallery}:{name:string;image?:string|null;icon?:string;gallery?:string[]}){
 const images=[...new Set([image,...(gallery||[])].filter((x):x is string=>typeof x==='string'&&x.length>0))];
 const [active,setActive]=useState(0);
 const dialogRef=useRef<HTMLDialogElement>(null);
 const current=images[active]||images[0];

 return <div className="min-w-0">
  {current?
   <button type="button" onClick={()=>dialogRef.current?.showModal()}
    aria-label={'تكبير صورة المنتج: '+name} aria-haspopup="dialog"
    className="group relative block w-full cursor-zoom-in rounded-[24px] text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
    <ProductMedia name={name} image={current} icon={icon} size={130} priority
      className="aspect-square w-full rounded-[24px] border border-[#cde9f4] bg-white"/>
    <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-[#d0e7f0] bg-white/95 px-3 py-2 text-xs font-black text-[#21586e] shadow-sm transition group-hover:bg-[#e9f8fd]">
     <ZoomIn size={16} aria-hidden="true"/> تكبير الصورة
    </span>
   </button>:
   <ProductMedia name={name} image={null} icon={icon} size={130} priority
     className="aspect-square w-full rounded-[24px] border border-[#cde9f4] bg-white"/>}
  {images.length>1&&<div className="mt-3 flex flex-wrap gap-3" role="group" aria-label="صور المنتج">
   {images.map((src,i)=><button key={src} type="button" onClick={()=>setActive(i)}
    aria-label={'عرض الصورة '+(i+1)} aria-pressed={current===src}
    className={'h-[74px] w-[74px] overflow-hidden rounded-xl border-2 bg-white '+(current===src?'border-brand':'border-[#d4e9f2]')}>
    <ProductMedia name={name+'، صورة '+(i+1)} image={src} className="h-full w-full" size={36}/>
   </button>)}
  </div>}
  {current&&<dialog ref={dialogRef} aria-label={'الصورة المكبرة: '+name}
    className="m-auto max-h-[96vh] w-[min(95vw,1080px)] max-w-none rounded-[24px] border border-[#cde9f4] bg-white p-0 text-[#234454] shadow-2xl backdrop:bg-[#061f2d]/85">
   <div dir="rtl" className="p-3 sm:p-5">
    <div className="mb-3 flex items-center justify-between gap-3">
     <strong className="min-w-0 truncate text-sm font-black sm:text-base">{name}</strong>
     <button type="button" autoFocus onClick={()=>dialogRef.current?.close()}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-[#cde7f1] bg-[#f1f9fc] px-4 text-sm font-bold text-[#20546c] hover:bg-[#e0f3f9]">
      <X size={18} aria-hidden="true"/> إغلاق
     </button>
    </div>
    <ProductMedia name={name} image={current} icon={icon} priority
     className="h-[min(73vh,740px)] w-full rounded-xl bg-white"/>
    <p className="mt-3 text-center text-xs text-[#587484]">اضغط Escape أو زر إغلاق للرجوع إلى المنتج.</p>
   </div>
  </dialog>}
 </div>;
}
