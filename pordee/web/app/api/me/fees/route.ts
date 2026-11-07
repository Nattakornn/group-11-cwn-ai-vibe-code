import { body, handle, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { getFees, updateFees } from '@/lib/portfolio/portfolio';
export const dynamic = 'force-dynamic';
export const GET = handle(async () => {
  const u = await requireUser();
  return json(await getFees(u.id));
});
export const PATCH = handle(async (req) => {
  const u = await requireUser();
  return json(await updateFees(u.id, await body(req)));
});
