import { handle, json, ApiError } from '@/lib/http';
import { tx } from '@/lib/db';
import { now as clockNow } from '@/lib/clock';
import { requireUser, userById } from '@/lib/session';
import { tierOf } from '@/lib/tier';
import { buildMe } from '@/lib/account/me';

export const dynamic = 'force-dynamic';

/** เปิดต่ออายุ Pro กลับหลังยกเลิก (8.2 #13 · R109) · ระหว่างรอบไม่เก็บเงิน · เก็บรอบใหม่ตอน tick ต่ออายุตามปกติ */
export const POST = handle(async () => {
  const me = await requireUser();
  const now = await clockNow();
  await tx(async (c) => {
    const r = await c.query<{ pro_period_end: string | null; pro_auto_renew: boolean }>(
      'SELECT pro_period_end, pro_auto_renew FROM users WHERE id = $1 FOR UPDATE', [me.id]);
    const u = r.rows[0] ?? null;
    if (tierOf(u, now) !== 'pro') {
      throw new ApiError(409, 'NOT_PRO', 'คุณยังไม่ได้เป็นสมาชิก Pro', 'You are not a Pro member');
    }
    if (u!.pro_auto_renew) {
      throw new ApiError(409, 'ALREADY_RENEWING', 'เปิดต่ออายุอัตโนมัติอยู่แล้ว', 'Auto-renewal is already on');
    }
    await c.query('UPDATE users SET pro_auto_renew = true WHERE id = $1', [me.id]);
    await c.query(
      `UPDATE subscriptions SET cancelled_at = NULL
       WHERE id = (SELECT id FROM subscriptions WHERE user_id = $1
                   ORDER BY period_end DESC, id DESC LIMIT 1)`, [me.id]);
  });
  const u = await userById(me.id);
  return json({ user: await buildMe(u!, now) });
});
