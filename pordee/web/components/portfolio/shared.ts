// F4 พอร์ต · ชนิดข้อมูลตาม API-CONTRACT ส่วนที่ 3 และตัวช่วยแสดงผล (ไม่คิดเงินเอง แค่จัดรูปแบบ)
import { D, fmtNum, fmtPct, fmtShares, fmtThb, fmtUsd } from '@/lib/money';
import type { Lang } from '@/lib/i18n';

export type Fx = { rate: string; rateDate: string; publishedAt: string };
export type Totals = {
  costUsd: string; valueUsd: string; plUsd: string; plPct: string | null; costThb: string; valueThb: string; plThb: string;
  realizedUsd: string; dividendsNetUsd: string; totalReturnUsd: string;
};
export type Holding = {
  symbol: string; name: string; status: 'listed' | 'delisted' | string; shares: string; avgCostUsd: string; costUsd: string; costThb: string;
  priceUsd: string | null; quoteAsOf: string | null; stale: boolean; valueUsd: string | null; valueThb: string | null;
  plUsd: string | null; plThb: string | null; plPct?: string | null; realizedUsd: string;
};
export type DcaPending = {
  id: number; planId: number; symbol: string; tradeDate: string; closePrice: string; fxRate: string; usdAmount: string;
  feeUsd: string; investUsd: string; shares: string; status: 'pending' | 'confirmed' | 'skipped' | string;
};
export type Portfolio = { asOf: string; marketOpen: boolean; fx: Fx; totals: Totals; holdings: Holding[]; pending: DcaPending[] };
export type Tx = {
  id: number; symbol: string; side: 'buy' | 'sell'; tradeDate: string; shares: string; price: string; feeUsd: string;
  fxRate: string | null; source: string; createdAt: string;
};
export type Fees = { feeRatePct: string; feeMinUsd: string };
export type DcaPlan = { id: number; symbol: string; name?: string; amountThb: string; dayOfMonth: number; active: boolean; createdAt?: string; nextTradeDate?: string | null };

const has = (v: string | null | undefined): v is string => v !== null && v !== undefined && v !== '';

/** หน้า EN ห้ามมีอักษรไทย (NFR-05) · เครื่องหมาย ฿ (U+0E3F) อยู่ในช่วงอักษรไทย จึงแสดงเป็น THB */
export function mkFmt(lang: Lang) {
  const thb = (v: string | null | undefined) => {
    if (!has(v)) return '—';
    return fmtThb(v, 2, lang);
  };
  const usd = (v: string | null | undefined) => (has(v) ? fmtUsd(v) : '—');
  const price = (v: string | null | undefined) => (has(v) ? fmtUsd(v) : '—');
  const shares = (v: string | null | undefined) => (has(v) ? fmtShares(v) : '—');
  const pct = (v: string | null | undefined) => (has(v) ? fmtPct(v) : '—');
  const rate = (v: string | null | undefined, dp = 2) => (has(v) ? fmtNum(v, dp) : '—');
  const signedUsd = (v: string | null | undefined) => (has(v) ? (D(v).gt(0) ? '+' : '') + fmtUsd(v) : '—');
  const signedThb = (v: string | null | undefined) => (has(v) ? (D(v).gt(0) ? '+' : '') + thb(v) : '—');
  return { thb, usd, price, shares, pct, rate, signedUsd, signedThb };
}

/** class สีขึ้น/ลง (เทียบกับ 0 เพื่อเลือกสีเท่านั้น) */
export const dirOf = (v: string | null | undefined) => (!has(v) ? 'flat' : D(v).gt(0) ? 'up' : D(v).lt(0) ? 'down' : 'flat');

/** วันที่นิวยอร์กของ ISO (ใช้เป็นค่าเริ่มต้นของช่องวันที่เท่านั้น) */
export function nyDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso)); } catch { return ''; }
}

/** ISO ล่าสุดในรายการ (ไม่ใช่เงิน) */
export function latestIso(list: (string | null | undefined)[]): string | null {
  let best: string | null = null; let bestMs = -Infinity;
  for (const s of list) {
    if (!s) continue;
    const ms = Date.parse(s);
    if (!Number.isNaN(ms) && ms > bestMs) { best = s; bestMs = ms; }
  }
  return best;
}
