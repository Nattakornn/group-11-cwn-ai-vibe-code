// POST /api/test/reset {now?} ล้างข้อมูลลูกค้ากลับเป็น seed และล็อกนาฬิกา (ไม่ส่ง now = 2026-11-06T22:00:00+07:00)
import { handle, json, body } from '@/lib/http';
import { q } from '@/lib/db';
import { assertTestApi, parseNow } from '@/lib/testapi';
export const dynamic = 'force-dynamic';
export const POST = handle(async (req) => {
  assertTestApi();
  const b = await body<{ now?: string }>(req);
  const n = b.now === undefined ? new Date('2026-11-06T22:00:00+07:00') : parseNow(b.now);
  await q('SELECT pordee_reset($1)', [n]);
  return json({ ok: true, now: n.toISOString() });
});
