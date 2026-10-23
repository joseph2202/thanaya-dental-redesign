"use client";

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,ArrowUpLeft,BadgeCheck,BarChart3,Check,ChevronLeft,
  ClipboardList,Layers3,Menu,Minus,Package,Plus,Search,ShieldCheck,
  ShoppingBag,Sparkles,Stethoscope,Trash2,Truck,Wallet,X
} from 'lucide-react';
import {productsAPI} from '@/lib/api';
import ProductMedia from '@/components/ui/ProductMedia';
import type {Product} from '@/context/CartContext';
import {saleUnitLabel} from '@/lib/saleUnits';

type PreviewProduct=Product&{
  availableStock?:number;sku?:string;model?:string;size?:string;
  specs?:{label:string;value:string}[];
};
type View='home'|'products'|'detail'|'cart'|'admin';
type Theme='dark'|'light';
type AdminTab='inventory'|'orders'|'reports';
const currency=(n:number)=>n.toLocaleString('en-US')+' د.ع';
const nav:{key:View;label:string}[]=[
  {key:'home',label:'الرئيسية'}, {key:'products',label:'المنتجات'},
  {key:'detail',label:'تفاصيل المنتج'}, {key:'cart',label:'السلة'},
  {key:'admin',label:'لوحة الإدارة'}
];

