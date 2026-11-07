import { handle, json, E } from '@/lib/http';
import { q1 } from '@/lib/db';
import { now as clockNow } from '@/lib/clock';
import { requireUser } from '@/lib/session';
import { quotaStatus } from '@/lib/feed';

export const dynamic = 'force-dynamic';

/** หน้าทีมงาน: โควตาและสถานะแหล่งข้อมูล (FR-09, FR-60) */
export const GET = handle(async () => {
  const u = await requireUser();
  if (!u.is_staff) throw E.forbidden();
  const now = await clockNow();
  const status = await quotaStatus(now);
  const last = await q1<{ ok: boolean }>(
    'SELECT ok FROM feed_requests WHERE requested_at <= $1 ORDER BY requested_at DESC, id DESC LIMIT 1', [now]);
  return json({ ...status, feedState: last && last.ok === false ? 'degraded' : 'ok' });
});
