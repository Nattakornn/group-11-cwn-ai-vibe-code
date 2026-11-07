// POST /api/test/feed {symbol, mode: 'price'|'zero'|'timeout'|'normal', price?} สั่ง Mock Feed (NFR-15)
// {symbol:'*', mode} = ทุกตัว · ไม่ล้างที่พักราคา (ราคาใหม่จะเห็นเมื่อที่พักหมดอายุตาม BR-10 หรือ clearCache:true)
import { handle, json, body, E } from '@/lib/http';
import { q, q1 } from '@/lib/db';
import { assertTestApi } from '@/lib/testapi';
export const dynamic = 'force-dynamic';
export const POST = handle(async (req) => {
  assertTestApi();
  const b = await body<{ symbol?: string; mode?: string; price?: string | number; clearCache?: boolean }>(req);
  const mode = b.mode ?? 'price';
  if (!['price', 'zero', 'timeout', 'normal'].includes(mode)) throw E.bad('mode ไม่ถูกต้อง', 'invalid mode');
  const syms = b.symbol === '*' ? (await q<{ symbol: string }>('SELECT symbol FROM stocks')).map((r) => r.symbol)
    : [((await q1<{ symbol: string }>('SELECT symbol FROM stocks WHERE upper(symbol)=upper($1)', [b.symbol ?? ''])) ?? (() => { throw E.notFound(); })()).symbol];
  for (const s of syms) {
    if (mode === 'normal') await q('DELETE FROM feed_overrides WHERE symbol = $1', [s]);
    else await q(`INSERT INTO feed_overrides (symbol, mode, price) VALUES ($1, $2, $3)
                  ON CONFLICT (symbol) DO UPDATE SET mode = EXCLUDED.mode, price = EXCLUDED.price`,
      [s, mode, mode === 'price' ? String(b.price) : null]);
    if (b.clearCache) await q('DELETE FROM quote_cache WHERE symbol = $1', [s]);
  }
  return json({ ok: true, symbols: syms.length, mode });
});
