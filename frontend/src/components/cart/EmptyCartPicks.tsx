"use client";

import {useEffect,useState} from 'react';
import {productsAPI} from '@/lib/api';
import CatalogProductCard,{type CatalogCardProduct} from '@/components/catalog/CatalogProductCard';

export default function EmptyCartPicks(){
 const [products,setProducts]=useState<CatalogCardProduct[]>([]);
 useEffect(()=>{
  let live=true;
  productsAPI.getAll()
   .then((list:CatalogCardProduct[])=>{if(live)setProducts(list.filter(p=>(p.availableStock??p.stock)>0).slice(0,3));})
   .catch(()=>{}); // The empty basket remains useful during API failures.
  return ()=>{live=false;};
 },[]);
 if(!products.length)return null;
 return <section aria-labelledby="cart-picks-title" className="mx-auto mt-10 max-w-4xl">
  <div className="mb-5 text-center">
   <span className="site-eyebrow" dir="ltr">START HERE</span>
   <h2 id="cart-picks-title" className="mt-2 text-xl font-black text-[#234b5d] sm:text-2xl">ابدأ بمنتج من كتالوج ثنايا</h2>
   <p className="mt-2 text-xs font-semibold text-[#718e9b]">منتجات متوفرة حالياً حسب الكتالوج؛ يتأكد المخزون مرة ثانية عند الطلب.</p>
  </div>
  <div className={`grid gap-3.5 sm:gap-5 ${products.length===1?'mx-auto max-w-[320px]':products.length===2?'mx-auto max-w-[680px] grid-cols-2':'mx-auto max-w-[820px] grid-cols-2 lg:grid-cols-3'}`}>
   {products.map(product=><CatalogProductCard key={product.id} product={product}/>)}
  </div>
 </section>;
}
