export type Product = {
  id:string; name:string; price:number; stock:number;
  description?:string; usdPrice?:number; category?:string; brand?:string;
  icon?:string; image?:string|null; badge?:string; saleUnit?:string|null;
};
export type CartItem = {product:Product;quantity:number};
export const cartLimits={lines:50,quantity:100,price:1000000000,stock:1000000} as const;
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const integer=(value:unknown,max:number):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;

// Browser snapshots are display hints, never inventory or pricing authority.
// Whitelist fields so corrupt/legacy storage cannot crash the whole provider.
export function productSnapshot(value:unknown):Product|null {
  if(!record(value)||typeof value.id!=='string'||!value.id.trim()||value.id.length>120||
    typeof value.name!=='string'||!value.name.trim()||value.name.length>160||
    !integer(value.price,cartLimits.price)||!integer(value.stock,cartLimits.stock))return null;
  const product:Product={id:value.id,name:value.name,price:value.price,stock:value.stock};
  for(const [key,limit] of [['description',4000],['category',90],['brand',120],['icon',80]] as const){
    if(typeof value[key]==='string'&&value[key].length<=limit)product[key]=value[key];
  }
  if(typeof value.usdPrice==='number'&&Number.isFinite(value.usdPrice)&&value.usdPrice>=0&&value.usdPrice<=cartLimits.price)product.usdPrice=value.usdPrice;
  if(value.image===null)product.image=null;
  else if(typeof value.image==='string'&&value.image.length<=2048&&
    (/^https?:\/\//i.test(value.image)||(/^\/(?!\/)/.test(value.image))))product.image=value.image;
  if(typeof value.badge==='string'&&['new','sale','popular'].includes(value.badge))product.badge=value.badge;
  if(value.saleUnit===null)product.saleUnit=null;
  else if(typeof value.saleUnit==='string'&&['piece','box','set','pack','pair','bottle','tube','carton','bag','roll'].includes(value.saleUnit))product.saleUnit=value.saleUnit;
  return product;
}

export function decodeSavedCart(raw:string|null):{items:CartItem[];recovered:boolean} {
  if(raw===null)return {items:[],recovered:false};
  if(raw.length>500000)return {items:[],recovered:true};
  let value:unknown;
  try{value=JSON.parse(raw)}catch{return {items:[],recovered:true};}
  if(!Array.isArray(value))return {items:[],recovered:true};
  const items:CartItem[]=[],ids=new Set<string>();let recovered=false;
  for(const entry of value){
    const product=record(entry)?productSnapshot(entry.product):null;
    if(!record(entry)||!product||!integer(entry.quantity,cartLimits.quantity)||entry.quantity<1||
      ids.has(product.id)||items.length>=cartLimits.lines){recovered=true;continue;}
    ids.add(product.id);items.push({product,quantity:entry.quantity});
  }
  return {items,recovered};
}
