const items = ['طب الأسنان', 'أجهزة طبية', 'مستلزمات عيادات', 'مختبرات', 'تعقيم', 'احتياجات يومية'];

export default function Ticker() {
  return <div className="bg-[#e9f0fc] border-y border-[#dbe7fa] overflow-hidden py-3 text-brand" aria-label="أقسام المتجر">
    <div className="animate-marquee gap-10 text-xs font-bold whitespace-nowrap" aria-hidden="true">
      {[...items, ...items].map((item, i) => <span key={i} className="inline-flex items-center gap-10">{item}<span className="w-1.5 h-1.5 bg-accent rounded-full" /></span>)}
    </div>
  </div>;
}
