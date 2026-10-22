"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import Link from 'next/link';
import {Printer,FileSpreadsheet,Copy,Phone} from 'lucide-react';
import {ordersAPI,exportsAPI} from '@/lib/api';
import SiteActionDialog from '@/components/ui/SiteActionDialog';
import PartialReturnDialog from '@/components/admin/PartialReturnDialog';
import {useAuth} from '@/context/AuthContext';
import {shortOrderCode} from '@/lib/orderPresentation';

type Line={id:string;quantity:number;price:number;productName?:string|null;product?:{name:string};returnLines?:{quantity:number;lotId?:string|null}[];lotAllocations?:{lotId:string;quantity:number;lot?:{code:string;expiryDate:string}}[]};
type ReturnEvent={id:string;createdAt:string;reason:string;lines:{orderItemId:string;quantity:number;lotId:string|null;disposition?:string}[]};
const returnedCount=(line:Line)=>(line.returnLines||[]).reduce((total,r)=>total+r.quantity,0);
type Order={id:string;customerName:string;customerPhone:string;customerAddress:string;customerCity:string;total:number;subtotal:number|null;shippingFee:number|null;couponCode:string|null;discountAmount:number|null;status:string;createdAt:string;items:Line[];returns?:ReturnEvent[]};
type Result={orders:Order[];total:number;page:number;pageSize:number;totalPages:number;statusCounts:Record<string,number>;matchingSearchTotal:number};
const statuses=[['all','الكل'],['pending','جديد'],['confirmed','مؤكد'],['shipped','بالطريق'],['delivered','مُسلّم'],['cancelled','ملغي'],['returned','مرتجع']] as const;
const transitions:Record<string,string[]>={pending:['confirmed','cancelled'],confirmed:['shipped','cancelled'],shipped:['delivered'],delivered:['returned'],cancelled:[],returned:[]};
const labels=Object.fromEntries(statuses);
const format=(n:number)=>n.toLocaleString('en-US')+' د.ع';
const colors:Record<string,string>={pending:'bg-amber-100 text-amber-800',confirmed:'bg-sky-100 text-sky-800',shipped:'bg-violet-100 text-violet-800',delivered:'bg-emerald-100 text-emerald-800',cancelled:'bg-red-100 text-red-800',returned:'bg-gray-200 text-gray-700'};

