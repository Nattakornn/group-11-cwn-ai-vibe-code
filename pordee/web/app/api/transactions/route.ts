import { body, handle, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { createTransaction, listTransactions } from '@/lib/portfolio/transactions';
export const dynamic = 'force-dynamic';
export const GET = handle(async () => {
  const u = await requireUser();
  return json(await listTransactions(u.id));
});
export const POST = handle(async (req) => {
  const u = await requireUser();
  return json(await createTransaction(u.id, await body(req)), 201);
});
