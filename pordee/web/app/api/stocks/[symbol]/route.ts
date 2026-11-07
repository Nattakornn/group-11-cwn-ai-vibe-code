// GET /api/stocks/:symbol ข้อมูลพื้นฐาน + ราคาปัจจุบัน (FR-03, FR-07, FR-08) · OTC / ไม่พบ → 404
import { handle, json } from '@/lib/http';
import { getStockDetail } from '@/lib/stocks/detail';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ symbol: string }> };

export const GET = handle<Ctx>(async (_req, ctx) => {
  const { symbol } = await ctx.params;
  return json(await getStockDetail(decodeURIComponent(symbol)));
});
