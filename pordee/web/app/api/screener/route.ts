// POST /api/screener (FR-45, FR-46 · BR-51, BR-52)
import { body, handle, json } from '@/lib/http';
import { runScreener } from '@/lib/analysis/service';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => json(await runScreener(await body(req))));
