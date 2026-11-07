// ตัวช่วยร่วมของ API เฝ้าดูและแจ้งเตือน (A4)
import { q1, type Db, pool } from '../db';
import { ApiError, E } from '../http';
import { StockNotFound } from '../feed';
import { LIMITS, tierLabel, type Tier } from '../tier';

export type StockRow = { symbol: string; name: string; exchange: string; status: 'listed' | 'delisted' };

/** ทำชื่อย่อให้เป็นรูปเดียวกับฐานข้อมูล: ตัวพิมพ์ใหญ่ · '-' = '.' */
export const normSymbol = (s: unknown): string =>
  typeof s === 'string' ? s.trim().toUpperCase().replace(/-/g, '.') : '';

/** หาหุ้น · ไม่พบ → 404 NOT_FOUND "ไม่พบหุ้นนี้" · OTC → 404 OTC_NOT_SUPPORTED */
export async function findStock(raw: unknown, db: Db = pool): Promise<StockRow> {
  const sym = normSymbol(raw);
  if (!sym) throw errSymbolRequired();
  const s = await q1<StockRow>('SELECT symbol, name, exchange, status FROM stocks WHERE upper(symbol) = $1', [sym], db);
  if (!s) throw new StockNotFound(sym, false);
  if (s.exchange === 'OTC') throw new StockNotFound(s.symbol, true);
  return s;
}

export const errWatchlistFull = (limit: number, tier: Tier) =>
  new ApiError(409, 'WATCHLIST_FULL', `รายการเฝ้าดูครบ ${limit} ตัวแล้ว (${tierLabel(tier)})`,
    `Your watchlist is full (${limit} stocks, ${tierLabel(tier)})`, { limit });

export const errAlreadyInList = () =>
  new ApiError(409, 'ALREADY_IN_LIST', 'หุ้นนี้อยู่ในรายการเฝ้าดูแล้ว', 'This stock is already in your watchlist');

export const errAlertsFull = (limit: number, tier: Tier) =>
  new ApiError(409, 'ALERTS_FULL', `ตั้งแจ้งเตือนครบ ${limit} รายการแล้ว (${tierLabel(tier)})`,
    `You have reached ${limit} alerts (${tierLabel(tier)})`, { limit });

export const errInvalidTarget = () =>
  new ApiError(400, 'INVALID_TARGET', 'ราคาเป้าหมายต้องมากกว่า 0', 'Target price must be greater than 0');

export const errPctExists = () =>
  new ApiError(409, 'ALERT_EXISTS', 'มีแจ้งเตือน 5% ของหุ้นนี้แล้ว', 'A 5% alert for this stock already exists');

export const errStockNotFound = () => new ApiError(404, 'NOT_FOUND', 'ไม่พบหุ้นนี้', 'Stock not found');

/** ช่องชื่อย่อว่าง → บอกช่องที่ต้องแก้ (R41 · TC-WATCH-03) */
export const errSymbolRequired = () =>
  new ApiError(400, 'INVALID_INPUT', 'กรุณากรอกชื่อย่อหุ้น เช่น AAPL', 'Please enter a stock symbol, e.g. AAPL', { field: 'symbol' });

/** หุ้นถูกถอด: ตั้งแจ้งเตือนไม่ได้ · ยังตอบ 404 "ไม่พบหุ้นนี้" ตามเดิม แต่บอกเหตุผ่าน reason ให้หน้าเว็บแสดง (8.2 #7) */
export const errStockDelisted = () =>
  new ApiError(404, 'NOT_FOUND', 'ไม่พบหุ้นนี้', 'Stock not found', { reason: 'DELISTED' });

/** หุ้นถูกถอด: เพิ่มเฝ้าดูได้แต่ต้องยืนยันก่อน (ส่ง confirmDelisted: true) ไม่กินโควตาเงียบ ๆ (8.2 #7 · R50) */
export const errDelistedConfirm = (symbol: string) =>
  new ApiError(409, 'DELISTED_CONFIRM', `${symbol} หยุดซื้อขายแล้ว (ถูกถอดออกจากตลาด) ราคาจะไม่เปลี่ยนอีก`,
    `${symbol} has stopped trading (delisted). Its price will not change.`, { reason: 'DELISTED', symbol });

export const watchLimit = (tier: Tier) => LIMITS.watchlist[tier];
export const alertLimit = (tier: Tier) => LIMITS.alerts[tier];

/**
 * ตรวจราคาเป้าหมาย: ตัวเลขทศนิยม ≤ 4 ตำแหน่ง · ≤ 0 → 400 INVALID_TARGET · รูปแบบผิด → 400 INVALID_INPUT
 * คืน string 4 ตำแหน่ง
 */
export function parseTarget(v: unknown): string {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw s === '' ? errInvalidTarget() : E.bad();
  const isZero = /^0+$/.test(m[2]) && /^0*$/.test(m[3] ?? '');
  if (m[1] === '-' || isZero) throw errInvalidTarget();
  if (m[2].replace(/^0+/, '').length > 10) throw E.bad();
  if ((m[3]?.length ?? 0) > 4) throw E.bad('ราคาเป้าหมายมีทศนิยมได้ไม่เกิน 4 ตำแหน่ง', 'Target price can have at most 4 decimal places');
  return `${m[2].replace(/^0+(?=\d)/, '')}.${(m[3] ?? '').padEnd(4, '0')}`;
}

/** id ตัวเลขจาก path · ไม่ใช่ตัวเลข → 404 */
export function parseId(v: string): number {
  if (!/^\d{1,12}$/.test(v)) throw E.notFound();
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 2147483647) throw E.notFound();
  return n;
}

export const iso = (d: Date | string | null): string | null => (d ? new Date(d).toISOString() : null);
