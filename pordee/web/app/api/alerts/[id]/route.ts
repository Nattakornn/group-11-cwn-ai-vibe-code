// แก้ / ลบแจ้งเตือน (FR-23)
import type { NextRequest } from 'next/server';
import { handle, json, body, E } from '@/lib/http';
import { q, q1 } from '@/lib/db';
import { now } from '@/lib/clock';
import { requireUser } from '@/lib/session';
import { getQuote } from '@/lib/feed';
import { directionFor } from '@/lib/alerts/rules';
import { alertLimit, errAlertsFull, parseId, parseTarget } from '@/lib/alerts/common';
import { tierOf } from '@/lib/tier';
import { alertCols, toAlert, type AlertRow } from '@/lib/alerts/serialize';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * {active?, targetPrice?} · เปลี่ยนเป้า หรือเปิดแจ้งเตือนราคาเป้าหมายที่ปิดไปแล้วอีกครั้ง
 * → คิดทิศทางใหม่จากราคาตอนนั้น (A-32) · ตั้งเป้าให้แจ้งเตือนแบบ 5% → 400 INVALID_INPUT
 */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const u = await requireUser();
  const id = parseId((await ctx.params).id);
  const b = await body<{ active?: unknown; targetPrice?: unknown }>(req);
  const cur = await q1<AlertRow>(`SELECT ${alertCols} FROM alerts WHERE id = $1 AND user_id = $2`, [id, u.id]);
  if (!cur) throw E.notFound();
  if (b.active !== undefined && typeof b.active !== 'boolean') throw E.bad();
  if (b.targetPrice !== undefined && b.targetPrice !== null && cur.kind !== 'target') throw E.bad();

  const active = typeof b.active === 'boolean' ? b.active : cur.active;
  let target = cur.target_price;
  let direction = cur.direction;
  const newTarget = cur.kind === 'target' && b.targetPrice !== undefined && b.targetPrice !== null;
  if (newTarget) target = parseTarget(b.targetPrice);
  const reopened = cur.kind === 'target' && active && !cur.active;
  // เปิดแจ้งเตือนที่ปิดอยู่กลับมา = กลับมานับโควตา (โควตานับเฉพาะที่ยังทำงาน · สมมติฐาน 8.2 #2)
  if (active && !cur.active) {
    const tier = tierOf(u, await now());
    const limit = alertLimit(tier);
    const c = await q1<{ used: number }>('SELECT count(*)::int AS used FROM alerts WHERE user_id = $1 AND active', [u.id]);
    if ((c?.used ?? 0) + 1 > limit) throw errAlertsFull(limit, tier);
  }
  if (cur.kind === 'target' && (newTarget || reopened)) {
    let price: string | null = null;
    try { price = (await getQuote(cur.symbol, await now())).price; } catch { price = null; }
    direction = directionFor(target as string, price);
  }
  const r = await q1<AlertRow>(
    `UPDATE alerts SET active = $3, target_price = $4, direction = $5 WHERE id = $1 AND user_id = $2 RETURNING ${alertCols}`,
    [id, u.id, active, target, direction]);
  if (!r) throw E.notFound();
  return json({ alert: toAlert(r) });
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await requireUser();
  const id = parseId((await ctx.params).id);
  const r = await q('DELETE FROM alerts WHERE id = $1 AND user_id = $2 RETURNING id', [id, u.id]);
  if (!r.length) throw E.notFound();
  const c = await q1<{ used: number }>('SELECT count(*)::int AS used FROM alerts WHERE user_id = $1 AND active', [u.id]);
  return json({ ok: true, id, used: c?.used ?? 0 });
});
