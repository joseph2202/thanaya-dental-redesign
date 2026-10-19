"use client";
import {useState} from 'react';
import ProductMedia from '@/components/ui/ProductMedia';
export default function ProductGallery({name,image,icon,gallery}:{name:string;image?:string|null;icon?:string;gallery?:string[]}){
 const images=[...new Set([image,...(gallery||[])].filter((x):x is string=>typeof x==='string'&&x.length>0))];
 const [active,setActive]=useState(0);
 const current=images[active]||images[0];
 return <div className="min-w-0">
  <ProductMedia name={name} image={current} icon={icon} size={130} className="aspect-square w-full rounded-[24px] border border-[#cde9f4] bg-white"/>
  {images.length>1&&<div className="mt-3 flex flex-wrap gap-3" role="group" aria-label="صور المنتج">{images.map((src,i)=><button key={src} type="button" onClick={()=>setActive(i)} aria-label={'عرض الصورة '+(i+1)} aria-pressed={current===src} className={'h-[74px] w-[74px] overflow-hidden rounded-xl border-2 bg-white '+(current===src?'border-brand':'border-[#d4e9f2]')}><ProductMedia name={name+'، صورة '+(i+1)} image={src} className="h-full w-full" size={36}/></button>)}</div>}
 </div>;
}
