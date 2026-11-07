// Pordee Mock Feed + ที่พักราคา + โควตา (flow-quote ใน DESIGN · FR-05, FR-06 · BR-09 ถึง BR-15)
// ทุกที่ที่แสดงราคาปัจจุบันต้องเรียก getQuote() เท่านั้น
import { pool, q, q1, tx, type Db } from './db';
import { now as clockNow, fromThai, thai } from './clock';
import { marketStatus, prevTradingDay, sessionClose, sessionOpen } from './market';
import { D, pctChange } from './money';

export const SOURCE = 'Pordee Mock Feed';
export const QUOTA_PER_MIN = 5;
export const QUOTA_PER_DAY = 500;
const REUSE_MS = 15 * 60 * 1000; // BR-10
const DELAY_MS = 15 * 60 * 1000; // BR-09
const STALE_MS = 30 * 60 * 1000; // BR-15

export type Quote = {
  symbol: string;
  /** ราคาที่แสดง (4 ตำแหน่ง) · null ถ้าไม่มีข้อมูลเลย */
  price: string | null;
  /** เวลาของราคา (ISO) */
  asOf: string | null;
  /** วันซื้อขาย (นิวยอร์ก YYYY-MM-DD) ของราคาปิดที่ใช้ ถ้าราคาที่แสดงเป็นราคาปิด · null = ราคาระหว่างวัน */
  closeDate?: string | null;
  /** true = ราคาระหว่างวันของรอบที่เปิดอยู่ (ไม่ต้องบอกวันที่) */
  currentSession?: boolean;
  /** ราคาปิดวันก่อน (ของรอบที่เปิดอยู่ หรือของรอบล่าสุดที่ปิดแล้ว) */
  prevClose: string | null;
  change: string | null;
  /** % เปลี่ยน ค่าจริงไม่ปัด (หน้าเว็บปัด 2 ตำแหน่งตอนแสดง) */
  changePct: string | null;
  /** ป้าย "ข้อมูลไม่อัปเดต" */
  stale: boolean;
  marketOpen: boolean;
  /** listed / delisted */
  status: 'listed' | 'delisted';
  source: typeof SOURCE;
};

export class StockNotFound extends Error {
  constructor(public symbol: string, public otc: boolean) { super(otc ? 'OTC' : 'NOT_FOUND'); }
}

/** เวลาเริ่มวันของโควตา = 07:00 ไทยล่าสุดที่ไม่เกิน now (BR-13) */
export function quotaDayStart(now: Date): Date {
  const t = thai(now);
  const start = fromThai(t.date, '07:00:00');
  return now >= start ? start : new Date(start.getTime() - 86400000);
}

export async function quotaStatus(now: Date, db: Db = pool) {
  const r = await q1<{ minute: number; day: number; last: Date | null }>(
    `SELECT count(*) FILTER (WHERE requested_at > $1::timestamptz - interval '60 seconds' AND requested_at <= $1) AS minute,
            count(*) FILTER (WHERE requested_at >= $2 AND requested_at <= $1) AS day,
            max(requested_at) AS last
     FROM feed_requests`, [now, quotaDayStart(now)], db);
  const cache = await q1<{ last: Date | null }>('SELECT max(fetched_at) AS last FROM quote_cache', [], db);
  return {
    minuteUsed: Number(r?.minute ?? 0), minuteLimit: QUOTA_PER_MIN,
    dayUsed: Number(r?.day ?? 0), dayLimit: QUOTA_PER_DAY,
    dayStartsAt: quotaDayStart(now).toISOString(),
    lastRequestAt: r?.last ? new Date(r.last).toISOString() : null,
    lastFetchAt: cache?.last ? new Date(cache.last).toISOString() : null,
  };
}

