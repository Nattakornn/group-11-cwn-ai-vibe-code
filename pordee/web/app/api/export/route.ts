// GET /api/export?symbol=&from=&to=&adjusted=1|0 (FR-43) · ต้องเข้าสู่ระบบ · เฉพาะ Pro · CSV ขึ้นต้นด้วย BOM
import { handle, langOf } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { exportCsv } from '@/lib/analysis/service';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const user = await requireUser();
  const sp = req.nextUrl.searchParams;
  const { filename, body } = await exportCsv(user, sp.get('symbol'), sp.get('from'), sp.get('to'), sp.get('adjusted'), langOf(req));
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
});
