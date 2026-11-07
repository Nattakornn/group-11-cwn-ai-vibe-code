// GET /api/stocks/:symbol/indicators?from=&to= (FR-13–FR-15 · BR-26–BR-31 · T-07)
import { handle, json } from '@/lib/http';
import { indicatorsFor } from '@/lib/analysis/service';

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export const dynamic = 'force-dynamic';

export const GET = handle<{ params: Promise<{ symbol: string }> }>(async (req, ctx) => {
  const { symbol } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  return json(await indicatorsFor(safeDecode(symbol), sp.get('from'), sp.get('to')));
});
