// ฟังก์ชันคำนวณบริสุทธิ์ของงานศึกษา: เทียบหุ้น (BR-53) · ลองเทียบ DCA (BR-54, T-09) · คัดกรอง (BR-51, BR-52)
import { D, pctChange, round2, type Num } from '@/lib/money';

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;
export const BACKTEST_MAX_MONTHS = 120;
export const HISTORY_KEEP = 20;

// ---------- เทียบหุ้น ----------

/** % เทียบราคาวันแรกของช่วง: (ราคา ÷ ราคาวันแรก − 1) × 100 · ค่าจริงไม่ปัด · วันแรก = 0 */
export function compareSeries(closes: { date: string; close: string }[]): { date: string; pct: string }[] {
  if (closes.length === 0) return [];
  const base = closes[0].close;
  return closes.map((c) => ({ date: c.date, pct: pctChange(base, c.close).toString() }));
}

// ---------- เดือน ----------

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const isMonth = (s: unknown): s is string => typeof s === 'string' && MONTH_RE.test(s);

/** จำนวนเดือนรวมหัวท้าย: 2025-11 ถึง 2026-10 = 12 */
export function monthsInclusive(fromMonth: string, toMonth: string): number {
  const [fy, fm] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** รายการเดือน YYYY-MM ตั้งแต่ from ถึง to */
export function monthList(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = fromMonth.split('-').map(Number);
  const n = monthsInclusive(fromMonth, toMonth);
  for (let k = 0; k < n; k++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

// ---------- ลองเทียบ DCA ----------

export type BacktestResult = {
  months: number;
  investedUsd: string;
  dca: { shares: string; valueUsd: string };
  lump: { shares: string; valueUsd: string };
  diffUsd: string;
};

/**
 * ลองเทียบ DCA กับซื้อก้อนเดียว (T-09): ใช้ดอลลาร์ · ไม่คิดค่าธรรมเนียม ไม่รวมปันผล · จำนวนหุ้นไม่ปัด
 * buyPrices = ราคาปิดปรับของวันทำการแรกของแต่ละเดือน (เรียงตามเดือน) · ก้อนเดียวซื้อทั้งหมดที่ราคาเดือนแรก
 * มูลค่า = round2(หุ้น × ราคาล่าสุด) · ส่วนต่าง = round2(DCA) − round2(ก้อนเดียว)
 */
export function backtest(buyPrices: Num[], monthlyUsd: Num, lastPrice: Num): BacktestResult {
  const months = buyPrices.length;
  const monthly = D(monthlyUsd);
  let dcaShares = D(0);
  for (const p of buyPrices) dcaShares = dcaShares.plus(monthly.div(D(p)));
  const invested = monthly.mul(months);
  const lumpShares = months > 0 ? invested.div(D(buyPrices[0])) : D(0);
  const dcaValue = round2(dcaShares.mul(D(lastPrice)));
  const lumpValue = round2(lumpShares.mul(D(lastPrice)));
  return {
    months,
    investedUsd: round2(invested).toFixed(2),
    dca: { shares: dcaShares.toFixed(4), valueUsd: dcaValue.toFixed(2) },
    lump: { shares: lumpShares.toFixed(4), valueUsd: lumpValue.toFixed(2) },
    diffUsd: dcaValue.minus(lumpValue).toFixed(2),
  };
}

// ---------- คัดกรอง ----------

export type ScreenerRow = { symbol: string; pe: string | null; divYieldPct: string | null; marketCapUsd: string | null };
export type ScreenerFilter = { peMax?: string; divMin?: string; capMinUsd?: string; capMaxUsd?: string };
export type ScreenerSort = { sort?: 'symbol' | 'pe' | 'div' | 'cap'; dir?: 'asc' | 'desc' };

/** ตัวกรอง BR-51, BR-52: ตั้งเงื่อนไขแล้วค่าที่ไม่มี (null) ไม่อยู่ในผล · รวมค่าที่เท่ากัน */
export function screen<T extends ScreenerRow>(rows: T[], f: ScreenerFilter, s: ScreenerSort = {}): T[] {
  const ok = rows.filter((r) => {
    if (f.peMax !== undefined && (r.pe === null || D(r.pe).gt(D(f.peMax)))) return false;
    if (f.divMin !== undefined && (r.divYieldPct === null || D(r.divYieldPct).lt(D(f.divMin)))) return false;
    if (f.capMinUsd !== undefined && (r.marketCapUsd === null || D(r.marketCapUsd).lt(D(f.capMinUsd)))) return false;
    if (f.capMaxUsd !== undefined && (r.marketCapUsd === null || D(r.marketCapUsd).gt(D(f.capMaxUsd)))) return false;
    return true;
  });
  const key = s.sort ?? 'symbol';
  const sign = s.dir === 'desc' ? -1 : 1;
  const val = (r: T) => (key === 'pe' ? r.pe : key === 'div' ? r.divYieldPct : key === 'cap' ? r.marketCapUsd : null);
  return ok.sort((a, b) => {
    if (key !== 'symbol') {
      const va = val(a), vb = val(b);
      // ค่าว่างอยู่ท้ายเสมอ
      if (va === null && vb !== null) return 1;
      if (va !== null && vb === null) return -1;
      if (va !== null && vb !== null) {
        const c = D(va).cmp(D(vb));
        if (c !== 0) return c * sign;
      }
      return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
    }
    return (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0) * sign;
  });
}
