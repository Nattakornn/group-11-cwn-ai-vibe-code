// POST /api/test/tick รันงานตามเวลาทุกงานครั้งเดียว ณ นาฬิกาของเว็บ
import { handle, json } from '@/lib/http';
import { now } from '@/lib/clock';
import { runJobs } from '@/lib/jobs';
import { assertTestApi } from '@/lib/testapi';
export const dynamic = 'force-dynamic';
export const POST = handle(async () => {
  assertTestApi();
  const n = await now();
  return json({ ok: true, now: n.toISOString(), jobs: await runJobs(n) });
});
