// งาน `alerts` ประเมินแจ้งเตือนทุกรอบ (flow-alert · seq-alert · BR-33–BR-37 · D-01, D-02)
import type { Job } from '../jobs';
import { q, q1, tx } from '../db';
import { thai } from '../clock';
import { marketStatus } from '../market';
import { getQuote, type Quote } from '../feed';
import { emailBody, emailSubject, inQuietHours, shouldTrigger } from './rules';

const REUSE_MIN = 15; // ที่พักราคาใช้ซ้ำได้ 15 นาที (BR-10)

type ActiveAlert = {
  id: number; user_id: number; symbol: string; kind: 'pct' | 'target'; target_price: string | null;
  direction: 'up' | 'down' | null; active: boolean;
  email: string; lang: 'th' | 'en'; quiet_start: string | null; quiet_end: string | null;
};

export type AlertsJobResult = {
  skipped?: 'market-closed';
  sessionDate?: string;
  symbols?: number;
  staleSymbols?: string[];
  fired?: number;
  emailed?: number;
  quiet?: number;
};

/**
 * ลำดับหุ้นที่จะอ่านราคา: ตัวที่มีที่พักอายุ ≤ 15 นาทีก่อน (ไม่กินโควตา) แล้วตัวอื่น
 * ในกลุ่ม "ตัวอื่น" ให้ตัวที่ถูกสั่งราคาไว้ใน Mock Feed (feed_overrides) มาก่อน · ในแต่ละกลุ่มเรียง A–Z
 * (ฟังก์ชันบริสุทธิ์ ทดสอบได้)
 */
export function orderSymbols(symbols: string[], freshCached: Set<string>, preferred: Set<string> = new Set()): string[] {
  const uniq = [...new Set(symbols)].sort();
  const rest = uniq.filter((s) => !freshCached.has(s));
  return [...uniq.filter((s) => freshCached.has(s)), ...rest.filter((s) => preferred.has(s)), ...rest.filter((s) => !preferred.has(s))];
}

// ---------- คิวเก็บตก + โควตาสำรองของงานแจ้งเตือน (สมมติฐาน 8.2 #22 · R19) ----------
// หุ้นที่รอบนี้ไม่ได้ราคาใหม่ (โควตาร่วมของเว็บเต็ม / แหล่งข้อมูลไม่ตอบ) เข้าคิว · รอบถัดไปหุ้นในคิวขอราคาด้วยโควตาสำรอง
// ของงานแจ้งเตือน (แยกจากโควตา 5/นาที · 500/วันที่หน้าเว็บใช้ จึงไม่ถูกหน้าเว็บแย่ง และไม่ไปลดโควตาของหน้าเว็บ)
// คิวอยู่ในหน่วยความจำ ผูกกับ filenode ของ feed_requests (reset = TRUNCATE → filenode เปลี่ยน → ล้างคิว)
export const RESERVE_PER_MIN = 30; // ครอบคลุมหุ้นที่มีแจ้งเตือนทั้งหมดได้ใน 1 รอบ
const QUEUE_TTL_MS = 10 * 60 * 1000; // คิวเก่ากว่า 10 นาทีทิ้ง (รอบถัดไปจะเข้าคิวใหม่เองถ้ายังพลาด)

type ReserveState = { fingerprint: string | null; queue: Map<string, number>; used: number[] };
const G = globalThis as unknown as { __pordeeAlertReserve?: ReserveState };
const state = (): ReserveState => (G.__pordeeAlertReserve ??= { fingerprint: null, queue: new Map(), used: [] });

async function syncReserve(now: Date): Promise<ReserveState> {
  const st = state();
  const r = await q1<{ fp: string }>(`SELECT pg_relation_filenode('feed_requests')::text AS fp`);
  const fp = r?.fp ?? null;
  if (fp !== st.fingerprint) { st.fingerprint = fp; st.queue.clear(); st.used = []; }
  const t = now.getTime();
  for (const [sym, at] of st.queue) if (at > t || t - at > QUEUE_TTL_MS) st.queue.delete(sym); // นาฬิกาถอยหลัง / เก่าเกิน
  st.used = st.used.filter((u) => u <= t && t - u < 60_000);
  return st;
}

/** คิวที่ใช้โควตาสำรองได้ในรอบนี้ = เข้าคิวก่อนเวลานี้ (รอบแรกที่พลาดยังใช้โควตาร่วม) */
const queuedBefore = (st: ReserveState, sym: string, now: Date) => {
  const at = st.queue.get(sym);
  return at !== undefined && at < now.getTime();
};

