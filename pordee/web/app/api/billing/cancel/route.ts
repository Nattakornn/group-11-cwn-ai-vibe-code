import { handle, json, ApiError } from '@/lib/http';
import { tx } from '@/lib/db';
import { now as clockNow } from '@/lib/clock';
import { requireUser, userById } from '@/lib/session';
import { tierOf } from '@/lib/tier';
import { buildMe } from '@/lib/account/me';

export const dynamic = 'force-dynamic';

/** ยกเลิกการต่ออายุ Pro (FR-56, BR-25) · ใช้ได้จนจบรอบ ไม่คืนเงิน */
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
    if (!u!.pro_auto_renew) {
      throw new ApiError(409, 'ALREADY_CANCELLED', 'ยกเลิกการต่ออายุแล้ว', 'Auto-renewal is already cancelled');
    }
    await c.query('UPDATE users SET pro_auto_renew = false WHERE id = $1', [me.id]);
    // บันทึกเวลายกเลิกที่รอบปัจจุบัน (รอบล่าสุดที่ยังไม่ถูกยกเลิก)
    await c.query(
      `UPDATE subscriptions SET cancelled_at = $2
       WHERE id = (SELECT id FROM subscriptions WHERE user_id = $1 AND cancelled_at IS NULL
                   ORDER BY period_end DESC, id DESC LIMIT 1)`, [me.id, now]);
  });
  const u = await userById(me.id);
  return json({ user: await buildMe(u!, now) });
});
