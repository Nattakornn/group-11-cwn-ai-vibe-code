// แจ้งเตือน 2 แบบ: 5% และราคาเป้าหมาย (FR-21–FR-23 · BR-20, BR-21 · A-32)
import type { NextRequest } from 'next/server';
import { handle, json, body, E } from '@/lib/http';
import { q, tx } from '@/lib/db';
import { now } from '@/lib/clock';
import { requireUser } from '@/lib/session';
import { tierOf } from '@/lib/tier';
import { getQuote } from '@/lib/feed';
import { directionFor } from '@/lib/alerts/rules';
import { alertLimit, errAlertsFull, errPctExists, errStockDelisted, findStock, parseTarget } from '@/lib/alerts/common';
import { alertCols, toAlert, type AlertRow } from '@/lib/alerts/serialize';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const u = await requireUser();
  const tier = tierOf(u, await now());
  const rows = await q<AlertRow>(`SELECT ${alertCols} FROM alerts WHERE user_id = $1 ORDER BY created_at, id`, [u.id]);
  // โควตานับเฉพาะแจ้งเตือนที่ยังทำงาน (สมมติฐาน 8.2 #2 · R48): ราคาเป้าที่แจ้งแล้วปิดตัวเอง / ที่ผู้ใช้ปิดไว้ ไม่นับ
  return json({ items: rows.map(toAlert), used: rows.filter((r) => r.active).length, limit: alertLimit(tier), tier });
});

/** ตั้งแจ้งเตือน · นับรวม 2 แบบใน tx เดียวกับการเพิ่ม โดยล็อกแถวผู้ใช้ก่อน */
export const POST = handle(async (req: NextRequest) => {
  const u = await requireUser();
  const b = await body<{ symbol?: unknown; kind?: unknown; targetPrice?: unknown }>(req);
  // ช่องที่ขาดต้องบอกชื่อช่อง (R41) · ส่งฟอร์มเปล่า → บอกให้กรอกชื่อย่อหุ้นก่อน
  if (typeof b.symbol !== 'string' || b.symbol.trim() === '') throw E.bad('กรุณากรอกชื่อย่อหุ้น', 'Please enter a stock symbol');
  if (b.kind !== 'pct' && b.kind !== 'target') throw E.bad('กรุณาเลือกแบบแจ้งเตือน', 'Please choose an alert type');
  const kind = b.kind;
  const target = kind === 'target' ? parseTarget(b.targetPrice) : null;
  const stock = await findStock(b.symbol);
  if (stock.status === 'delisted') throw errStockDelisted();
  const n = await now();
  const tier = tierOf(u, n);
  const limit = alertLimit(tier);

  // ทิศทางจากราคาตอนตั้ง (A-32) · อ่านราคาก่อนเปิด tx เพื่อไม่ถือล็อกระหว่างรอแหล่งข้อมูล
  let direction: 'up' | 'down' | null = null;
  if (kind === 'target') {
    let price: string | null = null;
    try { price = (await getQuote(stock.symbol, n)).price; } catch { price = null; }
    direction = directionFor(target as string, price);
  }

  const row = await tx(async (c) => {
    await c.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [u.id]);
    const cnt = await c.query<{ used: number }>('SELECT count(*)::int AS used FROM alerts WHERE user_id = $1 AND active', [u.id]);
    const used = cnt.rows[0].used;
    if (used + 1 > limit) throw errAlertsFull(limit, tier);
    if (kind === 'pct') {
      const dup = await c.query(`SELECT 1 FROM alerts WHERE user_id = $1 AND symbol = $2 AND kind = 'pct'`, [u.id, stock.symbol]);
      if (dup.rowCount) throw errPctExists();
    }
    const r = await c.query<AlertRow>(
      `INSERT INTO alerts (user_id, symbol, kind, target_price, direction, active, created_at)
       VALUES ($1, $2, $3, $4, $5, true, $6) RETURNING ${alertCols}`,
      [u.id, stock.symbol, kind, target, direction, n]);
    return { alert: r.rows[0], used: used + 1 };
  });
  return json({ alert: toAlert(row.alert), used: row.used, limit, tier }, 201);
});