export default function AdminOrders(){
 const {user}=useAuth();
 const canReceiveReturns=user?.role==='owner'||user?.role==='admin';
 const [data,setData]=useState<Result|null>(null),[status,setStatus]=useState('all'),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState<string|null>(null);
 const [expanded,setExpanded]=useState<string|null>(null);
 const [exportBusy,setExportBusy]=useState(false);
 const [pendingChange,setPendingChange]=useState<{order:Order;next:string}|null>(null);
 const [returnOrder,setReturnOrder]=useState<Order|null>(null);
 const [changeError,setChangeError]=useState('');
 const requestSequence=useRef(0);
 const load=useCallback(async()=>{
  const sequence=++requestSequence.current;
  setLoading(true);setError('');
  try{
   const next=await ordersAPI.manage({page,status,search:query});
   if(sequence===requestSequence.current)setData(next);
  }catch(e){
   if(sequence===requestSequence.current)setError(e instanceof Error?e.message:'تعذر تحميل الطلبات');
  }finally{
   if(sequence===requestSequence.current)setLoading(false);
  }
 },[page,status,query]);
 useEffect(()=>{load()},[load]);
 function change(order:Order,next:string){setChangeError('');setPendingChange({order,next});}
 async function confirmChange(){
  if(!pendingChange||busy)return;
  const {order,next}=pendingChange;
  setBusy(order.id);setError('');setNotice('');setChangeError('');
  try{
   await ordersAPI.updateStatus(order.id,next);
   setPendingChange(null);
   setNotice('تم تحديث حالة الطلب '+order.id);
   await load();
  }catch(e){setChangeError(e instanceof Error?e.message:'تعذر تغيير الحالة. يرجى تحديث الصفحة.')}
  finally{setBusy(null)}
 }
 function submitSearch(e:React.FormEvent){e.preventDefault();setPage(1);setQuery(search.trim());}
 async function copyOrderId(id:string){
  try{await navigator.clipboard.writeText(id);setNotice('تم نسخ رقم الطلب '+shortOrderCode(id));}
  catch{setError('تعذر النسخ تلقائياً. افتح تفاصيل الطلب وانسخه يدوياً.');}
 }
 return <AdminLayout>
  <PartialReturnDialog order={returnOrder} onClose={()=>setReturnOrder(null)}
    onComplete={message=>{
      setReturnOrder(null);setNotice(message);
      void load();
    }}/>
  <SiteActionDialog
   open={pendingChange!==null}
   title={pendingChange?.next==='returned'?'تأكيد استلام المرتجع':pendingChange?.next==='cancelled'?'تأكيد إلغاء الطلب':'تأكيد تغيير حالة الطلب'}
   description={pendingChange?.next==='returned'
    ? 'هل تم استلام كامل المنتجات فعلياً؟ تأكيد الحالة يعيد كل الكميات إلى المخزون. لا تستخدم هذا الإجراء لمرتجع جزئي.'
    : pendingChange?.next==='cancelled'
      ? 'سوف يُلغى الطلب وتُعاد كل القطع للمخزون تلقائياً. تأكد من قرار الإلغاء قبل المتابعة.'
      : 'ستتغيّر حالة الطلب إلى «'+(labels[pendingChange?.next||'']||'')+'» ويتم تسجيل التحديث وإخطار العميل.'}
   confirmLabel={pendingChange?.next==='returned'?'تأكيد استلام كل المرتجع':pendingChange?.next==='cancelled'?'إلغاء الطلب وإرجاع المخزون':'تأكيد تغيير الحالة'}
   onConfirm={()=>void confirmChange()}
   onClose={()=>{if(!busy){setPendingChange(null);setChangeError('')}}}
   busy={Boolean(busy)}
   error={changeError}
   destructive={pendingChange?.next==='returned'||pendingChange?.next==='cancelled'}
  >
   {pendingChange&&<p className="break-all rounded-xl bg-[#f0f9fc] p-3 text-sm font-bold">رقم الطلب: <span dir="ltr">{pendingChange.order.id}</span></p>}
  </SiteActionDialog>
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
   <div><h1 className="text-3xl font-black text-ink">إدارة الطلبات</h1><p className="mt-2 text-sm text-neutral-600">بحث سريع، متابعة الحالات، وتفاصيل فاتورة محفوظة من السيرفر.</p></div>
   <div className="flex flex-wrap gap-2">
     <button type="button" disabled={exportBusy} onClick={async()=>{setExportBusy(true);setError('');try{await exportsAPI.download('orders','all')}catch(e){setError(e instanceof Error?e.message:'تعذّر التصدير')}finally{setExportBusy(false)}}} className="site-btn site-btn-outline site-btn-sm"><FileSpreadsheet size={16}/>{exportBusy?'جاري تجهيز Excel...':'تصدير كل الطلبات Excel'}</button>
     <button onClick={()=>load()} disabled={loading} className="site-btn site-btn-outline site-btn-sm">تحديث الطلبات</button>
   </div>
  </div>
  {error&&<p className="mb-4 rounded-xl bg-red-50 p-4 text-red-700 font-bold" role="alert">{error}</p>}
  {notice&&<p className="mb-4 rounded-xl bg-green-50 p-4 text-green-700 font-bold" role="status">{notice}</p>}
  <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
   {(['pending','confirmed','shipped','delivered'] as const).map(x=><button key={x} onClick={()=>{setStatus(x);setPage(1)}} className={`rounded-2xl border p-4 text-right transition ${status===x?'border-brand bg-[#e9f8fd] shadow-sm':'border-brand/20 bg-white hover:border-brand'}`} aria-pressed={status===x}>
   <span className="text-sm text-neutral-600">{labels[x]}</span><strong className="mt-2 block text-3xl text-brand">{data?.statusCounts[x]??'—'}</strong></button>)}
  </div>
  <form onSubmit={submitSearch} role="search" aria-label="البحث في الطلبات" className="mb-5 flex flex-wrap gap-2">
   <input type="search" aria-label="البحث عن طلب بالرقم أو اسم الزبون أو الهاتف" value={search} onChange={e=>setSearch(e.target.value)} placeholder="رقم الطلب، اسم الزبون، الهاتف، المحافظة..." maxLength={100} className="min-w-[180px] flex-1 rounded-xl border border-brand/25 bg-white px-4 py-3"/>
   <button type="submit" className="site-btn site-btn-primary site-btn-sm">بحث</button>
   {(query||search)&&<button type="button" className="site-btn site-btn-outline site-btn-sm" onClick={()=>{setSearch('');setQuery('');setPage(1)}}>مسح</button>}
  </form>
  <div className="mb-5 flex flex-wrap gap-2">
   {statuses.map(([v,name])=><button key={v} type="button" onClick={()=>{setStatus(v);setPage(1)}} aria-pressed={status===v} className={`rounded-full border px-4 py-2 text-xs font-bold ${status===v?'bg-brand text-white border-brand':'bg-white text-ink border-brand/20'}`}>
    {name} ({v==='all'?data?.matchingSearchTotal??'—':data?.statusCounts[v]??'—'})
   </button>)}
  </div>
  <p className="mb-4 text-xs text-neutral-500">{loading?'جاري تحميل الطلبات...':`نتائج البحث: ${data?.total??0} طلب`}</p>
  {!loading&&data?.orders.length===0&&<div className="rounded-2xl bg-white p-10 text-center">ماكو طلبات مطابقة للبحث.</div>}
  <div className="space-y-4">
  {!loading&&data?.orders.map(o=>{
   const open=expanded===o.id;
   const productsSum=o.items.reduce((sum,item)=>sum+item.price*item.quantity,0);
   const hasReturnable=o.status==='delivered'&&o.items.some(line=>line.quantity>returnedCount(line));
   // Historical returned orders from the old status shortcut may lack a
   // receipt ledger. A returned status does not imply a refund or inspection.
   const missingReturnLedger=o.status==='returned'&&!(o.returns?.length);
   return <article key={o.id} aria-busy={busy===o.id} className="signature-order-card">
    <div className="grid items-start gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.95fr)_minmax(175px,.55fr)] lg:gap-5">
     <div className="min-w-0">
      <p className="text-[11px] font-semibold text-[#8399a3]">{new Date(o.createdAt).toLocaleString('ar-IQ')}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
       <h2 title={o.id} className="font-black text-[#0b8fb8]" dir="ltr">#{shortOrderCode(o.id)}</h2>
       <button type="button" onClick={()=>void copyOrderId(o.id)} aria-label={`نسخ رقم الطلب الكامل ${o.id}`} title="نسخ الرقم الكامل"
        className="grid h-9 w-9 place-items-center rounded-full border border-[#c8e5ef] text-[#177da0] hover:bg-[#e9f8fd]"><Copy size={15}/></button>
      </div>
      <p className="mt-2 break-words text-[15px] font-black text-[#244855]">{o.customerName}
       <span className="mr-2 text-xs font-semibold text-[#8aa0a9]">· {o.customerCity}</span>
      </p>
      <a href={`tel:${o.customerPhone.replace(/[^+0-9]/g,'')}`} className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-[#c7e4ef] bg-[#f1faff] px-3 text-xs font-black text-[#177da0]">
       <Phone size={14} aria-hidden="true"/> اتصال بالزبون <span dir="ltr">{o.customerPhone}</span>
      </a>
     </div>
     <div className="min-w-0 rounded-2xl border border-[#d9eaf0] bg-[#f5fafc] p-3.5 lg:min-h-[112px]">
      <p className="mb-2 text-[11px] font-black text-[#5f8392]">المنتجات المشتراة · {o.items.length} نوع</p>
      {o.items.slice(0,2).map(item=><p key={item.id} className="mt-1 break-words text-sm font-semibold leading-6 text-[#2e5263]">
       {item.productName||item.product?.name||'منتج من الطلب'} <span className="whitespace-nowrap font-black">× {item.quantity}</span>
       {returnedCount(item)>0&&<span className="mr-2 text-xs font-bold text-amber-700">(مرجع {returnedCount(item)})</span>}
      </p>)}
      {o.items.length>2&&<p className="mt-1 text-xs font-bold text-[#70909d]">+ {o.items.length-2} أصناف إضافية داخل الفاتورة</p>}
     </div>
     <div className="flex min-w-0 flex-row items-center justify-between gap-3 border-t border-[#edf2f5] pt-3 text-right lg:flex-col lg:items-end lg:justify-start lg:border-0 lg:pt-0">
      <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-black ${colors[o.status]||'bg-gray-100'}`}>{labels[o.status]||o.status}</span>
      <p className="text-xl font-black tabular-nums text-[#203f4e] lg:mt-2 lg:text-2xl" dir="rtl">{format(o.total)}</p>
     </div>
    </div>
    {missingReturnLedger&&<div className="mx-4 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 sm:mx-5">
      مرتجع قديم بدون سجل فرز؛ حالة الطلب لا تثبت الاستلام التفصيلي أو رد المبلغ.
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eaf1f4] bg-[#fbfdfe] px-4 py-3 sm:px-5">
     <button type="button" aria-expanded={open} onClick={()=>setExpanded(open?null:o.id)} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-black text-[#1686ac] hover:bg-[#eef9fc]">{open?'إخفاء الفاتورة ↑':'الفاتورة وتفاصيل الطلب ↓'}</button>
     <div className="flex flex-wrap gap-2">
      {canReceiveReturns&&hasReturnable&&<button type="button" disabled={busy!==null} onClick={()=>setReturnOrder(o)}
       className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-black text-amber-900 hover:bg-amber-100 disabled:opacity-50">استلام وفرز مرتجع</button>}
      {(transitions[o.status]||[]).filter(next=>next!=='returned').map(next=><button key={next} type="button" disabled={busy!==null} onClick={()=>change(o,next)}
       className={`rounded-xl border px-3 py-2.5 text-xs font-black transition disabled:opacity-50 ${next==='cancelled'?'border-red-200 bg-red-50 text-red-700 hover:bg-red-100':'border-[#bce1ed] bg-white text-[#167b9f] hover:bg-[#e7f7fc]'}`}>
       {busy===o.id?'جاري التحديث...':'تغيير إلى '+labels[next]}
      </button>)}
     </div>
    </div>
    {open&&<div className="grid gap-5 border-t border-brand/10 bg-paper2/30 p-5 md:grid-cols-2">
     {missingReturnLedger&&<div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-7 text-amber-950 md:col-span-2">
      <strong className="block">هذا مرتجع من السجلات القديمة.</strong>
      حالة الطلب «مرتجع»، لكن لا يوجد سجل استلام وفرز مفصّل يثبت الكميات التي عادت للمخزون أو حالتها.
      كذلك حالة الطلب وحدها لا تثبت رد أي مبلغ للزبون. لا تسجّل مرتجعاً جديداً على هذا الطلب لتعويض نقص السجل القديم.
     </div>}
     <section><h3 className="mb-3 font-black">معلومات التوصيل</h3><p className="font-bold">{o.customerName}</p><a className="block text-brand underline" href={`tel:${o.customerPhone}`} dir="ltr">{o.customerPhone}</a>
      <p className="mt-2 text-sm">{o.customerCity}، {o.customerAddress}</p><p className="mt-2 text-xs text-neutral-500">الدفع عند الاستلام</p></section>
     <section><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-black">تفاصيل المبالغ</h3><Link href={"/order/invoice?id="+encodeURIComponent(o.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-white px-3 py-2 text-xs font-black text-brand hover:bg-[#eaf9fc]"><Printer size={15}/> طباعة / حفظ PDF</Link></div>
      {o.items.map(i=><div key={i.id} className="mb-2 flex justify-between gap-3 text-sm">
        <span className="break-words">{i.productName||i.product?.name||'منتج من الطلب'} × {i.quantity}
          {returnedCount(i)>0&&<small className="mr-1 text-amber-700">({returnedCount(i)} مرجع)</small>}
        </span>
        <strong className="whitespace-nowrap">{format(i.price*i.quantity)}</strong>
      </div>)}
      <div className="mt-3 space-y-2 border-t border-brand/20 pt-3 text-sm">
       <div className="flex justify-between"><span>المنتجات</span><strong>{format(o.subtotal??productsSum)}</strong></div>
       {o.discountAmount!=null&&<div className="flex justify-between text-green-700"><span>خصم ({o.couponCode})</span><strong>-{format(o.discountAmount)}</strong></div>}
       <div className="flex justify-between"><span>التوصيل</span><strong>{o.shippingFee===null?'يحدد لاحقاً':format(o.shippingFee)}</strong></div>
       <div className="flex justify-between border-t border-brand/20 pt-2 text-lg font-black"><span>الإجمالي المحفوظ</span><strong>{format(o.total)}</strong></div>
      </div>
      {(o.returns?.length??0)>0&&<div className="mt-4 border-t border-brand/20 pt-3">
        <h4 className="mb-2 font-black">سجل استلام وفرز المرتجعات</h4>
        {o.returns?.map(entry=><div key={entry.id} className="mb-2 rounded-xl border border-[#d4e7ef] bg-white p-3 text-xs">
          <p className="font-bold text-[#345968]">{new Date(entry.createdAt).toLocaleString('ar-IQ')} — {entry.reason}</p>
          {Array.from(entry.lines.reduce((totals,line)=>{
            totals.set(line.orderItemId,(totals.get(line.orderItemId)||0)+line.quantity);return totals;
          },new Map<string,number>())).map(([itemId,qty])=><p key={itemId} className="mt-1">
            {o.items.find(i=>i.id===itemId)?.productName||o.items.find(i=>i.id===itemId)?.product?.name||'منتج'} × {qty}
          </p>)}
          <p className="mt-2 font-black text-[#3d6575]">
            السليم المعاد للمخزون: {entry.lines.filter(line=>line.disposition!=='quarantined').reduce((sum,line)=>sum+line.quantity,0)}
            {' · '}التالف المحجوز: {entry.lines.filter(line=>line.disposition==='quarantined').reduce((sum,line)=>sum+line.quantity,0)}
          </p>
          {entry.lines.some(line=>line.disposition==='quarantined')&&
            <p className="mt-1 text-red-800">التالف مسجّل في الحجر فقط، وما يزيد الكمية المتاحة للبيع.</p>}
          <p className="mt-1 text-amber-800">الاستلام والحجر لا يثبتان ردّ المبلغ للزبون.</p>
        </div>)}
      </div>}
      </section>
    </div>}
   </article>
  })}
  </div>
  {!!data&&data.totalPages>1&&<div className="mt-6 flex items-center justify-center gap-4">
   <button disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)} className="site-btn site-btn-outline site-btn-sm">السابق</button>
   <span className="text-sm font-bold">صفحة {data.page} من {data.totalPages}</span>
   <button disabled={loading||page>=data.totalPages} onClick={()=>setPage(p=>p+1)} className="site-btn site-btn-outline site-btn-sm">التالي</button>
  </div>}
 </AdminLayout>
}