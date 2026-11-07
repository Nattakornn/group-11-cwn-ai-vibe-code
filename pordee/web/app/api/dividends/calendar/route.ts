import { handle, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { dividendCalendar } from '@/lib/portfolio/dividends';
export const dynamic = 'force-dynamic';
export const GET = handle(async (req) => {
  const u = await requireUser();
  return json(await dividendCalendar(u.id, req.nextUrl.searchParams.get('month')));
});
