// ราคารายวัน · ราคาในฐานข้อมูลเป็นราคาจริง ฟังก์ชันนี้ปรับแตกพาร์ให้ (BR-32)
// แสดงเฉพาะรอบที่ปิดแล้ว (T-07): ส่ง lastClosed = marketStatus(now).lastClosedSession
import { q, q1, type Db, pool } from './db';
import { D } from './money';

export type Bar = { date: string; open: string; high: string; low: string; close: string; volume: number };

async function splitsOf(symbol: string, db: Db) {
  return q<{ effective_date: string; ratio_to: number; ratio_from: number }>(
    'SELECT effective_date, ratio_to, ratio_from FROM splits WHERE symbol = $1', [symbol], db);
}

/** ตัวหารของวันที่ date = ผลคูณอัตราของทุกการแตกพาร์ที่มีผลหลังวันนั้น */
function factorFor(date: string, splits: { effective_date: string; ratio_to: number; ratio_from: number }[]) {
  let f = D(1);
  for (const s of splits) if (date < s.effective_date) f = f.mul(s.ratio_to).div(s.ratio_from);
  return f;
}

/** แท่งรายวันช่วง [from, to] (วันที่นิวยอร์ก) · adjusted=true หารแตกพาร์ · ค่าเป็น string 4 ตำแหน่ง */
export async function dailyBars(symbol: string, from: string, to: string, adjusted = true, db: Db = pool): Promise<Bar[]> {
  const rows = await q<{ trade_date: string; open: string; high: string; low: string; close: string; volume: number }>(
    `SELECT trade_date, open, high, low, close, volume FROM daily_prices
     WHERE symbol = $1 AND trade_date BETWEEN $2 AND $3 ORDER BY trade_date`, [symbol, from, to], db);
  const sp = adjusted ? await splitsOf(symbol, db) : [];
  return rows.map((r) => {
    const f = factorFor(r.trade_date, sp);
    const a = (v: string) => D(v).div(f).toDecimalPlaces(4).toFixed(4);
    return { date: r.trade_date, open: a(r.open), high: a(r.high), low: a(r.low), close: a(r.close), volume: Number(r.volume) };
  });
}

/** ราคาปิดทั้งหมดถึงวันที่ to (ใช้คิดตัวชี้วัด) แบบปรับแตกพาร์ */
export async function adjustedCloses(symbol: string, to: string, db: Db = pool): Promise<{ date: string; close: string }[]> {
  const bars = await dailyBars(symbol, '1900-01-01', to, true, db);
  return bars.map((b) => ({ date: b.date, close: b.close }));
}

/** ราคาปิดจริงของวันที่ date (null ถ้าไม่มี) */
export async function closeOn(symbol: string, date: string, db: Db = pool): Promise<string | null> {
  const r = await q1<{ close: string }>('SELECT close FROM daily_prices WHERE symbol = $1 AND trade_date = $2', [symbol, date], db);
  return r?.close ?? null;
}

/** ราคาปิดล่าสุดที่ไม่เกินวันที่ date (วันที่ + ราคา) */
export async function lastCloseOnOrBefore(symbol: string, date: string, db: Db = pool) {
  return q1<{ trade_date: string; close: string }>(
    'SELECT trade_date, close FROM daily_prices WHERE symbol = $1 AND trade_date <= $2 ORDER BY trade_date DESC LIMIT 1',
    [symbol, date], db);
}

/** วันแรกที่มีข้อมูล */
export async function firstDate(symbol: string, db: Db = pool): Promise<string | null> {
  const r = await q1<{ d: string | null }>('SELECT min(trade_date) AS d FROM daily_prices WHERE symbol = $1', [symbol], db);
  return r?.d ?? null;
}
