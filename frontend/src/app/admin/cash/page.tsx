"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {cashAPI,type CashSummary,type StoreExpenseRecord} from "@/lib/api";
import {useAuth} from "@/context/AuthContext";
import {Wallet,Landmark,ReceiptText,RefreshCw,ShieldCheck} from "lucide-react";

const iqd=(x:number)=>x.toLocaleString("en-US")+" د.ع";
const style="site-input mt-1 w-full min-w-0 px-3 py-2";
const categories:{key:string;label:string}[]=[
 {key:"rent",label:"إيجار"},{key:"utilities",label:"فواتير وخدمات"},
 {key:"salaries",label:"رواتب"},{key:"delivery",label:"توصيل"},
 {key:"maintenance",label:"صيانة"},{key:"marketing",label:"تسويق"},
 {key:"other",label:"مصروف تشغيلي آخر"}
];
export default function CashAndExpenses(){
 const {user}=useAuth();
 const [range,setRange]=useState<"7"|"30"|"90"|"all">("30");
 const [summary,setSummary]=useState<CashSummary|null>(null);
 const [expenses,setExpenses]=useState<StoreExpenseRecord[]>([]);
 const [category,setCategory]=useState("rent");
 const [method,setMethod]=useState<"cash"|"bank_transfer"|"other">("cash");
 const [amount,setAmount]=useState("");
 const [reference,setReference]=useState("");
 const [note,setNote]=useState("");
 const [direction,setDirection]=useState<"contribution"|"withdrawal">("contribution");
 const [drawerAmount,setDrawerAmount]=useState("");
 const [drawerReference,setDrawerReference]=useState("");
 const [drawerNote,setDrawerNote]=useState("");
 const [confirmExpense,setConfirmExpense]=useState(false);
 const [confirmDrawer,setConfirmDrawer]=useState(false);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const expenseKey=useRef<string|null>(null),drawerKey=useRef<string|null>(null);
 const loadVersion=useRef(0);
 const resetExpense=()=>{expenseKey.current=null;setConfirmExpense(false);setNotice("");};
 const resetDrawer=()=>{drawerKey.current=null;setConfirmDrawer(false);setNotice("");};
 const load=useCallback(async()=>{
  const version=++loadVersion.current;
  setLoading(true);setError("");setSummary(null);
  try{
   const [report,items]=await Promise.all([cashAPI.summary(range),cashAPI.expenses()]);
   if(version!==loadVersion.current)return;
   setSummary(report);setExpenses(items);
  }catch(e){
   if(version===loadVersion.current)setError(e instanceof Error?e.message:"تعذر تحميل الصندوق والمصاريف");
  }finally{if(version===loadVersion.current)setLoading(false);}
 },[range]);
 useEffect(()=>{
  void load();
  return()=>{loadVersion.current++;};
 },[load]);
 // A range change renders before its effect starts: never label old figures
 // with the new period, even during that first render or after a failed load.
 const currentSummary=!loading&&summary?.range===range?summary:null;
 async function addExpense(e:FormEvent){
  e.preventDefault();setError("");setNotice("");
  const money=Number(amount);
  if(!Number.isSafeInteger(money)||money<1||reference.trim().length<8||note.trim().length<8){
   setError("أدخل قيمة صحيحة ورقم وصل ووصفاً واضحاً");return;
  }
  if(!confirmExpense){setConfirmExpense(true);return;}
  if(!expenseKey.current)expenseKey.current=crypto.randomUUID();
  setBusy(true);
  try{
   const done=await cashAPI.recordExpense({requestId:expenseKey.current,
    category,method,amountIqd:money,reference:reference.trim(),note:note.trim()});
   await load();setAmount("");setReference("");setNote("");setConfirmExpense(false);
   expenseKey.current=null;
   setNotice(done.alreadyRecorded?"المصروف محفوظ مسبقاً؛ لم يتكرر.":"تم حفظ المصروف المدفوع فعلياً.");
  }catch(err){
   setConfirmExpense(false);
   setError((err instanceof Error?err.message:"تعذر تسجيل المصروف")+
    " — إذا انقطع الاتصال، راجع السجل قبل إعادة المحاولة.");
  }finally{setBusy(false);}
 }
 async function addDrawer(e:FormEvent){
  e.preventDefault();setError("");setNotice("");
  const money=Number(drawerAmount);
  if(!Number.isSafeInteger(money)||money<1||drawerReference.trim().length<8||drawerNote.trim().length<8){
   setError("قيمة حركة الصندوق أو مرجعها غير صالح");return;
  }
  if(!confirmDrawer){setConfirmDrawer(true);return;}
  if(!drawerKey.current)drawerKey.current=crypto.randomUUID();
  setBusy(true);
  try{
   const done=await cashAPI.ownerMovement({
    requestId:drawerKey.current,direction,amountIqd:money,
    reference:drawerReference.trim(),note:drawerNote.trim()
   });
   await load();setDrawerAmount("");setDrawerReference("");setDrawerNote("");
   drawerKey.current=null;setConfirmDrawer(false);
   setNotice(done.alreadyRecorded?"هذه الحركة محفوظة مسبقاً.":"تم توثيق حركة النقد الخاصة بالمالك.");
  }catch(err){
   setConfirmDrawer(false);
   setError(err instanceof Error?err.message:"تعذر توثيق حركة النقد");
  }finally{setBusy(false);}
 }
 return <AdminLayout>
  <div className="space-y-5">
   <header className="flex flex-wrap items-start justify-between gap-3">
    <div>
     <span className="site-eyebrow flex items-center gap-2"><Wallet size={16}/> حسابات ثنايا</span>
     <h1 className="mt-2 text-2xl font-black text-ink sm:text-3xl">المصاريف وحركة الصندوق</h1>
     <p className="site-muted mt-2 text-sm">وثّق المصاريف المدفوعة، وتابع حركة النقد المسجّلة بعيداً عن أرصدة البنك غير المرتبطة.</p>
    </div>
    <button className="site-btn site-btn-outline site-btn-sm" type="button" disabled={busy||loading} onClick={()=>void load()}>
     <RefreshCw size={16}/> تحديث
    </button>
   </header>
   <div className="flex flex-wrap gap-2">
    {(["7","30","90","all"] as const).map((v,i)=>
     <button key={v} type="button" aria-pressed={range===v} disabled={busy} onClick={()=>setRange(v)}
      className={"rounded-full border px-3 py-1.5 text-sm font-bold "+(range===v?"bg-brand text-white border-brand":"border-brand/25")}>
      {["7 أيام","30 يوم","90 يوم","كل الفترة"][i]}
     </button>)}
   </div>
   {error&&<p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</p>}
   {notice&&<p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{notice}</p>}
   {loading&&<p role="status" className="site-muted rounded-xl border border-brand/20 p-4 text-sm">جاري تحميل تقرير الصندوق للفترة المحددة...</p>}
   {currentSummary&&<section aria-label="تقرير حركة النقد" className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
     {[
      ["مصاريف تشغيلية مدفوعة",currentSummary.recordedExpenseIqd],
      ["نقد داخل مسجل",currentSummary.cashInIqd],
      ["نقد خارج مسجل",currentSummary.cashOutIqd],
      ["صافي حركة النقد المسجلة",currentSummary.netRecordedCashMovementIqd]
     ].map(([name,value])=><div className="site-surface rounded-2xl p-4" key={String(name)}>
       <p className="site-muted text-xs font-bold">{String(name)}</p>
       <p className="mt-3 text-xl font-black text-brand">{iqd(Number(value))}</p>
      </div>)}
    </div>
    <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-950">{currentSummary.warning}</p>
    <div className="site-surface grid gap-3 rounded-2xl p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
     <p>تحصيل نقدي من الطلبات: <strong>{iqd(currentSummary.components.customerCashCollectedIqd)}</strong></p>
     <p>استرداد نقدي للزبائن: <strong>{iqd(currentSummary.components.customerCashRefundedIqd)}</strong></p>
     <p>مدفوع نقداً للموردين: <strong>{iqd(currentSummary.components.supplierCashPaidIqd)}</strong></p>
     <p>مصاريف نقدية: <strong>{iqd(currentSummary.components.cashOperatingExpensesIqd)}</strong></p>
     <p>إضافات نقدية من المالك: <strong>{iqd(currentSummary.components.ownerCashContributionsIqd)}</strong></p>
     <p>سحوبات المالك: <strong>{iqd(currentSummary.components.ownerCashWithdrawalsIqd)}</strong></p>
    </div>
   </section>}

   <div className="grid gap-5 lg:grid-cols-2">
    <section className="site-surface rounded-2xl p-4 sm:p-5">
     <h2 className="text-lg font-black"><ReceiptText size={19} className="me-2 inline text-brand"/>تسجيل مصروف مدفوع</h2>
     <p className="site-muted mt-2 text-xs leading-6">لا تسجّل شراء البضاعة من المورد هنا؛ هذا موجود ضمن فواتير الموردين حتى ما يتكرر الحساب.</p>
     <form className="mt-4 space-y-3" onSubmit={addExpense}>
      <label className="block text-sm font-bold">نوع المصروف
       <select className={style} value={category} disabled={busy} onChange={e=>{setCategory(e.target.value);resetExpense();}}>
        {categories.map(c=><option value={c.key} key={c.key}>{c.label}</option>)}
       </select></label>
      <div className="grid gap-3 sm:grid-cols-2">
       <label className="block text-sm font-bold">المبلغ بالدينار العراقي
        <input className={style} type="number" required min={1} step={1} value={amount}
         onChange={e=>{setAmount(e.target.value);resetExpense();}} disabled={busy}/></label>
       <label className="block text-sm font-bold">طريقة الدفع
        <select className={style} value={method} disabled={busy}
         onChange={e=>{setMethod(e.target.value as typeof method);resetExpense();}}>
         <option value="cash">نقدي</option><option value="bank_transfer">تحويل مصرفي</option>
         <option value="other">طريقة موثقة أخرى</option>
        </select></label>
      </div>
      <label className="block text-sm font-bold">مرجع الوصل أو المصروف
       <input className={style} value={reference} minLength={8} maxLength={200} required
        disabled={busy} onChange={e=>{setReference(e.target.value);resetExpense();}}/></label>
      <label className="block text-sm font-bold">وصف المصروف
       <textarea className={style} rows={2} value={note} minLength={8} maxLength={300} required
        disabled={busy} onChange={e=>{setNote(e.target.value);resetExpense();}}/></label>
      {confirmExpense&&<p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
       تأكيد تسجيل مصروف بقيمة {iqd(Number(amount)||0)}، مدفوع فعلياً؟</p>}
      <button type="submit" disabled={busy} className="site-btn site-btn-primary">
       {confirmExpense?"تأكيد حفظ المصروف":"مراجعة المصروف"}
      </button>
     </form>
    </section>
    <section className="site-surface rounded-2xl p-4 sm:p-5">
     <h2 className="text-lg font-black"><Landmark size={19} className="me-2 inline text-brand"/>حركات نقد المالك</h2>
     <p className="site-muted mt-2 text-xs">صلاحية المالك فقط. تسجّل إدخال نقد شخصي أو سحبه، ولا تنشئ دفعة إلكترونية.</p>
     {user?.role==="owner"?<form className="mt-4 space-y-3" onSubmit={addDrawer}>
      <label className="block text-sm font-bold">نوع الحركة
       <select className={style} value={direction} disabled={busy}
        onChange={e=>{setDirection(e.target.value as typeof direction);resetDrawer();}}>
        <option value="contribution">إضافة نقد من المالك</option>
        <option value="withdrawal">سحب نقد بواسطة المالك</option>
       </select></label>
      <label className="block text-sm font-bold">المبلغ بالدينار العراقي
       <input className={style} type="number" min={1} step={1} required value={drawerAmount}
        onChange={e=>{setDrawerAmount(e.target.value);resetDrawer();}} disabled={busy}/></label>
      <label className="block text-sm font-bold">مرجع الحركة
       <input className={style} minLength={8} maxLength={200} required value={drawerReference}
        onChange={e=>{setDrawerReference(e.target.value);resetDrawer();}} disabled={busy}/></label>
      <label className="block text-sm font-bold">سبب الحركة
       <textarea className={style} minLength={8} maxLength={300} rows={2} required value={drawerNote}
        onChange={e=>{setDrawerNote(e.target.value);resetDrawer();}} disabled={busy}/></label>
      {confirmDrawer&&<p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
       تأكيد {direction==="contribution"?"إضافة":"سحب"} نقد بقيمة {iqd(Number(drawerAmount)||0)}؟</p>}
      <button type="submit" className="site-btn site-btn-primary" disabled={busy}>
       {confirmDrawer?"تأكيد حركة النقد":"مراجعة حركة النقد"}
      </button>
     </form>:<p className="site-muted mt-4 flex items-center gap-2 text-sm"><ShieldCheck size={16}/> هذه الميزة متاحة للمالك فقط.</p>}
    </section>
   </div>

   <section className="site-surface rounded-2xl p-4 sm:p-5">
    <h2 className="mb-3 font-black">آخر المصاريف الموثقة</h2>
    {!expenses.length&&<p className="site-muted text-sm">ماكو مصاريف مسجلة ضمن القائمة.</p>}
    <div className="space-y-2">{expenses.map(row=>
     <div key={row.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-brand/15 p-3 text-sm">
      <div>
       <strong>{categories.find(c=>c.key===row.category)?.label||row.category}</strong>
       <p className="site-muted mt-1 max-w-lg break-words text-xs">{row.reference} — {row.note}</p>
      </div>
      <div className="text-end"><strong>{iqd(row.amountIqd)}</strong>
       <p className="site-muted mt-1 text-xs">{new Date(row.createdAt).toLocaleDateString("ar-IQ")}</p>
      </div>
     </div>)}</div>
   </section>
  </div>
 </AdminLayout>;
}
