// "ตอนนี้" ของทั้งเว็บ (NFR-14) และตัวช่วยเรื่องเวลาไทย / นิวยอร์ก
// ห้ามใช้ new Date() ตรง ๆ ในกฎทางธุรกิจ ให้ใช้ now() เสมอ
import { q1, type Db, pool } from './db';

export const TH_TZ = 'Asia/Bangkok';
export const NY_TZ = 'America/New_York';

export const testApiEnabled = () => process.env.ALLOW_TEST_API === '1';

/** เวลาที่ล็อกไว้ (ถ้าเปิดโหมดทดสอบและมีการล็อก) หรือเวลาจริง */
export async function now(db: Db = pool): Promise<Date> {
  if (!testApiEnabled()) return new Date();
  const r = await q1<{ frozen_now: Date | null }>('SELECT frozen_now FROM app_clock WHERE id = 1', [], db);
  return r?.frozen_now ? new Date(r.frozen_now) : new Date();
}

export async function isFrozen(db: Db = pool): Promise<boolean> {
  if (!testApiEnabled()) return false;
  const r = await q1<{ frozen_now: Date | null }>('SELECT frozen_now FROM app_clock WHERE id = 1', [], db);
  return !!r?.frozen_now;
}

type Parts = { date: string; time: string; minutes: number; isoDow: number };
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(d: Date, tz: string): Parts {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const dows: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    minutes: Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60,
    isoDow: dows[p.weekday as string],
  };
}
/** วันเวลาไทยของ d */
export const thai = (d: Date) => parts(d, TH_TZ);
/** วันเวลานิวยอร์กของ d (รู้ช่วงเวลาออมแสงเอง) */
export const ny = (d: Date) => parts(d, NY_TZ);
export const thaiDate = (d: Date) => thai(d).date;

/** 'YYYY-MM-DD' + 'HH:mm[:ss]' เวลาไทย -> Date */
export function fromThai(date: string, time = '00:00:00'): Date {
  return new Date(`${date}T${time.length === 5 ? time + ':00' : time}+07:00`);
}

/** 'YYYY-MM-DD' + 'HH:mm[:ss]' เวลานิวยอร์ก -> Date (หา offset ของวันนั้นจริง) */
export function fromNy(date: string, time = '00:00:00'): Date {
  const t = time.length === 5 ? time + ':00' : time;
  const asUtc = new Date(`${date}T${t}Z`).getTime();
  let guess = asUtc;
  for (let k = 0; k < 3; k++) {
    const p = ny(new Date(guess));
    const shown = new Date(`${p.date}T${p.time}Z`).getTime();
    guess += asUtc - shown;
  }
  return new Date(guess);
}

/** บวกลบวันของสตริงวันที่ */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ลบปีแบบวันเดียวกัน (6 พ.ย. 2569 - 1 ปี = 6 พ.ย. 2568) */
export function minusYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y - years, m, 0)).getUTCDate();
  return `${y - years}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** จำนวนวันระหว่างวันที่ (b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
