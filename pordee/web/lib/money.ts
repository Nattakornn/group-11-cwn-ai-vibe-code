// เงินทุกตัวคิดด้วย decimal.js (NFR-11) · ห้ามใช้ number ของ JS กับเงิน ราคา จำนวนหุ้น อัตรา หรือ %
// ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์
import Decimal from 'decimal.js';

export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dx = InstanceType<typeof Dec>;
export type Num = Dx | string | number;

export const D = (v: Num): Dx => new Dec(v as any);
/** ดอลลาร์ / บาท: ปัดครึ่งขึ้น 2 ตำแหน่ง (BR-39) */
export const round2 = (v: Num): Dx => D(v).toDecimalPlaces(2, Dec.ROUND_HALF_UP);
/** ราคา: ปัดครึ่งขึ้น 4 ตำแหน่ง */
export const round4 = (v: Num): Dx => D(v).toDecimalPlaces(4, Dec.ROUND_HALF_UP);
/** จำนวนหุ้นที่เว็บคิดเอง: ปัดลง 4 ตำแหน่ง (BR-44) */
export const sharesDown = (v: Num): Dx => D(v).toDecimalPlaces(4, Dec.ROUND_DOWN);

/** ค่าธรรมเนียม = max(round2(มูลค่า × อัตรา%), ขั้นต่ำ) (BR-38, BR-39) */
export function fee(value: Num, ratePct: Num = '0.15', minUsd: Num = '1.00'): Dx {
  const f = round2(D(value).mul(D(ratePct)).div(100));
  return Dec.max(f, D(minUsd));
}

/** % เปลี่ยน = (ใหม่ ÷ เก่า − 1) × 100 (ค่าจริง ไม่ปัด) */
export const pctChange = (from: Num, to: Num): Dx => D(to).div(D(from)).minus(1).mul(100);

/** จำนวนทศนิยมไม่เกิน n ตำแหน่ง? (BR-40) */
export function maxDecimals(v: string, n: number): boolean {
  const m = /^\d+(?:\.(\d+))?$/.exec(v.trim());
  return !!m && (m[1]?.length ?? 0) <= n;
}

// ---------- แสดงผล (string ทั้งหมด ไม่ผ่าน float) ----------
function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
/** ตัวเลขมีจุลภาค เช่น 1,234.56 */
export function fmtNum(v: Num, dp = 2): string {
  const s = D(v).toFixed(dp, Dec.ROUND_HALF_UP);
  const neg = s.startsWith('-');
  const [i, f] = (neg ? s.slice(1) : s).split('.');
  return (neg ? '-' : '') + group(i) + (f !== undefined ? '.' + f : '');
}
export const fmtUsd = (v: Num, dp = 2) => (D(v).isNeg() ? '-$' + fmtNum(D(v).abs(), dp) : '$' + fmtNum(v, dp));
/** เงินบาท: หน้าไทยใช้ ฿ · หน้าอังกฤษใช้ THB เพราะ ฿ (U+0E3F) อยู่ในช่วงอักษรไทย (NFR-05) */
export const fmtThb = (v: Num, dp = 2, lang: 'th' | 'en' = 'th') => {
  const sym = lang === 'en' ? 'THB ' : '฿';
  return D(v).isNeg() ? '-' + sym + fmtNum(D(v).abs(), dp) : sym + fmtNum(v, dp);
};
/** +0.42% / -5.00% / 0.00% */
export function fmtPct(v: Num, dp = 2): string {
  const r = D(v).toDecimalPlaces(dp, Dec.ROUND_HALF_UP);
  return (r.gt(0) ? '+' : '') + fmtNum(r, dp) + '%';
}
/** +$1.00 / -$2.50 */
export const fmtSignedUsd = (v: Num) => (D(v).gt(0) ? '+' : '') + fmtUsd(v);
export const fmtSignedThb = (v: Num, lang: 'th' | 'en' = 'th') => (D(v).gt(0) ? '+' : '') + fmtThb(v, 2, lang);
export const fmtShares = (v: Num) => fmtNum(v, 4);
/** สตริงสำหรับส่งทาง API */
export const s2 = (v: Num) => round2(v).toFixed(2);
export const s4 = (v: Num) => round4(v).toFixed(4);
