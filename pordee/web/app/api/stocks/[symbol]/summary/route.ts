// POST /api/stocks/:symbol/summary (FR-47, FR-48 · BR-56 · NFR-12) แม่แบบตายตัว
import { handle, json, langOf } from '@/lib/http';
import { summaryFor } from '@/lib/analysis/service';

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export const dynamic = 'force-dynamic';

export const POST = handle<{ params: Promise<{ symbol: string }> }>(async (req, ctx) => {
  const { symbol } = await ctx.params;
  return json(await summaryFor(safeDecode(symbol), langOf(req)));
});
