import { handle, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { confirmPending } from '@/lib/portfolio/dca';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export const POST = handle<Ctx>(async (_req, ctx) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  return json(await confirmPending(u.id, id));
});
