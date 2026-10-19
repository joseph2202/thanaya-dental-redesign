"use client";
import {useCallback,useEffect,useState} from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import {ordersAPI} from '@/lib/api';

type Line={id:string;quantity:number;price:number;product?:{name:string}};
type Order={id:string;customerName:string;customerPhone:string;customerAddress:string;customerCity:string;total:number;subtotal:number|null;shippingFee:number|null;couponCode:string|null;discountAmount:number|null;status:string;createdAt:string;items:Line[]};
type Result={orders:Order[];total:number;page:number;pageSize:number;totalPages:number;statusCounts:Record<string,number>;matchingSearchTotal:number};
const statuses=[['all','الكل'],['pending','جديد'],['confirmed','مؤكد'],['shipped','بالطريق'],['delivered','مُسلّم'],['cancelled','ملغي'],['returned','مرتجع']] as const;
const transitions:Record<string,string[]>={pending:['confirmed','cancelled'],confirmed:['shipped','cancelled'],shipped:['delivered'],delivered:['returned'],cancelled:[],returned:[]};
const labels=Object.fromEntries(statuses);
const format=(n:number)=>n.toLocaleString('en-US')+' د.ع';
const colors:Record<string,string>={pending:'bg-amber-100 text-amber-800',confirmed:'bg-sky-100 text-sky-800',shipped:'bg-violet-100 text-violet-800',delivered:'bg-emerald-100 text-emerald-800',cancelled:'bg-red-100 text-red-800',returned:'bg-gray-200 text-gray-700'};

export default function AdminOrders(){
 const [data,setData]=useState<Result|null>(null),[status,setStatus]=useState('all'),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState<string|null>(null);
 const [expanded,setExpanded]=useState<string|null>(null);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{setData(await ordersAPI.manage({page,status,search:query}))}
  catch(e){setError(e instanceof Error?e.message:'تعذر تحميل الطلبات')}
  finally{setLoading(false)}
 },[page,status,query]);
 useEffect(()=>{load()},[load]);
 async function change(order:Order,next:string){
  const phrase=next==='cancelled'?'إلغاء الطلب وإرجاع بضاعته للمخزون؟':next==='returned'?'هل استلمت المنتجات المرتجعة فعلياً؟ سترجع للمخزون.':`تغيير حالة الطلب إلى «${labels[next]}»؟`;
  if(!window.confirm(phrase))return;
  setBusy(order.id);setError('');setNotice('');
  try{await ordersAPI.updateStatus(order.id,next);setNotice('تم تحديث حالة الطلب '+order.id);await load();}
  catch(e){setError(e instanceof Error?e.message:'تعذر تغيير الحالة. يرجى تحديث الصفحة.')}
  finally{setBusy(null)}
 }
 function submitSearch(e:React.FormEvent){e.preventDefault();setPage(1);setQuery(search.trim());}
 return <AdminLayout>
  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
   <div><h1 className="text-3xl font-black text-ink">إدارة الطلبات</h1><p className="mt-2 text-sm text-neutral-600">بحث سريع، متابعة الحالات، وتفاصيل فاتورة محفوظة من السيرفر.</p></div>
   <button onClick={()=>load()} disabled={loading} className="site-btn site-btn-outline site-btn-sm">تحديث الطلبات</button>
  </div>
  {error&&<p className="mb-4 rounded-xl bg-red-50 p-4 text-red-700 font-bold" role="alert">{error}</p>}
  {notice&&<p className="mb-4 rounded-xl bg-green-50 p-4 text-green-700 font-bold" role="status">{notice}</p>}
  <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
   {(['pending','confirmed','shipped','delivered'] as const).map(x=><button key={x} onClick={()=>{setStatus(x);setPage(1)}} className="rounded-2xl border border-brand/20 bg-white p-4 text-right hover:border-brand">
   <span className="text-sm text-neutral-600">{labels[x]}</span><strong className="mt-2 block text-3xl text-brand">{data?.statusCounts[x]??'—'}</strong></button>)}
  </div>
  <form onSubmit={submitSearch} className="mb-5 flex flex-wrap gap-2">
   <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="رقم الطلب، اسم الزبون، الهاتف، المحافظة..." maxLength={100} className="min-w-[180px] flex-1 rounded-xl border border-brand/25 bg-white px-4 py-3"/>
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
  {data?.orders.map(o=>{
   const open=expanded===o.id;
   const productsSum=o.items.reduce((sum,item)=>sum+item.price*item.quantity,0);
   return <article key={o.id} className="overflow-hidden rounded-2xl border border-brand/20 bg-white">
    <div className="flex flex-wrap items-start justify-between gap-4 p-5">
     <div className="min-w-0"><p className="text-xs text-neutral-500">{new Date(o.createdAt).toLocaleString('ar-IQ')}</p><h2 className="mt-1 break-all font-extrabold text-brand">{o.id}</h2>
      <p className="mt-2 font-bold text-ink">{o.customerName} <span className="text-sm font-normal text-neutral-500">· {o.customerCity}</span></p>
     </div>
     <div className="text-left"><span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${colors[o.status]||'bg-gray-100'}`}>{labels[o.status]||o.status}</span>
      <p className="mt-3 text-xl font-black text-ink">{format(o.total)}</p></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand/10 px-5 py-3">
     <button type="button" aria-expanded={open} onClick={()=>setExpanded(open?null:o.id)} className="font-bold text-sm text-brand">{open?'إخفاء التفاصيل ↑':'عرض الفاتورة والتفاصيل ↓'}</button>
     <div className="flex flex-wrap gap-2">{(transitions[o.status]||[]).map(next=><button key={next} type="button" disabled={busy!==null} onClick={()=>change(o,next)}
      className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50 ${next==='cancelled'||next==='returned'?'border-red-200 text-red-700':'border-brand/20 text-brand'}`}>{busy===o.id?'جاري التحديث...':labels[next]}</button>)}</div>
    </div>
    {open&&<div className="grid gap-5 border-t border-brand/10 bg-paper2/30 p-5 md:grid-cols-2">
     <section><h3 className="mb-3 font-black">معلومات التوصيل</h3><p className="font-bold">{o.customerName}</p><a className="block text-brand underline" href={`tel:${o.customerPhone}`} dir="ltr">{o.customerPhone}</a>
      <p className="mt-2 text-sm">{o.customerCity}، {o.customerAddress}</p><p className="mt-2 text-xs text-neutral-500">الدفع عند الاستلام</p></section>
     <section><h3 className="mb-3 font-black">الفاتورة</h3>
      {o.items.map(i=><div key={i.id} className="mb-2 flex justify-between gap-3 text-sm"><span>{i.product?.name||'منتج'} × {i.quantity}</span><strong className="whitespace-nowrap">{format(i.price*i.quantity)}</strong></div>)}
      <div className="mt-3 space-y-2 border-t border-brand/20 pt-3 text-sm">
       <div className="flex justify-between"><span>المنتجات</span><strong>{format(o.subtotal??productsSum)}</strong></div>
       {o.discountAmount!=null&&<div className="flex justify-between text-green-700"><span>خصم ({o.couponCode})</span><strong>-{format(o.discountAmount)}</strong></div>}
       <div className="flex justify-between"><span>التوصيل</span><strong>{o.shippingFee===null?'يحدد لاحقاً':format(o.shippingFee)}</strong></div>
       <div className="flex justify-between border-t border-brand/20 pt-2 text-lg font-black"><span>الإجمالي المحفوظ</span><strong>{format(o.total)}</strong></div>
      </div></section>
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