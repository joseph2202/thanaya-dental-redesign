"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import SiteActionDialog from '@/components/ui/SiteActionDialog';
import Link from 'next/link';
import {financeAPI,type FinancialSummary,type OrderFinancialLedger,type FinanceOrderChoice} from '@/lib/api';
import {ArrowUpLeft,BadgeCheck,HandCoins,History,RefreshCw,RotateCcw,Search,ShieldAlert,Wallet} from 'lucide-react';

type Mode='collection'|'refund';
type Method='cash'|'bank_transfer'|'card'|'other';
type Draft={requestId:string;kind:Mode;method:Method;amountIqd:number;note:string};
const money=(n:number)=>n.toLocaleString('en-US')+' د.ع';
const names:Record<string,string>={collection:'تحصيل',refund:'استرداد',cash:'نقداً',bank_transfer:'تحويل مصرفي',card:'بطاقة',other:'طريقة أخرى'};
const periods:[FinancialSummary['range'],string][]=[['7','7 أيام'],['30','30 يوم'],['90','90 يوم'],['all','الكل']];

export default function FinancePage(){
 const [period,setPeriod]=useState<'7'|'30'|'90'|'all'>('30');
 const [summary,setSummary]=useState<FinancialSummary|null>(null);
 const [summaryError,setSummaryError]=useState('');
 const [orderId,setOrderId]=useState('');
 const [finderTerm,setFinderTerm]=useState('');
 const [choices,setChoices]=useState<FinanceOrderChoice[]>([]);
 const [finding,setFinding]=useState(false);
 const [finderError,setFinderError]=useState('');
 const [finderLoaded,setFinderLoaded]=useState(false);
 const finderSeq=useRef(0);
 const ledgerSeq=useRef(0);
 const [ledger,setLedger]=useState<OrderFinancialLedger|null>(null);
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [kind,setKind]=useState<Mode>('collection');
 const [method,setMethod]=useState<Method>('cash');
 const [amount,setAmount]=useState('');
 const [note,setNote]=useState('');
 const [draft,setDraft]=useState<Draft|null>(null);

 const refreshSummary=useCallback(async()=>{
  try{setSummaryError('');setSummary(await financeAPI.summary(period));}
  catch(e){setSummaryError(e instanceof Error?e.message:'تعذّر تحميل سجل التحصيل');}
 },[period]);
 useEffect(()=>{void refreshSummary();},[refreshSummary]);
 async function findOrders(term:string){
  const sequence=++finderSeq.current;
  setFinding(true);setFinderError('');
  try{
   const result=await financeAPI.findOrders(term.trim());
   if(sequence!==finderSeq.current)return;
   setChoices(result.orders);setFinderLoaded(true);
  }catch(e){
   if(sequence!==finderSeq.current)return;
   setFinderError(e instanceof Error?e.message:'تعذّر جلب الطلبات الجاهزة للمراجعة');
  }finally{if(sequence===finderSeq.current)setFinding(false);}
 }
 useEffect(()=>{void findOrders('');},[]);

 async function loadOrder(id:string){
  if(!id.trim()||busy)return;
  const sequence=++ledgerSeq.current;
  setLoading(true);setError('');setNotice('');
  setAmount('');setNote('');
  try{
   const detail=await financeAPI.order(id.trim());
   if(sequence!==ledgerSeq.current)return;
   setLedger(detail);setOrderId(detail.order.id);
  }catch(e){
   if(sequence!==ledgerSeq.current)return;
   setLedger(null);setError(e instanceof Error?e.message:'تعذّر تحميل سجل الطلب');
  }finally{if(sequence===ledgerSeq.current)setLoading(false);}
 }
 useEffect(()=>{
  const id=new URLSearchParams(window.location.search).get('orderId');
  if(id&&id.length<=120){setOrderId(id);void loadOrder(id);}
  // Only inspect the URL when this workspace first opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 function prepare(e:React.FormEvent){
  e.preventDefault();
  if(!ledger||busy)return;
  const parsed=Number(amount);
  if(!Number.isSafeInteger(parsed)||parsed<=0){setError('أدخل مبلغاً صحيحاً بالدينار العراقي');return;}
  if(note.trim().length<8){setError('اكتب ملاحظة واضحة من 8 أحرف على الأقل');return;}
  setError('');
  const uuid=crypto.randomUUID();
  setDraft({requestId:uuid,kind,method,amountIqd:parsed,note:note.trim()});
 }
 async function confirm(){
  if(!draft||!ledger||busy)return;
  setBusy(true);setError('');
  try{
   const saved=await financeAPI.record(ledger.order.id,draft);
   setDraft(null);setAmount('');setNote('');
   await Promise.all([loadOrder(ledger.order.id),refreshSummary()]);
   setNotice(saved.alreadyProcessed?'الحركة مسجلة سابقاً؛ لم نكررها.':'تم توثيق الحركة المالية بنجاح');
  }catch(e){
   // Keep the SAME requestId in the dialog for retries, including
   // a lost HTTP response after a successful database commit.
   setError(e instanceof Error?e.message:'تعذّر التأكد من حفظ الحركة؛ راجع السجل قبل المحاولة');
  }finally{setBusy(false);}
 }
 const limit=kind==='collection'?ledger?.totals.collectionRemainingIqd:ledger?.totals.refundableRemainingIqd;
 const canRecord=Boolean(ledger&&limit&&limit>0);
 return <AdminLayout>
  <SiteActionDialog open={draft!==null} title={draft?.kind==='refund'?'تأكيد تسجيل رد مبلغ':'تأكيد تسجيل مبلغ محصّل'}
   description={draft?`الطلب #${ledger?.order.id} — ${names[draft.kind]} ${money(draft.amountIqd)} بواسطة ${names[draft.method]}. الحركة توثيق يدوي، وليست دفعاً إلكترونياً.`:''}
   confirmLabel="سجّل الحركة المالية" destructive={draft?.kind==='refund'}
   busy={busy} error={draft?error:''} onClose={()=>{if(!busy){setDraft(null);setError('')}}}
   onConfirm={confirm}>
   {draft&&<div className="rounded-xl border border-brand/25 bg-paper2/50 p-3 text-xs leading-7">
    <strong>مرجع الحركة:</strong> <span dir="ltr" className="break-all">{draft.requestId}</span>
    <p className="mt-2">إذا انقطع الاتصال، اضغط تأكيد مرة ثانية بنفس المرجع؛ لا تنشئ حركة جديدة قبل مراجعة السجل.</p>
   </div>}
  </SiteActionDialog>
  <div className="mb-6">
   <span className="site-eyebrow">THANAYA / VERIFIED CASHFLOW</span>
   <h1 className="mt-2 text-3xl font-black text-ink">التحصيل والاسترداد المالي</h1>
   <p className="site-muted mt-2 max-w-3xl text-sm">تسجيل يدوي بإثبات من الموظف، منفصل عن حالة توصيل الطلب وعن استلام المرتجع. لا يُحسب ككشف بنكي أو صافي ربح.</p>
  </div>
  <div role="note" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
   <ShieldAlert size={22} className="mt-1 shrink-0"/>
   <p><strong>مهم:</strong> لا تضغط «تسجيل تحصيل» إلا بعد استلام المبلغ فعلياً، ولا «استرداد» إلا بعد رد المال. الطلبات القديمة ليست محصّلة تلقائياً، والمرتجعات القديمة بدون سجل استلام ما تتيح استرداداً آلياً.</p>
  </div>

  <section className="signature-detail-sheet mb-6 p-5" aria-labelledby="finance-summary-title">
   <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
    <div><h2 id="finance-summary-title" className="text-xl font-black">الحركات المالية الموثقة</h2><p className="site-muted mt-1 text-xs">الفترة حسب تاريخ تسجيل الحركة، مو تاريخ إنشاء الطلب.</p></div>
    <div className="flex flex-wrap gap-2">{periods.map(([key,label])=>
     <button type="button" key={key} aria-pressed={period===key} onClick={()=>setPeriod(key as typeof period)}
      className={`rounded-full border px-3 py-2 text-xs font-black ${period===key?'border-brand bg-brand text-white':'border-brand/20 bg-paper2 text-ink'}`}>{label}</button>)}</div>
   </div>
   {summaryError&&<p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{summaryError}</p>}
   {summary&&<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {[
     {label:'تحصيلات مسجلة',value:money(summary.receivedIqd),icon:HandCoins},
     {label:'استردادات مسجلة',value:money(summary.refundedIqd),icon:RotateCcw},
     {label:'صافي الحركات المسجلة',value:money(summary.netRecordedIqd),icon:Wallet},
     {label:'طلبات مسلّمة بدون سجل تحصيل',value:String(summary.deliveredWithoutReceipt),icon:History}
    ].map(({label,value,icon:Icon})=><div key={label} className="rounded-2xl border border-brand/20 bg-paper2/40 p-4">
     <Icon size={22} className="mb-3 text-brand"/><p className="site-muted text-xs font-bold">{label}</p><p className="mt-1 break-words text-xl font-black text-ink">{value}</p>
    </div>)}
   </div>}
  </section>

  <section className="signature-detail-sheet p-5 sm:p-6" aria-labelledby="order-finance-title">
   <h2 id="order-finance-title" className="text-xl font-black">السجل المالي لطلب محدد</h2>
   <section className="mt-4 rounded-2xl border border-brand/20 bg-paper2/25 p-3 sm:p-4" aria-label="البحث عن طلب للتحصيل">
    <h3 className="flex items-center gap-2 text-sm font-black"><Search size={17} className="text-brand"/> اختر طلباً جاهزاً للمراجعة</h3>
    <p className="site-muted mt-1 text-xs">أحدث الطلبات المسلّمة أو المرتجعة، وتگدر تبحث بالاسم أو رقم الطلب أو الهاتف.</p>
    <form onSubmit={e=>{e.preventDefault();void findOrders(finderTerm)}} className="mt-3 flex flex-wrap gap-2">
     <input aria-label="بحث طلب للتحصيل" className="site-input min-w-[180px] flex-1 px-3"
      maxLength={100} value={finderTerm} onChange={e=>setFinderTerm(e.target.value)}
      placeholder="ابحث عن اسم أو رقم طلب..."/>
     <button type="submit" disabled={finding} className="site-btn site-btn-outline">
      {finding?'جاري البحث...':'بحث'} <Search size={16}/>
     </button>
    </form>
    {finderError&&<p role="alert" className="mt-3 text-xs font-bold text-red-500">{finderError}</p>}
    {finderLoaded&&choices.length===0&&!finderError&&
     <p role="status" className="site-muted mt-3 rounded-xl border border-dashed border-brand/25 p-4 text-sm">
      ماكو طلبات مسلّمة أو مرتجعة تطابق البحث. مو معناته ماكو طلبات جديدة؛ التحصيل يُسجّل بعد التسليم فقط.
     </p>}
    {choices.length>0&&<div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
     {choices.map(item=><button key={item.id} type="button"
      disabled={loading||busy} onClick={()=>{void loadOrder(item.id)}}
      aria-pressed={ledger?.order.id===item.id}
      className={ledger?.order.id===item.id
        ?'min-w-0 rounded-xl border border-brand bg-brand/10 p-3 text-right transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand'
        :'min-w-0 rounded-xl border border-brand/20 bg-paper2/40 p-3 text-right transition hover:border-brand/60 hover:bg-brand/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand'}>
      <span className="block truncate text-sm font-black">{item.customerName}</span>
      <span className="site-muted mt-1 block truncate text-[11px]" dir="ltr">#{item.id}</span>
      <span className="mt-2 flex items-center justify-between gap-2 text-xs">
       <span className="site-muted">{item.status==='delivered'?'مُسلّم':'مرتجع'}</span>
       <strong>{money(item.total)}</strong>
      </span>
      <span className="site-muted mt-1 block text-[11px]">متبقّي للتحصيل: {money(item.collectionRemainingIqd)}</span>
     </button>)}
    </div>}
    {choices.length===12&&<p className="site-muted mt-3 text-xs">تظهر آخر 12 نتيجة. للعثور على طلب أقدم، ابحث باسمه أو رقمه.</p>}
   </section>
   <form onSubmit={e=>{e.preventDefault();void loadOrder(orderId)}} className="mt-4 flex flex-wrap gap-3">
    <label className="min-w-[220px] flex-1"><span className="mb-1 block text-xs font-bold">رقم الطلب الكامل</span>
     <input className="site-input w-full px-3" required maxLength={120} value={orderId} onChange={e=>setOrderId(e.target.value)} placeholder="انسخ رقم الطلب من صفحة إدارة الطلبات"/></label>
    <button type="submit" disabled={loading} className="site-btn site-btn-primary self-end">{loading?'جاري التحميل...':'عرض السجل'} <ArrowUpLeft size={17}/></button>
    <Link href="/admin/orders" className="site-btn site-btn-outline self-end">الطلبات</Link>
   </form>
   {error&&!draft&&<p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
   {notice&&<p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900"><BadgeCheck size={16} className="ml-2 inline"/>{notice}</p>}
   {ledger&&<div className="mt-6 border-t border-brand/20 pt-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div>
     <strong className="text-lg">{ledger.order.customerName}</strong><p className="site-muted mt-1 text-xs">#{ledger.order.id} · الحالة: {ledger.order.status}</p></div>
     <strong className="text-lg">{money(ledger.order.total)}</strong></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
     {[
      ['مُحصّل',ledger.totals.collectedIqd],['مُسترد',ledger.totals.refundedIqd],
      ['المتبقي للتحصيل',ledger.totals.collectionRemainingIqd],
      ['المسموح رده بعد المرتجع',ledger.totals.refundableRemainingIqd]
     ].map(([label,value])=><div key={label} className="rounded-xl border border-brand/15 bg-paper2/35 p-3">
      <p className="site-muted text-xs">{label}</p><p className="mt-1 text-lg font-black">{money(Number(value))}</p>
     </div>)}
    </div>
    <form onSubmit={prepare} className="mt-6 grid gap-3 rounded-2xl border border-brand/20 p-4 sm:grid-cols-2">
     <div><label className="mb-1 block text-xs font-bold" htmlFor="fin-kind">نوع الحركة</label><select id="fin-kind" className="site-input w-full px-2" value={kind} onChange={e=>setKind(e.target.value as Mode)}>
      <option value="collection">تحصيل نقد/دفعة</option><option value="refund">رد مبلغ للزبون</option></select></div>
     <div><label className="mb-1 block text-xs font-bold" htmlFor="fin-method">الطريقة الفعلية</label><select id="fin-method" className="site-input w-full px-2" value={method} onChange={e=>setMethod(e.target.value as Method)}>
      <option value="cash">نقداً</option><option value="bank_transfer">تحويل مصرفي</option><option value="card">بطاقة</option><option value="other">طريقة أخرى</option></select></div>
     <div><label className="mb-1 block text-xs font-bold" htmlFor="fin-amount">المبلغ بالدينار العراقي</label>
      <input id="fin-amount" className="site-input w-full px-3" type="number" min="1" max={limit||undefined} required step="1"
       value={amount} onChange={e=>setAmount(e.target.value)} placeholder="مثلاً: 80000"/></div>
     <div><label className="mb-1 block text-xs font-bold" htmlFor="fin-note">إثبات / ملاحظة داخلية</label>
      <input id="fin-note" className="site-input w-full px-3" required minLength={8} maxLength={300}
       value={note} onChange={e=>setNote(e.target.value)} placeholder="رقم وصل، اسم المستلم، أو مرجع التحويل"/></div>
     <div className="sm:col-span-2"><button type="submit" disabled={!canRecord||busy} className="site-btn site-btn-primary">
      راجع وسجّل {kind==='collection'?'التحصيل':'الاسترداد'} <ArrowUpLeft size={17}/>
     </button>
     <p className="site-muted mt-2 text-xs">الحد الحالي: {money(limit||0)}. العملية لا تنفذ تحويلاً بنكياً؛ تسجّل فقط ما تمّ فعلياً.</p></div>
    </form>
    <h3 className="mt-7 text-lg font-black">تاريخ الحركات المالية</h3>
    {ledger.events.length===0?<p className="site-muted mt-3 rounded-xl border border-dashed border-brand/30 p-5 text-sm">ماكو أي تحصيل أو استرداد مسجّل لهذا الطلب حتى الآن.</p>:
     <div className="mt-3 overflow-x-auto"><table className="w-full text-right text-sm"><thead><tr className="border-b border-brand/20">
      <th className="p-3">التاريخ</th><th className="p-3">الحركة</th><th className="p-3">الطريقة</th><th className="p-3">المبلغ</th><th className="p-3">الملاحظة</th></tr></thead>
      <tbody>{ledger.events.map(e=><tr key={e.id} className="border-b border-brand/10">
       <td className="p-3 whitespace-nowrap">{new Date(e.createdAt).toLocaleString('ar-IQ')}</td>
       <td className="p-3">{names[e.kind]}</td><td className="p-3">{names[e.method]}</td>
       <td className="p-3 whitespace-nowrap font-black">{money(e.amountIqd)}</td><td className="p-3">{e.note}</td>
      </tr>)}</tbody></table></div>}
   </div>}
  </section>
  <p className="site-muted mt-5 flex items-center gap-2 text-xs"><RefreshCw size={16}/> تحديث الصفحة أو السجل لا يكرّر الحركات. السجل لا يعوّض المطابقة مع إيصالات الدفع الفعلية.</p>
 </AdminLayout>;
}
