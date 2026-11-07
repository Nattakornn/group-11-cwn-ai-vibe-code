// กล่องแจ้งเตือนในเว็บ (FR-24 · A-05) · เก็บทุกแจ้งเตือนรวมที่เกิดในช่วงเงียบ
import { handle, json } from '@/lib/http';
import { q, q1 } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { toInboxItem, type EventRow } from '@/lib/alerts/serialize';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const u = await requireUser();
  const rows = await q<EventRow>(
    `SELECT e.id, e.alert_id, e.symbol, a.kind, e.price, e.change_pct, e.triggered_at, e.in_quiet_hours, e.read_at, a.target_price
     FROM alert_events e JOIN alerts a ON a.id = e.alert_id
     WHERE e.user_id = $1 ORDER BY e.triggered_at DESC, e.id DESC LIMIT 500`, [u.id]);
  const c = await q1<{ unread: number }>(
    'SELECT count(*)::int AS unread FROM alert_events WHERE user_id = $1 AND read_at IS NULL', [u.id]);
  return json({ items: rows.map(toInboxItem), unread: c?.unread ?? 0 });
});
