"use client";

import {useEffect,useState} from 'react';
import {MapPin,Plus,Star,Pencil,Trash2,X} from 'lucide-react';
import {addressesAPI,AddressInput,SavedAddress} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';

const provinces=['بغداد','البصرة','نينوى','أربيل','النجف','كربلاء','الأنبار','بابل','ديالى','ذي قار','صلاح الدين','كركوك','ميسان','المثنى','واسط','دهوك','السليمانية','حلبجة'];
const blank:AddressInput={label:'',name:'',phone:'',city:'البصرة',address:''};

export default function AddressBook(){
  const {user}=useAuth();
  const [addresses,setAddresses]=useState<SavedAddress[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [busy,setBusy]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [showForm,setShowForm]=useState(false);
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const [form,setForm]=useState<AddressInput>(blank);

  async function refresh(){setAddresses(await addressesAPI.getMine());}
  useEffect(()=>{
    if(!user)return;
    let live=true;
    addressesAPI.getMine().then(rows=>{if(live)setAddresses(rows)})
      .catch(e=>{if(live)setError(e instanceof Error?e.message:'تعذّر جلب العناوين')})
      .finally(()=>{if(live)setLoading(false)});
    return ()=>{live=false};
  },[user]);

  const startAdd=()=>{
    setEditingId(null);setDeleteId(null);setError('');setSuccess('');
    setForm({...blank,name:user?.name||'',phone:user?.phone||''});
    setShowForm(true);
  };
  const startEdit=(address:SavedAddress)=>{
    setEditingId(address.id);setDeleteId(null);setError('');setSuccess('');
    setForm({label:address.label,name:address.name,phone:address.phone,city:address.city,address:address.address});
    setShowForm(true);
  };
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;
    setBusy(true);setError('');setSuccess('');
    try{
      if(editingId)await addressesAPI.update(editingId,form);
      else await addressesAPI.create(form);
      await refresh();
      setShowForm(false);setEditingId(null);setSuccess('انحفظ العنوان بنجاح');
    }catch(e){setError(e instanceof Error?e.message:'تعذّر حفظ العنوان')}
    finally{setBusy(false)}
  };
  const makeDefault=async(id:string)=>{
    if(busy)return;
    setBusy(true);setError('');setSuccess('');
    try{await addressesAPI.setDefault(id);await refresh();setSuccess('تحدّد العنوان الافتراضي')}
    catch(e){setError(e instanceof Error?e.message:'تعذّر اختيار العنوان')}
    finally{setBusy(false)}
  };
  const remove=async(id:string)=>{
    if(busy)return;
    setBusy(true);setError('');setSuccess('');
    try{await addressesAPI.delete(id);await refresh();setDeleteId(null);setSuccess('انحذف العنوان من دفتر العناوين')}
    catch(e){setError(e instanceof Error?e.message:'تعذّر حذف العنوان')}
    finally{setBusy(false)}
  };
  const input='mt-1.5 w-full rounded-xl border border-[#c6e4ed] bg-white px-4 py-3 text-sm outline-none focus:border-[#059bd0] focus:ring-2 focus:ring-[#059bd0]/15';

  return <section id="saved-addresses" className="site-surface mt-6 scroll-mt-28 p-5 sm:p-6" aria-labelledby="addresses-title">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="addresses-title" className="flex items-center gap-2 text-xl font-black"><MapPin className="text-brand" size={22}/>عناويني المحفوظة</h2>
        <p className="site-muted mt-1 text-sm">احفظ حتى 5 عناوين، واختَر عنوانك بسرعة عند الطلب القادم.</p>
      </div>
      {!showForm&&addresses.length<5&&<button type="button" onClick={startAdd} className="site-btn site-btn-primary site-btn-sm"><Plus size={17}/> إضافة عنوان</button>}
    </div>
    {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    {success&&<p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{success}</p>}
    {loading?<p role="status" className="py-5 text-sm text-neutral-600">جاري تحميل العناوين...</p>:
      addresses.length===0&&!showForm?<p className="rounded-2xl bg-[#f3fafd] p-5 text-sm text-[#536f7f]">ما عندك عنوان محفوظ بعد. ضيف عنوان البيت أو العيادة حتى ما تعيد كتابة تفاصيله بكل طلب.</p>:
      <div className={`grid gap-3 ${addresses.length===1 ? "grid-cols-1" : "md:grid-cols-2"}`}>
        {addresses.map(a=><div key={a.id} className={`rounded-2xl border border-[#d3e9f1] bg-[#fbfdfe] p-4 ${addresses.length===1 ? "sm:flex sm:items-center sm:justify-between sm:gap-5" : ""}`}>
          <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2"><strong className="text-base">{a.label}</strong>
              {a.isDefault&&<span className="rounded-full bg-[#dcf5ec] px-2 py-1 text-[11px] font-bold text-[#15745c]">افتراضي</span>}
            </div>
            <MapPin size={18} className="text-brand"/>
          </div>
          <p className="mt-2 text-sm font-semibold">{a.name} · <span dir="ltr">{a.phone}</span></p>
          <p className="mt-1 break-words text-sm leading-7 text-[#567481]">{a.city} — {a.address}</p>
          </div>
          <div className={`mt-4 flex flex-wrap items-center gap-2 border-t border-[#e0edf2] pt-3 ${addresses.length===1 ? "sm:mt-0 sm:shrink-0 sm:border-t-0 sm:border-r sm:pr-5 sm:pt-0" : ""}`}>
            <button type="button" disabled={busy} onClick={()=>startEdit(a)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-[#eaf7fc]"><Pencil size={14}/> تعديل</button>
            {!a.isDefault&&<button type="button" disabled={busy} onClick={()=>makeDefault(a.id)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-[#eaf7fc]"><Star size={14}/> اجعله الافتراضي</button>}
            {deleteId===a.id?<span className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-2 py-1 text-xs font-bold">متأكد؟
              <button type="button" onClick={()=>remove(a.id)} disabled={busy} className="rounded-lg bg-red-600 px-2 py-1.5 text-white disabled:opacity-50">نعم، احذف</button>
              <button type="button" onClick={()=>setDeleteId(null)} disabled={busy} className="rounded-lg border px-2 py-1.5">إلغاء</button>
            </span>:<button type="button" disabled={busy} onClick={()=>setDeleteId(a.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 size={14}/> حذف</button>}
          </div>
        </div>)}
      </div>}
    {showForm&&<form onSubmit={save} className="mt-5 rounded-2xl border border-[#b9e0ec] bg-[#f2fbfe] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-black">{editingId?'تعديل العنوان':'إضافة عنوان جديد'}</h3>
        <button type="button" onClick={()=>{setShowForm(false);setEditingId(null);setError('')}} aria-label="إغلاق نموذج العنوان" className="rounded-full border bg-white p-2" disabled={busy}><X size={18}/></button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">اسم العنوان (مثل البيت أو العيادة)<input required maxLength={40} value={form.label} onChange={e=>setForm({...form,label:e.target.value})} className={input}/></label>
        <label className="text-sm font-bold">اسم المستلم<input required minLength={2} maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className={input}/></label>
        <label className="text-sm font-bold">رقم الموبايل<input required pattern="07[0-9]{9}" dir="ltr" maxLength={11} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className={input} placeholder="07XXXXXXXXX"/></label>
        <label className="text-sm font-bold">المحافظة<select value={form.city} onChange={e=>setForm({...form,city:e.target.value})} className={input}>{provinces.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
        <label className="text-sm font-bold sm:col-span-2">العنوان التفصيلي<textarea required minLength={5} maxLength={500} value={form.address} onChange={e=>setForm({...form,address:e.target.value})} className={input} rows={3} placeholder="المنطقة، الشارع، أقرب نقطة دالة..."/></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="site-btn site-btn-primary site-btn-sm">{busy?'جاري الحفظ...':editingId?'حفظ التعديلات':'حفظ العنوان'}</button>
        <button type="button" disabled={busy} className="site-btn site-btn-outline site-btn-sm" onClick={()=>{setShowForm(false);setEditingId(null)}}>إلغاء</button>
      </div>
    </form>}
  </section>;
}
