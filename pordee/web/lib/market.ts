// สถานะตลาด (flow-market ใน DESIGN · BR-02 ถึง BR-08)
// ปฏิทินใช้ market_calendar เท่านั้น (T-02) · ห้ามใช้ไลบรารีวันหยุดจริง
import { q } from './db';
import { modeFlag } from './bug';
import { addDays, fromNy, ny } from './clock';

type Cal = Map<string, { status: 'closed' | 'early'; close: string | null }>;
let calCache: Cal | null = null;

async function cal(): Promise<Cal> {
  if (calCache) return calCache;
  const rows = await q<{ ny_date: string; status: 'closed' | 'early'; close_time_ny: string | null }>(
    'SELECT ny_date, status, close_time_ny FROM market_calendar',
  );
  calCache = new Map(rows.map((r) => [r.ny_date, { status: r.status, close: r.close_time_ny }]));
  return calCache;
}

const isoDow = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

/** วันนี้ (วันที่นิวยอร์ก) เป็นวันทำการไหม */
export async function isTradingDay(nyDate: string): Promise<boolean> {
  if (isoDow(nyDate) >= 6) return false;
  return (await cal()).get(nyDate)?.status !== 'closed';
}
/** เวลาเปิดของวันทำการ */
export const sessionOpen = (nyDate: string): Date => fromNy(nyDate, '09:30:00');
/** เวลาปิดของวันทำการ (13:00 ถ้าปิดเร็ว) */
export async function sessionClose(nyDate: string): Promise<Date> {
  const c = (await cal()).get(nyDate);
  const shortDay = c?.status === 'early' && !!c.close && modeFlag() === '0';
  return fromNy(nyDate, shortDay ? (c!.close as string) : '16:00:00');
}
export async function isEarlyClose(nyDate: string): Promise<boolean> {
  return (await cal()).get(nyDate)?.status === 'early';
}
/** วันทำการถัดไป (inclusive = นับวันนี้ด้วยถ้าเป็นวันทำการ) */
export async function nextTradingDay(nyDate: string, inclusive = false): Promise<string> {
  let d = inclusive ? nyDate : addDays(nyDate, 1);
  while (!(await isTradingDay(d))) d = addDays(d, 1);
  return d;
}
/** วันทำการก่อนหน้า */
export async function prevTradingDay(nyDate: string): Promise<string> {
  let d = addDays(nyDate, -1);
  while (!(await isTradingDay(d))) d = addDays(d, -1);
  return d;
}

export type MarketStatus = {
  open: boolean;
  /** เปิดอยู่และวันนี้ปิดเร็ว */
  earlyClose: boolean;
  /** วันที่นิวยอร์กของรอบที่กำลังเปิด (null ถ้าปิด) */
  sessionDate: string | null;
  /** เวลาปิดของรอบที่กำลังเปิด */
  closesAt: string | null;
  /** เวลาเปิดครั้งถัดไป (ISO) · ถ้าเปิดอยู่ = รอบถัดไป */
  nextOpen: string;
  /** รอบล่าสุดที่ปิดแล้ว (วันที่นิวยอร์ก) */
  lastClosedSession: string;
};

/** สถานะตลาด ณ now */
export async function marketStatus(now: Date): Promise<MarketStatus> {
  const today = ny(now).date;
  let open = false;
  let early = false;
  let closesAt: Date | null = null;
  if (await isTradingDay(today)) {
    const o = sessionOpen(today);
    const c = await sessionClose(today);
    if (now >= o && now < c) {
      open = true;
      closesAt = c;
      early = await isEarlyClose(today);
    }
  }
  // รอบล่าสุดที่ปิดแล้ว
  const last = (await isTradingDay(today)) && now >= (await sessionClose(today)) ? today : await prevTradingDay(today);
  // รอบเปิดครั้งถัดไป
  let next = await nextTradingDay(today, true);
  if (now >= sessionOpen(next)) next = await nextTradingDay(next);
  return {
    open,
    earlyClose: open && early,
    sessionDate: open ? today : null,
    closesAt: closesAt ? closesAt.toISOString() : null,
    nextOpen: sessionOpen(next).toISOString(),
    lastClosedSession: last,
  };
}

/** วันซื้อขายของรอบที่เกี่ยวข้องกับ now: รอบที่เปิดอยู่ หรือรอบล่าสุดที่ปิดแล้ว */
export async function currentOrLastSession(now: Date): Promise<string> {
  const s = await marketStatus(now);
  return s.sessionDate ?? s.lastClosedSession;
}