const takeReserve = (st: ReserveState) => async (now: Date): Promise<boolean> => {
  const t = now.getTime();
  st.used = st.used.filter((u) => u <= t && t - u < 60_000);
  if (st.used.length >= RESERVE_PER_MIN) return false;
  st.used.push(t);
  return true;
};

export async function runAlerts(now: Date): Promise<AlertsJobResult> {
  const ms = await marketStatus(now);
  if (!ms.open || !ms.sessionDate) return { skipped: 'market-closed' };
  const sessionDate = ms.sessionDate;

  const alerts = await q<ActiveAlert>(
    `SELECT a.id, a.user_id, a.symbol, a.kind, a.target_price, a.direction, a.active,
            u.email, u.lang, u.quiet_start, u.quiet_end
     FROM alerts a JOIN users u ON u.id = a.user_id JOIN stocks s ON s.symbol = a.symbol
     WHERE a.active AND u.delete_requested_at IS NULL AND s.status = 'listed' AND s.exchange <> 'OTC'
     ORDER BY a.symbol, a.id`);
  if (!alerts.length) return { sessionDate, symbols: 0, staleSymbols: [], fired: 0, emailed: 0, quiet: 0 };

  const bySymbol = new Map<string, ActiveAlert[]>();
  for (const a of alerts) bySymbol.set(a.symbol, [...(bySymbol.get(a.symbol) ?? []), a]);

  const fresh = await q<{ symbol: string }>(
    `SELECT symbol FROM quote_cache WHERE symbol = ANY($1) AND fetched_at >= $2::timestamptz - interval '${REUSE_MIN} minutes'`,
    [[...bySymbol.keys()], now]);
  // หัวหน้า: ไม่ให้ลำดับขึ้นกับ feed_overrides (ตารางสำหรับทดสอบ) · โค้ดจริงต้องทำงานเหมือนกันทุกสภาพ
  const order = orderSymbols([...bySymbol.keys()], new Set(fresh.map((r) => r.symbol)), new Set<string>());

  const quietNow = thai(now).time; // 'HH:mm:ss' เวลาไทย
  const staleSymbols: string[] = [];
  let fired = 0, emailed = 0, quiet = 0;

  const st = await syncReserve(now);
  const miss = (sym: string) => { if (!st.queue.has(sym)) st.queue.set(sym, now.getTime()); staleSymbols.push(sym); };

  for (const sym of order) {
    let quote: Quote;
    const opts = queuedBefore(st, sym, now) ? { takeQuota: takeReserve(st) } : undefined;
    try { quote = await getQuote(sym, now, opts); } catch { miss(sym); continue; }
    // หุ้นที่ไม่ได้ราคาใหม่ (stale) ไม่ประเมินในรอบนี้ (D-02) แต่เข้าคิวเก็บตกให้รอบถัดไป
    if (quote.stale || quote.price === null) { miss(sym); continue; }
    st.queue.delete(sym);

    for (const a of bySymbol.get(sym) ?? []) {
      if (!shouldTrigger(a, quote)) continue;
      const isQuiet = inQuietHours(quietNow, a.quiet_start, a.quiet_end);
      const res = await tx(async (c) => {
        const ev = await c.query<{ id: number }>(
          `INSERT INTO alert_events (alert_id, user_id, symbol, session_date, price, change_pct, triggered_at, in_quiet_hours)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (alert_id, session_date) DO NOTHING RETURNING id`,
          [a.id, a.user_id, sym, sessionDate, quote.price, quote.changePct, now, isQuiet]);
        if (!ev.rowCount) return null; // แจ้งไปแล้วในรอบนี้ (BR-35)
        const eventId = ev.rows[0].id;
        // ราคาเป้าหมายแจ้งครั้งเดียวแล้วปิดตัวเอง (BR-36)
        if (a.kind === 'target') await c.query('UPDATE alerts SET active = false WHERE id = $1', [a.id]);
        if (isQuiet) return { eventId, emailed: false };
        const mail = {
          lang: a.lang, symbol: sym, kind: a.kind, price: quote.price as string, changePct: quote.changePct,
          prevClose: quote.prevClose, targetPrice: a.target_price, triggeredAt: now.toISOString(),
        };
        await c.query(
          `INSERT INTO email_outbox (user_id, alert_event_id, to_email, subject, body, sent_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          [a.user_id, eventId, a.email, emailSubject(mail), emailBody(mail), now]);
        return { eventId, emailed: true };
      });
      if (!res) continue;
      fired++;
      if (res.emailed) emailed++; else quiet++;
    }
  }
  return { sessionDate, symbols: order.length, staleSymbols, fired, emailed, quiet };
}

export const jobs: Job[] = [{ name: 'alerts', run: runAlerts }];
