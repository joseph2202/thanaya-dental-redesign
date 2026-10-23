// Only displayed while the server is fetching fresh public catalog data.
// A bounded request in HomeCatalog replaces this state with cards or an error.
export default function HomeCatalogFallback(){
 return <section id="featured-products" className="site-container py-10" role="status" aria-label="جاري تجهيز منتجات ثنايا">
  <div className="mb-6 space-y-3">
   <div className="h-4 w-36 animate-pulse rounded-lg bg-[#46768a]/20"/>
   <div className="h-9 w-64 max-w-full animate-pulse rounded-lg bg-[#46768a]/20"/>
  </div>
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
   {[0,1,2].map(i=><div key={i} aria-hidden="true" className="site-surface rounded-[22px] border p-4">
    <div className="aspect-[5/3] animate-pulse rounded-xl bg-[#46768a]/20"/>
    <div className="mt-4 h-5 w-3/4 animate-pulse rounded bg-[#46768a]/20"/>
    <div className="mt-3 h-4 w-2/5 animate-pulse rounded bg-[#46768a]/20"/>
   </div>)}
  </div>
  <p className="site-muted mt-5 text-xs">نتحقق من المنتجات الحالية...</p>
 </section>;
}
