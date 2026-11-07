// ตัวช่วยร่วมของโมดูลวิเคราะห์ (A5): หาหุ้น · ช่วงวันที่ตามสิทธิ์ · บันทึกประวัติ
import { pool, q, q1, tx, type Db } from '@/lib/db';
import { now as clockNow } from '@/lib/clock';
import { marketStatus } from '@/lib/market';
import { historyStart, tierLabel, tierOf, type Tier } from '@/lib/tier';
import { currentUser, type UserRow } from '@/lib/session';
import { ApiError, E } from '@/lib/http';
import { StockNotFound } from '@/lib/feed';
import { fmtDate } from '@/lib/i18n';
import { HISTORY_KEEP } from './calc';

export type StockRow = {
  symbol: string; name: string; exchange: string; exchange_label: string; kind: string;
  status: 'listed' | 'delisted'; pe: string | null; div_yield_pct: string | null; market_cap_usd: string | null;
};

/** ชื่อย่อจาก URL / body: ตัวพิมพ์ใหญ่ · '-' = '.' (BRK-B = BRK.B) */
export const normSymbol = (s: unknown): string => String(s ?? '').trim().toUpperCase().replace(/-/g, '.');

/** หาหุ้น · ไม่พบ → 404 NOT_FOUND · OTC → 404 OTC_NOT_SUPPORTED (หุ้นถูกถอดยังใช้ได้) */
export async function findStock(symbol: unknown, db: Db = pool): Promise<StockRow> {
  const sym = normSymbol(symbol);
  if (!sym) throw new StockNotFound(sym, false);
  const r = await q1<StockRow>(
    `SELECT symbol, name, exchange, exchange_label, kind, status, pe, div_yield_pct, market_cap_usd
     FROM stocks WHERE upper(symbol) = $1`, [sym], db);
  if (!r) throw new StockNotFound(sym, false);
  if (r.exchange === 'OTC') throw new StockNotFound(r.symbol, true);
  return r;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (s: unknown): s is string =>
  typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** ลบเดือนแบบวันเดียวกัน (ไม่มีวันนั้นใช้วันสุดท้ายของเดือน) */
export function minusMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const idx = y * 12 + (m - 1) - n;
  const ny = Math.floor(idx / 12);
  const nm = idx - ny * 12 + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** 403 RANGE_NOT_ALLOWED (ข้อความเดียวกับ A1) */
export function rangeNotAllowed(tier: Tier, earliest: string): ApiError {
  return new ApiError(403, 'RANGE_NOT_ALLOWED',
    `ระดับ ${tierLabel(tier)} ดูย้อนหลังได้ถึง ${fmtDate(earliest, 'th')}`,
    `${tierLabel(tier)} members can view history back to ${fmtDate(earliest, 'en')}`,
    { earliestAllowed: earliest });
}

export type Viewer = { user: UserRow | null; tier: Tier; now: Date; lastClosed: string };

/** ผู้ดู ณ ตอนนี้: ผู้ใช้ (หรือ null) · ระดับ · now · รอบล่าสุดที่ปิดแล้ว */
export async function viewer(user?: UserRow | null): Promise<Viewer> {
  const u = user === undefined ? await currentUser() : user;
  const now = await clockNow();
  const ms = await marketStatus(now);
  return { user: u, tier: tierOf(u, now), now, lastClosed: ms.lastClosedSession };
}

/**
 * ช่วงวันที่ตามสิทธิ์ (เหมือนกราฟของ A1): to ไม่เกินรอบล่าสุดที่ปิดแล้ว (T-07) · from ค่าเริ่มต้น = to − 6 เดือน
 * (ถ้าเก่ากว่าสิทธิ์ใช้วันแรกของสิทธิ์) · from ที่ส่งมาเก่ากว่าสิทธิ์ → 403 RANGE_NOT_ALLOWED
 */
export function resolveRange(v: Viewer, fromIn: unknown, toIn: unknown): { from: string; to: string; earliestAllowed: string } {
  const earliest = historyStart(v.tier, v.now);
  const has = (x: unknown) => x !== undefined && x !== null && x !== '';
  if (has(fromIn) && !isDate(fromIn)) throw E.bad();
  if (has(toIn) && !isDate(toIn)) throw E.bad();
  let to = has(toIn) ? (toIn as string) : v.lastClosed;
  if (to > v.lastClosed) to = v.lastClosed;
  let from: string;
  if (has(fromIn)) {
    from = fromIn as string;
    if (from < earliest) throw rangeNotAllowed(v.tier, earliest);
  } else {
    from = minusMonths(to, 6);
    if (from < earliest) from = earliest;
  }
  if (from > to) throw E.bad('วันเริ่มต้องไม่หลังวันสิ้นสุด', 'The start date must not be after the end date');
  return { from, to, earliestAllowed: earliest };
}

/**
 * บันทึกประวัติการลอง/การเทียบ (BR-55) แล้วลบรายการที่เกิน 20 ล่าสุดในทรานแซกชันเดียวกัน
 * ล็อกด้วย advisory lock ต่อผู้ใช้ กันกดพร้อมกันแล้วเกิน 20
 */
export async function saveHistory(userId: number, kind: 'compare' | 'backtest', params: Record<string, unknown>, at: Date): Promise<void> {
  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`study_history:${userId}`]);
    await c.query('INSERT INTO study_history (user_id, kind, params, created_at) VALUES ($1, $2, $3, $4)',
      [userId, kind, JSON.stringify(params), at]);
    await c.query(
      `DELETE FROM study_history WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM study_history WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2)`,
      [userId, HISTORY_KEEP]);
  });
}

export type HistoryItem = { id: number; kind: 'compare' | 'backtest'; params: Record<string, unknown>; createdAt: string };

/** ประวัติของผู้ใช้ ใหม่สุดก่อน (ไม่เกิน 20) */
export async function listHistory(userId: number, db: Db = pool): Promise<HistoryItem[]> {
  const rows = await q<{ id: number; kind: 'compare' | 'backtest'; params: Record<string, unknown>; created_at: Date }>(
    `SELECT id, kind, params, created_at FROM study_history WHERE user_id = $1
     ORDER BY created_at DESC, id DESC LIMIT $2`, [userId, HISTORY_KEEP], db);
  return rows.map((r) => ({ id: Number(r.id), kind: r.kind, params: r.params, createdAt: new Date(r.created_at).toISOString() }));
}
