import { body, handle, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { createPlan, listPlans } from '@/lib/portfolio/dca';
export const dynamic = 'force-dynamic';
export const GET = handle(async () => {
  const u = await requireUser();
  return json(await listPlans(u.id));
});
export const POST = handle(async (req) => {
  const u = await requireUser();
  return json(await createPlan(u.id, await body(req)), 201);
});
