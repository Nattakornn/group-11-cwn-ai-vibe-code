import { handle, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { getPortfolio } from '@/lib/portfolio/portfolio';
export const dynamic = 'force-dynamic';
export const GET = handle(async () => {
  const u = await requireUser();
  return json(await getPortfolio(u.id));
});
