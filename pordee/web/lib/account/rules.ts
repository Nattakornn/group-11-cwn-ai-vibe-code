// กฎวันที่ของบัญชี (ฟังก์ชันบริสุทธิ์ · วันที่ไทย 'YYYY-MM-DD')
import { addDays, daysBetween } from '../clock';

export const PRO_PRICE_THB = '199.00';
/** วันที่ขอลบ = วันที่ 0 · ถึงวันที่นี้แล้วต้องลบ (BR-57, A-22) */
export const PURGE_AFTER_DAYS = 29;

/** บวกเดือนแบบวันเดียวกัน ถ้าเดือนปลายทางไม่มีวันนั้นใช้วันสุดท้ายของเดือน (A-15) */
export function addMonthsClamped(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ty = Math.floor(idx / 12);
  const tm = (idx % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** รอบ Pro ที่เริ่มวัน start: จบวันเดียวกันของเดือนถัดไป − 1 วัน (BR-24) */
export function periodFrom(start: string): { start: string; end: string } {
  return { start, end: addDays(addMonthsClamped(start, 1), -1) };
}

/** รอบถัดไปหลังรอบที่จบวัน end */
export function nextPeriod(end: string): { start: string; end: string } {
  return periodFrom(addDays(end, 1));
}

/** รอบที่ต้องต่ออายุทั้งหมดจนครอบคลุมวันนี้ (ต่อเมื่อวันนี้ > วันจบรอบ) */
export function renewalsDue(end: string, today: string): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  let cur = end;
  while (today > cur) {
    const p = nextPeriod(cur);
    out.push(p);
    cur = p.end;
  }
  return out;
}

/** ต้องลบข้อมูลแล้วหรือยัง (วันที่ไทยที่ขอ, วันที่ไทยของวันนี้) */
export function shouldPurge(requestedDate: string, today: string): boolean {
  return daysBetween(requestedDate, today) >= PURGE_AFTER_DAYS;
}
