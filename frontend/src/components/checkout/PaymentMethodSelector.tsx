"use client";
import {Banknote,CheckCircle2,CreditCard,LockKeyhole,ShieldCheck,WalletCards} from 'lucide-react';

// A future payment gateway MUST supply its own hosted/card-tokenization UI.
// This component deliberately collects NO card number, CVV or expiration date.
// Cash on delivery is the only actionable selection until a processor is live.
export default function PaymentMethodSelector(){
 return <section aria-labelledby="checkout-payment-title" className="rounded-[24px] border border-brand/25 bg-paper2/60 p-4 sm:p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <span className="site-eyebrow">THANAYA / PAYMENT</span>
    <h3 id="checkout-payment-title" className="mt-1 text-lg font-black text-ink">اختَر طريقة الدفع</h3>
    <p className="site-muted mt-1 text-xs leading-6">الدفع عند الاستلام متاح حالياً. واجهة البطاقات للمعاينة فقط إلى حين ربط مزود دفع معتمد.</p>
   </div>
   <div className="grid h-11 w-11 place-items-center rounded-2xl border border-brand/20 bg-paper text-brand"><WalletCards size={22}/></div>
  </div>

  <div role="radiogroup" aria-label="طريقة دفع الطلب" className="mt-4 grid gap-3">
   <label className="relative flex cursor-default items-start gap-3 rounded-2xl border-2 border-brand bg-paper p-4 shadow-[0_6px_20px_rgba(0,141,184,.08)]">
    <input type="radio" name="payment-method" value="cod" checked readOnly className="mt-1 h-4 w-4 shrink-0 accent-[#0095bd]" aria-label="الدفع عند الاستلام"/>
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Banknote size={23}/></span>
    <span className="min-w-0 flex-1">
     <span className="block text-sm font-black text-ink">الدفع النقدي عند الاستلام</span>
     <span className="site-muted mt-1 block text-xs leading-6">تأكد الطلب الآن وادفع عند وصول المندوب، وفق مبلغ الطلب النهائي.</span>
    </span>
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-black text-emerald-700">
     <CheckCircle2 size={13}/> متاح
    </span>
   </label>

   <div aria-disabled="true" className="relative overflow-hidden rounded-2xl border border-dashed border-brand/30 bg-paper/50 p-4">
    <div className="flex items-start gap-3">
     <span aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 rounded-full border-2 border-slate-400/60"/>
     <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand/70"><CreditCard size={23}/></span>
     <span className="min-w-0 flex-1">
      <span className="block text-sm font-black text-ink/85">الدفع ببطاقة ائتمانية أو بطاقة خصم</span>
      <span className="site-muted mt-1 block text-xs leading-6">مخصص لدعم البطاقات التي يقبلها مزود الدفع عند ربطه، وليس لدينا قبول بطاقات مباشر حالياً.</span>
     </span>
     <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] font-black text-amber-700">قريباً</span>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/15 bg-paper2/55 px-3 py-2">
     <span className="site-muted flex items-center gap-2 text-[11px]"><LockKeyhole size={14}/> لا نطلب رقم البطاقة أو CVV أو تاريخ الانتهاء</span>
     <span className="site-muted flex items-center gap-1 text-[11px]"><ShieldCheck size={14}/> الربط الآمن لاحقاً</span>
    </div>
   </div>
  </div>
  <p className="site-muted mt-3 text-xs leading-6" role="note">تأكيد الطلب أدناه يعني <strong>الدفع عند الاستلام فقط</strong>. لا يتم خصم أي مبلغ من بطاقة إلكترونياً.</p>
 </section>;
}
