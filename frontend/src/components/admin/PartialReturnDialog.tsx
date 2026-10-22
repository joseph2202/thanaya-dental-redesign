"use client";
import {useEffect,useMemo,useState} from 'react';
import SiteActionDialog from '@/components/ui/SiteActionDialog';
import {ordersAPI} from '@/lib/api';

export type ReturnableOrder={
  id:string;customerName:string;status:string;
  items:{id:string;productName?:string|null;product?:{name:string};quantity:number;price:number;
    returnLines?:{quantity:number;lotId?:string|null;disposition?:string}[];
    lotAllocations?:{lotId:string;quantity:number;lot?:{code:string;expiryDate:string}}[]}[];
};
type Props={order:ReturnableOrder|null;onClose:()=>void;onComplete:(message:string)=>void};
type ReturnChoice={orderItemId:string;quantity:number;quarantinedQuantity?:number;
  lots?:{lotId:string;quantity:number;quarantinedQuantity?:number}[]};
const countReturned=(item:ReturnableOrder['items'][number])=>
  (item.returnLines||[]).reduce((sum,line)=>sum+line.quantity,0);
const keyFor=(itemId:string,lotId?:string)=>lotId?itemId+':'+lotId:itemId;
const nonnegative=(raw:string)=>/^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw))&&Number(raw)>=0;

