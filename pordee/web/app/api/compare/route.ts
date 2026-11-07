// POST /api/compare (FR-17 · BR-53) · เข้าสู่ระบบอยู่ → บันทึกประวัติ (BR-55)
import { body, handle, json } from '@/lib/http';
import { runCompare } from '@/lib/analysis/service';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => json(await runCompare(await body(req))));
