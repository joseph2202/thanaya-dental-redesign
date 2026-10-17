const items = ['مستلزمات طب الأسنان', 'أجهزة طبية', 'منتجات العيادات', 'معدات المختبر', 'مستلزمات التعقيم', 'من البصرة إلى أنحاء العراق'];

export default function Ticker() {
  return <div className="bg-[#079ecb] border-y border-[#0494c3] overflow-hidden py-3 text-white" aria-label="أقسام المتجر">
    <div className="animate-marquee gap-10 text-xs font-bold whitespace-nowrap" aria-hidden="true">
      {[...items, ...items].map((item, i) => <span key={i} className="inline-flex items-center gap-10">{item}<span className="w-1.5 h-1.5 bg-white/80 rounded-full" /></span>)}
    </div>
  </div>;
}