export default function PartialReturnDialog({order,onClose,onComplete}:Props){
  const [quantities,setQuantities]=useState<Record<string,string>>({});
  const [quarantined,setQuarantined]=useState<Record<string,string>>({});
  const [reason,setReason]=useState('');
  const [requestId,setRequestId]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(order){
      setQuantities({});setQuarantined({});setReason('');setError('');
      setRequestId(crypto.randomUUID());
    }
  },[order?.id]);

  const chosen=useMemo<ReturnChoice[]>(()=>order?.items.flatMap<ReturnChoice>(item=>{
    if(item.lotAllocations?.length){
      const lots=item.lotAllocations.flatMap(lot=>{
        const key=keyFor(item.id,lot.lotId);
        const n=Number(quantities[key]||0);
        const damaged=Number(quarantined[key]||0);
        return Number.isSafeInteger(n)&&n>0&&Number.isSafeInteger(damaged)&&damaged>=0&&damaged<=n
          ?[{lotId:lot.lotId,quantity:n,...(damaged?{quarantinedQuantity:damaged}:{})}]:[];
      });
      const quantity=lots.reduce((sum,lot)=>sum+lot.quantity,0);
      return quantity>0?[{orderItemId:item.id,quantity,lots}]:[];
    }
    const n=Number(quantities[item.id]||0);
    const damaged=Number(quarantined[item.id]||0);
    return Number.isSafeInteger(n)&&n>0&&Number.isSafeInteger(damaged)&&damaged>=0&&damaged<=n
      ?[{orderItemId:item.id,quantity:n,...(damaged?{quarantinedQuantity:damaged}:{})}]:[];
  })||[],[order,quantities,quarantined]);

  const valid=!!order&&reason.trim().length>=3&&reason.trim().length<=250&&
    chosen.length>0&&order.items.every(item=>{
      if(item.lotAllocations?.length){
        return item.lotAllocations.every(lot=>{
          const key=keyFor(item.id,lot.lotId);
          const total=quantities[key]??'0';
          const damaged=quarantined[key]??'0';
          const used=(item.returnLines||[]).filter(line=>line.lotId===lot.lotId)
            .reduce((sum,line)=>sum+line.quantity,0);
          return nonnegative(total)&&nonnegative(damaged)&&
            Number(total)<=lot.quantity-used&&Number(damaged)<=Number(total);
        });
      }
      const total=quantities[item.id]??'0';
      const damaged=quarantined[item.id]??'0';
      return nonnegative(total)&&nonnegative(damaged)&&
        Number(total)<=item.quantity-countReturned(item)&&Number(damaged)<=Number(total);
    });

  const totalReturned=chosen.reduce((sum,line)=>sum+line.quantity,0);
  const totalDamaged=chosen.reduce((sum,line)=>
    sum+(line.lots?.length?line.lots.reduce((s,lot)=>s+(lot.quarantinedQuantity||0),0):
      (line.quarantinedQuantity||0)),0);

  async function submit(){
    if(!valid||!order||!requestId||busy)return;
    setBusy(true);setError('');
    try{
      const result=await ordersAPI.receiveReturn(order.id,{
        requestId,reason:reason.trim(),items:chosen
      });
      onComplete(result.alreadyProcessed?'هذا المرتجع مسجّل مسبقاً؛ لم تُضاف أي كمية ثانية.':
        `تم تسجيل ${totalReturned} قطعة، منها ${totalDamaged} محجوزة وغير قابلة للبيع. استرداد المبالغ يحتاج تسوية مالية منفصلة.`);
    }catch(e){
      setError(e instanceof Error?e.message:'تعذر تسجيل المرتجع؛ يمكنك المحاولة مجدداً بنفس العملية.');
    }finally{setBusy(false);}
  }

  function quantityFields(key:string,max:number){
    const returned=Number(quantities[key]??'0');
    const damaged=Number(quarantined[key]??'0');
    return <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-bold text-[#375a68]">
        الكمية المستلمة
        <input type="number" min={0} max={max} step={1} inputMode="numeric"
          value={quantities[key]??'0'} disabled={busy||max===0}
          onChange={e=>{setQuantities(current=>({...current,[key]:e.target.value}));setError('');}}
          className="mt-1 block min-h-11 w-full rounded-lg border border-[#c2dce6] bg-white px-3 py-2 text-base"/>
      </label>
      <label className="block text-xs font-bold text-red-800">
        منها تالف / غير صالح للبيع
        <input type="number" min={0} max={Math.max(0,returned)} step={1} inputMode="numeric"
          value={quarantined[key]??'0'} disabled={busy||max===0}
          onChange={e=>{setQuarantined(current=>({...current,[key]:e.target.value}));setError('');}}
          className="mt-1 block min-h-11 w-full rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-base"/>
      </label>
      {nonnegative(quantities[key]??'0')&&nonnegative(quarantined[key]??'0')&&damaged<=returned&&
        <p className="text-xs font-bold text-emerald-800 sm:col-span-2">
          {returned-damaged} قطعة سليمة ترجع للمخزون · {damaged} قطعة تبقى محجوزة
        </p>}
    </div>;
  }

  return <SiteActionDialog
    open={order!==null}
    title="استلام المرتجع وفرز حالته"
    description="حدد كل القطع المستلمة، وبعدها كم منها تالف أو غير صالح للبيع. التالف يُسجل في سجل الحجر ولا يدخل للمخزون المتاح."
    confirmLabel="تأكيد الاستلام والفرز"
    onConfirm={()=>void submit()}
    onClose={()=>{if(!busy)onClose();}}
    busy={busy}
    error={error}
    confirmDisabled={!valid||!requestId}
  >
    {order&&<div className="space-y-3">
      <p className="rounded-xl bg-[#f0f9fc] p-3 text-sm font-bold text-[#285367]">
        طلب {order.customerName} — سجل الكميات التي استلمتها فعلياً
      </p>
      {order.items.map(item=>{
        const returned=countReturned(item);
        const max=Math.max(0,item.quantity-returned);
        return <div key={item.id} className="rounded-xl border border-[#d4e7ef] bg-white p-3">
          <p className="break-words text-sm font-black text-[#233943]">
            {item.productName||item.product?.name||'منتج من الطلب'}
          </p>
          <p className="mt-1 text-xs text-[#557683]">
            المشتراة: {item.quantity} · المستلمة سابقاً: {returned} · الباقية: {max}
          </p>
          {item.lotAllocations?.length?<div className="mt-3 space-y-3">
            {item.lotAllocations.map(lot=>{
              const already=(item.returnLines||[]).filter(line=>line.lotId===lot.lotId)
                .reduce((sum,line)=>sum+line.quantity,0);
              const available=Math.max(0,lot.quantity-already);
              return <div key={lot.lotId} className="rounded-xl border border-[#d7e7ed] bg-[#f7fcfe] p-3">
                <p className="text-xs font-black text-[#2c7288]">
                  التشغيلة <b dir="ltr">{lot.lot?.code||lot.lotId}</b> · الباقي للإرجاع {available}
                </p>
                {quantityFields(keyFor(item.id,lot.lotId),available)}
              </div>;
            })}
          </div>:quantityFields(keyFor(item.id),max)}
        </div>;
      })}
      <label className="block text-sm font-black text-[#345968]">
        سبب المرتجع وحالة القطع
        <textarea rows={3} maxLength={250} value={reason} disabled={busy}
          onChange={e=>setReason(e.target.value)}
          placeholder="مثال: استلام 3 قطع، واحدة مكسورة وتم حجزها وعدم إرجاعها للبيع"
          className="mt-2 w-full resize-y rounded-xl border border-[#c2dce6] p-3 text-sm"/>
      </label>
      <div className="rounded-xl border border-[#c2e0eb] bg-[#f1faff] p-3 text-xs leading-6">
        <p className="font-black text-[#245a73]">ملخص قبل التأكيد</p>
        <p>المستلم: {totalReturned} · السليم: {totalReturned-totalDamaged} · المحجوز: {totalDamaged}</p>
        <p className="mt-1 font-bold text-amber-900">هذا إثبات استلام بضاعة فقط، وليس إثبات رد أموال أو إصدار رصيد دائن.</p>
      </div>
    </div>}
  </SiteActionDialog>;
}
