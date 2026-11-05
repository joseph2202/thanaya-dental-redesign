"use client";

import {useEffect,useState} from 'react';
import {History,RefreshCw} from 'lucide-react';
import {ordersAPI,type OrderStatusHistory} from '@/lib/api';
import {orderStatusLabels} from '@/lib/orderPresentation';

const roles:Record<string,string>={owner:'مالك المتجر',admin:'الإدارة',sales:'المبيعات',inventory:'المخزون',customer:'الزبون'};
const time=new Intl.DateTimeFormat('ar-IQ',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Baghdad'});

export default function OrderStatusTimeline({orderId,currentStatus}:{orderId:string;currentStatus:string}){
  const [data,setData]=useState<OrderStatusHistory|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError('');setData(null);
    void ordersAPI.history(orderId,controller.signal).then(result=>{
      if(!controller.signal.aborted)setData(result);
    }).catch(reason=>{
      if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'تعذّر عرض سجل الحالة');
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[orderId,currentStatus,revision]);

  return <section aria-label="سجل حالة الطلب" aria-busy={loading}
    className="rounded-2xl border border-brand/20 bg-paper p-4 md:col-span-2">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="flex items-center gap-2 font-black"><History size={18} className="text-brand"/>سجل حالة الطلب</h3>
        <p className="site-muted mt-1 text-xs leading-6">الإجراءات الموثقة، مع المنفّذ والتوقيت بتوقيت بغداد.</p></div>
      <button type="button" disabled={loading} onClick={()=>setRevision(value=>value+1)}
        className="site-btn site-btn-outline site-btn-sm" aria-label="تحديث سجل حالة الطلب"><RefreshCw size={15}/></button>
    </div>
    {loading&&<p role="status" className="site-muted mt-4 text-sm">جاري تحميل السجل...</p>}
    {error&&<div className="mt-4 rounded-xl border border-red-300 p-3 text-sm" role="alert">
      <p>{error}</p><button type="button" onClick={()=>setRevision(value=>value+1)} className="mt-2 font-bold text-brand underline">إعادة المحاولة</button>
    </div>}
    {!loading&&data&&!data.completeFromCreation&&<p role="note" className="mt-4 rounded-xl border border-amber-400/40 p-3 text-xs leading-6">
      لا يوجد حدث إنشاء موثّق لهذا الطلب؛ يظهر أدناه ما حُفظ من إجراءات فقط، دون افتراض تاريخ سابق.
    </p>}
    {!loading&&data?.events.length===0&&<p className="site-muted mt-4 text-sm">لا توجد تغييرات حالة موثقة لهذا الطلب بعد.</p>}
    {!!data?.events.length&&<ol className="mt-5 space-y-4 border-s border-brand/25 ps-4">
      {data.events.map(event=><li key={event.id} className="relative rounded-xl border border-brand/15 p-3">
        <span aria-hidden="true" className="absolute -start-[22px] top-5 h-2.5 w-2.5 rounded-full bg-brand"/>
        <p className="text-sm font-black">{event.kind==='placed'?'تم إنشاء الطلب':event.kind==='full_return'?'تم استلام كامل المرتجع':'تم تغيير حالة الطلب'}</p>
        <p className="mt-1 text-sm">{event.fromStatus?'من «'+(orderStatusLabels[event.fromStatus]||event.fromStatus)+'» إلى ':''}
          «{orderStatusLabels[event.toStatus]||event.toStatus}»</p>
        <p className="site-muted mt-2 break-words text-xs">بواسطة {event.actorName} · {roles[event.actorRole]||event.actorRole}</p>
        <time dateTime={event.createdAt} className="site-muted mt-1 block text-xs">{time.format(new Date(event.createdAt))}</time>
        {event.reason&&<p className="mt-2 break-words rounded-lg border border-brand/10 p-2 text-sm leading-7">{event.reason}</p>}
      </li>)}
    </ol>}
    {data?.hasMore&&<p className="site-muted mt-3 text-xs">تظهر أحدث 100 حركة موثقة.</p>}
  </section>;
}
