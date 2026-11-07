import { body, handle, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { deleteTransaction, updateTransaction } from '@/lib/portfolio/transactions';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export const PATCH = handle<Ctx>(async (req, ctx) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  return json(await updateTransaction(u.id, id, await body(req)));
});
export const DELETE = handle<Ctx>(async (_req, ctx) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  return json(await deleteTransaction(u.id, id));
});
