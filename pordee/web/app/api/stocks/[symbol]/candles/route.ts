// GET /api/stocks/:symbol/candles?interval=day|week&from=&to=&adjusted=1|0 (FR-10–FR-12, FR-16 · BR-22, BR-23, BR-32)
import { handle, json } from '@/lib/http';
import { now } from '@/lib/clock';
import { currentUser } from '@/lib/session';
import { tierOf } from '@/lib/tier';
import { getCandles } from '@/lib/stocks/candles';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ symbol: string }> };

export const GET = handle<Ctx>(async (req, ctx) => {
  const { symbol } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const n = await now();
  const tier = tierOf(await currentUser(), n); // ไม่เข้าสู่ระบบ = free
  return json(await getCandles(decodeURIComponent(symbol), {
    interval: sp.get('interval'), from: sp.get('from'), to: sp.get('to'), adjusted: sp.get('adjusted'),
  }, tier, n));
});
