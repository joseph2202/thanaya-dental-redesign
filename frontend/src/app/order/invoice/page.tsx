"use client";
import {Suspense,useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {Printer,ArrowRight,ShieldCheck} from 'lucide-react';
import {ordersAPI,settingsAPI} from '@/lib/api';
import {orderStatusLabels,shortOrderCode} from '@/lib/orderPresentation';

type Order={id:string;status:string;createdAt:string;customerName:string;customerPhone:string;customerCity:string;customerAddress:string;total:number;subtotal:number|null;discountAmount:number|null;shippingFee:number|null;couponCode:string|null;items:{id:string;price:number;quantity:number;product?:{name:string}}[]};
type Store={siteName?:string;phone?:string;address?:string};
const iqd=(amount:number)=>amount.toLocaleString('en-US')+' د.ع';
function InvoiceContent(){
 const id=useSearchParams().get('id')||'';
 const [order,setOrder]=useState<Order|null>(null),[store,setStore]=useState<Store>({});
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  if(!id){setError('رقم الطلب مفقود');setLoading(false);return}
  let active=true;
  Promise.all([ordersAPI.getById(id),settingsAPI.getPublic().catch(()=>({}))])
   .then(([o,settings])=>{if(active){setOrder(o);setStore(settings)}})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'تعذّر تحميل الفاتورة')})
   .finally(()=>{if(active)setLoading(false)});
  return ()=>{active=false};
 },[id]);
 const subtotal=order?.subtotal??order?.items.reduce((sum,item)=>sum+item.price*item.quantity,0)??0;
 return <main dir="rtl" className="invoice-page mx-auto max-w-[920px] px-4 py-6 sm:py-9">
  <div className="invoice-controls mb-5 flex flex-wrap items-center justify-between gap-3">
   <Link href="/account" className="inline-flex items-center gap-2 text-sm font-black text-[#476d7f]"><ArrowRight size={18}/> حسابي</Link>
   {order&&<button type="button" onClick={()=>window.print()} className="site-btn site-btn-primary site-btn-sm"><Printer size={18}/> طباعة / حفظ PDF</button>}
  </div>
  {loading?<p className="rounded-xl bg-white p-7 text-center" role="status">جاري تجهيز ملخص الطلب...</p>
  :error||!order?<div className="rounded-xl bg-white p-7 text-center text-red-700" role="alert">{error||'تعذّر تحميل الطلب'}</div>
  :<article className="invoice-paper overflow-hidden rounded-[24px] border border-[#d0e6ef] bg-white shadow-[0_15px_45px_rgba(20,61,79,.06)]">
   <header className="flex flex-wrap items-start justify-between gap-5 border-b-4 border-[#059bd0] px-6 py-6 sm:px-9">
    <div><p className="text-xs font-bold tracking-wider text-brand" dir="ltr">THANAYA MEDICAL</p>
     <h1 className="mt-1 text-3xl font-black text-[#274555]">{store.siteName||'ثنايا'}</h1>
     <p className="mt-2 text-xs text-[#677f8a]">{store.address||'مستلزمات الأسنان والأجهزة الطبية'}</p>
     {store.phone&&<p className="mt-1 text-xs font-bold text-[#526f7e]" dir="ltr">{store.phone}</p>}
    </div>
    <div className="text-left"><span className="inline-block rounded-xl bg-[#e8f7fc] px-3 py-1.5 text-xs font-black text-[#067ea9]">ملخّص طلب قابل للطباعة</span>
     <p dir="ltr" className="mt-3 text-sm font-black">#{shortOrderCode(order.id)}</p>
     <p className="mt-1 text-xs text-[#6b8794]">{new Date(order.createdAt).toLocaleString('ar-IQ',{dateStyle:'medium',timeStyle:'short'})}</p>
     <p className="mt-2 text-xs font-bold text-[#527583]">الحالة: {orderStatusLabels[order.status]||order.status}</p>
    </div>
   </header>
   <div className="grid gap-4 border-b border-[#e4eff3] bg-[#f8fcfe] px-6 py-5 text-sm sm:grid-cols-2 sm:px-9">
    <div><p className="mb-2 text-xs font-black text-brand">المستلم</p><p className="font-black">{order.customerName}</p><p className="mt-1 text-right" dir="ltr">{order.customerPhone}</p></div>
    <div><p className="mb-2 text-xs font-black text-brand">عنوان التوصيل</p><p className="font-bold">{order.customerCity}</p><p className="mt-1 break-words text-[#617b87]">{order.customerAddress}</p></div>
   </div>
   <section className="px-5 py-5 sm:px-9 sm:py-6">
    <h2 className="mb-4 text-lg font-black text-[#274b5b]">المنتجات</h2>
    <div className="overflow-x-auto"><table className="w-full border-collapse text-right text-sm">
     <thead><tr className="bg-[#eaf6fb] text-[#305669]"><th className="p-3">المنتج</th><th className="p-3 text-center">الكمية</th><th className="p-3">سعر الوحدة</th><th className="p-3">المجموع</th></tr></thead>
     <tbody>{order.items.map((item,index)=><tr key={item.id} className="border-b border-[#e5eff3]">
      <td className="max-w-[280px] break-words p-3 font-bold">{item.product?.name||'منتج من الطلب'} <small className="text-[#9db3bd]">#{index+1}</small></td>
      <td className="p-3 text-center">{item.quantity}</td><td className="whitespace-nowrap p-3">{iqd(item.price)}</td><td className="whitespace-nowrap p-3 font-bold">{iqd(item.price*item.quantity)}</td>
     </tr>)}</tbody>
    </table></div>
    <div className="mr-auto mt-5 max-w-sm space-y-3 rounded-xl bg-[#f4fafc] p-4 text-sm">
     <div className="flex justify-between gap-3"><span>مجموع المنتجات</span><strong>{iqd(subtotal)}</strong></div>
     {(order.discountAmount??0)>0&&<div className="flex justify-between gap-3 text-emerald-700"><span>الخصم {order.couponCode||''}</span><strong>-{iqd(order.discountAmount||0)}</strong></div>}
     <div className="flex justify-between gap-3"><span>التوصيل</span><strong>{order.shippingFee==null?'غير محدد في الطلب':iqd(order.shippingFee)}</strong></div>
     <div className="flex justify-between gap-3 border-t border-[#d0e5ec] pt-3 text-base font-black"><span>الإجمالي المحفوظ</span><strong>{iqd(order.total)}</strong></div>
    </div>
    <p className="mt-5 text-[11px] leading-6 text-[#68818c]"><ShieldCheck size={14} className="ml-1 inline"/> أسعار الوحدات والكميات محفوظة من وقت الشراء. اسم المنتج قد يعكس اسمه الحالي إذا تغير لاحقاً.</p>
    <p className="mt-1 text-[11px] leading-6 text-[#68818c]">هذه وثيقة ملخص طلب، وليست إيصال قبض أو فاتورة ضريبية؛ حالة تسليم الطلب لا تثبت تحصيل المبلغ.</p>
   </section>
   <footer className="border-t border-[#d6e8f0] bg-[#f8fcfe] px-6 py-4 text-center text-xs text-[#748c97]">
    <p>رقم الطلب الكامل</p><p className="mt-1 break-all font-mono text-[10px]" dir="ltr">{order.id}</p><p className="mt-2 font-bold">شكراً لاختياركم ثنايا</p>
   </footer>
  </article>}
  <style jsx global>{`
   @media print{
    @page{size:A4;margin:10mm}
    html,body{background:white !important;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    body::before,.invoice-controls{display:none !important}
    .invoice-page{max-width:none !important;padding:0 !important}
    .invoice-paper{box-shadow:none !important;border:none !important;border-radius:0 !important}
    .invoice-paper tr,.invoice-paper header,.invoice-paper footer{break-inside:avoid}
   }
  `}</style>
 </main>;
}
export default function InvoicePage(){return <Suspense fallback={<p className="p-10 text-center">جاري تجهيز الملخص...</p>}><InvoiceContent/></Suspense>}
