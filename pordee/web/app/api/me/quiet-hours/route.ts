// ช่วงเงียบของผู้ใช้ (FR-26 · BR-37) · เวลาไทย 'HH:mm' · ข้ามเที่ยงคืนได้ (เช่น 22:00–07:00)
import type { NextRequest } from 'next/server';
import { handle, json, body, E } from '@/lib/http';
import { q1 } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { hhmm, isHHmm } from '@/lib/alerts/rules';

export const dynamic = 'force-dynamic';

const out = (r: { quiet_start: string | null; quiet_end: string | null }) =>
  ({ quietStart: hhmm(r.quiet_start), quietEnd: hhmm(r.quiet_end) });

export const GET = handle(async () => {
  const u = await requireUser();
  return json(out(u));
});

/** {start, end} ทั้งคู่เป็น 'HH:mm' หรือทั้งคู่เป็น null (ปิดช่วงเงียบ) */
export const PATCH = handle(async (req: NextRequest) => {
  const u = await requireUser();
  const b = await body<{ start?: unknown; end?: unknown; quietStart?: unknown; quietEnd?: unknown }>(req);
  // รับชื่อช่องแบบเดียวกับคำตอบ (quietStart/quietEnd) ด้วย · ถ้าไม่มีทั้ง 2 แบบ = ไม่ได้ส่งค่า → ปฏิเสธ (ไม่ล้างช่วงเงียบเงียบ ๆ)
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
  if (!has('start') && !has('end') && !has('quietStart') && !has('quietEnd')) {
    throw E.bad('กรุณาเลือกเวลาเริ่มและเวลาจบ', 'Please choose a start and an end time');
  }
  const start = (has('start') ? b.start : b.quietStart) ?? null;
  const end = (has('end') ? b.end : b.quietEnd) ?? null;
  // ส่งช่องว่าง = ยังไม่ได้เลือกเวลา → ปฏิเสธ ค่าที่เก็บไม่เปลี่ยน (สมมติฐาน 8.2 #30) · ล้างช่วงเงียบต้องส่ง null ทั้งคู่
  if (start === '' && end === '') {
    throw E.bad('กรุณาเลือกเวลาเริ่มและเวลาจบ', 'Please choose a start and an end time');
  }
  if (start === '' || end === '') {
    throw E.bad('กรุณาเลือกทั้งเวลาเริ่มและเวลาจบ', 'Please choose both a start and an end time');
  }
  if ((start === null) !== (end === null)) {
    throw E.bad('กรุณาเลือกทั้งเวลาเริ่มและเวลาจบ', 'Please choose both a start and an end time');
  }
  if (start !== null && (!isHHmm(start) || !isHHmm(end))) {
    throw E.bad('เวลาต้องอยู่ในรูปแบบ HH:mm', 'Times must be in HH:mm format');
  }
  if (start !== null && start === end) {
    throw E.bad('เวลาเริ่มและเวลาจบต้องไม่ซ้ำกัน', 'Start and end times must be different');
  }
  const r = await q1<{ quiet_start: string | null; quiet_end: string | null }>(
    'UPDATE users SET quiet_start = $2, quiet_end = $3 WHERE id = $1 RETURNING quiet_start, quiet_end',
    [u.id, start, end]);
  return json(out(r!));
});
