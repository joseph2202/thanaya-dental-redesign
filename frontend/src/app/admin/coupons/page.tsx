"use client";
import {useEffect,useState} from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import {couponsAPI} from '@/lib/api';
import {parseThousandsIqd,formatThousandsIqd} from '@/lib/money-entry';

type Coupon={id:string;code:string;kind:string;discount:number;active:boolean;minSubtotal:number;maxUses:number|null;usedCount:number;expiresAt:string|null};
export default function AdminCoupons(){
 const [rows,setRows]=useState<Coupon[]>([]);
 const [form,setForm]=useState({code:'',kind:'percent',discount:'10',minSubtotal:'0',maxUses:'',expiresAt:''});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const [loading,setLoading]=useState(true);
 async function load(){setLoading(true);try{setRows(await couponsAPI.getAll());setError('')}catch(e){setError(e instanceof Error?e.message:'تعذر تحميل الكوبونات')}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 async function add(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');setSuccess('');
  const discount=form.kind==='fixed'?parseThousandsIqd(form.discount):Number(form.discount);
  const minSubtotal=parseThousandsIqd(form.minSubtotal);
  if(discount===null||minSubtotal===null){setError('أدخل مبلغاً صالحاً بالألف دينار');setBusy(false);return}
  try{
   await couponsAPI.create({code:form.code,kind:form.kind,discount,minSubtotal,maxUses:form.maxUses?Number(form.maxUses):null,expiresAt:form.expiresAt?new Date(form.expiresAt+'T23:59:59').toISOString():null});
   setSuccess('تم إنشاء الكوبون');setForm({...form,code:''});await load();
  }catch(e){setError(e instanceof Error?e.message:'تعذر إضافة الكوبون')}finally{setBusy(false)}
 }
 async function toggle(c:Coupon){setError('');try{await couponsAPI.toggle(c.id);await load()}catch(e){setError(e instanceof Error?e.message:'فشل تغيير الحالة')}}
 async function remove(c:Coupon){if(!confirm('حذف الكوبون غير المستخدم؟'))return;setError('');try{await couponsAPI.delete(c.id);await load()}catch(e){setError(e instanceof Error?e.message:'تعذر الحذف')}}
 return <AdminLayout>
 <h1 className="mb-2 text-3xl font-black text-ink">كوبونات الخصم</h1>
 <p className="mb-6 text-sm text-neutral-600">تحتسب الخصومات من السيرفر على مجموع المنتجات قبل الشحن. الكوبونات المستخدمة يمكن تعطيلها ولا تُحذف من السجل.</p>
 {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 font-bold text-red-700">{error}</p>}
 {success&&<p role="status" className="mb-4 rounded-xl bg-green-50 p-4 font-bold text-green-700">{success}</p>}
 <form onSubmit={add} className="mb-8 grid gap-4 rounded-2xl border border-brand/20 bg-white p-6 md:grid-cols-2">
 <h2 className="md:col-span-2 text-xl font-black">إضافة كوبون</h2>
 <label className="text-sm font-bold">رمز الكوبون<input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]+" value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="THANAYA10" className="mt-2 w-full rounded-xl border border-brand/30 p-3" /></label>
 <label className="text-sm font-bold">نوع الخصم<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value,discount:'10'})} className="mt-2 w-full rounded-xl border border-brand/30 bg-white p-3"><option value="percent">نسبة مئوية %</option><option value="fixed">مبلغ ثابت (بالألف دينار)</option></select></label>
 <label className="text-sm font-bold">{form.kind==='percent'?'نسبة الخصم %':'مقدار الخصم بالألف د.ع'}<input required type="number" min={form.kind==='percent'?'1':'0.001'} max={form.kind==='percent'?'100':'1000000'} step={form.kind==='percent'?'1':'0.001'} value={form.discount} onChange={e=>setForm({...form,discount:e.target.value})} className="mt-2 w-full rounded-xl border border-brand/30 p-3" /></label>
 <label className="text-sm font-bold">أقل مجموع للمنتجات (بالألف د.ع)<input required type="number" min="0" step="0.001" value={form.minSubtotal} onChange={e=>setForm({...form,minSubtotal:e.target.value})} className="mt-2 w-full rounded-xl border border-brand/30 p-3" /></label>
 <label className="text-sm font-bold">الحد الأعلى للاستخدامات (اختياري)<input type="number" min="1" step="1" value={form.maxUses} onChange={e=>setForm({...form,maxUses:e.target.value})} placeholder="بدون حد" className="mt-2 w-full rounded-xl border border-brand/30 p-3" /></label>
 <label className="text-sm font-bold">تاريخ الانتهاء (اختياري)<input type="date" value={form.expiresAt} onChange={e=>setForm({...form,expiresAt:e.target.value})} className="mt-2 w-full rounded-xl border border-brand/30 p-3" /></label>
 <button disabled={busy} type="submit" className="site-btn site-btn-primary md:col-span-2">{busy?'جاري الحفظ...':'إنشاء الكوبون'}</button>
 </form>
 <div className="overflow-x-auto rounded-2xl border border-brand/20 bg-white">
 <table className="w-full min-w-[750px] text-right text-sm"><thead className="bg-paper2"><tr>{['الرمز','الخصم','أقل طلب','الاستخدامات','الانتهاء','الحالة','إجراء'].map(x=><th key={x} className="p-4 font-black">{x}</th>)}</tr></thead><tbody>
 {loading?<tr><td colSpan={7} className="p-6">جاري التحميل...</td></tr>:rows.length===0?<tr><td colSpan={7} className="p-6">لا يوجد كوبونات بعد</td></tr>:rows.map(c=><tr key={c.id} className="border-t border-brand/10">
 <td className="p-4 font-bold">{c.code}</td><td className="p-4">{c.kind==='fixed'?formatThousandsIqd(c.discount)+' ألف د.ع':c.discount+'%'}</td>
 <td className="p-4">{formatThousandsIqd(c.minSubtotal)} ألف</td><td className="p-4">{c.usedCount} / {c.maxUses??'∞'}</td>
 <td className="p-4">{c.expiresAt?new Date(c.expiresAt).toLocaleDateString('ar-IQ'):'بدون'}</td>
 <td className="p-4"><button onClick={()=>toggle(c)} className={c.active?'font-bold text-green-700':'font-bold text-red-700'}>{c.active?'نشط':'متوقف'}</button></td>
 <td className="p-4">{c.usedCount===0&&<button onClick={()=>remove(c)} className="text-red-700 underline">حذف</button>}</td>
 </tr>)}</tbody></table></div>
 </AdminLayout>
}