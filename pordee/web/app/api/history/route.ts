// GET /api/history (FR-44 · BR-55) ใหม่สุดก่อน · เก็บ 20 รายการล่าสุด
import { handle, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { listHistory } from '@/lib/analysis/common';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const user = await requireUser();
  return json({ items: await listHistory(user.id) });
});
