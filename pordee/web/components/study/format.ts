// F6 · ตัวช่วยแสดงผล (ใช้ได้ทั้งเซิร์ฟเวอร์และเบราว์เซอร์) · ตัวเลขผ่าน decimal.js เท่านั้น
import { D, fmtUsd } from '@/lib/money';

export const isNonNegNumber = (v: string) => /^\d+(\.\d+)?$/.test(v.trim());

/** มูลค่าตลาดแบบย่อ: $3.50T / $812.00B / $45.10M */
export function fmtCap(v: string): string {
  const x = D(v.trim());
  if (x.gte('1e12')) return fmtUsd(x.div('1e12')) + 'T';
  if (x.gte('1e9')) return fmtUsd(x.div('1e9')) + 'B';
  if (x.gte('1e6')) return fmtUsd(x.div('1e6')) + 'M';
  return fmtUsd(x, 0);
}

/** 'YYYY-MM' → 'พ.ย. 2568' / 'Nov 2025' */
export function fmtMonth(month: string, lang: 'th' | 'en'): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const d = new Date(`${month}-15T12:00:00Z`);
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}
