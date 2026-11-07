import type { NextRequest } from 'next/server';
import { handle, json, body, E } from '@/lib/http';
import { tx } from '@/lib/db';
import { now as clockNow } from '@/lib/clock';
import { requireUser, destroySession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** ขอลบบัญชี (FR-53) · ออกจากระบบทุกเครื่องทันที ยกเลิกคำขอไม่ได้ · ข้อมูลถูกลบโดยงาน purge (BR-57) */
export const POST = handle(async (req: NextRequest) => {
  const me = await requireUser();
  const b = await body<{ confirm?: unknown }>(req);
  if (b.confirm !== true) throw E.bad();
  const now = await clockNow();
  await tx(async (c) => {
    await c.query(
      'UPDATE users SET delete_requested_at = $2 WHERE id = $1 AND delete_requested_at IS NULL', [me.id, now]);
    await c.query('DELETE FROM sessions WHERE user_id = $1', [me.id]);
  });
  await destroySession();
  return json({ ok: true });
});
