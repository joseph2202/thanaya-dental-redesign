"use client";
import {useEffect,useRef,useState} from 'react';
import {FlaskConical,RefreshCw} from 'lucide-react';
import {useAuth} from '@/context/AuthContext';
import {paymentSandboxAPI,type SandboxPayment,type SandboxPaymentCatalog,type SandboxPaymentDetail} from '@/lib/api';
import {shortOrderCode} from '@/lib/orderPresentation';

const labels:Record<SandboxPayment['status'],string>={pending:'بانتظار الدفع',authorized:'مفوّض فقط؛ لم يدفع بعد',
 paid:'مدفوع تجريبياً',failed:'فشلت المحاولة',cancelled:'أُلغيت المحاولة',refunded:'استرداد تجريبي مسجّل'};
const sources:Record<string,string>={created:'إنشاء المحاولة',webhook:'إشعار موقّع',reconciliation:'استعلام ومطابقة'};
const money=(amount:number)=>amount.toLocaleString('en-US')+' د.ع';
const time=new Intl.DateTimeFormat('ar-IQ',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Baghdad'});

export default function PaymentSandboxPanel(){
 const {user}=useAuth();
 const [catalog,setCatalog]=useState<SandboxPaymentCatalog|null>(null),[detail,setDetail]=useState<SandboxPaymentDetail|null>(null);
 const [orderId,setOrderId]=useState(''),[refundAmount,setRefundAmount]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [revision,setRevision]=useState(0);
 const createKey=useRef<{orderId:string;key:string}|null>(null);
 const refundKey=useRef<{reference:string;amount:number;key:string}|null>(null);
 useEffect(()=>{
  if(user?.role!=='owner')return;
  const controller=new AbortController();
  setError('');
  void paymentSandboxAPI.status(controller.signal).then(async data=>{
   if(controller.signal.aborted)return;setCatalog(data);
   if(data.enabled){setOrderId(data.orders?.[0]?.id||'');
    const reference=data.intents?.[0]?.payment.reference;
    if(reference){const saved=await paymentSandboxAPI.get(reference);if(!controller.signal.aborted)setDetail(saved);}
   }
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'تعذر عرض محاكي الدفع');});
  return()=>controller.abort();
 },[user?.role,revision]);
 async function run(action:()=>Promise<SandboxPaymentDetail>,success:string){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{const saved=await action();setDetail(saved);setCatalog(await paymentSandboxAPI.status());setNotice(success);}
  catch(reason){setError(reason instanceof Error?reason.message:'تعذر إكمال التجربة');}
  finally{setBusy(false);}
 }
 function create(){
  if(!orderId)return;
  if(createKey.current?.orderId!==orderId)createKey.current={orderId,key:crypto.randomUUID()};
  const key=createKey.current.key;
  void run(()=>paymentSandboxAPI.create(orderId,key),'حُفظت المحاولة التجريبية؛ لم يُسجّل أي تحصيل حقيقي.');
 }
 function refund(){
  if(!detail)return;
  const amount=Number(refundAmount),reference=detail.payment.reference;
  if(!Number.isSafeInteger(amount)||amount<1){setError('اكتب مبلغ استرداد صحيحاً بالدينار');return;}
  if(refundKey.current?.reference!==reference||refundKey.current.amount!==amount)
   refundKey.current={reference,amount,key:crypto.randomUUID()};
  const key=refundKey.current.key;
  void run(async()=>{const saved=await paymentSandboxAPI.refund(reference,amount,key);setRefundAmount('');refundKey.current=null;return saved;},
   'حُفظ الاسترداد التجريبي؛ لا توجد حركة مالية حقيقية.');
 }
 if(user?.role!=='owner'||catalog?.enabled===false)return null;
 if(!catalog)return error?<div className="rounded-2xl border border-amber-500/30 p-4 text-sm" role="alert"><p>{error}</p>
  <button type="button" onClick={()=>setRevision(value=>value+1)} className="mt-2 font-bold underline">إعادة فحص توفر المحاكي</button></div>:null;
 const payment=detail?.payment,remaining=payment?payment.amountIqd-payment.refundedIqd:0;
 const canProgress=payment&&['pending','authorized'].includes(payment.status);
 return <section aria-label="محاكي الدفع" className="site-surface space-y-5 rounded-3xl border border-brand/30 p-4 sm:p-6" aria-busy={busy}>
  <header><div className="flex items-center gap-2 text-brand"><FlaskConical size={22}/><h2 className="text-xl font-black">محاكي الدفع — معاينة فقط</h2></div>
   <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-7">هذه تجربة معزولة بلا أموال أو بيانات بطاقة. حالة الدفع هنا لا تغيّر الطلب أو المخزون أو سجل التحصيل الحقيقي.</p></header>
  {error&&<p role="alert" className="break-words rounded-xl border border-red-500/30 p-3 text-sm">{error}</p>}
  {notice&&<p role="status" className="rounded-xl border border-brand/25 p-3 text-sm leading-7">{notice}</p>}
  <div className="flex flex-wrap items-end gap-3">
   <label className="min-w-0 flex-1 basis-full text-sm font-bold sm:basis-0">طلب المعاينة
    <select value={orderId} disabled={busy} onChange={event=>setOrderId(event.target.value)} className="site-input mt-2 w-full px-3 py-3">
     {!catalog.orders?.length&&<option value="">لا توجد طلبات في المعاينة؛ أنشئ طلباً تجريبياً أولاً</option>}
     {catalog.orders?.map(order=><option key={order.id} value={order.id}>#{shortOrderCode(order.id)} · {money(order.total)}</option>)}
    </select>
   </label>
   <button type="button" disabled={busy||!orderId} onClick={create} className="site-btn site-btn-primary">بدء محاولة تجريبية</button>
   <button type="button" disabled={busy} onClick={()=>{createKey.current=null;setDetail(null);setError('');setNotice('يمكنك بدء محاولة جديدة بمعرّف مستقل.');}} className="site-btn site-btn-outline">محاولة جديدة</button>
  </div>
  {!!catalog.intents?.length&&<label className="block text-sm font-bold">محاولة محفوظة
   <select value={payment?.reference||''} disabled={busy} onChange={event=>{const ref=event.target.value;if(ref)void run(()=>paymentSandboxAPI.get(ref),'تم تحميل المحاولة المحفوظة.');}}
    className="site-input mt-2 w-full px-3 py-3">
    <option value="">اختَر محاولة</option>{catalog.intents.map(({payment:item})=><option key={item.reference} value={item.reference}>
     #{shortOrderCode(item.orderId)} · {labels[item.status]} · {item.reference.slice(-8)}</option>)}
   </select>
  </label>}
  {payment&&<div className="space-y-4 rounded-2xl border border-brand/20 p-4">
   <p className="break-all text-xs" dir="ltr">{payment.reference}</p>
   <div className="grid gap-3 sm:grid-cols-3">
    <p className="text-sm">الحالة التجريبية المسجلة<output aria-label="حالة المحاولة التجريبية" className="mt-2 block font-black text-brand">{labels[payment.status]}</output></p>
    <p className="text-sm">مبلغ الطلب من السيرفر<strong className="mt-2 block font-black">{money(payment.amountIqd)}</strong></p>
    <p className="text-sm">المسترد التجريبي<output aria-label="مجموع الاسترداد التجريبي" className="mt-2 block font-black">{money(payment.refundedIqd)}</output></p>
   </div>
   <div className="flex flex-wrap gap-2">
    {canProgress&&<>
     {payment.status==='pending'&&<button type="button" disabled={busy} onClick={()=>void run(()=>paymentSandboxAPI.simulate(payment.reference,'authorized'),'حُفظ التفويض التجريبي؛ التفويض وحده ليس دفعاً.')} className="site-btn site-btn-outline site-btn-sm">محاكاة تفويض</button>}
     <button type="button" disabled={busy} onClick={()=>void run(()=>paymentSandboxAPI.simulate(payment.reference,'paid'),'وصل الإشعار الموقّع وحُفظ الدفع التجريبي فقط.')} className="site-btn site-btn-primary site-btn-sm">محاكاة دفع ناجح</button>
     <button type="button" disabled={busy} onClick={()=>void run(()=>paymentSandboxAPI.simulate(payment.reference,'paid',false),'تمت المحاكاة دون وصول الإشعار. استعلم لمطابقة الحالة.')} className="site-btn site-btn-outline site-btn-sm">محاكاة دفع بإشعار مفقود</button>
     <button type="button" disabled={busy} onClick={()=>void run(()=>paymentSandboxAPI.simulate(payment.reference,'failed'),'سُجل فشل التجربة؛ يمكن بدء محاولة جديدة.')} className="site-btn site-btn-outline site-btn-sm">محاكاة فشل</button>
     <button type="button" disabled={busy} onClick={()=>void run(()=>paymentSandboxAPI.simulate(payment.reference,'cancelled'),'أُلغيت المحاولة التجريبية فقط.')} className="site-btn site-btn-outline site-btn-sm">محاكاة إلغاء</button>
    </>}
    <button type="button" disabled={busy} onClick={()=>void run(()=>paymentSandboxAPI.reconcile(payment.reference),'تم الاستعلام ومطابقة الحالة مع المزود التجريبي.')} className="site-btn site-btn-outline site-btn-sm"><RefreshCw size={16}/>الاستعلام ومطابقة الحالة</button>
   </div>
   {['paid','refunded'].includes(payment.status)&&remaining>0&&<form onSubmit={event=>{event.preventDefault();refund();}} className="flex flex-wrap items-end gap-3 border-t border-brand/20 pt-4">
    <label className="min-w-0 flex-1 basis-full text-sm font-bold sm:basis-0">مبلغ الاسترداد التجريبي بالدينار
     <input type="number" min={1} max={remaining} step={1} inputMode="numeric" required value={refundAmount} disabled={busy}
      onChange={event=>setRefundAmount(event.target.value)} className="site-input mt-2 w-full px-3 py-3"/>
    </label><button type="submit" disabled={busy} className="site-btn site-btn-outline">تأكيد استرداد تجريبي</button>
    <p className="site-muted w-full text-xs">الحد المتبقي في هذه التجربة: {money(remaining)}</p>
   </form>}
   <div><h3 className="font-black">سجل التجربة</h3>
    <ol className="mt-3 space-y-3">{detail?.events.map(event=><li key={event.eventId} className="rounded-xl border border-brand/15 p-3 text-sm leading-7">
     <p className="font-bold">{sources[event.source]||event.source} · {labels[event.status]}</p>
     <p className="site-muted text-xs">{event.actorName?'بواسطة '+event.actorName+' · ':''}<time dateTime={event.occurredAt}>{time.format(new Date(event.occurredAt))}</time> — توقيت بغداد</p>
    </li>)}</ol>
   </div>
  </div>}
 </section>;
}
