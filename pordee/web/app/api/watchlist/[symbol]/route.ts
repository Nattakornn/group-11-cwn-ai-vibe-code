// ลบหุ้นออกจากรายการเฝ้าดู (FR-18)
import type { NextRequest } from 'next/server';
import { handle, json, E } from '@/lib/http';
import { q, q1 } from '@/lib/db';
import { now } from '@/lib/clock';
import { requireUser } from '@/lib/session';
import { tierOf } from '@/lib/tier';
import { normSymbol, watchLimit } from '@/lib/alerts/common';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ symbol: string }> };

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const u = await requireUser();
  const { symbol: raw } = await ctx.params;
  let s = raw;
  try { s = decodeURIComponent(raw); } catch { /* ใช้ค่าเดิม */ }
  const sym = normSymbol(s);
  const r = await q('DELETE FROM watchlist_items WHERE user_id = $1 AND upper(symbol) = $2 RETURNING symbol', [u.id, sym]);
  if (!r.length) throw E.notFound();
  const c = await q1<{ used: number }>('SELECT count(*)::int AS used FROM watchlist_items WHERE user_id = $1', [u.id]);
  const tier = tierOf(u, await now());
  return json({ ok: true, symbol: r[0].symbol, used: c?.used ?? 0, limit: watchLimit(tier), tier });
});