export default function ThemePreview(){
 const [theme,setTheme]=useState<Theme>('dark');
 const [view,setView]=useState<View>('home');
 const [products,setProducts]=useState<PreviewProduct[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const [selected,setSelected]=useState<string|null>(null);
 const [cart,setCart]=useState<Record<string,number>>({});
 const [filter,setFilter]=useState('');
 const [category,setCategory]=useState('');
 const [adminTab,setAdminTab]=useState<AdminTab>('inventory');
 const [notice,setNotice]=useState('');
 const [mobileNav,setMobileNav]=useState(false);

 useEffect(()=>{
  let live=true;
  productsAPI.getAll().then((data:PreviewProduct[])=>{
   if(live){setProducts(data);setSelected(data[0]?.id??null);}
  }).catch(()=>{if(live)setError(true)})
   .finally(()=>{if(live)setLoading(false)});
  return ()=>{live=false};
 },[]);

 const picked=products.find(p=>p.id===selected)||products[0];
 const visible=products.filter(p=>
  (!category||p.category===category)&&
  (!filter.trim()||[p.name,p.brand,p.category,p.sku].some(v=>v?.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())))
 );
 const categories=[...new Set(products.map(p=>p.category?.trim()).filter((v):v is string=>Boolean(v)))];
 const cartLines=products.filter(p=>(cart[p.id]||0)>0);
 const itemCount=cartLines.reduce((sum,p)=>sum+(cart[p.id]||0),0);
 const subtotal=cartLines.reduce((sum,p)=>sum+(cart[p.id]||0)*p.price,0);
 const available=(p:PreviewProduct)=>Math.max(0,p.availableStock??p.stock??0);
 const availableCount=products.filter(p=>available(p)>0).length;
 const productCount=products.length;

 function go(next:View){
  setView(next);setNotice('');setMobileNav(false);
  if(typeof window!=='undefined')window.scrollTo({top:0,behavior:'smooth'});
 }
 function choose(p:PreviewProduct){setSelected(p.id);go('detail');}
 function add(p:PreviewProduct){
  const max=Math.min(100,available(p));
  if(max<=0){setNotice('هذا المنتج غير متوفر حالياً.');return;}
  if((cart[p.id]||0)>=max){setNotice('وصلت للحد المتاح ضمن هذه المعاينة.');return;}
  setCart(old=>({...old,[p.id]:(old[p.id]||0)+1}));
  setNotice('أُضيف المنتج لسلة المعاينة فقط؛ لم يتغير مخزون أو سلة ثنايا الحقيقية.');
 }
 function changeQty(p:PreviewProduct,next:number){
  if(next>Math.min(100,available(p)))return;
  setCart(old=>{
   const updated={...old};
   if(next<=0)delete updated[p.id];else updated[p.id]=next;
   return updated;
  });
 }
 function browseCategory(value:string){setCategory(value);go('products');}
 function ProductCard({product}:{product:PreviewProduct}){
  const qty=available(product);
  return <article className="thl-product">
   <button type="button" onClick={()=>choose(product)} className="thl-product-image" aria-label={`عرض تفاصيل ${product.name}`}>
    <ProductMedia image={product.image} icon={product.icon} name={product.name} size={55} className="thl-media"/>
    <span className={`thl-stock ${qty===0?'is-out':''}`}>{qty>0?'● متوفر':'غير متوفر'}</span>
    {!product.image&&<span className="thl-no-photo">بدون صورة مرفوعة</span>}
   </button>
   <div className="thl-product-info">
    <span className="thl-small-accent">{product.category||'مستلزمات طبية'}</span>
    <button type="button" onClick={()=>choose(product)} className="thl-product-name">{product.name}</button>
    <p className="thl-faint text-xs">{product.brand||'العلامة غير محددة'}</p>
    <div className="thl-product-price"><span className="thl-faint text-xs">السعر / {saleUnitLabel(product.saleUnit)}</span>
     <strong>{currency(product.price)}</strong></div>
    <button type="button" disabled={qty===0} onClick={()=>add(product)} className="thl-cta thl-product-add">
     <ShoppingBag size={16}/> إضافة لسلة المعاينة
    </button>
   </div>
  </article>;
 }
 function LoadState(){
  return loading?<div className="thl-empty">جاري قراءة كتالوج ثنايا للمعاينة...</div>:
   error?<div role="alert" className="thl-empty">تعذّر قراءة المنتجات. تأكد أن الباكند شغال؛ باقي صفحات المعاينة متاحة.</div>:
   <div className="thl-empty">ماكو منتجات منشورة حالياً؛ المعاينة ما تنشئ منتجات وهمية.</div>;
 }

 return <div className="thl-shell" data-theme={theme} dir="rtl">
  <div className="thl-lab-bar">
   <div className="thl-wrap thl-lab-inner">
    <span className="thl-lab-identity"><Sparkles size={15}/> مختبر تصميم ثنايا — معاينة منفصلة، بدون تغيير المتجر</span>
    <div className="thl-top-actions">
     <div className="thl-tone" role="group" aria-label="قارن نمط الألوان">
      <button type="button" aria-pressed={theme==='dark'} onClick={()=>setTheme('dark')}>داكن</button>
      <button type="button" aria-pressed={theme==='light'} onClick={()=>setTheme('light')}>فاتح</button>
     </div>
     <Link href="/" className="thl-exit">الموقع الأصلي <ArrowUpLeft size={15}/></Link>
    </div>
   </div>
  </div>

  <header className="thl-header">
   <div className="thl-wrap thl-header-inner">
    <button type="button" className="thl-brand" onClick={()=>go('home')} aria-label="معاينة ثنايا الرئيسية">
     <Image src="/logo-icon.png" width={40} height={40} alt="" className="h-10 w-10 object-contain"/>
     <span><strong>ثنايا</strong><small dir="ltr">THANAYA MEDICAL</small></span>
    </button>
    <nav aria-label="صفحات المعاينة" className="thl-desktop-nav">
     {nav.map(item=><button type="button" key={item.key} aria-current={view===item.key?'page':undefined}
       onClick={()=>go(item.key)}>{item.label}</button>)}
    </nav>
    <div className="thl-header-buttons">
     <button type="button" className="thl-basket-link" onClick={()=>go('cart')} aria-label={`سلة المعاينة: ${itemCount} قطع`}>
      <ShoppingBag size={17}/> <span className="hidden sm:inline">السلة</span><span className="thl-basket-count">{itemCount}</span>
     </button>
     <button type="button" className="thl-menu-button" onClick={()=>setMobileNav(x=>!x)} aria-expanded={mobileNav} aria-label="صفحات المعاينة">
      {mobileNav?<X size={21}/>:<Menu size={21}/>}
     </button>
    </div>
   </div>
   {mobileNav&&<nav aria-label="التنقل بالموبايل" className="thl-mobile-nav thl-wrap">{nav.map(item=>
    <button key={item.key} type="button" aria-current={view===item.key?'page':undefined} onClick={()=>go(item.key)}>{item.label}</button>)}</nav>}
  </header>

  {notice&&<div className="thl-notice thl-wrap" role="status"><Check size={17}/>{notice}<button type="button" onClick={()=>setNotice('')} aria-label="إخفاء الملاحظة"><X size={16}/></button></div>}

  <main className="thl-wrap thl-main">
   {view==='home'&&<>
    <section className="thl-hero" aria-labelledby="thl-hero-title">
     <div className="thl-hero-copy">
      <span className="thl-kicker"><span className="thl-dot"/> THE THANAYA EXPERIENCE</span>
      <h1 id="thl-hero-title">كل ما تحتاجه<span>لعيادة متكاملة.</span></h1>
      <p>مستلزمات طب الأسنان والأجهزة الطبية، بمعلومات واضحة وأسعار بالدينار العراقي. اختر ما يناسب عيادتك بثقة.</p>
      <div className="thl-hero-actions">
       <button type="button" className="thl-cta" onClick={()=>go('products')}>تصفّح المنتجات <ArrowUpLeft size={18}/></button>
       <button type="button" className="thl-outline" onClick={()=>browseCategory(categories[0]||'')}>استكشف الأقسام <ArrowLeft size={16}/></button>
      </div>
      <div className="thl-trust"><span><ShieldCheck size={17}/> أسعار ووحدات بيع واضحة</span><span><Truck size={17}/> التوصيل حسب المحافظة</span></div>
     </div>
     <div className="thl-hero-art" aria-hidden="true">
      <div className="thl-orbit thl-orbit-one"/><div className="thl-orbit thl-orbit-two"/>
      <div className="thl-floating thl-floating-one"><Stethoscope size={29}/><small>THANAYA / CLINIC</small><b>تفاصيل مدروسة</b></div>
      <div className="thl-floating thl-floating-two"><Package size={30}/><small>SHOP THE CATALOG</small><b>كل احتياجاتك بمكان واحد</b></div>
      <div className="thl-orbit-logo"><Layers3 size={32}/></div>
     </div>
    </section>
    <section className="thl-benefits" aria-label="مميزات التسوق">
     <span><BadgeCheck size={20}/> بيانات وأسعار واضحة</span><span><ShieldCheck size={20}/> الكمية تتأكد عند الطلب</span>
     <span><ShoppingBag size={20}/> تسوق بمراحل سهلة</span>
    </section>
    <section className="thl-section" aria-labelledby="thl-featured-title">
     <div className="thl-section-heading"><div><span className="thl-small-accent">SELECTED / 01</span>
      <h2 id="thl-featured-title">منتجات لعيادتك، بتفاصيل أوضح.</h2>
      <p>معروضة من كتالوج ثنايا الحالي — بدون بيانات تجريبية إضافية.</p></div>
      <button type="button" className="thl-text-link" onClick={()=>go('products')}>كل المنتجات <ArrowUpLeft size={16}/></button>
     </div>
     {products.length?<div className="thl-products-grid">
       {products.slice(0,3).map(p=><ProductCard key={p.id} product={p}/>)}
       {products.length<3&&<aside className="thl-editorial">
        <span className="thl-small-accent">THANAYA / BETTER CHOICES</span><h3>الاختيار يبدأ<br/>من التفاصيل.</h3>
        <p>قارن مواصفات المنتج ووحدة البيع والكمية المتاحة قبل إتمام طلب عيادتك.</p>
        <button type="button" className="thl-outline" onClick={()=>go('products')}>الكتالوج الكامل <ArrowUpLeft size={16}/></button>
       </aside>}
      </div>:<LoadState/>}
    </section>
    <section className="thl-section thl-category-section">
     <div><span className="thl-small-accent">EXPLORE / CATEGORIES</span><h2>أقسام حسب المنتجات الموجودة.</h2></div>
     <div className="thl-category-chips">{categories.length?categories.map(name=>
      <button key={name} type="button" className="thl-outline" onClick={()=>browseCategory(name)}>{name}<ArrowUpLeft size={16}/></button>)
      :<span className="thl-faint">الأقسام تظهر من كتالوج ثنايا.</span>}</div>
    </section>
    <section className="thl-offer-banner" aria-labelledby="thanaya-preview-banner">
      <div className="thl-offer-art" aria-hidden="true"><Stethoscope size={44}/><span>THANAYA / BASRA</span></div>
      <div className="thl-offer-copy">
       <span className="thl-small-accent">THANAYA / BASRA</span>
       <h2 id="thanaya-preview-banner">احتياجات عيادتك، <span>أسهل مع ثنايا.</span></h2>
       <p>تصفّح مستلزمات طب الأسنان والأجهزة الطبية، واختَر اللي يناسب عيادتك من الكتالوج الحالي.</p>
      </div>
      <button type="button" className="thl-cta thl-offer-button" onClick={()=>go('products')}>ابدأ التصفّح <ArrowUpLeft size={18}/></button>
    </section>
   </>}

   {view==='products'&&<section className="thl-section thl-inner-page">
    <div className="thl-section-heading"><div><span className="thl-small-accent">THE CATALOG</span><h1>منتجات ثنايا.</h1>
      <p>تصفّح المنتجات الحالية بالمظهر الداكن المقترح، مع السعر والتوفر الحقيقيين.</p></div>
     <span className="thl-count">{visible.length} منتج</span></div>
    <div className="thl-filter">
     <label className="thl-search"><Search size={18}/><input type="search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="ابحث عن منتج أو ماركة..." aria-label="البحث في كتالوج المعاينة"/></label>
     <div className="thl-categories">
      <button type="button" aria-pressed={!category} onClick={()=>setCategory('')}>الكل</button>
      {categories.map(name=><button type="button" key={name} aria-pressed={category===name} onClick={()=>setCategory(name)}>{name}</button>)}
     </div>
    </div>
    {visible.length?<div className="thl-products-grid">{visible.map(p=><ProductCard key={p.id} product={p}/>)}</div>:
      products.length?<div className="thl-empty">ماكو منتج يطابق البحث. <button type="button" className="thl-text-link" onClick={()=>{setFilter('');setCategory('')}}>إعادة عرض الكل</button></div>:<LoadState/>}
   </section>}

   {view==='detail'&&<section className="thl-section thl-inner-page" aria-labelledby="thl-detail-title">
    <button type="button" className="thl-back" onClick={()=>go('products')}><ChevronLeft size={16}/> رجوع للكتالوج</button>
    {picked?<div className="thl-detail-grid">
      <div className="thl-detail-media">
       <span className="thl-small-accent">PRODUCT / GALLERY</span>
       <ProductMedia name={picked.name} image={picked.image} icon={picked.icon} size={90} className="thl-detail-photo"/>
       {!picked.image&&<p className="thl-faint text-xs">هذه أيقونة توضيحية؛ لم تُرفع صورة فعلية للمنتج.</p>}
      </div>
      <div className="thl-detail-info">
       <span className="thl-small-accent">{picked.category||'مستلزمات طبية'} / {picked.brand||'ثنايا'}</span>
       <h1 id="thl-detail-title">{picked.name}</h1>
       <p className="thl-faint">{picked.description?.trim()||'الوصف الفني لهذا المنتج غير مُدرج بعد.'}</p>
       <div className="thl-price-panel">
        <span className="thl-faint text-xs">السعر / {saleUnitLabel(picked.saleUnit)}</span>
        <strong>{currency(picked.price)}</strong>
        <span className="thl-stock-detail">{available(picked)>0?'● متوفر حالياً':'غير متوفر حالياً'}</span>
       </div>
       <button type="button" disabled={available(picked)===0} className="thl-cta thl-full" onClick={()=>add(picked)}><ShoppingBag size={18}/> أضف لسلة المعاينة</button>
       <div className="thl-specifications"><h2>تفاصيل ومواصفات</h2>
        <dl>{[
         ['وحدة البيع',saleUnitLabel(picked.saleUnit)],
         ['الماركة',picked.brand||'غير محددة'],
         ['القسم',picked.category||'غير محدد'],
         ['رمز المنتج',picked.sku||'غير متوفر'],
         ...(picked.specs||[]).slice(0,5).map(spec=>[spec.label,spec.value])
        ].map(([label,value],i)=><div key={i}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
       </div>
      </div>
     </div>:<LoadState/>}
   </section>}

   {view==='cart'&&<section className="thl-section thl-inner-page" aria-labelledby="thl-cart-title">
    <div className="thl-section-heading"><div><span className="thl-small-accent">PREVIEW / CART</span><h1 id="thl-cart-title">سلة ثنايا، بأسلوب داكن.</h1>
     <p>سلة معاينة مستقلة داخل هذه الصفحة فقط. ما تنشئ طلبات وما تغيّر السلة الحقيقية.</p></div>
     <span className="thl-count">{itemCount} قطعة</span></div>
    {cartLines.length?<div className="thl-cart-grid"><div className="thl-cart-list">
      {cartLines.map(p=><article key={p.id} className="thl-cart-line">
       <ProductMedia name={p.name} image={p.image} icon={p.icon} className="thl-cart-photo" size={35}/>
       <div className="thl-cart-line-main"><strong>{p.name}</strong><span className="thl-faint text-xs">{currency(p.price)} / {saleUnitLabel(p.saleUnit)}</span>
        <div className="thl-stepper">
         <button type="button" disabled={cart[p.id]<=1} onClick={()=>changeQty(p,cart[p.id]-1)} aria-label={`تقليل كمية ${p.name}`}><Minus size={16}/></button>
         <output>{cart[p.id]}</output>
         <button type="button" disabled={cart[p.id]>=Math.min(available(p),100)} onClick={()=>changeQty(p,cart[p.id]+1)} aria-label={`زيادة كمية ${p.name}`}><Plus size={16}/></button>
        </div>
       </div>
       <div className="thl-cart-line-total"><strong>{currency(cart[p.id]*p.price)}</strong>
        <button type="button" onClick={()=>changeQty(p,0)} aria-label={`إزالة ${p.name}`}><Trash2 size={18}/></button>
       </div>
      </article>)}
     </div><aside className="thl-summary"><span className="thl-small-accent">ORDER SUMMARY / VISUAL ONLY</span><h2>ملخص سلة المعاينة</h2>
       <div className="thl-summary-row"><span>المنتجات ({itemCount})</span><strong>{currency(subtotal)}</strong></div>
       <div className="thl-summary-row"><span>التوصيل</span><span>يُحدد عند طلب حقيقي</span></div>
       <div className="thl-summary-total"><span>مجموع المنتجات فقط</span><strong>{currency(subtotal)}</strong></div>
       <button type="button" className="thl-cta thl-full" disabled>إتمام الطلب غير متاح بالمعاينة</button>
       <p className="thl-faint text-xs">هذا التصميم لا يتحقق من عروض السعر لحظة الدفع؛ الموقع الحقيقي يبقى كما هو حتى الموافقة.</p>
      </aside></div>:<div className="thl-empty thl-empty-cart"><ShoppingBag size={44}/>
       <h2>سلة المعاينة فارغة.</h2><p>جرّب تضيف منتج حتى تشوف تصميم السلة الممتلئة.</p>
       <button type="button" className="thl-cta" onClick={()=>go('products')}>استكشف الكتالوج <ArrowUpLeft size={17}/></button></div>}
   </section>}

   {view==='admin'&&<section className="thl-section thl-inner-page">
    <div className="thl-section-heading"><div><span className="thl-small-accent">THANAYA / ADMIN LOOK</span><h1>تصوّر لوحة الإدارة الداكنة.</h1>
      <p>معاينة بصرية للوحة الإدارة، بدون فتح سجلات الطلبات الخاصة أو تغيير المخزون.</p></div>
     <span className="thl-count">عرض تجريبي</span></div>
    <div className="thl-admin-grid">
     <aside className="thl-admin-nav"><h2>مساحة الإدارة</h2>
      {([{key:'inventory',label:'المنتجات والمخزون',icon:Package},
        {key:'orders',label:'الطلبات',icon:ClipboardList},
        {key:'reports',label:'التقارير',icon:BarChart3}] as const).map(({key,label,icon:Icon})=>
        <button type="button" key={key} aria-pressed={adminTab===key} onClick={()=>setAdminTab(key)}><Icon size={17}/>{label}</button>)}
     </aside>
     <div className="thl-admin-area">
      {adminTab==='inventory'?<><div className="thl-admin-metrics">
       <div><span>المنتجات الظاهرة بالكتالوج</span><strong>{productCount}</strong></div>
       <div><span>متوفرة حسب الكتالوج</span><strong>{availableCount}</strong></div>
       <div><span>غير متوفرة حالياً</span><strong>{productCount-availableCount}</strong></div>
      </div>
      <div className="thl-admin-table"><h2>معاينة جدول المنتجات</h2>
       {products.length?products.slice(0,5).map(p=><div key={p.id} className="thl-admin-row">
        <span>{p.name}</span><span>{currency(p.price)}</span><span>{available(p)} {saleUnitLabel(p.saleUnit)}</span>
       </div>):<LoadState/>}
      </div></>:<div className="thl-admin-placeholder"><Wallet size={32}/>
       <h2>{adminTab==='orders'?'تصميم إدارة الطلبات':'تصميم التقارير المالية'}</h2>
       <p>هذه معاينة للألوان وتوزيع المساحات فقط. الأرقام والطلبات المالية الحقيقية ما نعرضها أو نحسبها هنا.</p>
       <div className="thl-placeholder-lines"><span/><span/><span/></div>
      </div>}
     </div>
    </div>
   </section>}
  </main>

  <footer className="thl-footer"><div className="thl-wrap">
   <div><strong>ثنايا</strong><small>THANAYA / DESIGN LAB</small></div>
   <p>معاينة Dark Theme فقط — بدون اعتماد أو نشر أو تغيير بيانات.</p>
   <Link href="/">الرجوع للموقع الأصلي <ArrowUpLeft size={15}/></Link>
  </div></footer>
 </div>;
}