/** ขอโควตา 1 ครั้ง (advisory lock ให้เข้าแถวทีละคำขอ) · true = ได้ */
async function takeQuota(now: Date, symbol: string): Promise<boolean> {
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(4242)');
    const r = await c.query(
      `INSERT INTO feed_requests (requested_at, symbol)
       SELECT $1, $2
       WHERE (SELECT count(*) FROM feed_requests WHERE requested_at > $1::timestamptz - interval '60 seconds' AND requested_at <= $1) < ${QUOTA_PER_MIN}
         AND (SELECT count(*) FROM feed_requests WHERE requested_at >= $3 AND requested_at <= $1) < ${QUOTA_PER_DAY}
       RETURNING id`, [now, symbol, quotaDayStart(now)]);
    return r.rowCount === 1;
  });
}

/** Mock Feed: ราคาล่าสุดที่เวลาไม่ใหม่กว่า now − 15 นาที (TEST-DATA 4.3) · null = ไม่ตอบ */
async function mockFeed(symbol: string, now: Date, sessionDate: string, prevClose: string | null):
  Promise<{ price: string; quoteTime: Date } | null> {
  const ov = await q1<{ mode: string; price: string | null }>('SELECT mode, price FROM feed_overrides WHERE symbol = $1', [symbol]);
  const t = new Date(now.getTime() - DELAY_MS);
  if (ov?.mode === 'timeout') return null;
  if (ov?.mode === 'zero') return { price: '0.0000', quoteTime: t };
  if (ov?.mode === 'price' && ov.price !== null) return { price: ov.price, quoteTime: t };
  const open = sessionOpen(sessionDate);
  const iq = await q1<{ price: string; quote_time: Date }>(
    `SELECT price, quote_time FROM intraday_quotes WHERE symbol = $1 AND quote_time >= $2 AND quote_time <= $3
     ORDER BY quote_time DESC LIMIT 1`, [symbol, open, t]);
  if (iq) return { price: iq.price, quoteTime: new Date(iq.quote_time) };
  if (!prevClose) return null;
  if (t < open) {
    // ยังไม่ถึงจุดแรกของรอบ: ตอบราคาปิดของรอบก่อน ณ เวลาปิด
    const prev = await prevTradingDay(sessionDate);
    return { price: prevClose, quoteTime: await sessionClose(prev) };
  }
  const mark = new Date(open.getTime() + Math.floor((t.getTime() - open.getTime()) / 300000) * 300000);
  return { price: prevClose, quoteTime: mark };
}

/** ตัวเลือกของ getQuote · takeQuota = ใช้โควตาแหล่งอื่นแทนโควตาร่วมของเว็บ (งานแจ้งเตือนใช้โควตาสำรอง · 8.2 #22) */
export type QuoteOpts = { takeQuota?: (now: Date, symbol: string) => Promise<boolean> };

