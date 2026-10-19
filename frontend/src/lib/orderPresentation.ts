// Presentation helpers only. Original order IDs remain unchanged in API and database.
export const orderStatusLabels: Record<string, string> = {
  pending: 'قيد المعالجة',
  confirmed: 'تم التأكيد',
  shipped: 'بالطريق',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
  returned: 'مرتجع',
};

export const orderStatusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900',
  confirmed: 'bg-sky-100 text-sky-900',
  shipped: 'bg-violet-100 text-violet-900',
  delivered: 'bg-emerald-100 text-emerald-900',
  cancelled: 'bg-rose-100 text-rose-900',
  returned: 'bg-neutral-200 text-neutral-800',
};

export function shortOrderCode(id: string): string {
  const raw = id.startsWith('ord_') ? id.slice(4) : id;
  return raw.slice(0, 10).toUpperCase();
}

export function orderPresentation(status: string): { heading: string; message: string } {
  switch (status) {
    case 'pending':
      return { heading: 'تم استلام طلبك بنجاح!', message: 'طلبك قيد المعالجة، وراح نتواصل وياك لتأكيد التوصيل.' };
    case 'confirmed':
      return { heading: 'طلبك تم تأكيده', message: 'تم تأكيد الطلب، وتگدر تتابع حالته من حسابك.' };
    case 'shipped':
      return { heading: 'طلبك بالطريق', message: 'تم تسجيل الطلب ضمن الطلبات المرسلة.' };
    case 'delivered':
      return { heading: 'تم تسليم الطلب', message: 'الطلب مسجل لدينا بحالة مُسلّم.' };
    case 'cancelled':
      return { heading: 'هذا الطلب ملغي', message: 'حالة هذا الطلب ملغي. تگدر تتصفح منتجاتنا وتسوّي طلب جديد.' };
    case 'returned':
      return { heading: 'هذا الطلب مرتجع', message: 'تم تسجيل الطلب كمرتجع في نظام المتجر.' };
    default:
      return { heading: 'تفاصيل طلبك', message: 'راجع بيانات الطلب وحالته الحالية أدناه.' };
  }
}
