"use client";
import {Banknote,CheckCircle2,CreditCard,WalletCards} from 'lucide-react';

// A future payment gateway MUST supply its own hosted/card-tokenization UI.
// This component deliberately collects NO card number, CVV or expiration date.
// Cash on delivery is the only actionable selection until a processor is live.
export default function PaymentMethodSelector(){
 return <section aria-labelledby="checkout-payment-title" className="rounded-[24px] border border-brand/25 bg-paper2/60 p-4 sm:p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <span className="site-eyebrow">THANAYA / PAYMENT</span>
    <h3 id="checkout-payment-title" className="mt-1 text-lg font-black text-ink">اختَر طريقة الدفع</h3>
    <p className="site-muted mt-1 text-xs leading-6">اختر طريقة الدفع المناسبة لإكمال طلبك.</p>
   </div>
   <div className="hidden h-11 w-11 place-items-center rounded-2xl border border-brand/20 bg-paper text-brand min-[400px]:grid" aria-hidden="true"><WalletCards size={22}/></div>
  </div>

  <div role="radiogroup" aria-label="طريقة دفع الطلب" className="mt-4 grid gap-3">
   <label className="relative grid cursor-default grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-2xl border-2 border-brand bg-paper p-3 shadow-[0_6px_20px_rgba(0,141,184,.08)] sm:p-4">
    <input type="radio" name="payment-method" value="cod" checked readOnly className="mt-1 h-4 w-4 shrink-0 accent-[#0095bd]" aria-label="الدفع عند الاستلام"/>
    <span className="min-w-0">
     <span className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-black text-ink">الدفع النقدي عند الاستلام</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-black th-stock-ok"><CheckCircle2 size={13} aria-hidden="true"/> متاح</span>
      <Banknote size={20} className="hidden text-brand min-[400px]:block" aria-hidden="true"/>
     </span>
     <span className="site-muted mt-1 block text-xs leading-6">أكمل الطلب الآن وادفع عند استلامه.</span>
    </span>
   </label>

   <div aria-disabled="true" className="relative rounded-2xl border border-dashed border-brand/30 bg-paper/50 p-3 sm:p-4">
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
     <span aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 rounded-full border-2 border-slate-400/60"/>
     <span className="min-w-0">
      <span className="flex flex-wrap items-center gap-2">
       <span className="text-sm font-black text-ink/85">الدفع ببطاقة ائتمانية أو بطاقة خصم</span>
       <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] font-black th-stock-low">غير متاح</span>
       <CreditCard size={20} className="hidden text-brand min-[400px]:block" aria-hidden="true"/>
      </span>
      <span className="site-muted mt-1 block text-xs leading-6">هذه الطريقة غير متاحة حالياً.</span>
     </span>
    </div>

   </div>
  </div>

 </section>;
}
