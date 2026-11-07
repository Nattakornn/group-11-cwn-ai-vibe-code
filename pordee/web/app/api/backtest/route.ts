// POST /api/backtest (FR-42 · BR-54 · T-09) · ต้องเข้าสู่ระบบ · เฉพาะ Pro
import { body, handle, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { runBacktest } from '@/lib/analysis/service';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const user = await requireUser();
  return json(await runBacktest(user, await body(req)));
});
