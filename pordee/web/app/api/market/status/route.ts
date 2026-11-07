import { handle, json } from '@/lib/http';
import { now } from '@/lib/clock';
import { marketStatus } from '@/lib/market';
export const dynamic = 'force-dynamic';
export const GET = handle(async () => {
  const n = await now();
  return json({ now: n.toISOString(), ...(await marketStatus(n)) });
});
