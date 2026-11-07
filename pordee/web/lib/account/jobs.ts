// งานตามเวลาของบัญชี: ต่ออายุ Pro (BR-24, D-17) · ลบบัญชีที่ขอลบครบกำหนด (BR-57, A-22)
import type { Job } from '../jobs';
import { q, tx } from '../db';
import { thaiDate } from '../clock';
import { PRO_PRICE_THB, renewalsDue, shouldPurge } from './rules';

/** ต่ออายุอัตโนมัติ: จ่ายจำลองผ่านเสมอ · วนจนรอบครอบคลุมวันนี้ */
export async function renew(now: Date) {
  const today = thaiDate(now);
  const due = await q<{ id: number }>(
    `SELECT id FROM users
     WHERE pro_auto_renew AND pro_period_end IS NOT NULL AND pro_period_end < $1::date
       AND delete_requested_at IS NULL
     ORDER BY id`, [today]);
  const renewed: { userId: number; periods: { start: string; end: string }[] }[] = [];
  for (const { id } of due) {
    const periods = await tx(async (c) => {
      const r = await c.query<{ pro_period_end: string; pro_auto_renew: boolean }>(
        'SELECT pro_period_end, pro_auto_renew FROM users WHERE id = $1 FOR UPDATE', [id]);
      const u = r.rows[0];
      if (!u || !u.pro_auto_renew || !u.pro_period_end) return [];
      const ps = renewalsDue(u.pro_period_end, today);
      for (const p of ps) {
        await c.query(
          `INSERT INTO subscriptions (user_id, period_start, period_end, amount_thb, created_at)
           VALUES ($1, $2, $3, $4, $5)`, [id, p.start, p.end, PRO_PRICE_THB, now]);
      }
      if (ps.length) {
        await c.query('UPDATE users SET pro_period_end = $2 WHERE id = $1', [id, ps[ps.length - 1].end]);
      }
      return ps;
    });
    if (periods.length) renewed.push({ userId: id, periods });
  }
  return { renewed };
}

/** ลบบัญชีที่ขอลบมาแล้วตั้งแต่ 29 วัน (วันที่ขอ = วันที่ 0) · cascade ทุกตารางของลูกค้า */
export async function purge(now: Date) {
  const today = thaiDate(now);
  const rows = await q<{ id: number; requested: string }>(
    `SELECT id, to_char(delete_requested_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS requested
     FROM users WHERE delete_requested_at IS NOT NULL AND delete_requested_at <= $1
     ORDER BY id`, [now]);
  const ids = rows.filter((r) => shouldPurge(r.requested, today)).map((r) => r.id);
  if (ids.length) await q('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
  return { purged: ids };
}

export const jobs: Job[] = [
  { name: 'renew', run: renew },
  { name: 'purge', run: purge },
];
