// ระดับสมาชิกและโควตา (BR-16 ถึง BR-23) · คนไม่เข้าสู่ระบบ = สิทธิ์ Free (A-13)
import { minusYears, thaiDate } from './clock';
import type { UserRow } from './session';

export type Tier = 'free' | 'pro';
export const LIMITS = {
  watchlist: { free: 10, pro: 50 },
  alerts: { free: 3, pro: 20 },
  historyYears: { free: 1, pro: 10 },
  backtestMonths: 120,
} as const;

/** Pro ถ้าวันไทยของ now ไม่เกิน pro_period_end
 *  · หรือรอบจบแล้วแต่ยังเปิดต่ออายุอัตโนมัติ (รอ tick ต่ออายุ) → ยัง Pro ไม่ขาดสิทธิ์แม้วินาทีเดียว (8.2 #13 · R107)
 *  · ส่ง pro_auto_renew มาด้วยเสมอเมื่อมี (ถ้าไม่ส่ง ถือว่าไม่ต่ออายุ) */
export function tierOf(
  u: (Pick<UserRow, 'pro_period_end'> & Partial<Pick<UserRow, 'pro_auto_renew' | 'delete_requested_at'>>) | null,
  now: Date,
): Tier {
  if (!u?.pro_period_end) return 'free';
  if (thaiDate(now) <= u.pro_period_end) return 'pro';
  return u.pro_auto_renew === true && !u.delete_requested_at ? 'pro' : 'free';
}

/** วันแรกที่ดูย้อนหลังได้ (วันที่ไทยของวันนี้ ลบ 1 หรือ 10 ปี) */
export function historyStart(tier: Tier, now: Date): string {
  return minusYears(thaiDate(now), LIMITS.historyYears[tier]);
}

export const tierLabel = (t: Tier) => (t === 'pro' ? 'Pro' : 'Free');
