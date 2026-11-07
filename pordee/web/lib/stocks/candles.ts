// แท่งเทียนรายวัน / รายสัปดาห์ (FR-10–FR-12, FR-16 · BR-22, BR-23, BR-32 · D-13 · T-07)
import { pool, type Db } from '@/lib/db';
import { addDays } from '@/lib/clock';
import { ApiError, E } from '@/lib/http';
import { fmtDate } from '@/lib/i18n';
import { marketStatus } from '@/lib/market';
import { D } from '@/lib/money';
import { dailyBars, type Bar } from '@/lib/prices';
import { historyStart, tierLabel, type Tier } from '@/lib/tier';
import { findStock } from './search';

export type Interval = 'day' | 'week';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** วันที่ 'YYYY-MM-DD' ที่มีจริง */
export function isDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** ลบเดือนแบบวันเดียวกัน (วันเกินสิ้นเดือนใช้วันสุดท้ายของเดือน) */
export function minusMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) - months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** วันจันทร์ของสัปดาห์ (จันทร์–ศุกร์ ตามวันที่นิวยอร์ก D-13) */
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = อาทิตย์
  return addDays(date, -((dow + 6) % 7));
}

/** 403 RANGE_NOT_ALLOWED (ใช้ร่วมกับ A5 ได้) */
export function rangeNotAllowed(tier: Tier, earliestAllowed: string): ApiError {
  const label = tierLabel(tier);
  return new ApiError(403, 'RANGE_NOT_ALLOWED',
    `ระดับ ${label} ดูย้อนหลังได้ถึง ${fmtDate(earliestAllowed, 'th')}`,
    `${label} members can view history back to ${fmtDate(earliestAllowed, 'en')}`,
    { earliestAllowed });
}

/** ตรวจว่า from ไม่เก่ากว่าสิทธิ์ (BR-22, BR-23) · คืนวันแรกที่ดูได้ */
export function assertRange(from: string, tier: Tier, now: Date): string {
  const earliest = historyStart(tier, now);
  if (from < earliest) throw rangeNotAllowed(tier, earliest);
  return earliest;
}

/** รวมแท่งรายวันเป็นรายสัปดาห์ · date = วันทำการแรกของสัปดาห์ · สัปดาห์ที่ยังไม่จบแสดงตามที่มี (D-13) */
export function toWeekly(days: Bar[]): Bar[] {
  const out: Bar[] = [];
  let cur: { key: string; bar: Bar } | null = null;
  for (const b of days) {
    const key = mondayOf(b.date);
    if (!cur || cur.key !== key) {
      if (cur) out.push(cur.bar);
      cur = { key, bar: { ...b } };
      continue;
    }
    const w = cur.bar;
    w.close = b.close;
    if (D(b.high).gt(w.high)) w.high = b.high;
    if (D(b.low).lt(w.low)) w.low = b.low;
    w.volume += b.volume;
  }
  if (cur) out.push(cur.bar);
  return out;
}

export type CandleQuery = { interval?: string | null; from?: string | null; to?: string | null; adjusted?: string | null };
export type CandleResult = {
  symbol: string; interval: Interval; adjusted: boolean; from: string; to: string; earliestAllowed: string; bars: Bar[];
};

/**
 * GET /api/stocks/:symbol/candles
 * ค่าเริ่มต้น: day · to = รอบล่าสุดที่ปิดแล้ว · from = to − 6 เดือน (ไม่เก่ากว่าสิทธิ์) · adjusted = 1
 */
export async function getCandles(symbol: string, query: CandleQuery, tier: Tier, now: Date, db: Db = pool): Promise<CandleResult> {
  const stock = await findStock(symbol, db);

  const interval = (query.interval || 'day') as Interval;
  if (interval !== 'day' && interval !== 'week') throw E.bad();
  const adjRaw = query.adjusted ?? '1';
  if (adjRaw !== '1' && adjRaw !== '0' && adjRaw !== 'true' && adjRaw !== 'false') throw E.bad();
  const adjusted = adjRaw === '1' || adjRaw === 'true';
  if (query.from && !isDate(query.from)) throw E.bad();
  if (query.to && !isDate(query.to)) throw E.bad();

  const { lastClosedSession } = await marketStatus(now);
  const earliest = historyStart(tier, now);

  // แสดงเฉพาะรอบที่ปิดแล้ว (T-07)
  let to = query.to || lastClosedSession;
  if (to > lastClosedSession) to = lastClosedSession;

  let from: string;
  if (query.from) {
    from = query.from;
    if (from < earliest) throw rangeNotAllowed(tier, earliest);
  } else {
    if (to < earliest) throw rangeNotAllowed(tier, earliest);
    from = minusMonths(to, 6);
    if (from < earliest) from = earliest;
  }
  if (from > to) throw E.bad();

  let bars: Bar[];
  if (interval === 'day') {
    bars = await dailyBars(stock.symbol, from, to, adjusted, db);
  } else {
    // ดึงตั้งแต่วันจันทร์ของสัปดาห์แรก (ไม่เก่ากว่าสิทธิ์) เพื่อให้แท่งแรกครบสัปดาห์
    const start = mondayOf(from) < earliest ? earliest : mondayOf(from);
    bars = toWeekly(await dailyBars(stock.symbol, start, to, adjusted, db));
  }

  return { symbol: stock.symbol, interval, adjusted, from, to, earliestAllowed: earliest, bars };
}
