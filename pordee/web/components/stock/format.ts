// ตัวช่วยแสดงผลของหน้าหุ้น (F2) · ตัวเลขเงินใช้ decimal ผ่าน @/lib/money เท่านั้น
import { D, fmtNum, fmtUsd } from '@/lib/money';
import { fmtDate, fmtDateTimeTh, type Lang } from '@/lib/i18n';

export type Stock = {
  symbol: string; name: string; exchange: string; exchangeLabel: string; kind: string; status: 'listed' | 'delisted' | string;
  pe: string | null; divYieldPct: string | null; marketCapUsd: string | null; fundamentalsDate: string | null;
};
export type Bar = { date: string; open: string; high: string; low: string; close: string; volume: string | number };
export type Point = { date: string; value: string };
export type Cross = { date: string; kind: 'golden' | 'death' };
export type Candles = { symbol: string; interval: 'day' | 'week'; adjusted: boolean; from: string; to: string; earliestAllowed: string; bars: Bar[] };
export type Indicators = {
  sma50: Point[]; sma200: Point[]; rsi14: Point[];
  latest: { sma50: string | null; sma200: string | null; rsi14: string | null; rsiLabel: 'overbought' | 'oversold' | null };
  crosses: Cross[];
  notEnough: { sma50: boolean; sma200: boolean; rsi14: boolean };
  counts?: { closes: number };
};

/** มูลค่าตลาดแบบย่อ $3.50T / $350.00B / $5.00M */
export function fmtCap(v: string): string {
  const d = D(v);
  const abs = d.abs();
  if (abs.gte('1e12')) return fmtUsd(d.div('1e12')) + 'T';
  if (abs.gte('1e9')) return fmtUsd(d.div('1e9')) + 'B';
  if (abs.gte('1e6')) return fmtUsd(d.div('1e6')) + 'M';
  return fmtUsd(d);
}

/** ราคาบนกราฟ / ตาราง: 2 ตำแหน่ง มีจุลภาค */
export const fmtPrice = (v: string) => fmtNum(v, 2);
export const fmtVol = (v: string | number) => fmtNum(String(v), 0);

/** วันที่ 'YYYY-MM-DD' หรือ ISO → ข้อความตามภาษา */
export function fmtWhen(v: string, lang: Lang): string {
  return /T/.test(v) ? fmtDateTimeTh(v, lang) : fmtDate(v, lang);
}

/** วันที่ 'YYYY-MM-DD' ย้อนหลัง n เดือน (ไม่ใช่เงิน · ใช้ตั้งช่วงกราฟ) */
export function minusMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map((x) => parseInt(x, 10));
  const total = y * 12 + (m - 1) - months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, last);
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

export const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** ชื่อย่อจาก URL: ตัวใหญ่ · '-' = '.' (FR-01) */
export function normSymbol(raw: string): string {
  let s = raw;
  try { s = decodeURIComponent(raw); } catch { /* ใช้ค่าเดิม */ }
  return s.trim().toUpperCase().replace(/-/g, '.');
}

/** error ที่ไม่ใช่ JSON ของ API (เช่น 500 HTML) → ข้อความทั่วไปตามภาษา */
export function friendly(err: { code: string; message: string } | null, fallback: string): { code: string; message: string } {
  if (!err) return { code: 'UNKNOWN', message: fallback };
  return err.code.startsWith('HTTP_') || !err.message ? { code: err.code, message: fallback } : err;
}
