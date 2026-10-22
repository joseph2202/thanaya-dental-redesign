"use client";
import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, ShieldCheck, X, FileSpreadsheet } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { productsAPI, uploadAPI, settingsAPI, exportsAPI } from '@/lib/api';
import { parseThousandsIqd,parseUsd,formatThousandsIqd,formatFullIqd } from '@/lib/money-entry';
import ProductIcon from '@/components/ui/ProductIcon';
import SiteActionDialog from '@/components/ui/SiteActionDialog';
import { useAuth } from '@/context/AuthContext';
import {saleUnitLabel,saleUnitOptions} from '@/lib/saleUnits';

type InventoryView='all'|'low'|'out'|'hidden';
const sellableStock=(p:any):number=>Math.max(0,Number(p.lotTracking?(p.availableStock??p.stock):p.stock)||0);
const availabilityColor=(n:number)=>n===0?'text-red-700':n<=5?'text-amber-700':'text-emerald-700';

export default function AdminProducts() {
  const { user } = useAuth();
  const canEditProducts = user?.role === 'owner' || user?.role === 'admin';
  const [productsList, setProductsList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [inventoryView,setInventoryView]=useState<InventoryView>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [visibilityBusy, setVisibilityBusy] = useState<string | null>(null);
  const [exportBusy,setExportBusy]=useState(false);
  const [exportError,setExportError]=useState('');
  const [visibilityError, setVisibilityError] = useState('');
  const [pendingVisibility, setPendingVisibility] = useState<any | null>(null);
  const visibilityDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = visibilityDialogRef.current;
    if (!dialog) return;
    if (pendingVisibility && !dialog.open) dialog.showModal();
    if (!pendingVisibility && dialog.open) dialog.close();
  }, [pendingVisibility]);
  const [stockProduct, setStockProduct] = useState<any>(null);
  const [lotsData,setLotsData]=useState<any>(null);
  const [lotError,setLotError]=useState('');
  const [lotBusy,setLotBusy]=useState(false);
  const [lotForm,setLotForm]=useState({code:'',expiryDate:'',quantity:''});
  const [stockDelta, setStockDelta] = useState('');
  const [stockReason, setStockReason] = useState('');
  const [stockError, setStockError] = useState('');
  const [stockHistory, setStockHistory] = useState<any[]>([]);
  const [unitCostInput,setUnitCostInput]=useState('');
  const [unitCostBusy,setUnitCostBusy]=useState(false);
  const [unitCostMessage,setUnitCostMessage]=useState('');
  const [lotCostEdit,setLotCostEdit]=useState<string|null>(null);
  const [lotCostInput,setLotCostInput]=useState('');
  const [lotCostBusy,setLotCostBusy]=useState(false);
  const [costHistoryOpen,setCostHistoryOpen]=useState(false);
  const [costHistory,setCostHistory]=useState<any[]>([]);
  const [costHistoryBusy,setCostHistoryBusy]=useState(false);
  const [costHistoryError,setCostHistoryError]=useState('');
  const costHistoryRequest=useRef(0);
  const [pendingAction,setPendingAction]=useState<
    {kind:'adjustLot';lot:any}|{kind:'adjustStock';productId:string;productName:string;before:number;delta:number;reason:string}|{kind:'enableLots'}|{kind:'deleteProduct';product:any}|null
  >(null);
  const [actionDelta,setActionDelta]=useState('');
  const [actionReason,setActionReason]=useState('');
  const [actionBusy,setActionBusy]=useState(false);
  const [actionError,setActionError]=useState('');
  const closeAction=()=>{if(!actionBusy){setPendingAction(null);setActionError('')}};


  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await productsAPI.manage();
      setProductsList(data);
    } catch (error) {
      console.error('Failed to load products', error);
    }
  };

  const openInventory = async (product: any) => {
    setStockProduct(product);setLotsData(null);setLotError('');
    setUnitCostInput(product.purchaseCostIqd==null?'':String(product.purchaseCostIqd));
    setUnitCostMessage('');setLotCostEdit(null);
    costHistoryRequest.current++;
    setCostHistoryOpen(false);setCostHistory([]);setCostHistoryError('');setCostHistoryBusy(false);
    productsAPI.getLots(product.id).then(data => {
      setLotsData(data);
      setStockProduct((current: any) => current?.id === product.id
        ? {...current, stock: data.product.stock, lotTracking: data.product.lotTracking}
        : current);
    }).catch(e => setLotError(e instanceof Error ? e.message : 'تعذر تحميل التشغيلات'));
    setStockDelta(''); setStockReason(''); setStockError(''); setStockHistory([]);
    try { const data = await productsAPI.getInventory(product.id); setStockHistory(data.movements || []); }
    catch (error) { setStockError(error instanceof Error ? error.message : 'تعذر جلب السجل'); }
  };

  const refreshLots = async (id: string) => {
    const data = await productsAPI.getLots(id);
    setLotsData(data);
    // Keep the currently open inventory panel in sync with the audited database stock.
    // Refreshing the table alone leaves stockProduct holding its initial zero-stock snapshot.
    setStockProduct((current: any) => current?.id === id
      ? {...current, stock: data.product.stock, lotTracking: data.product.lotTracking}
      : current);
    await loadProducts();
    const inventory = await productsAPI.getInventory(id);
    setStockHistory(inventory.movements || []);
  };
  const enableLots=()=>{if(stockProduct){setActionError('');setPendingAction({kind:'enableLots'})}};
  const receiveLot=async(e:React.FormEvent)=>{
    e.preventDefault();if(!stockProduct)return;
    setLotBusy(true);setLotError('');
    try{await productsAPI.receiveLot(stockProduct.id,{...lotForm,quantity:Number(lotForm.quantity)});await refreshLots(stockProduct.id);setLotForm({code:'',expiryDate:'',quantity:''});}
    catch(e){setLotError(e instanceof Error?e.message:'تعذر تسجيل التشغيلة');}
    finally{setLotBusy(false);}
  };
  const adjustLot=(lot:any)=>{
    if(!stockProduct)return;
    setActionDelta('');setActionReason('');setActionError('');
    setPendingAction({kind:'adjustLot',lot});
  };
  const confirmAction=async()=>{
    if(!pendingAction||actionBusy)return;
    let delta=0;
    if(pendingAction.kind==='adjustLot'){
      const raw=actionDelta.trim();
      delta=Number(raw);
      if(!/^[+-]?\d+$/.test(raw)||!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>1000000){
        setActionError('أدخل فرق كمية صحيحاً مثل -1 أو +2، ولا يجوز صفر');return;
      }
      if(!actionReason.trim()||actionReason.trim().length>180){
        setActionError('أدخل سبب التعديل، بحد أقصى 180 حرفاً');return;
      }
      if(pendingAction.lot.stock+delta<0||pendingAction.lot.stock+delta>1000000){
        setActionError('التغيير خارج الكمية المسموحة للتشغيلة');return;
      }
    }
    setActionBusy(true);setActionError('');
    try{
      if(pendingAction.kind==='adjustLot'){
        if(!stockProduct)throw new Error('يرجى فتح المخزون من جديد');
        await productsAPI.adjustLot(stockProduct.id,pendingAction.lot.id,{delta,reason:actionReason.trim()});
        // Success is final even if reloading fails; never offer a double adjustment.
        setPendingAction(null);
        try{await refreshLots(stockProduct.id);}catch{setLotError('تم تعديل المخزون، لكن تعذر تحديث البيانات. أغلق قسم المخزون وافتحه مجدداً.');}
      }else if(pendingAction.kind==='adjustStock'){
        if(!stockProduct||stockProduct.id!==pendingAction.productId)throw new Error('يرجى فتح مخزون المنتج من جديد');
        const updated=await productsAPI.adjustStock(pendingAction.productId,pendingAction.delta,pendingAction.reason);
        // The stock mutation is already committed. Close confirmation before any follow-up reads.
        setPendingAction(null);
        setStockProduct(updated);
        setStockDelta('');setStockReason('');
        try{
          await loadProducts();
          const data=await productsAPI.getInventory(updated.id);
          setStockHistory(data.movements||[]);
        }catch{
          setStockError('تم تصحيح المخزون، لكن تعذر تحديث السجل. أغلق قسم المخزون وافتحه مجدداً؛ لا تعيد تسجيل الحركة.');
        }
      }else if(pendingAction.kind==='enableLots'){
        if(!stockProduct)throw new Error('يرجى فتح المخزون من جديد');
        await productsAPI.enableLots(stockProduct.id);
        setPendingAction(null);
        try{await refreshLots(stockProduct.id);}catch{setLotError('تم تفعيل التشغيلات، لكن تعذر تحديث البيانات. أغلق قسم المخزون وافتحه مجدداً.');}
      }else{
        const target=pendingAction.product;
        await productsAPI.delete(target.id);
        setProductsList(current=>current.filter(p=>p.id!==target.id));
        if(stockProduct?.id===target.id)setStockProduct(null);
      }
      setPendingAction(null);
    }catch(e){setActionError(e instanceof Error?e.message:'تعذّر تنفيذ العملية؛ يرجى تحديث المخزون');}
    finally{setActionBusy(false);}
  };
  const saveStock = (e: React.FormEvent) => {
    e.preventDefault();
    const raw=stockDelta.trim();
    const delta=Number(raw);
    if(!stockProduct||!/^[+-]?\d+$/.test(raw)||!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>1000000||!stockReason.trim()){
      setStockError('أدخل فرق كمية صحيحاً مثل +5 أو -2، مع سبب التصحيح');return;
    }
    if(stockProduct.stock+delta<0||stockProduct.stock+delta>1000000){
      setStockError('التصحيح سيجعل المخزون خارج الكمية المسموحة');return;
    }
    setStockError('');setActionError('');
    setPendingAction({kind:'adjustStock',productId:stockProduct.id,productName:stockProduct.name,before:stockProduct.stock,delta,reason:stockReason.trim()});
  };

  const validCost=(value:string):number|null|undefined=>{
    const cleaned=value.trim().replace(/,/g,'');
    if(cleaned==='')return null;
    if(!/^\d{1,10}$/.test(cleaned))return undefined;
    const numeric=Number(cleaned);
    return Number.isSafeInteger(numeric)&&numeric<=1_000_000_000?numeric:undefined;
  };
  const saveUnitCost=async(e:React.FormEvent)=>{
    e.preventDefault();if(!stockProduct||unitCostBusy)return;
    const cost=validCost(unitCostInput);
    if(cost===undefined){setUnitCostMessage('أدخل تكلفة بالدينار رقم صحيح أو اتركها فارغة إذا غير معروفة');return;}
    setUnitCostBusy(true);setUnitCostMessage('');
    try{
      const saved=await productsAPI.savePurchaseCost(stockProduct.id,cost,stockProduct.costRevision||0);
      setStockProduct((current:any)=>current?{...current,...saved}:current);
      setUnitCostMessage('انحفظت تكلفة الشراء في سجل التعديلات، بدون تغيير السعر أو المخزون');
      await loadProducts();
    }catch(e){setUnitCostMessage(e instanceof Error?e.message:'تعذّر حفظ تكلفة الشراء');}
    finally{setUnitCostBusy(false);}
  };
  const loadCostHistory=async(productId:string)=>{
    const requestId=++costHistoryRequest.current;
    setCostHistoryBusy(true);setCostHistoryError('');
    try{
      const changes=await productsAPI.purchaseCostHistory(productId);
      if(requestId===costHistoryRequest.current)setCostHistory(Array.isArray(changes)?changes:[]);
    }catch(e){
      if(requestId===costHistoryRequest.current)setCostHistoryError(e instanceof Error?e.message:'تعذر عرض سجل تغييرات التكلفة');
    }finally{
      if(requestId===costHistoryRequest.current)setCostHistoryBusy(false);
    }
  };
  const saveLotCost=async(lot:any)=>{
    if(!stockProduct||lotCostBusy)return;
    const cost=validCost(lotCostInput);
    if(cost===undefined){setLotError('أدخل تكلفة صحيحة بالدينار أو اتركها فارغة');return;}
    setLotCostBusy(true);setLotError('');
    try{
      const saved=await productsAPI.saveLotPurchaseCost(stockProduct.id,lot.id,cost,lot.costRevision||0);
      // Committed on the server: reflect the exact revision before attempting a secondary reload.
      setLotCostEdit(null);setLotCostInput('');
      setLotsData((current:any)=>current?{...current,lots:current.lots?.map((item:any)=>
        item.id===lot.id?{...item,purchaseCostIqd:saved.purchaseCostIqd,costRevision:saved.costRevision}:item
      )}:current);
      setUnitCostMessage('انحفظت تكلفة شراء التشغيلة بنجاح، وما تغيّر سعر البيع أو المخزون.');
      try{await refreshLots(stockProduct.id);}
      catch{setLotError('تم حفظ التكلفة بنجاح لكن تعذر تحديث البيانات. افتح المخزون من جديد؛ لا تكرر عملية الحفظ.');}
      if(costHistoryOpen)void loadCostHistory(stockProduct.id);
    }catch(e){setLotError(e instanceof Error?e.message:'تعذّر حفظ تكلفة التشغيلة');}
    finally{setLotCostBusy(false);}
  };
  const toggleVisibility = (product: any) => {
    if (visibilityBusy) return;
    setVisibilityError('');
    setPendingVisibility(product);
  };

  const confirmVisibility = async () => {
    const product = pendingVisibility;
    if (!product || visibilityBusy) return;
    setVisibilityBusy(product.id);
    setVisibilityError('');
    try {
      await productsAPI.setVisibility(product.id, product.published === false);
      await loadProducts();
      setPendingVisibility(null);
    } catch (error) {
      setVisibilityError(error instanceof Error ? error.message : 'تعذّر تغيير ظهور المنتج');
    } finally {
      setVisibilityBusy(null);
    }
  };

  const handleDelete = (product:any) => {setActionError('');setPendingAction({kind:'deleteProduct',product})};

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setShowAddForm(true);
  };

  const handleSave = async (product: any): Promise<string | null> => {
    setLoading(true);
    try {
      const data = { ...product, category: product.category.trim() };
      if (editingProduct) {
        // Metadata updates cannot silently overwrite available stock.
        delete data.stock;
        delete data.availableStock;
        delete data.lotTracking;
        delete data.published;
        delete data.lots;
        delete data.purchaseCostIqd;
        delete data.costRevision;
        delete data.id;
        delete data.createdAt;
        delete data.orderItems;
        delete data.inventoryMovements;
      }
      if (editingProduct) {
        await productsAPI.update(product.id, data);
      } else {
        await productsAPI.create(data);
      }
      await loadProducts();
      setShowAddForm(false);
      setEditingProduct(null);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'فشل حفظ المنتج';
    } finally {
      setLoading(false);
    }
  };

  const existingCategories = [...new Set(productsList.map(p => p.category?.trim()).filter(Boolean))] as string[];

  const inventorySummary={
    all:productsList.length,
    low:productsList.filter(p=>sellableStock(p)>0&&sellableStock(p)<=5).length,
    out:productsList.filter(p=>sellableStock(p)===0).length,
    hidden:productsList.filter(p=>p.published===false).length
  };
  const normalizedQuery=searchQuery.trim().toLocaleLowerCase();
  const filteredProducts=productsList.filter(p=>{
    const matches=!normalizedQuery||[p.name,p.sku,p.brand,p.category].some(
      value=>typeof value==='string'&&value.toLocaleLowerCase().includes(normalizedQuery));
    const available=sellableStock(p);
    return matches&&(inventoryView==='all'||
      (inventoryView==='low'&&available>0&&available<=5)||
      (inventoryView==='out'&&available===0)||
      (inventoryView==='hidden'&&p.published===false));
  });

  return (
    <AdminLayout>
      <SiteActionDialog
        open={pendingAction!==null}
        title={pendingAction?.kind==='adjustLot'?'تصحيح مخزون التشغيلة':pendingAction?.kind==='adjustStock'?'تأكيد تصحيح المخزون':pendingAction?.kind==='enableLots'?'تفعيل تتبع التشغيلات':'تأكيد حذف المنتج'}
        description={pendingAction?.kind==='adjustLot'||pendingAction?.kind==='adjustStock'
          ? 'هذا الإجراء يغيّر المخزون الفعلي فقط، وليس عملية بيع أو مرتجع. سيُحفظ السبب في سجل حركات المخزون.'
          : pendingAction?.kind==='enableLots'
          ? 'تفعيل تتبع التشغيلات متاح للمنتجات بدون مخزون أو حركات سابقة أو طلبات؛ بعده تسجّل كل شحنة برقم تشغيلة وتاريخ صلاحية.'
          : 'سيُحذف المنتج فقط إذا لم يكن مرتبطاً بطلب أو سجل مخزون. الحذف لا يمس الطلبات القديمة.'}
        confirmLabel={pendingAction?.kind==='adjustLot'||pendingAction?.kind==='adjustStock'?'تأكيد تصحيح المخزون':pendingAction?.kind==='enableLots'?'تفعيل التشغيلات':'حذف المنتج'}
        destructive={pendingAction?.kind==='deleteProduct'||(pendingAction?.kind==='adjustLot'&&Number(actionDelta)<0)||(pendingAction?.kind==='adjustStock'&&pendingAction.delta<0)}
        onConfirm={()=>void confirmAction()}
        onClose={closeAction}
        busy={actionBusy}
        error={actionError}
      >
        {pendingAction?.kind==='adjustStock'&&<div className="rounded-xl bg-[#f0f9fc] p-3 text-sm leading-7">
          <p className="font-bold">المنتج: {pendingAction.productName}</p>
          <p>المخزون الحالي: <strong>{pendingAction.before.toLocaleString('en-US')}</strong></p>
          <p>فرق الكمية: <strong dir="ltr">{pendingAction.delta>0?'+':''}{pendingAction.delta.toLocaleString('en-US')}</strong></p>
          <p>المخزون المتوقع: <strong>{(pendingAction.before+pendingAction.delta).toLocaleString('en-US')}</strong></p>
          <p>السبب: <strong>{pendingAction.reason}</strong></p>
          <p className="mt-2 text-xs text-[#4f7180]">المتوقع مبني على آخر قراءة للمخزون؛ الخادم يتحقق عند الحفظ. هذه حركة توريد أو جرد أو تلف، مو بيع للزبون أو مرتجع.</p>
        </div>}
        {pendingAction?.kind==='adjustLot'&&<>
          <div className="rounded-xl bg-[#f0f9fc] p-3 text-sm leading-7">
            <p className="font-bold">التشغيلة: <span dir="ltr">{pendingAction.lot.code}</span></p>
            <p>الكمية الحالية: <strong>{pendingAction.lot.stock.toLocaleString('en-US')}</strong></p>
            {actionDelta.trim()&&Number.isSafeInteger(Number(actionDelta))&&
              <p>الكمية المتوقعة بعد التعديل: <strong>{(pendingAction.lot.stock+Number(actionDelta)).toLocaleString('en-US')}</strong></p>}
          </div>
          <label className="block text-sm font-black">فرق الكمية (موجب للإضافة، سالب للنقصان)
            <input autoFocus required type="text" inputMode="numeric" dir="ltr" placeholder="مثال: -1 أو +2" value={actionDelta}
              onChange={e=>{setActionDelta(e.target.value);setActionError('')}}
              className="mt-2 block w-full rounded-xl border border-brand/30 bg-white p-3 text-base"/>
          </label>
          <label className="block text-sm font-black">سبب التعديل
            <textarea required maxLength={180} rows={2} placeholder="مثال: قطعة تالفة أثناء الجرد" value={actionReason}
              onChange={e=>{setActionReason(e.target.value);setActionError('')}}
              className="mt-2 block w-full resize-y rounded-xl border border-brand/30 bg-white p-3 text-base"/>
          </label>
          <p className="text-xs leading-6 text-[#6a8795]">تسجيل بيع للزبون ينقص المخزون تلقائياً؛ لا تستخدم هذه العملية بدلاً من الطلبات.</p>
        </>}
        {pendingAction?.kind==='deleteProduct'&&<p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{pendingAction.product.name}</p>}
      </SiteActionDialog>
      <dialog
        ref={visibilityDialogRef}
        dir="rtl"
        aria-labelledby="visibility-dialog-title"
        aria-describedby="visibility-dialog-description"
        onClose={() => setPendingVisibility(null)}
        onCancel={(event) => { if (visibilityBusy) event.preventDefault(); }}
        onClick={(event) => { if (event.target === event.currentTarget && !visibilityBusy) setPendingVisibility(null); }}
        className="fixed inset-0 z-[100] m-auto w-[calc(100%-2rem)] max-w-[460px] overflow-hidden rounded-[28px] border border-[#b8e2ef] bg-white p-0 text-[#233943] shadow-[0_30px_100px_rgba(13,45,65,.35)] backdrop:bg-[#102c3d]/60 backdrop:backdrop-blur-[5px]"
      >
        {pendingVisibility && (
          <>
            <div className="relative bg-[linear-gradient(125deg,#e7f8fd,#f7fcff)] px-6 pb-6 pt-7 sm:px-8">
              <button
                type="button"
                aria-label="إغلاق نافذة التأكيد"
                onClick={() => setPendingVisibility(null)}
                disabled={Boolean(visibilityBusy)}
                className="absolute left-5 top-5 grid h-9 w-9 place-items-center rounded-full border border-[#c4e5ef] bg-white text-[#4c6877] transition hover:bg-[#dff3fa] disabled:opacity-50"
              >
                <X size={18} aria-hidden="true" />
              </button>
              <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[#b4e0ec] bg-white text-[#038cb9] shadow-sm">
                {pendingVisibility.published === false ? <Eye size={26} aria-hidden="true" /> : <EyeOff size={26} aria-hidden="true" />}
              </div>
              <h3 id="visibility-dialog-title" className="text-xl font-black leading-8 text-[#213b49]">
                {pendingVisibility.published === false ? 'إظهار المنتج بالمتجر؟' : 'إخفاء المنتج عن الزبائن؟'}
              </h3>
              <p className="mt-2 break-words text-base font-bold text-[#087ba3]">{pendingVisibility.name}</p>
              <p id="visibility-dialog-description" className="mt-3 text-sm leading-7 text-[#526e7b]">
                {pendingVisibility.published === false
                  ? 'راح يرجع المنتج للبحث وصفحات المتجر، ويصير ممكن طلبه إذا عنده مخزون متاح.'
                  : 'راح يختفي من صفحات الزبائن والبحث، وما تنقبل عليه طلبات جديدة. مخزونه وسجل التشغيلات والطلبات القديمة تبقى محفوظة.'}
              </p>
            </div>
            <div className="px-6 py-5 sm:px-8">
              <div className="mb-5 flex items-start gap-2 rounded-xl bg-[#f1f9fc] px-3 py-3 text-xs font-semibold leading-6 text-[#456b7e]">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#058fba]" aria-hidden="true" />
                <span>تگدر ترجع تغيّر حالة العرض بأي وقت من إدارة المنتجات.</span>
              </div>
              {visibilityError && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{visibilityError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPendingVisibility(null)}
                  disabled={Boolean(visibilityBusy)}
                  className="min-h-12 rounded-full border-2 border-[#35515e] bg-white px-3 text-sm font-black text-[#263f4c] transition hover:bg-[#edf5f8] disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={confirmVisibility}
                  disabled={Boolean(visibilityBusy)}
                  className="min-h-12 rounded-full border-2 border-[#059bd0] bg-[#059bd0] px-3 text-sm font-black text-white shadow-[0_5px_0_#047ba8] transition hover:bg-[#008bbd] disabled:opacity-60 disabled:shadow-none"
                >
                  {visibilityBusy ? 'جاري الحفظ...' : pendingVisibility.published === false ? 'تأكيد الإظهار' : 'تأكيد الإخفاء'}
                </button>
              </div>
            </div>
          </>
        )}
      </dialog>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-3xl font-black text-ink">إدارة المنتجات</h2>
        {canEditProducts&&<div className="flex flex-wrap gap-2">
          <button type="button" disabled={exportBusy} onClick={async()=>{setExportBusy(true);setExportError('');try{await exportsAPI.download('inventory')}catch(e){setExportError(e instanceof Error?e.message:'تعذّر التصدير')}finally{setExportBusy(false)}}} className="site-btn site-btn-outline site-btn-sm">
            <FileSpreadsheet size={16}/>{exportBusy?'جاري تجهيز Excel...':'تصدير المخزون Excel'}
          </button>
          <button onClick={() => { setShowAddForm(true); setEditingProduct(null); }} className="bg-brand text-white rounded-full px-6 py-2 font-bold hover:bg-brand-dark transition">+ إضافة منتج</button>
        </div>}
      </div>

      {exportError&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{exportError}</p>}
      {stockProduct && <section className="site-surface mb-5 p-4 md:p-5" aria-label="إدارة المخزون">
        <div className="flex items-center justify-between gap-3 mb-4"><h3 className="text-xl font-black">مخزون {stockProduct.name}</h3><button type="button" className="site-btn site-btn-outline site-btn-sm" onClick={() => setStockProduct(null)}>إغلاق</button></div>
        <p className="mb-4 text-sm">الكمية الحالية: <strong className="text-brand">{stockProduct.stock}</strong> {saleUnitLabel(stockProduct.saleUnit)}. للإضافة اكتب رقماً موجباً، وللتصحيح بالنقصان اكتب رقماً سالباً.</p>
        {canEditProducts&&<div className="mb-4 rounded-2xl border border-[#c6e4ed] bg-white p-4">
          <h4 className="mb-2 text-base font-black text-[#28505f]">تكلفة الشراء <span className="mr-2 rounded-full bg-[#e9f6fb] px-2 py-1 text-[10px] font-bold text-[#127ea3]">معلومات داخلية</span></h4>
          <p className="mb-3 text-sm leading-7 text-[#476b7a]">هنا تسجّل <strong>سعر شراء وحدة البيع من المورد</strong> بالدينار العراقي؛ مو سعر بيعها للزبون. إذا المنتج إله أكثر من شحنة (تشغيلة)، كل شحنة ممكن تكون إلها تكلفة مختلفة. التسجيل ما يغيّر الكمية أو السعر المعروض للزبون، وما يمثل صافي الربح.</p>
          {!stockProduct.lotTracking?<form onSubmit={saveUnitCost} className="flex flex-wrap items-end gap-3">
            <label className="min-w-[190px] flex-1 text-sm font-bold">تكلفة شراء الوحدة (د.ع)
              <input type="text" inputMode="numeric" dir="ltr" value={unitCostInput} onChange={e=>setUnitCostInput(e.target.value)} placeholder="اترك فارغاً إذا غير معروف" className="mt-2 w-full rounded-xl border border-brand/25 p-3" />
            </label>
            <button disabled={unitCostBusy} type="submit" className="site-btn site-btn-primary site-btn-sm">{unitCostBusy?'جاري الحفظ...':'حفظ تكلفة الشراء'}</button>
            {stockProduct.purchaseCostIqd!=null&&<p className="w-full text-xs font-bold text-[#327583]">الفرق المبدئي للوحدة قبل الخصومات والمصاريف: {(stockProduct.price-stockProduct.purchaseCostIqd).toLocaleString('en-US')} د.ع</p>}
          </form>:<div className="rounded-xl border border-[#c7e4ef] bg-[#f0f9fc] p-3 text-sm leading-7 text-[#346d83]">
            <p className="font-black">ليش تكلفة الشراء تختلف بين التشغيلات؟</p>
            <p>مثال: اشتريت 20 وحدة بسعر 5,000 د.ع للوحدة؛ تكلفة الشراء الكلية للشحنة 100,000 د.ع. إذا وصلتك شحنة ثانية بسعر مختلف، تسجّل تكلفتها بشكل منفصل.</p>
            <p className="mt-1 text-xs">لا تدخل مجموع الشحنة بحقل تكلفة الوحدة. بعد وجود مبيعات للتشغيلة يمنع الخادم تعديل تكلفتها حفاظاً على دقة السجل.</p>
          </div>}
          {unitCostMessage&&<p role="status" className="mt-3 text-sm font-bold text-[#416477]">{unitCostMessage}</p>}
          <div className="mt-4 border-t border-[#d9eaf0] pt-3">
            <button type="button" className="rounded-lg border border-[#b7dce8] px-3 py-2 text-sm font-bold text-[#18789a] hover:bg-[#eff8fc]"
              onClick={()=>{
                if(costHistoryOpen){costHistoryRequest.current++;setCostHistoryOpen(false);setCostHistoryBusy(false);}
                else{setCostHistoryOpen(true);void loadCostHistory(stockProduct.id);}
              }}>
              {costHistoryOpen?'إخفاء سجل تغييرات التكلفة':'عرض سجل تغييرات التكلفة'}
            </button>
            {costHistoryOpen&&<div className="mt-3 rounded-xl bg-[#f6fbfd] p-3 text-sm">
              {costHistoryBusy?<p role="status">جاري تحميل سجل التكلفة...</p>:
                costHistoryError?<p role="alert" className="text-red-700">{costHistoryError} <button type="button" className="underline" onClick={()=>void loadCostHistory(stockProduct.id)}>إعادة المحاولة</button></p>:
                costHistory.length===0?<p className="text-[#506e7b]">ماكو تغييرات تكلفة مسجّلة لهذا المنتج بعد.</p>:
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {costHistory.map((change:any)=><div key={change.id} className="rounded-lg border border-[#e0edf2] bg-white p-3">
                    <p className="font-bold">{change.lotId?'تشغيلة: '+(lotsData?.lots?.find((lot:any)=>lot.id===change.lotId)?.code||'محددة'):'تكلفة المنتج المباشرة'}</p>
                    <p className="mt-1 text-[#4c6a76]">قبل: {change.beforeCostIqd==null?'غير مسجلة':change.beforeCostIqd.toLocaleString('en-US')+' د.ع'}</p>
                    <p className="text-[#24728d]">بعد: {change.afterCostIqd==null?'غير مسجلة':change.afterCostIqd.toLocaleString('en-US')+' د.ع'}</p>
                    <time className="mt-1 block text-xs text-[#64828e]">{new Date(change.createdAt).toLocaleString('ar-IQ')}</time>
                  </div>)}
                  <p className="text-xs text-[#64828e]">يعرض آخر 50 تغيير مسجّل، مو سجلات عمليات البيع.</p>
                </div>}
            </div>}
          </div>
        </div>}
        <div className="mb-5 rounded-xl border border-brand/20 bg-[#f4faff] p-4">
          <h4 className="mb-3 font-black">التشغيلات وتواريخ الصلاحية</h4>
          {lotsData?.product?.lotTracking ? <>
            <p className="mb-3 text-xs text-neutral-600">تُباع التشغيلات الصالحة حسب الأقرب انتهاءً؛ المخزون المنتهي لا يدخل ضمن المتاح للبيع.</p>
            <div className="mb-4 space-y-2">{lotsData.lots?.map((lot:any)=><div key={lot.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-brand/15 bg-white p-3 text-sm">
              <div className="min-w-0 flex-1">
                <b dir="ltr" className="inline-block break-all">{lot.code}</b>
                <p className="mt-1 break-words text-[#526975]">الصلاحية: {lot.expiryDate} · الكمية: {lot.stock} {saleUnitLabel(stockProduct.saleUnit)}</p>
                {canEditProducts&&<div className="mt-2">
                  <p className="text-sm font-bold text-[#457486]">تكلفة شراء وحدة البيع ({saleUnitLabel(stockProduct.saleUnit)}): <strong className={lot.purchaseCostIqd==null?'text-[#956c20]':'text-[#256c83]'}>{lot.purchaseCostIqd==null?'غير محددة بعد (اختيارية)':lot.purchaseCostIqd.toLocaleString('en-US')+' د.ع'}</strong></p>
                  {lot.purchaseCostIqd!=null&&<p className="mt-1 text-xs text-[#557987]">فرق سعر البيع الحالي عن سعر الشراء، قبل المصاريف: {(stockProduct.price-lot.purchaseCostIqd).toLocaleString('en-US')} د.ع للوحدة (مو صافي ربح).</p>}
                  {lotCostEdit===lot.id?<div className="mt-2 rounded-xl border border-[#c2dfeb] bg-[#f6fbff] p-3">
                    <label className="block text-sm font-bold text-[#345968]">تكلفة شراء وحدة البيع بالدينار العراقي
                      <input aria-label="تكلفة شراء وحدة البيع للتشغيلة بالدينار" type="text" inputMode="numeric" dir="ltr" value={lotCostInput}
                        onChange={e=>{setLotCostInput(e.target.value);setLotError('')}} className="mt-2 block w-full max-w-[250px] rounded-lg border border-[#b8dce8] bg-white p-3 text-base"
                        placeholder="مثلاً 5000"/>
                    </label>
                    <p className="mt-2 text-xs leading-6 text-[#4d7080]">اكتب تكلفة الوحدة، مو مجموع الشحنة. تركها فارغة يعني غير معروفة؛ كتابة 0 تعني الشحنة مجانية فعلاً.</p>
                    {lotCostInput.trim()!==''&&validCost(lotCostInput)!=null&&<p className="mt-2 text-xs font-bold text-[#24728d]">فرق سعر البيع الحالي قبل المصاريف: {(stockProduct.price-Number(validCost(lotCostInput))).toLocaleString('en-US')} د.ع للوحدة</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={lotCostBusy} onClick={()=>void saveLotCost(lot)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{lotCostBusy?'جاري الحفظ...':'حفظ تكلفة الشراء'}</button>
                      <button type="button" disabled={lotCostBusy} onClick={()=>setLotCostEdit(null)} className="rounded-lg border border-[#afccda] bg-white px-4 py-2 text-sm font-bold text-[#345968]">إلغاء</button>
                    </div>
                  </div>:<button type="button" onClick={()=>{setLotError('');setLotCostEdit(lot.id);setLotCostInput(lot.purchaseCostIqd==null?'':String(lot.purchaseCostIqd));}}
                    className="mt-2 rounded-lg border border-brand/20 bg-white px-3 py-2 text-sm font-bold text-brand hover:bg-[#f1fbff]">
                    {lot.purchaseCostIqd==null?'تسجيل تكلفة الشراء':'تعديل تكلفة الشراء'}
                  </button>}
                </div>}
                <strong className={'mt-2 block '+(lot.status==='expired'?'text-red-700':lot.status==='soon'?'text-amber-700':'text-green-700')}>{lot.status==='expired'?'منتهية':lot.status==='soon'?'قريبة الانتهاء':'صالحة'}</strong>
              </div>
              <button type="button" disabled={lotBusy} onClick={()=>adjustLot(lot)} className="site-btn site-btn-outline site-btn-sm self-start shrink-0">تصحيح المخزون</button>
            </div>)}</div>
            <form onSubmit={receiveLot} className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm font-bold">رقم التشغيلة<input required maxLength={80} value={lotForm.code} onChange={e=>setLotForm({...lotForm,code:e.target.value})} className="mt-1 w-full rounded-xl border p-3" placeholder="LOT-2026-A"/></label>
              <label className="text-sm font-bold">تاريخ الصلاحية<input required type="date" value={lotForm.expiryDate} onChange={e=>setLotForm({...lotForm,expiryDate:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label>
              <label className="text-sm font-bold">الكمية المستلمة<input required type="number" min={1} max={1000000} value={lotForm.quantity} onChange={e=>setLotForm({...lotForm,quantity:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label>
              <button type="submit" disabled={lotBusy} className="site-btn site-btn-primary w-fit max-w-full justify-self-start sm:col-span-3">تسجيل التشغيلة وإضافة المخزون</button>
            </form>
          </> : <><p className="mb-3 text-xs text-neutral-600">لتفعيلها بأمان، المنتج لازم يكون بدون مخزون وبدون حركات أو طلبات سابقة. المنتجات القديمة تبقى على النظام السابق.</p><button type="button" disabled={lotBusy||stockProduct.stock!==0} onClick={enableLots} className="site-btn site-btn-outline site-btn-sm">تفعيل تتبع التشغيلات</button></>}
          {lotError&&<p role="alert" className="mt-3 font-bold text-red-700">{lotError}</p>}
        </div>
        {!lotsData?.product?.lotTracking && <form onSubmit={saveStock} className="grid gap-3 sm:grid-cols-[130px_1fr_auto] items-end">
          <label className="text-sm font-bold">فرق الكمية<input type="number" step="1" required value={stockDelta} onChange={e=>setStockDelta(e.target.value)} className="mt-1 block w-full rounded-xl border border-brand/30 p-3" placeholder="+5 أو -2" /></label>
          <label className="text-sm font-bold">سبب التعديل<input required maxLength={250} value={stockReason} onChange={e=>setStockReason(e.target.value)} className="mt-1 block w-full rounded-xl border border-brand/30 p-3" placeholder="توريد، جرد، تلف..." /></label>
          <button type="submit" disabled={actionBusy} className="site-btn site-btn-primary">مراجعة تصحيح المخزون</button>
        </form>}
        <p className="mt-2 text-xs text-neutral-600">لإضافة توريد أو توثيق تلف أو فرق جرد. مبيعات الزبائن والمرتجعات تغيّر المخزون تلقائياً.</p>
        {stockError && <p role="alert" className="mt-3 font-bold text-red-700">{stockError}</p>}
        <h4 className="font-black mt-6 mb-3">آخر حركات المخزون</h4>
        <div className="max-h-64 overflow-auto space-y-2 text-sm">{stockHistory.length === 0 ? <p className="text-neutral-500">ماكو حركات مخزون مسجلة بعد.</p> : stockHistory.map((entry: any)=><div key={entry.id} className="rounded-xl border border-brand/15 px-4 py-3 flex flex-wrap justify-between gap-3"><span>{entry.reason} — {entry.delta > 0 ? '+' : ''}{entry.delta}</span><span>{entry.before} ← {entry.after}</span><time>{new Date(entry.createdAt).toLocaleString('ar-IQ')}</time></div>)}</div>
      </section>}

      {showAddForm && (
        <ProductForm product={editingProduct} existingCategories={existingCategories} onSave={handleSave} onCancel={() => { setShowAddForm(false); setEditingProduct(null); }} loading={loading} />
      )}

      {visibilityError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 font-bold text-red-700">{visibilityError}</p>}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="تصفية المنتجات حسب الحالة">
        {([
          ['all','كل المنتجات'],['low','مخزون قليل'],['out','غير متوفر'],['hidden','مخفي عن الزبائن']
        ] as [InventoryView,string][]).map(([key,label])=>
          <button key={key} type="button" onClick={()=>setInventoryView(key)} aria-pressed={inventoryView===key}
            className={`rounded-2xl border p-3 text-right transition sm:p-4 ${inventoryView===key?'border-[#5bbbd9] bg-[#eaf8fc]':'border-[#d1e7ee] bg-white hover:border-brand'}`}>
            <span className="block text-xs font-bold text-[#617b89]">{label}</span>
            <strong className={`mt-2 block text-2xl font-black ${key==='out'?'text-red-700':key==='low'?'text-amber-700':'text-brand'}`}>{inventorySummary[key]}</strong>
          </button>)}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="admin-product-search" className="sr-only">البحث في المنتجات والمخزون</label>
        <input id="admin-product-search" type="search" value={searchQuery}
          onChange={e=>setSearchQuery(e.target.value)} placeholder="ابحث بالاسم، SKU، الماركة أو القسم..."
          className="site-input min-h-11 min-w-0 flex-1 px-4 py-2 text-sm sm:max-w-lg"/>
        <span role="status" className="text-xs font-bold text-[#647e8a]">{filteredProducts.length} منتج مطابق</span>
      </div>
      {filteredProducts.length===0&&<div className="site-surface mb-4 p-8 text-center">
        <p className="font-black text-[#315465]">ماكو منتجات تطابق البحث أو الفلتر.</p>
        <button type="button" className="mt-3 text-sm font-bold text-brand underline" onClick={()=>{setSearchQuery('');setInventoryView('all')}}>عرض كل المنتجات</button>
      </div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:hidden" aria-label="بطاقات إدارة المنتجات">
        {filteredProducts.map(p=>{
          const available=sellableStock(p);
          return <article key={p.id} className="min-w-0 rounded-[22px] border border-[#cce5ee] bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#edf7fb] text-brand">
                {p.image?<img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-contain p-1"/>:<ProductIcon name={p.icon||'Package'} size={32}/>}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-sm font-black text-[#234757]">{p.name}</h3>
                <p className="mt-1 break-words text-xs text-[#708793]">{p.brand||'بدون ماركة'} · {p.category||'غير مصنف'}</p>
                {p.sku&&<p dir="ltr" className="mt-1 break-all text-left text-[11px] text-[#708793]">SKU: {p.sku}</p>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {p.published===false&&<span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-900">مخفي عن الزبائن</span>}
              {available===0&&<span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-black text-red-700">غير متوفر للبيع</span>}
              {available>0&&available<=5&&<span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">مخزون قليل</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-[#f4fafc] p-3">
              <div><span className="block text-[11px] font-bold text-[#6d8996]">سعر البيع</span><strong className="mt-1 block text-sm font-black text-[#254353]">{p.price.toLocaleString('en-US')} د.ع</strong></div>
              <div><span className="block text-[11px] font-bold text-[#6d8996]">المتاح للبيع</span><strong className={`mt-1 block text-sm font-black ${availabilityColor(available)}`}>{available} {saleUnitLabel(p.saleUnit)}</strong></div>
              {p.lotTracking&&<p className="col-span-2 text-[11px] text-[#63808e]">المخزون الفعلي: {p.stock} — المنتهي الصلاحية ما يدخل بالمتاح للبيع.</p>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={()=>openInventory(p)} className="site-btn site-btn-outline site-btn-sm !px-3">المخزون</button>
              {canEditProducts&&<button type="button" onClick={()=>handleEdit(p)} className="rounded-full border border-[#b2ddeb] bg-[#eaf8fc] px-4 py-2 text-xs font-black text-[#147fa2]">تعديل</button>}
              {canEditProducts&&<button type="button" disabled={visibilityBusy===p.id} onClick={()=>toggleVisibility(p)} className="rounded-full border border-[#c8e0e9] px-3 py-2 text-xs font-bold text-[#31586a] disabled:opacity-50">{visibilityBusy===p.id?'جاري الحفظ...':p.published===false?'إظهار بالمتجر':'إخفاء من المتجر'}</button>}
              {canEditProducts&&<button type="button" onClick={()=>handleDelete(p)} className="rounded-full border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">حذف</button>}
            </div>
          </article>;
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border-2 border-brand/20 bg-white lg:block">
        <table className="w-full min-w-[900px]">
          <thead className="bg-paper2">
            <tr>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">المنتج</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">التصنيف</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">السعر</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">المخزون</th>
              <th className="px-4 py-3 text-right font-black text-sm text-ink">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => (
              <tr key={p.id} className="border-t border-brand/10">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {p.image ? (
    <img src={p.image} alt={p.name} className="w-12 h-12 object-cover rounded-lg border border-brand/20" />
  ) : (
    <div className="text-brand"><ProductIcon name={p.icon || 'Package'} size={32} /></div>
  )}
                    <div>
                      <p className="font-bold text-sm text-ink">{p.name} {p.published === false && <span className="mr-2 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-900">مخفي عن الزبائن</span>}</p>
                      <p className="text-xs text-neutral-500">{p.brand}{p.sku ? ' · SKU: '+p.sku : ''}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-ink">{p.category}</td>
                <td className="px-4 py-3 text-sm font-bold text-ink">{p.price.toLocaleString()} د.ع</td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-bold ${availabilityColor(sellableStock(p))}`}>{sellableStock(p)} {saleUnitLabel(p.saleUnit)}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openInventory(p)} className="site-btn site-btn-outline site-btn-sm">المخزون</button>
                    {canEditProducts && <button type="button" disabled={visibilityBusy === p.id} onClick={() => toggleVisibility(p)} className="rounded-lg border border-brand/20 px-3 py-1 text-xs font-bold text-ink hover:bg-brand/10 disabled:opacity-50">{visibilityBusy === p.id ? 'جاري الحفظ...' : p.published === false ? 'إظهار بالمتجر' : 'إخفاء من المتجر'}</button>}
                    {canEditProducts && <button onClick={() => handleEdit(p)} className="text-xs bg-brand/10 text-brand rounded-lg px-3 py-1 font-bold hover:bg-brand/20">تعديل</button>}
                    {canEditProducts && <button onClick={() => handleDelete(p)} className="text-xs bg-red-50 text-red-600 rounded-lg px-3 py-1 font-bold hover:bg-red-100">حذف</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

function ProductForm({ product, existingCategories, onSave, onCancel, loading }: { product: any; existingCategories: string[]; onSave: (p: any) => Promise<string | null>; onCancel: () => void; loading: boolean }) {
  const [form, setForm] = useState(product || { name: '', description: '', price: 0, usdPrice: 0, category: '', brand: '', icon: 'Package', stock: 0, badge: '', image: '', gallery: [], specs: [], sku: '', model: '', size: '', saleUnit: 'piece' });
  const [extraUploading,setExtraUploading]=useState(false);
  const [success, setSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [imagePreview, setImagePreview] = useState(product?.image || '');
  const [uploading, setUploading] = useState(false);
  const [priceUnit,setPriceUnit]=useState<'thousands'|'usd'>('thousands');
  const [priceText,setPriceText]=useState(product?formatThousandsIqd(product.price):'');
  const [exchangeRate,setExchangeRate]=useState<number|null>(null);
  useEffect(()=>{settingsAPI.getPublic().then((d:any)=>setExchangeRate(d.usdToIqdRate??null)).catch(()=>{})},[]);
  const parsed=priceUnit==='thousands'?parseThousandsIqd(priceText):parseUsd(priceText);
  const resolvedPrice=parsed===null?null:priceUnit==='thousands'?parsed:exchangeRate&&exchangeRate>0?Math.round(parsed*exchangeRate):null;
  const rateValid=exchangeRate!==null&&Number.isSafeInteger(exchangeRate)&&exchangeRate>=1&&exchangeRate<=1_000_000;
  const priceValid=resolvedPrice!==null&&Number.isSafeInteger(resolvedPrice)&&resolvedPrice>=0&&resolvedPrice<=1_000_000_000&&(priceUnit!=='usd'||rateValid);


  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // عرض معاينة الصورة
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // رفع الصورة للسيرفر
    setUploading(true);
    try {
      const result = await uploadAPI.uploadImage(file);
      setForm({ ...form, image: result.url });
      setSuccess('تم رفع الصورة بنجاح');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      setImagePreview(form.image || '');
      setSaveError(error.message || 'فشل رفع الصورة');
    } finally {
      setUploading(false);
    }
  };

  const extraImages:string[]=Array.isArray(form.gallery)?form.gallery:[];
  const specifications:{label:string;value:string}[]=Array.isArray(form.specs)?form.specs:[];
  const uploadExtra=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const files=Array.from(e.target.files||[]);
    if(files.length+extraImages.length>5){setSaveError('الحد الأقصى 5 صور إضافية');return;}
    setExtraUploading(true);setSaveError('');
    try{const uploaded:string[]=[];for(const file of files){const result=await uploadAPI.uploadImage(file);uploaded.push(result.url)}setForm((old:any)=>({...old,gallery:[...(Array.isArray(old.gallery)?old.gallery:[]),...uploaded]}))}
    catch(err){setSaveError(err instanceof Error?err.message:'تعذر رفع إحدى الصور')}
    finally{setExtraUploading(false);e.target.value=''}
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!priceValid || resolvedPrice === null) {setSaveError('راجع السعر وسعر الصرف قبل الحفظ');return;}
    const usdPrice = exchangeRate && exchangeRate>0 ? Math.round(resolvedPrice / exchangeRate) : form.usdPrice;
    const error = await onSave({...form,gallery:extraImages,specs:specifications.filter(p=>p.label.trim()||p.value.trim()),price:resolvedPrice,usdPrice});
    if (error) setSaveError(error);
  };

  return (
    <div className="bg-white border-2 border-brand/20 rounded-2xl p-6 mb-6">
      <h3 className="font-black text-xl mb-6 text-ink">{product ? '✏️ تعديل منتج' : '➕ إضافة منتج جديد'}</h3>
      
      {success && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-6 text-green-700 font-bold">
          ✅ {success}
        </div>
      )}

      {saveError && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 font-bold" role="alert">{saveError}</div>}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* رفع الصورة */}
        <div className="md:col-span-2">
          <label className="block font-bold mb-2 text-sm text-ink">صورة المنتج</label>
          <div className="flex items-center gap-4">
            {imagePreview && (
              <div className="flex shrink-0 flex-col items-center gap-2">
                <img src={imagePreview} alt="معاينة صورة المنتج" className="h-24 w-24 rounded-xl border-2 border-brand/30 object-contain" />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => {
                    setForm((current: any) => ({ ...current, image: '' }));
                    setImagePreview('');
                  }}
                  className="max-w-36 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  إزالة الصورة واستخدام الأيقونة
                </button>
              </div>
            )}
            <label className="flex-1 cursor-pointer">
              <div className="border-2 border-dashed border-brand/30 rounded-xl p-6 text-center hover:border-brand transition">
                {uploading ? (
                  <p className="text-brand font-bold">جاري الرفع...</p>
                ) : (
                  <>
                    <p className="text-neutral-600 mb-2">اضغط لاختيار صورة</p>
                    <p className="text-xs text-neutral-400">JPG, PNG, WebP (حد أقصى 5MB)</p>
                  </>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        </div>

        <div className="md:col-span-2 rounded-xl border border-brand/20 p-4"><h4 className="mb-2 font-black">صور إضافية للمنتج (حتى 5)</h4><div className="mb-3 flex flex-wrap gap-3">{extraImages.map((src:string,index:number)=><div className="relative" key={src}><img src={src} alt={'صورة إضافية '+(index+1)} className="h-20 w-20 rounded-lg border object-contain"/><button type="button" aria-label="حذف الصورة الإضافية" onClick={()=>setForm((old:any)=>({...old,gallery:old.gallery.filter((url:string)=>url!==src)}))} className="absolute -left-2 -top-2 rounded-full bg-red-600 px-2 text-white">×</button></div>)}</div><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={extraUploading||extraImages.length>=5} onChange={uploadExtra} className="max-w-full text-sm"/><p className="mt-2 text-xs text-neutral-500">ارفع صور المنتج الحقيقية فقط. صورة الغلاف الأساسية تبقى كما هي.</p>{extraUploading&&<p role="status">جاري رفع الصور...</p>}</div>
        <div className="md:col-span-2 rounded-xl border border-brand/20 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="font-black">المواصفات الفنية (حتى 12)</h4><button type="button" disabled={specifications.length>=12} className="site-btn site-btn-outline site-btn-sm" onClick={()=>setForm((old:any)=>({...old,specs:[...(old.specs||[]),{label:'',value:''}]}))}>+ إضافة مواصفة</button></div>{specifications.map((spec,index)=><div key={index} className="mb-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]"><input aria-label={'اسم المواصفة '+(index+1)} maxLength={80} value={spec.label} placeholder="مثال: الشركة المصنعة" onChange={e=>setForm((old:any)=>({...old,specs:old.specs.map((p:any,i:number)=>i===index?{...p,label:e.target.value}:p)}))} className="site-input min-w-0 px-3"/><input aria-label={'قيمة المواصفة '+(index+1)} maxLength={300} value={spec.value} placeholder="مثال: DentaPro" onChange={e=>setForm((old:any)=>({...old,specs:old.specs.map((p:any,i:number)=>i===index?{...p,value:e.target.value}:p)}))} className="site-input min-w-0 px-3"/><button type="button" onClick={()=>setForm((old:any)=>({...old,specs:old.specs.filter((_:any,i:number)=>i!==index)}))} className="rounded-lg border px-3 text-red-700">حذف</button></div>)}</div>
        {/* اسم المنتج */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">اسم المنتج *</label>
          <input 
            type="text" 
            placeholder="مثال: طقم أدوات فحص أسنان"
            value={form.name} 
            onChange={(e) => setForm({ ...form, name: e.target.value })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand" 
            required 
          />
        </div>

        <div className="md:col-span-2 rounded-xl border border-brand/20 bg-[#f6fbfe] p-4">
          <h4 className="mb-3 font-black">هوية المنتج ووحدة البيع</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold">رمز المنتج SKU (اختياري وفريد)
              <input type="text" dir="ltr" maxLength={40} value={form.sku||''} onChange={e=>setForm({...form,sku:e.target.value.toUpperCase()})}
                placeholder="DNT-BOX-001" className="mt-2 w-full rounded-xl border border-brand/30 bg-white px-4 py-3 text-left"/>
              <span className="mt-1 block text-xs font-normal text-neutral-600">حروف إنجليزية وأرقام و - أو _ أو نقطة. لا يتكرر بين المنتجات.</span>
            </label>
            <label className="block text-sm font-bold">وحدة البيع
              <select value={form.saleUnit||'piece'} onChange={e=>setForm({...form,saleUnit:e.target.value})}
                className="mt-2 w-full rounded-xl border border-brand/30 bg-white px-4 py-3">
                {Object.entries(saleUnitOptions).map(([code,name])=><option key={code} value={code}>{name}</option>)}
              </select>
              <span className="mt-1 block text-xs font-normal text-neutral-600">السعر والمخزون والكمية المطلوبة تُحسب بهذه الوحدة. لا تغيّرها بعد بدء حركات المخزون أو البيع.</span>
            </label>
            <label className="block text-sm font-bold">الموديل (اختياري)
              <input type="text" maxLength={100} value={form.model||''} onChange={e=>setForm({...form,model:e.target.value})}
                placeholder="TM-20" className="mt-2 w-full rounded-xl border border-brand/30 bg-white px-4 py-3"/>
            </label>
            <label className="block text-sm font-bold">القياس / الحجم (اختياري)
              <input type="text" maxLength={100} value={form.size||''} onChange={e=>setForm({...form,size:e.target.value})}
                placeholder="20 ml أو Size M" className="mt-2 w-full rounded-xl border border-brand/30 bg-white px-4 py-3"/>
            </label>
          </div>
        </div>

        {/* التصنيف */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">التصنيف *</label>
          <input 
            type="text" 
            placeholder="اختَر قسمًا موجودًا أو اكتب قسمًا جديدًا"
            value={form.category} 
            onChange={(e) => setForm({ ...form, category: e.target.value })} 
            list="thanaya-product-categories"
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand" 
            required 
          />
          <datalist id="thanaya-product-categories">{existingCategories.map(name => <option key={name} value={name} />)}</datalist>
          <p className="text-xs text-neutral-500 mt-1">اختَر الاسم الموجود إذا المنتج من نفس القسم؛ اختلاف الكتابة ينشئ قسمًا ثانيًا بالمتجر.</p>
        </div>

        <div className="md:col-span-2 rounded-xl border border-brand/20 bg-paper2/30 p-4 space-y-3">
          <label className="block font-bold text-sm">وحدة إدخال السعر</label>
          <select value={priceUnit} onChange={e=>{
            const unit=e.target.value as 'thousands'|'usd';
            setPriceUnit(unit);
            setPriceText(unit==='thousands'?formatThousandsIqd(resolvedPrice??form.price):exchangeRate?String(Number(((resolvedPrice??form.price)/exchangeRate).toFixed(2))):'');
          }} className="w-full rounded-xl border border-brand/30 bg-white px-4 py-3">
            <option value="thousands">بالألف دينار العراقي (25 = 25,000 د.ع)</option>
            <option value="usd">دولار أمريكي ($10 = عشرة دولارات)</option>
          </select>
          <label className="block font-bold text-sm">
            {priceUnit==='thousands'?'السعر بالألف دينار':'السعر بالدولار'}
            <input required type="text" inputMode="decimal" value={priceText} placeholder={priceUnit==='thousands'?'مثال: 25 أو 12.5':'مثال: 10 أو 12.50'}
              onChange={e=>setPriceText(e.target.value)}
              className="mt-2 w-full rounded-xl border border-brand/30 bg-white px-4 py-3" />
          </label>
          {priceUnit==='usd'&&<p className={rateValid?'text-sm font-bold text-ink':'text-sm font-bold text-red-700'}>{rateValid?`سعر الصرف المعتمد: 1 دولار = ${exchangeRate.toLocaleString('en-US')} د.ع. الحسبة: ${priceText||'0'} × ${exchangeRate.toLocaleString('en-US')}`:'حدد سعر صرف موجب في إعدادات ثنايا قبل حفظ السعر.'}</p>}
          {priceUnit==='usd'&&rateValid&&exchangeRate!==null&&(exchangeRate<1000||exchangeRate>3000)&&<p className="text-sm text-amber-700">تنبيه: سعر الصرف غير معتاد، راجع الحسبة قبل الحفظ.</p>}
          <p className={priceValid?'text-sm font-bold text-brand':'text-sm font-bold text-red-700'} role="status">
            {priceValid&&resolvedPrice!==null?'السعر النهائي: '+formatFullIqd(resolvedPrice):'أدخل سعراً صالحاً قبل الحفظ.'}
          </p>
          <p className="text-xs text-neutral-600">السعر ينحفظ بالدينار الكامل. الطلبات القديمة ما تتغير.</p>
        </div>

        {/* الماركة */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">الماركة / الشركة المصنعة *</label>
          <input 
            type="text" 
            placeholder="مثال: DentaPro"
            value={form.brand} 
            onChange={(e) => setForm({ ...form, brand: e.target.value })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand" 
            required 
          />
        </div>

        {/* المخزون */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">{product ? 'المخزون (للعرض فقط)' : 'الكمية الابتدائية (المخزون) *'}</label>
          <input 
            type="number" 
            placeholder="مثال: 50"
            value={form.stock ?? ''} 
            onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand" 
            required
            readOnly={Boolean(product)}
            min={0}
          />
          {product && <p className="text-xs text-neutral-500 mt-1">لتغيير الكمية استخدم زر المخزون بجانب المنتج حتى تُسجَّل الحركة.</p>}
        </div>

        {/* الأيقونة */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">اسم الأيقونة (احتياطي)</label>
          <input 
            type="text" 
            placeholder="مثال: Stethoscope, Package, Heart"
            value={form.icon} 
            onChange={(e) => setForm({ ...form, icon: e.target.value })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand" 
          />
          <p className="text-xs text-neutral-500 mt-1">تستخدم إذا لم توجد صورة</p>
        </div>

        {/* البادج */}
        <div>
          <label className="block font-bold mb-2 text-sm text-ink">الشارة (اختياري)</label>
          <select 
            value={form.badge || ''} 
            onChange={(e) => setForm({ ...form, badge: e.target.value })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand bg-white"
          >
            <option value="">بدون شارة</option>
            <option value="new">جديد</option>
            <option value="sale">خصم</option>
            <option value="popular">مطلوب</option>
          </select>
        </div>

        {/* الوصف */}
        <div className="md:col-span-2">
          <label className="block font-bold mb-2 text-sm text-ink">وصف المنتج *</label>
          <textarea 
            placeholder="اكتب وصفاً تفصيلياً للمنتج..."
            value={form.description} 
            onChange={(e) => setForm({ ...form, description: e.target.value })} 
            className="w-full border-2 border-brand/30 rounded-xl px-4 py-3 focus:outline-none focus:border-brand resize-none" 
            rows={4} 
            required 
          />
        </div>

        {/* الأزرار */}
        <div className="md:col-span-2 flex gap-3 pt-2">
          <button type="submit" disabled={loading || uploading || extraUploading} className="bg-brand text-white rounded-full px-8 py-3 font-bold disabled:opacity-50 hover:bg-brand-dark transition">
            {loading ? 'جاري الحفظ...' : (product ? 'تحديث المنتج' : 'إضافة المنتج')}
          </button>
          <button type="button" onClick={onCancel} className="bg-gray-200 text-gray-700 rounded-full px-8 py-3 font-bold hover:bg-gray-300 transition">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}
