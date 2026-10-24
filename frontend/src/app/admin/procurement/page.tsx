"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import SiteActionDialog from '@/components/ui/SiteActionDialog';
import {productsAPI,procurementAPI,type PurchaseDraftRecord,type SupplierRecord} from '@/lib/api';
import {ArrowUpLeft,Building2,ClipboardList,FilePlus2,PackagePlus,RefreshCw,Search,ShieldCheck,Truck} from 'lucide-react';

type ProductPick={id:string;name:string;sku?:string|null};
type DraftLine={productId:string;quantity:string;unitCostIqd:string};
const iqd=(num:number)=>num.toLocaleString('en-US')+' د.ع';
const emptySupplier={code:'',name:'',contact:'',phone:'',email:'',city:'',address:'',note:''};
const emptyLine=():DraftLine=>({productId:'',quantity:'1',unitCostIqd:''});

export default function ProcurementPage(){
 const [suppliers,setSuppliers]=useState<SupplierRecord[]>([]);
 const [drafts,setDrafts]=useState<PurchaseDraftRecord[]>([]);
 const [products,setProducts]=useState<ProductPick[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [search,setSearch]=useState('');
 const [section,setSection]=useState<'suppliers'|'drafts'>('suppliers');
 const [supplierForm,setSupplierForm]=useState({...emptySupplier});
 const [showSupplierForm,setShowSupplierForm]=useState(false);
 const [archive,setArchive]=useState<SupplierRecord|null>(null);
 const [supplierId,setSupplierId]=useState('');
 const [draftNote,setDraftNote]=useState('');
 const [lines,setLines]=useState<DraftLine[]>([emptyLine()]);
 const draftRequestId=useRef<string|null>(null);
 const [openId,setOpenId]=useState<string|null>(null);
 const loadSequence=useRef(0);

 const refresh=useCallback(async()=>{
  const seq=++loadSequence.current;
  setLoading(true);setError('');
  try{
   const [supplierList,draftList,productList]=await Promise.all([
    procurementAPI.suppliers(),procurementAPI.drafts(),productsAPI.manage()
   ]);
   if(seq!==loadSequence.current)return;
   setSuppliers(supplierList);setDrafts(draftList);setProducts(productList);
  }catch(e){
   if(seq!==loadSequence.current)return;
   setError(e instanceof Error?e.message:'تعذر تحميل بيانات المشتريات');
  }finally{if(seq===loadSequence.current)setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);

 async function submitSupplier(e:React.FormEvent){
  e.preventDefault();if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const created=await procurementAPI.createSupplier(supplierForm);
   setSupplierForm({...emptySupplier});setShowSupplierForm(false);
   await refresh();
   setNotice('انضاف المورد '+created.name+' لدليل موردي ثنايا');
  }catch(e){setError(e instanceof Error?e.message:'تعذر حفظ المورد');}
  finally{setBusy(false);}
 }
 async function toggleSupplier(){
  if(!archive||busy)return;
  setBusy(true);setError('');
  try{
   await procurementAPI.updateSupplier(archive.id,{
    active:!archive.active,expectedRevision:archive.revision
   });
   setArchive(null);
   await refresh();
   setNotice('تحدثت حالة المورد بدون حذف مشتريات قديمة');
  }catch(e){setError(e instanceof Error?e.message:'تعذر تحديث المورد');}
  finally{setBusy(false);}
 }

 function changeLine(index:number,field:keyof DraftLine,value:string){
  draftRequestId.current=null;
  setLines(prev=>prev.map((line,i)=>i===index?{...line,[field]:value}:line));
 }
 function addLine(){
  draftRequestId.current=null;
  setLines(prev=>prev.length>=30?prev:[...prev,emptyLine()]);
 }
 function removeLine(index:number){
  draftRequestId.current=null;
  setLines(prev=>prev.length===1?[emptyLine()]:prev.filter((_,i)=>i!==index));
 }
 function resetPurchaseDraft(){
  setSupplierId('');setDraftNote('');setLines([emptyLine()]);
  draftRequestId.current=null;
 }
 const total=lines.reduce((sum,line)=>{
  const quantity=Number(line.quantity),unitCost=Number(line.unitCostIqd);
  return sum+(Number.isSafeInteger(quantity)&&Number.isSafeInteger(unitCost)&&quantity>0&&unitCost>0?quantity*unitCost:0);
 },0);
 async function saveDraft(e:React.FormEvent){
  e.preventDefault();if(busy)return;
  const parsed=lines.map(line=>({
   productId:line.productId,quantity:Number(line.quantity),unitCostIqd:Number(line.unitCostIqd)
  }));
  if(!supplierId){setError('اختَر المورد أولاً');return;}
  if(parsed.some(line=>!line.productId||!Number.isSafeInteger(line.quantity)||line.quantity<=0
    ||!Number.isSafeInteger(line.unitCostIqd)||line.unitCostIqd<=0)){
   setError('أدخل منتجاً وكمية صحيحة وتكلفة وحدة بالدينار لكل سطر');return;
  }
  if(new Set(parsed.map(line=>line.productId)).size!==parsed.length){
   setError('لا تضيف نفس المنتج مرتين؛ اجمع الكمية بسطر واحد');return;
  }
  if(!draftRequestId.current)draftRequestId.current=crypto.randomUUID();
  setBusy(true);setError('');setNotice('');
  try{
   const result=await procurementAPI.createDraft({
    requestId:draftRequestId.current,supplierId,note:draftNote,lines:parsed
   });
   resetPurchaseDraft();await refresh();setOpenId(result.id);
   setNotice(result.alreadyCreated?'المسودة موجودة مسبقاً؛ لم ننشئ نسخة مكررة.':
    'تم حفظ مسودة شراء داخلية فقط. لا تغيير في المخزون أو التحصيل، ولم تُرسل للمورد.');
  }catch(e){
   setError(e instanceof Error?e.message:'تعذر تأكيد حفظ المسودة؛ لا تكررها بمعرّف مختلف قبل مراجعة السجل');
  }finally{setBusy(false);}
 }
 const shownSuppliers=suppliers.filter(s=>(s.name+' '+s.code+' '+(s.contact||'')).toLowerCase().includes(search.trim().toLowerCase()));
 const activeSuppliers=suppliers.filter(s=>s.active);

 return <AdminLayout>
  <SiteActionDialog open={archive!==null}
   title={archive?.active?'إيقاف المورد مؤقتاً':'إعادة تفعيل المورد'}
   description={archive?.active?'إيقاف المورد يمنع إنشاء مسودات شراء جديدة عليه، لكن يحفظ كل السجلات السابقة.':'يرجع هذا المورد متاحاً لمسودات المشتريات الجديدة.'}
   confirmLabel={archive?.active?'إيقاف المورد':'تفعيل المورد'} busy={busy}
   onClose={()=>{if(!busy)setArchive(null);}} onConfirm={toggleSupplier}/>

  <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
   <div>
    <span className="site-eyebrow">THANAYA / BUSINESS OPERATIONS / 01</span>
    <h1 className="mt-2 text-3xl font-black sm:text-4xl">الموردون والمشتريات</h1>
    <p className="site-muted mt-2 text-sm leading-7">أول وحدة من نظام إدارة شركة ثنايا: بيانات الموردين ومسودات شراء موثقة قبل استلام البضاعة.</p>
   </div>
   <button type="button" className="site-btn site-btn-outline" onClick={()=>void refresh()} disabled={loading||busy}>
    <RefreshCw size={17}/> تحديث
   </button>
  </header>
  <div className="mb-5 flex items-start gap-3 rounded-2xl border border-brand/35 bg-paper2/40 p-4 text-sm">
   <ShieldCheck size={21} className="mt-1 shrink-0 text-brand"/>
   <div><strong>نظام مشتريات آمن — المرحلة الأولى</strong>
    <p className="site-muted mt-1 leading-7">كل طلب شراء هنا مسودة داخلية فقط، وما يعتبر فاتورة مورد أو استلام مخزني. الكميات والأموال الحالية تبقى بدون تغيير.</p></div>
  </div>
  <div className="grid gap-3 sm:grid-cols-3">
   {[
    ['الموردون المسجلون',suppliers.length,Building2],
    ['موردون متاحون',activeSuppliers.length,Truck],
    ['مسودات شراء',drafts.length,ClipboardList]
   ].map(([label,value,Icon])=>{
    const Symbol=Icon as typeof Building2;
    return <div key={label as string} className="site-surface rounded-2xl border p-4">
     <Symbol size={21} className="mb-3 text-brand"/>
     <p className="site-muted text-xs">{label as string}</p>
     <p className="mt-1 text-2xl font-black">{loading?'—':value as number}</p>
    </div>;
   })}
  </div>
  <div role="tablist" aria-label="أقسام المشتريات" className="mt-6 mb-5 flex flex-wrap gap-2">
   <button role="tab" type="button" aria-selected={section==='suppliers'} onClick={()=>setSection('suppliers')}
    className={section==='suppliers'?'site-btn site-btn-primary':'site-btn site-btn-outline'}><Building2 size={17}/> دليل الموردين</button>
   <button role="tab" type="button" aria-selected={section==='drafts'} onClick={()=>setSection('drafts')}
    className={section==='drafts'?'site-btn site-btn-primary':'site-btn site-btn-outline'}><PackagePlus size={17}/> مسودات الشراء</button>
  </div>
  {error&&<div role="alert" className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm font-bold text-red-500">{error}</div>}
  {notice&&<div role="status" className="mb-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-500">{notice}</div>}
  {loading&&<p role="status" className="site-muted py-5 text-sm">جاري تحميل سجلات ثنايا...</p>}

  {section==='suppliers'&&<section className="site-surface rounded-3xl border p-4 sm:p-6">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div><h2 className="text-xl font-black">دليل الموردين</h2>
     <p className="site-muted mt-1 text-xs">احتفظ بمعلومات المورد وتاريخ مشترياته حتى عند إيقافه.</p></div>
    <button type="button" onClick={()=>setShowSupplierForm(!showSupplierForm)}
      className="site-btn site-btn-primary"><FilePlus2 size={17}/> {showSupplierForm?'إخفاء النموذج':'إضافة مورد'}</button>
   </div>
   {showSupplierForm&&<form onSubmit={submitSupplier} className="mt-5 grid gap-3 rounded-2xl border border-brand/20 bg-paper2/35 p-4 sm:grid-cols-2">
    {([
     ['code','رمز المورد (حروف إنجليزية وأرقام)','SUP-001'],
     ['name','اسم المورد','المجهّز الطبي'],
     ['contact','الشخص المسؤول','اختياري'],
     ['phone','الهاتف','اختياري'],
     ['email','البريد الإلكتروني','اختياري'],
     ['city','المحافظة / المدينة','اختياري'],
     ['address','العنوان','اختياري'],
     ['note','ملاحظات داخلية','اختياري']
    ] as const).map(([key,label,placeholder])=><label key={key} className="min-w-0">
     <span className="mb-1 block text-xs font-bold">{label}</span>
     <input className="site-input w-full px-3" value={supplierForm[key]}
      onChange={e=>setSupplierForm(prev=>({...prev,[key]:e.target.value}))}
      required={key==='code'||key==='name'} maxLength={key==='note'?500:key==='address'?230:150}
      placeholder={placeholder}/></label>)}
    <div className="sm:col-span-2"><button type="submit" className="site-btn site-btn-primary" disabled={busy}>
     {busy?'جاري الحفظ...':'حفظ المورد'} <ArrowUpLeft size={16}/></button></div>
   </form>}
   <label className="mt-5 flex items-center gap-3 rounded-xl border border-brand/20 p-3">
    <Search size={18} className="text-brand"/>
    <input className="w-full min-w-0 bg-transparent text-sm outline-none" value={search}
      onChange={e=>setSearch(e.target.value)} placeholder="ابحث بالاسم أو رمز المورد..."/>
   </label>
   {shownSuppliers.length===0&&!loading?<p className="site-muted mt-5 rounded-xl border border-dashed border-brand/20 p-5 text-center text-sm">ماكو موردين مطابقين بعد. ابدأ بإضافة أول مورد تتعامل وياه ثنايا.</p>:
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{shownSuppliers.map(s=><article key={s.id}
     className="rounded-2xl border border-brand/20 bg-paper2/25 p-4">
     <div className="flex items-start justify-between gap-2">
      <div><p className="text-lg font-black">{s.name}</p><p className="site-muted mt-1 text-xs" dir="ltr">{s.code}</p></div>
      <span className={s.active?'rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-black text-emerald-500':'site-muted rounded-full bg-paper2 px-3 py-1 text-[11px] font-black'}>
       {s.active?'نشط':'موقوف'}</span>
     </div>
     <p className="site-muted mt-3 min-h-6 text-xs">{[s.contact,s.phone,s.city].filter(Boolean).join(' • ')||'ما مسجّل بيانات اتصال بعد'}</p>
     <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={busy} className="site-btn site-btn-outline !min-h-9 !px-3 !text-xs"
       onClick={()=>setArchive(s)}>{s.active?'إيقاف مؤقت':'إعادة تفعيل'}</button>
     </div>
    </article>)}</div>}
  </section>}

  {section==='drafts'&&<section className="site-surface rounded-3xl border p-4 sm:p-6">
   <div><h2 className="text-xl font-black">مسودات الشراء من الموردين</h2>
    <p className="site-muted mt-1 text-xs">خطط مشترياتك بالتكلفة الكاملة بالدينار. الإرسال والاستلام لاحقاً بعد اعتماد إجراء رسمي.</p></div>
   <form onSubmit={saveDraft} className="mt-5 grid gap-4 rounded-2xl border border-brand/20 bg-paper2/30 p-4">
    <label><span className="mb-2 block text-xs font-black">المورد</span>
     <select className="site-input w-full px-3" required value={supplierId}
      onChange={e=>{draftRequestId.current=null;setSupplierId(e.target.value)}}>
      <option value="">اختر المورد...</option>
      {activeSuppliers.map(s=><option key={s.id} value={s.id}>{s.name} · {s.code}</option>)}</select></label>
    {lines.map((line,index)=><div key={index} className="grid gap-3 rounded-xl border border-brand/20 p-3 sm:grid-cols-[minmax(0,1fr)_100px_150px_auto]">
     <label className="min-w-0"><span className="mb-1 block text-xs font-bold">المنتج #{index+1}</span>
      <select required className="site-input w-full px-2" value={line.productId}
       onChange={e=>changeLine(index,'productId',e.target.value)}>
       <option value="">اختر المنتج...</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?' · '+p.sku:''}</option>)}</select></label>
     <label><span className="mb-1 block text-xs font-bold">الكمية</span>
      <input required type="number" min="1" max="100000" step="1" className="site-input w-full px-2"
       value={line.quantity} onChange={e=>changeLine(index,'quantity',e.target.value)}/></label>
     <label><span className="mb-1 block text-xs font-bold">تكلفة الوحدة د.ع</span>
      <input required type="number" min="1" max="2000000000" step="1" className="site-input w-full px-2"
       value={line.unitCostIqd} onChange={e=>changeLine(index,'unitCostIqd',e.target.value)} placeholder="مثلاً 25000"/></label>
     <button type="button" className="site-btn site-btn-outline self-end !min-h-10 !px-3 !text-xs" onClick={()=>removeLine(index)}>حذف</button>
    </div>)}
    <div className="flex flex-wrap items-center justify-between gap-3">
     <button type="button" className="site-btn site-btn-outline" disabled={lines.length>=30}
      onClick={addLine}>+ إضافة منتج آخر</button>
     <strong>إجمالي مخطط: {iqd(total)}</strong>
    </div>
    <label><span className="mb-1 block text-xs font-bold">ملاحظات المسودة</span>
     <textarea className="site-input w-full px-3 py-2" rows={2} maxLength={400} value={draftNote}
      onChange={e=>{draftRequestId.current=null;setDraftNote(e.target.value)}} placeholder="تفاصيل داخلية فقط، لا تُرسل للمورد..."/></label>
    <button type="submit" disabled={busy||!activeSuppliers.length||!products.length}
     className="site-btn site-btn-primary w-fit"><ClipboardList size={17}/>{busy?'جاري الحفظ...':'حفظ مسودة شراء داخلية'}</button>
   </form>
   <h3 className="mt-8 text-lg font-black">المسودات المحفوظة</h3>
   {!drafts.length&&!loading?<p className="site-muted mt-3 rounded-xl border border-dashed border-brand/20 p-5 text-center text-sm">ماكو مسودات شراء محفوظة بعد.</p>:
    <div className="mt-3 space-y-3">{drafts.map(d=><article key={d.id} className="rounded-xl border border-brand/20 bg-paper2/25 p-4">
     <button type="button" className="flex w-full flex-wrap items-center justify-between gap-3 text-right" onClick={()=>setOpenId(openId===d.id?null:d.id)}
      aria-expanded={openId===d.id}>
      <div><strong>{d.supplier.name}</strong><p className="site-muted mt-1 text-xs">مسودة داخلية • {new Date(d.createdAt).toLocaleDateString('ar-IQ')} • بواسطة {d.createdBy.name}</p></div>
      <strong>{iqd(d.totalIqd)}</strong>
     </button>
     {openId===d.id&&<div className="mt-3 space-y-2 border-t border-brand/20 pt-3">
      {d.lines.map(line=><div key={line.id} className="flex flex-wrap justify-between gap-2 text-sm">
       <span>{line.productName} × {line.quantity}</span>
       <span className="site-muted">{iqd(line.unitCostIqd)} للوحدة</span>
      </div>)}
      {d.note&&<p className="site-muted text-xs">ملاحظة: {d.note}</p>}
      <p className="site-muted text-xs">غير مرسلة للمورد • لا حركة مخزون • لا ذمم مالية</p>
     </div>}
    </article>)}</div>}
  </section>}
 </AdminLayout>;
}
