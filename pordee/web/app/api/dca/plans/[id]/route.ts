import { body, handle, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { updatePlan } from '@/lib/portfolio/dca';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export const PATCH = handle<Ctx>(async (req, ctx) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  return json(await updatePlan(u.id, id, await body(req)));
});
