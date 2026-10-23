"use client";

import {useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';

export type ThanayaTheme='dark'|'light';
const key='thanaya:color-theme';
const eventName='thanaya-theme-change';

function currentTheme():ThanayaTheme {
 if(typeof document==='undefined')return 'dark';
 return document.documentElement.dataset.thanayaTheme==='light'?'light':'dark';
}

export function ThemeInitializer(){
 useEffect(()=>{
  try{
   const stored=window.localStorage.getItem(key);
   document.documentElement.dataset.thanayaTheme=stored==='light'?'light':'dark';
  }catch{document.documentElement.dataset.thanayaTheme='dark';}
  window.dispatchEvent(new Event(eventName));
 },[]);
 return null;
}

export default function ThemeToggle({compact=false}:{compact?:boolean}){
 const [theme,setTheme]=useState<ThanayaTheme>('dark');
 useEffect(()=>{
  const sync=()=>setTheme(currentTheme());
  sync();
  window.addEventListener(eventName,sync);
  const fromAnotherTab=(e:StorageEvent)=>{if(e.key===key){
   document.documentElement.dataset.thanayaTheme=e.newValue==='light'?'light':'dark';
   sync();
  }};
  window.addEventListener('storage',fromAnotherTab);
  return ()=>{window.removeEventListener(eventName,sync);window.removeEventListener('storage',fromAnotherTab);};
 },[]);
 function toggle(){
  const next:ThanayaTheme=theme==='dark'?'light':'dark';
  document.documentElement.dataset.thanayaTheme=next;
  try{window.localStorage.setItem(key,next);}catch{/* Browser may block local storage. */}
  setTheme(next);
  window.dispatchEvent(new Event(eventName));
 }
 return <button type="button" onClick={toggle} className="thanaya-theme-toggle"
   aria-label={theme==='dark'?'تفعيل المظهر الفاتح':'تفعيل المظهر الداكن'}
   title={theme==='dark'?'التبديل للمظهر الفاتح':'التبديل للمظهر الداكن'}>
   {theme==='dark'?<Sun size={18} aria-hidden="true"/>:<Moon size={18} aria-hidden="true"/>}
   {!compact&&<span className="hidden min-[440px]:inline">{theme==='dark'?'فاتح':'داكن'}</span>}
 </button>;
}
