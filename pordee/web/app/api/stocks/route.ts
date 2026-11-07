// GET /api/stocks?q= ค้นหาหุ้น (FR-01, FR-02 · D-14) · ตอบ 200 เสมอ
import { handle, json, langOf } from '@/lib/http';
import { searchStocks } from '@/lib/stocks/search';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  return json(await searchStocks(q, langOf(req)));
});
