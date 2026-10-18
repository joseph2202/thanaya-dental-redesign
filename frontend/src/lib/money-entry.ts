// UI-only helpers. APIs and SQLite always store full integer Iraqi dinars.
// Never infer units from the number of digits: the input label decides the unit.
export function normalizedDecimal(value: string): string {
  return value.trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0)-0x660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0)-0x6f0))
    .replace(/٫/g, '.');
}

export function parseThousandsIqd(value: string): number | null {
  const text=normalizedDecimal(value);
  if(!/^\d+(?:\.\d{1,3})?$/.test(text))return null;
  const numeric=Number(text),full=Math.round(numeric*1000);
  return Number.isSafeInteger(full)&&full>=0&&full<=1_000_000_000 ? full : null;
}

export function parseUsd(value: string): number | null {
  const text=normalizedDecimal(value);
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;
  const numeric=Number(text);
  return Number.isFinite(numeric)&&numeric>=0&&numeric<=1_000_000 ? numeric:null;
}
export const formatThousandsIqd=(fullDinars:number):string=>String(fullDinars/1000);
export const formatFullIqd=(fullDinars:number):string=>fullDinars.toLocaleString('en-US')+' د.ع';
