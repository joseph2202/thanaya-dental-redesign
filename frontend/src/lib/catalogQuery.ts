export type CatalogFilterValues = {
  search:string; category:string; brand:string; sort:string;
  minPrice:string; maxPrice:string; inStock:boolean;
};
const limits={search:100,category:90,brand:120,sort:20,minPrice:20,maxPrice:20} as const;
type ApiFilters=Partial<Record<keyof typeof limits,string>>;

// Next supplies repeated URL values as arrays. Do not send them to a text
// input or coerce them into a broader, unintended server query.
export function parseCatalogQuery(input:Record<string,unknown>):
  {ok:true; filters:CatalogFilterValues; api:ApiFilters} | {ok:false; error:string} {
  const api:ApiFilters={};
  const filters:CatalogFilterValues={search:'',category:'',brand:'',sort:'',minPrice:'',maxPrice:'',inStock:false};
  for(const key of Object.keys(limits) as (keyof typeof limits)[]){
    const raw=input[key];
    if(raw===undefined)continue;
    if(typeof raw!=='string')return {ok:false,error:'بعض الفلاتر مكررة أو غير صالحة. امسح الفلاتر واخترها من جديد.'};
    const value=raw.trim();
    if(value.length>limits[key])return {ok:false,error:'قيمة أحد الفلاتر طويلة جداً. قصّر البحث أو اختر الفلاتر من جديد.'};
    filters[key]=value;
    if(value)api[key]=value;
  }
  for(const key of ['minPrice','maxPrice'] as const){
    const value=filters[key];
    if(value&&(!/^[0-9]+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>1000000000)){
      return {ok:false,error:'السعر لازم يكون رقماً صحيحاً بالدينار العراقي، من صفر إلى مليار.'};
    }
  }
  if(filters.minPrice&&filters.maxPrice&&Number(filters.minPrice)>Number(filters.maxPrice)){
    return {ok:false,error:'الحد الأدنى للسعر أكبر من الحد الأعلى'};
  }
  if(filters.sort&&!['price-asc','price-desc','name'].includes(filters.sort))return {ok:false,error:'ترتيب المنتجات غير صالح. اختر الترتيب من القائمة.'};
  if(input.inStock!==undefined&&input.inStock!==''&&input.inStock!=='1')return {ok:false,error:'فلتر توفر المنتجات غير صالح. اختره من القائمة.'};
  filters.inStock=input.inStock==='1';
  return {ok:true,filters,api};
}
