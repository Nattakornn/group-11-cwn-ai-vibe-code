// POST /api/test/clock {now} ล็อกนาฬิกา · {now:null} = ใช้เวลาจริง · GET ดูค่าปัจจุบัน
import { handle, json, body } from '@/lib/http';
import { q } from '@/lib/db';
import { now as clockNow } from '@/lib/clock';
import { assertTestApi, parseNow } from '@/lib/testapi';
export const dynamic = 'force-dynamic';
export const POST = handle(async (req) => {
  assertTestApi();
  const b = await body<{ now?: string | null }>(req);
  const n = b.now === null ? null : parseNow(b.now);
  await q('UPDATE app_clock SET frozen_now = $1 WHERE id = 1', [n]);
  return json({ ok: true, now: (n ?? new Date()).toISOString(), frozen: n !== null });
});
export const GET = handle(async () => { assertTestApi(); return json({ now: (await clockNow()).toISOString() }); });
