"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Maximize2,Minus,Plus,X} from 'lucide-react';
import ProductMedia from '@/components/ui/ProductMedia';
import styles from './ProductGallery.module.css';
import {productImages} from '@/lib/productImages';

export default function ProductGallery({name,image,icon,gallery}:{name:string;image?:string|null;icon?:string;gallery?:string[]}){
 const images=productImages({image,gallery});
 const [active,setActive]=useState(0),[open,setOpen]=useState(false),[zoomed,setZoomed]=useState(false);
 const [unavailable,setUnavailable]=useState<Record<string,boolean>>({});
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),closeButton=useRef<HTMLButtonElement>(null);
 const viewport=useRef<HTMLDivElement>(null),id=useId();
 const current=images[active]||images[0],missing=Boolean(current&&unavailable[current]);
 function markUnavailable(src:string){setUnavailable(previous=>previous[src]?previous:{...previous,[src]:true});}
 function select(index:number){setActive((index+images.length)%images.length);setZoomed(false);}
 useEffect(()=>{
  const element=dialog.current;if(!element)return;
  if(!open){if(element.open)element.close();return;}
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';
  if(!element.open)element.showModal();closeButton.current?.focus();
  return()=>{document.body.style.overflow=previous;};
 },[open]);
 useEffect(()=>{if(viewport.current){viewport.current.scrollLeft=0;viewport.current.scrollTop=0;}},[active,zoomed]);
 function close(){setOpen(false);setZoomed(false);trigger.current?.focus({preventScroll:true});}
 return <div className="min-w-0">
  <ProductMedia name={name} image={current} icon={icon} size={130} priority onUnavailable={()=>{if(current)markUnavailable(current);}}
   className="aspect-square w-full rounded-[24px] border border-brand/20 bg-paper"/>
  {current&&<button ref={trigger} type="button" disabled={missing} onClick={()=>{setZoomed(false);setOpen(true);}}
   aria-haspopup="dialog" className="site-btn site-btn-outline mt-3 w-full"><Maximize2 size={17}/>{missing?'الصورة غير متاحة للتكبير':'تكبير صور المنتج'}</button>}
  {images.length>1&&<div className="mt-3 flex flex-wrap gap-3" role="group" aria-label="صور المنتج">
   {images.map((src,index)=><button key={src} type="button" onClick={()=>select(index)} aria-label={'عرض الصورة '+(index+1)} aria-pressed={current===src}
    className={'h-[74px] w-[74px] overflow-hidden rounded-xl border-2 bg-paper '+(current===src?'border-brand':'border-brand/20')}>
    <ProductMedia name={name+'، صورة '+(index+1)} image={src} className="h-full w-full" size={36} onUnavailable={()=>markUnavailable(src)}/>
   </button>)}
  </div>}
  <dialog ref={dialog} dir="rtl" aria-labelledby={id+'-title'} aria-describedby={id+'-help'} className={styles.lightbox}
   onClose={close} onCancel={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget)close();}}
   onKeyDown={event=>{
    if(zoomed||images.length<2)return;
    if(event.key==='ArrowLeft'){event.preventDefault();select(active+1);}
    if(event.key==='ArrowRight'){event.preventDefault();select(active-1);}
   }}>
   <header className="flex items-start justify-between gap-3 border-b border-brand/20 p-4">
    <div className="min-w-0"><h2 id={id+'-title'} className="font-black">تكبير صور المنتج</h2><p className="site-muted mt-1 break-words text-xs">{name}</p></div>
    <button ref={closeButton} type="button" onClick={close} aria-label="إغلاق معرض الصور" className="site-btn site-btn-outline site-btn-sm shrink-0"><X size={19}/></button>
   </header>
   {open&&<>
    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
     <div className="flex items-center gap-2">
      <button type="button" disabled={images.length<2} onClick={()=>select(active-1)} aria-label="الصورة السابقة" className="site-btn site-btn-outline site-btn-sm"><ChevronRight size={18}/></button>
      <p role="status" className="text-xs">الصورة {Math.min(active+1,images.length)} من {images.length}</p>
      <button type="button" disabled={images.length<2} onClick={()=>select(active+1)} aria-label="الصورة التالية" className="site-btn site-btn-outline site-btn-sm"><ChevronLeft size={18}/></button>
     </div>
     <button type="button" disabled={missing} aria-pressed={zoomed} onClick={()=>setZoomed(value=>!value)} className="site-btn site-btn-outline site-btn-sm">
      {zoomed?<Minus size={16}/>:<Plus size={16}/>} {zoomed?'الحجم الطبيعي':'تكبير 2×'}
     </button>
    </div>
    <div ref={viewport} tabIndex={0} dir="ltr" aria-label="مساحة الصورة المكبّرة" className={styles.viewport+' '+(zoomed?styles.zoomed:'')}>
     {missing?<p role="status" className="site-muted p-8 text-center text-sm">تعذّر تحميل هذه الصورة. جرّب صورة أخرى.</p>:
      <div className={styles.canvas}>
       {/* eslint-disable-next-line @next/next/no-img-element */}
       <img src={current} alt={name+'، صورة '+Math.min(active+1,images.length)} decoding="async" onError={()=>markUnavailable(current)} className={styles.image}/>
      </div>}
    </div>
    <p id={id+'-help'} className="site-muted border-t border-brand/20 p-3 text-xs leading-6">عند التكبير حرّك الصورة بالتمرير أو اللمس. استخدم Escape للإغلاق، والأسهم لتغيير الصورة بالحجم الطبيعي.</p>
   </>}
  </dialog>
 </div>;
}
