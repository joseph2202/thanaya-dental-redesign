"use client";
import {useState,type ReactNode} from 'react';

// The icon can be passed as a server-rendered slot; only image failure needs state.
export default function ResilientProductImage({src,name,priority=false,fallback,onUnavailable}:{
 src:string;name:string;priority?:boolean;fallback:ReactNode;onUnavailable?:()=>void;
}){
 const [failed,setFailed]=useState<string|null>(null);
 if(failed===src)return <span role="img" aria-label={'صورة '+name+' غير متاحة'} className="flex h-full w-full flex-col items-center justify-center gap-2 p-3">
  <span aria-hidden="true">{fallback}</span><span className="site-muted text-center text-xs">الصورة غير متاحة</span>
 </span>;
 // Uploaded/local URLs keep their transport; no extra image proxy or retry loop.
 // eslint-disable-next-line @next/next/no-img-element
 return <img src={src} alt={name} loading={priority?'eager':'lazy'} decoding="async"
  onError={()=>{setFailed(src);onUnavailable?.();}}/>;
}
