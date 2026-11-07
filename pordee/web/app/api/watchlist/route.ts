// รายการเฝ้าดู (FR-18–FR-20 · BR-16–BR-19)
import type { NextRequest } from 'next/server';
import { handle, json, body } from '@/lib/http';
import { q, tx } from '@/lib/db';
import { now } from '@/lib/clock';
import { requireUser } from '@/lib/session';
import { tierOf } from '@/lib/tier';
import { getQuote, type Quote } from '@/lib/feed';
import { errAlreadyInList, errDelistedConfirm, errWatchlistFull, findStock, watchLimit } from '@/lib/alerts/common';

export const dynamic = 'force-dynamic';

/** ลำดับที่แสดง = ลำดับที่เพิ่ม (1, 2, 3 …) · Free ตัวที่ 11 ขึ้นไป = เฉพาะ Pro ไม่ดึงราคา (BR-18) */
export const GET = handle(async () => {
  const u = await requireUser();
  const n = await now();
  const tier = tierOf(u, n);
  const limit = watchLimit(tier);
  const rows = await q<{ symbol: string; name: string; rank: number }>(
    `SELECT w.symbol, s.name, row_number() OVER (ORDER BY w.position, w.added_at, w.symbol)::int AS rank
     FROM watchlist_items w JOIN stocks s ON s.symbol = w.symbol
     WHERE w.user_id = $1 ORDER BY w.position, w.added_at, w.symbol`, [u.id]);
  const visible = 10; // สิทธิ์ Free เห็นราคา 10 ตัวแรก
  const items: { symbol: string; name: string; position: number; proOnly: boolean; quote: Quote | null }[] = [];
  for (const r of rows) {
    const proOnly = tier === 'free' && r.rank > visible;
    let quote: Quote | null = null;
    if (!proOnly) {
      try { quote = await getQuote(r.symbol, n); } catch { quote = null; }
    }
    items.push({ symbol: r.symbol, name: r.name, position: r.rank, proOnly, quote });
  }
  return json({ items, used: rows.length, limit, tier });
});

/** เพิ่มหุ้น · นับโควตาใน tx เดียวกับการเพิ่ม โดยล็อกแถวผู้ใช้ก่อน (DESIGN 4) */
export const POST = handle(async (req: NextRequest) => {
  const u = await requireUser();
  const b = await body<{ symbol?: unknown; confirmDelisted?: unknown }>(req);
  const stock = await findStock(b.symbol);
  const n = await now();
  const tier = tierOf(u, n);
  const limit = watchLimit(tier);
  const out = await tx(async (c) => {
    await c.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [u.id]);
    const dup = await c.query('SELECT 1 FROM watchlist_items WHERE user_id = $1 AND symbol = $2', [u.id, stock.symbol]);
    if (dup.rowCount) throw errAlreadyInList();
    // หุ้นถูกถอด: ต้องยืนยันก่อน (เช็กหลัง "มีแล้ว" เพื่อบอกเหตุจริงก่อน) · ยกเลิก = ไม่กินโควตา (8.2 #7)
    if (stock.status === 'delisted' && b.confirmDelisted !== true) throw errDelistedConfirm(stock.symbol);
    const cnt = await c.query<{ used: number; maxpos: number }>(
      'SELECT count(*)::int AS used, coalesce(max(position), 0)::int AS maxpos FROM watchlist_items WHERE user_id = $1', [u.id]);
    const { used, maxpos } = cnt.rows[0];
    if (used + 1 > limit) throw errWatchlistFull(limit, tier);
    await c.query('INSERT INTO watchlist_items (user_id, symbol, position, added_at) VALUES ($1, $2, $3, $4)',
      [u.id, stock.symbol, maxpos + 1, n]);
    return { position: used + 1, used: used + 1 };
  });
  return json({ item: { symbol: stock.symbol, name: stock.name, position: out.position, proOnly: false },
    used: out.used, limit, tier }, 201);
});
