// ทำเครื่องหมายว่าอ่านแล้ว (A-05: ตัวนับยังไม่อ่านลดลง)
import type { NextRequest } from 'next/server';
import { handle, json, E } from '@/lib/http';
import { q, q1 } from '@/lib/db';
import { now } from '@/lib/clock';
import { requireUser } from '@/lib/session';
import { parseId } from '@/lib/alerts/common';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await requireUser();
  const id = parseId((await ctx.params).id);
  const r = await q('UPDATE alert_events SET read_at = coalesce(read_at, $3) WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, u.id, await now()]);
  if (!r.length) throw E.notFound();
  const c = await q1<{ unread: number }>(
    'SELECT count(*)::int AS unread FROM alert_events WHERE user_id = $1 AND read_at IS NULL', [u.id]);
  return json({ ok: true, id, unread: c?.unread ?? 0 });
});
