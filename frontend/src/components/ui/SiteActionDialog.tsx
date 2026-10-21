"use client";

import {useEffect,useId,useRef,type ReactNode} from 'react';
import {AlertTriangle,CheckCircle2,X} from 'lucide-react';

type Props={
  open:boolean;
  title:string;
  description:string;
  confirmLabel:string;
  onConfirm:()=>void;
  onClose:()=>void;
  busy?:boolean;
  error?:string;
  destructive?:boolean;
  confirmDisabled?:boolean;
  children?:ReactNode;
};

/** Reusable Thanaya-styled modal, replacing browser prompt/confirm/alert dialogs. */
export default function SiteActionDialog({
  open,title,description,confirmLabel,onConfirm,onClose,busy=false,error='',destructive=false,
  confirmDisabled=false,children
}:Props){
  const dialog=useRef<HTMLDialogElement>(null);
  const id=useId();
  useEffect(()=>{
    const element=dialog.current;
    if(!element)return;
    if(open&&!element.open)element.showModal();
    if(!open&&element.open)element.close();
  },[open]);
  return (
    <dialog
      ref={dialog}
      dir="rtl"
      aria-labelledby={id+'-title'}
      aria-describedby={id+'-description'}
      onClose={onClose}
      onCancel={event=>{if(busy)event.preventDefault();}}
      onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}
      className="fixed inset-0 z-[120] m-auto w-[calc(100%-2rem)] max-w-[500px] max-h-[min(90dvh,760px)] overflow-y-auto rounded-[28px] border border-[#b8e2ef] bg-white p-0 text-[#233943] shadow-[0_30px_100px_rgba(13,45,65,.35)] backdrop:bg-[#102c3d]/65 backdrop:backdrop-blur-[6px]"
    >
      <form onSubmit={event=>{event.preventDefault();if(!busy&&!confirmDisabled)onConfirm();}}>
        <div className="relative bg-[linear-gradient(125deg,#e7f8fd,#f7fcff)] px-5 pb-5 pt-6 sm:px-7">
          <button type="button" aria-label="إغلاق النافذة" onClick={onClose} disabled={busy}
            className="absolute left-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-[#c4e5ef] bg-white text-[#4c6877] transition hover:bg-[#dff3fa] disabled:opacity-50">
            <X size={18} aria-hidden="true"/>
          </button>
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-[#b4e0ec] bg-white text-[#038cb9]">
            {destructive?<AlertTriangle size={24} aria-hidden="true"/>:<CheckCircle2 size={24} aria-hidden="true"/>}
          </div>
          <h2 id={id+'-title'} className="text-xl font-black leading-8 text-[#213b49]">{title}</h2>
          <p id={id+'-description'} className="mt-2 text-sm leading-7 text-[#526e7b]">{description}</p>
        </div>
        <div className="space-y-4 px-5 py-5 sm:px-7">
          {children}
          {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onClose} disabled={busy}
              className="min-h-12 rounded-full border-2 border-[#35515e] bg-white px-3 text-sm font-black text-[#263f4c] transition hover:bg-[#edf5f8] disabled:opacity-50">إلغاء</button>
            <button type="submit" disabled={busy||confirmDisabled}
              className={`min-h-12 rounded-full border-2 px-3 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${destructive
                ? 'border-red-600 bg-red-600 shadow-[0_4px_0_#991b1b] hover:bg-red-700'
                : 'border-[#059bd0] bg-[#059bd0] shadow-[0_4px_0_#047ba8] hover:bg-[#008bbd]'}`}>
              {busy?'جاري التنفيذ...':confirmLabel}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
