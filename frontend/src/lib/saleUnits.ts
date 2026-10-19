export const saleUnitOptions: Record<string,string> = {
  piece: 'قطعة',
  box: 'علبة',
  set: 'طقم',
  pack: 'عبوة',
  pair: 'زوج',
  bottle: 'قنينة',
  tube: 'أنبوب',
  carton: 'كارتون',
  bag: 'كيس',
  roll: 'لفة'
};

export function saleUnitLabel(value?: string | null): string {
  return (value && saleUnitOptions[value]) || 'قطعة';
}
