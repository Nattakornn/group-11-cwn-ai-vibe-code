import { handle, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { dividendsReceived } from '@/lib/portfolio/dividends';
export const dynamic = 'force-dynamic';
export const GET = handle(async () => {
  const u = await requireUser();
  return json(await dividendsReceived(u.id));
});
