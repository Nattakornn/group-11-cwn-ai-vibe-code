import { handle, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { listPending } from '@/lib/portfolio/dca';
export const dynamic = 'force-dynamic';
/** ?status=all → รวมรายการที่ยืนยัน/ข้ามแล้ว · ค่าเริ่มต้นเฉพาะ pending */
export const GET = handle(async (req) => {
  const u = await requireUser();
  return json(await listPending(u.id, req.nextUrl.searchParams.get('status') === 'all'));
});
