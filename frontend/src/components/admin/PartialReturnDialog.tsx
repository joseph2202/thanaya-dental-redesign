"use client";
import {useEffect,useMemo,useState} from 'react';
import SiteActionDialog from '@/components/ui/SiteActionDialog';
import {ordersAPI} from '@/lib/api';

export type ReturnableOrder={
  id:string;customerName:string;status:string;
  items:{id:string;productName?:string|null;product?:{name:string};quantity:number;price:number;returnLines?:{quantity:number;lotId?:string|null}[];lotAllocations?:{lotId:string;quantity:number;lot?:{code:string;expiryDate:string}}[]}[];
};
type Props={order:ReturnableOrder|null;onClose:()=>void;onComplete:(message:string)=>void};
const countReturned=(item:ReturnableOrder['items'][number])=>(item.returnLines||[]).reduce((sum,line)=>sum+line.quantity,0);

export default function PartialReturnDialog({order,onClose,onComplete}:Props){
  const [quantities,setQuantities]=useState<Record<string,string>>({});
  const [reason,setReason]=useState('');
  const [requestId,setRequestId]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(order){setQuantities({});setReason('');setError('');setRequestId(crypto.randomUUID());}
  },[order?.id]);

  const lotKey=(itemId:string,lotId:string)=>itemId+':'+lotId;
  const chosen=useMemo(()=>order?.items.flatMap(item=>{
    if(item.lotAllocations?.length){
      const lots=item.lotAllocations.flatMap(lot=>{
        const n=Number(quantities[lotKey(item.id,lot.lotId)]||0);
        return Number.isSafeInteger(n)&&n>0?[{lotId:lot.lotId,quantity:n}]:[];
      });
      const quantity=lots.reduce((sum,lot)=>sum+lot.quantity,0);
      return quantity>0?[{orderItemId:item.id,quantity,lots}]:[];
    }
    const quantity=Number(quantities[item.id]||0);
    return Number.isSafeInteger(quantity)&&quantity>0?[{orderItemId:item.id,quantity}]:[];
  })||[],[order,quantities]);
  const valid=!!order&&reason.trim().length>=3&&reason.trim().length<=250&&
    chosen.length>0&&order.items.every(item=>{
      if(item.lotAllocations?.length){
        return item.lotAllocations.every(lot=>{
          const raw=quantities[lotKey(item.id,lot.lotId)]||'0';
          const n=Number(raw);
          const already=(item.returnLines||[]).filter(line=>line.lotId===lot.lotId)
            .reduce((sum,line)=>sum+line.quantity,0);
          return /^\d+$/.test(raw)&&Number.isSafeInteger(n)&&n>=0&&n<=lot.quantity-already;
        });
      }
      const raw=quantities[item.id]||'0';
      const n=Number(raw);
      return /^\d+$/.test(raw)&&Number.isSafeInteger(n)&&n>=0&&n<=item.quantity-countReturned(item);
    });

  async function submit(){
    if(!valid||!order||!requestId||busy)return;
    setBusy(true);setError('');
    try{
      const result=await ordersAPI.receiveReturn(order.id,{requestId,reason:reason.trim(),items:chosen});
      // Close the committed action before any secondary order-list refresh.
      onComplete(result.alreadyProcessed?'هذا المرتجع مسجّل مسبقاً؛ ما انضافت أي كمية ثانية.':
        result.orderStatus==='returned'?'تم استلام كل الكميات المتبقية وتسجيل المرتجع.':'تم تسجيل المرتجع الجزئي وإعادة القطع إلى مخزونها الأصلي.');
    }catch(e){setError(e instanceof Error?e.message:'تعذر تسجيل المرتجع؛ يمكنك المحاولة مجدداً بنفس العملية.');}
    finally{setBusy(false);}
  }

  return <SiteActionDialog
    open={order!==null}
    title="استلام مرتجع جزئي"
    description="حدّد القطع التي استلمتها فعلياً بحالة مناسبة لإعادة المخزون، واكتب السبب. تسجيل البضاعة هنا لا يعني ردّ المبلغ للزبون."
    confirmLabel="تأكيد استلام القطع"
    onConfirm={()=>void submit()}
    onClose={()=>{if(!busy)onClose();}}
    busy={busy}
    error={error}
    confirmDisabled={!valid||!requestId}
  >
    {order&&<div className="space-y-3">
      <p className="rounded-xl bg-[#f0f9fc] p-3 text-sm font-bold text-[#285367]">
        طلب {order.customerName} · اختر الكميات الفعلية فقط
      </p>
      {order.items.map(item=>{
        const returned=countReturned(item);
        const max=Math.max(0,item.quantity-returned);
        return <div key={item.id} className="rounded-xl border border-[#d4e7ef] bg-white p-3">
          <p className="break-words text-sm font-black text-[#233943]">{item.productName||item.product?.name||'منتج من الطلب'}</p>
          <p className="mt-1 text-xs text-[#557683]">المشتراة: {item.quantity} · المرجعة سابقاً: {returned} · المتاحة للإرجاع: {max}</p>
          {item.lotAllocations?.length?<div className="mt-3 space-y-2">
            <p className="text-xs font-bold text-[#2c7288]">حدد من أي تشغيلة رجعت القطع فعلياً:</p>
            {item.lotAllocations.map(lot=>{
              const already=(item.returnLines||[]).filter(line=>line.lotId===lot.lotId)
                .reduce((sum,line)=>sum+line.quantity,0);
              const available=Math.max(0,lot.quantity-already);
              const key=lotKey(item.id,lot.lotId);
              return <label key={lot.lotId} className="block rounded-lg border border-[#d7e7ed] bg-[#f7fcfe] p-2 text-xs font-bold text-[#375a68]">
                <span className="block">التشغيلة <b dir="ltr">{lot.lot?.code||lot.lotId}</b> · متبقي للإرجاع {available}</span>
                <input type="number" min={0} max={available} step={1} inputMode="numeric"
                  value={quantities[key]??'0'} disabled={busy||available===0}
                  onChange={e=>{setQuantities(current=>({...current,[key]:e.target.value}));setError('');}}
                  className="mt-2 block w-full rounded-lg border border-[#c2dce6] bg-white px-3 py-2 text-base"/>
              </label>;
            })}
          </div>:<label className="mt-3 block text-sm font-bold text-[#375a68]">
            كمية هذا المرتجع
            <input type="number" min={0} max={max} step={1} inputMode="numeric"
              value={quantities[item.id]??'0'} disabled={busy||max===0}
              onChange={e=>{setQuantities(current=>({...current,[item.id]:e.target.value}));setError('');}}
              className="mt-1 block w-full rounded-lg border border-[#c2dce6] px-3 py-2 text-base" />
          </label> 
        </div>;
      })}
      <label className="block text-sm font-black text-[#345968]">سبب استلام المرتجع
        <textarea rows={3} maxLength={250} value={reason} disabled={busy}
          onChange={e=>setReason(e.target.value)}
          placeholder="مثال: رجعت قطعتان من أصل خمس بسبب اختلاف المقاس"
          className="mt-2 w-full resize-y rounded-xl border border-[#c2dce6] p-3 text-sm" />
      </label>
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
        تنبيه: هاي حركة مخزون فقط. لا تعتبر المبلغ مسترداً أو مدفوعاً، ولا تستخدمها للقطع التالفة أو غير الصالحة للبيع قبل وجود مسار حجر مخزني مستقل.
      </p>
      <p className="text-sm font-bold text-[#2a697e]">المحدد للاستلام: {chosen.reduce((sum,line)=>sum+line.quantity,0)} قطعة</p>
    </div>}
  </SiteActionDialog>;
}
