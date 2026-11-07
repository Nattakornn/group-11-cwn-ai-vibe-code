import { handle, json, ApiError } from '@/lib/http';
import { tx } from '@/lib/db';
import { now as clockNow, thaiDate } from '@/lib/clock';
import { requireUser, userById } from '@/lib/session';
import { tierOf } from '@/lib/tier';
import { buildMe } from '@/lib/account/me';
import { PRO_PRICE_THB, periodFrom } from '@/lib/account/rules';

export const dynamic = 'force-dynamic';

/** อัปเกรด Pro ด้วยการจ่ายจำลอง (FR-55, BR-24, A-15, D-17) · สิทธิ์ใช้ได้ทันที */
export const POST = handle(async () => {
  const me = await requireUser();
  const now = await clockNow();
  const period = await tx(async (c) => {
    const r = await c.query<{ pro_period_end: string | null; pro_auto_renew: boolean }>(
      'SELECT pro_period_end, pro_auto_renew FROM users WHERE id = $1 FOR UPDATE', [me.id]);
    if (tierOf(r.rows[0] ?? null, now) === 'pro') {
      throw new ApiError(409, 'ALREADY_PRO', 'คุณเป็นสมาชิก Pro อยู่แล้ว', 'You are already a Pro member');
    }
    const p = periodFrom(thaiDate(now));
    await c.query(
      `INSERT INTO subscriptions (user_id, period_start, period_end, amount_thb, created_at)
       VALUES ($1, $2, $3, $4, $5)`, [me.id, p.start, p.end, PRO_PRICE_THB, now]);
    await c.query('UPDATE users SET pro_period_end = $2, pro_auto_renew = true WHERE id = $1', [me.id, p.end]);
    return p;
  });
  const u = await userById(me.id);
  return json({
    user: await buildMe(u!, now),
    subscription: { periodStart: period.start, periodEnd: period.end, amountThb: PRO_PRICE_THB, paid: true },
  });
});