/** ราคาปัจจุบันของหุ้น 1 ตัว (flow-quote) */
export async function getQuote(symbol: string, at?: Date, opts?: QuoteOpts): Promise<Quote> {
  const stock = await q1<{ symbol: string; exchange: string; status: 'listed' | 'delisted' }>(
    'SELECT symbol, exchange, status FROM stocks WHERE upper(symbol) = upper($1)', [symbol]);
  if (!stock) throw new StockNotFound(symbol, false);
  if (stock.exchange === 'OTC') throw new StockNotFound(stock.symbol, true);
  const sym = stock.symbol;
  const now = at ?? (await clockNow());
  const ms = await marketStatus(now);
  const base = { symbol: sym, source: SOURCE, marketOpen: ms.open, status: stock.status } as const;

  const closeOf = (d: string) =>
    q1<{ trade_date: string; close: string }>(
      'SELECT trade_date, close FROM daily_prices WHERE symbol = $1 AND trade_date <= $2 ORDER BY trade_date DESC LIMIT 1', [sym, d]);

  // หุ้นถูกถอด: ราคาสุดท้ายค้างไว้ (FR-08)
  if (stock.status === 'delisted') {
    const last = await closeOf('9999-12-31');
    return { ...base, price: last?.close ?? null, asOf: last ? (await sessionClose(last.trade_date)).toISOString() : null,
      closeDate: last?.trade_date ?? null, prevClose: null, change: null, changePct: null, stale: false };
  }

  if (!ms.open) {
    // ตลาดปิด: ราคาปิดรอบล่าสุด ไม่ขึ้นป้าย (A-14)
    const last = await closeOf(ms.lastClosedSession);
    const prev = last ? await closeOf(await prevTradingDay(last.trade_date)) : null;
    const price = last?.close ?? null;
    return {
      ...base, price, asOf: last ? (await sessionClose(last.trade_date)).toISOString() : null,
      closeDate: last?.trade_date ?? null, prevClose: prev?.close ?? null,
      change: price && prev ? D(price).minus(prev.close).toFixed(4) : null,
      changePct: price && prev ? pctChange(prev.close, price).toString() : null,
      stale: false,
    };
  }

  const sessionDate = ms.sessionDate as string;
  const prev = await closeOf(await prevTradingDay(sessionDate));
  const prevClose = prev?.close ?? null;
  const cache = await q1<{ price: string; quote_time: Date; fetched_at: Date }>(
    'SELECT price, quote_time, fetched_at FROM quote_cache WHERE symbol = $1', [sym]);

  let price: string | null = null;
  let quoteTime: Date | null = null;
  let failed = false;
  let closeDate: string | null = null;

  if (cache && now.getTime() - new Date(cache.fetched_at).getTime() <= REUSE_MS) {
    price = cache.price; quoteTime = new Date(cache.quote_time);
  } else if (await (opts?.takeQuota ?? takeQuota)(now, sym)) {
    const got = await mockFeed(sym, now, sessionDate, prevClose);
    if (got && D(got.price).gt(0)) {
      price = got.price; quoteTime = got.quoteTime;
      await q(`INSERT INTO quote_cache (symbol, price, quote_time, fetched_at) VALUES ($1, $2, $3, $4)
               ON CONFLICT (symbol) DO UPDATE SET price = EXCLUDED.price, quote_time = EXCLUDED.quote_time, fetched_at = EXCLUDED.fetched_at`,
        [sym, got.price, got.quoteTime, now]);
    } else {
      failed = true;
      await q(`UPDATE feed_requests SET ok = false WHERE id = (SELECT max(id) FROM feed_requests WHERE symbol = $1)`, [sym]);
    }
  } else {
    failed = true;
  }

  if (price === null) {
    // ใช้ราคาที่พักเดิม ถ้าไม่มีใช้ราคาปิดรอบก่อน (T-06)
    if (cache) { price = cache.price; quoteTime = new Date(cache.quote_time); }
    else if (prev) { price = prev.close; quoteTime = await sessionClose(prev.trade_date); closeDate = prev.trade_date; }
  }
  const stale = failed || (quoteTime !== null && now.getTime() - quoteTime.getTime() >= STALE_MS);
  return {
    ...base, price, asOf: quoteTime ? quoteTime.toISOString() : null, closeDate,
    currentSession: closeDate === null && quoteTime !== null && quoteTime >= sessionOpen(sessionDate), prevClose,
    change: price && prevClose ? D(price).minus(prevClose).toFixed(4) : null,
    changePct: price && prevClose ? pctChange(prevClose, price).toString() : null,
    stale,
  };
}

/** หลายตัว (ทีละตัวตามลำดับ เพื่อให้โควตานับตรง) */
export async function getQuotes(symbols: string[], at?: Date): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  for (const s of symbols) out[s] = await getQuote(s, at);
  return out;
}

/** เวลาอัปเดตราคาล่าสุดสำหรับ footer (FR-51): ดึงจากแหล่งข้อมูลสำเร็จครั้งล่าสุด
 *  ถ้ายังไม่มี (ที่พักว่าง/แหล่งข้อมูลล่ม) ใช้เวลาปิดของรอบล่าสุดที่ปิดแล้ว ซึ่งเป็นราคาที่หน้าเว็บใช้แทน */
export async function lastPriceUpdate(now: Date): Promise<string> {
  const r = await q1<{ last: Date | null }>('SELECT max(fetched_at) AS last FROM quote_cache WHERE fetched_at <= $1', [now]);
  if (r?.last) return new Date(r.last).toISOString();
  const ms = await marketStatus(now);
  return (await sessionClose(ms.lastClosedSession)).toISOString();
}
