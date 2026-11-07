// F6 · ค่าตั้งต้นฝั่งเซิร์ฟเวอร์ของหน้าศึกษา (อ่านอย่างเดียว ไม่เขียนตาราง)
import { currentUser } from '@/lib/session';
import { now, thaiDate } from '@/lib/clock';
import { tierOf, historyStart, type Tier } from '@/lib/tier';
import { marketStatus } from '@/lib/market';

export type StudyCtx = {
  loggedIn: boolean;
  tier: Tier;
  /** วันแรกที่ระดับนี้ดูย้อนหลังได้ 'YYYY-MM-DD' */
  historyStart: string;
  /** รอบที่ปิดล่าสุด (วันที่นิวยอร์ก) */
  lastClosed: string;
  today: string;
};

export async function studyContext(): Promise<StudyCtx> {
  const [user, n] = await Promise.all([currentUser(), now()]);
  const tier = tierOf(user, n);
  const status = await marketStatus(n);
  return { loggedIn: !!user, tier, historyStart: historyStart(tier, n), lastClosed: status.lastClosedSession, today: thaiDate(n) };
}

/** 'YYYY-MM-DD' ลบ n เดือน (วันเกินสิ้นเดือนปัดเป็นวันสุดท้ายของเดือน) */
export function minusMonthsDate(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const idx = y * 12 + (m - 1) - n;
  const ny = Math.floor(idx / 12), nm = (idx % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** 'YYYY-MM' ลบ n เดือน */
export function minusMonths(month: string, n: number): string {
  return minusMonthsDate(`${month}-01`, n).slice(0, 7);
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
export const sp = one;
export const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isMonth = (v: string) => /^\d{4}-\d{2}$/.test(v);
export const cleanSymbol = (v: string) => v.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
