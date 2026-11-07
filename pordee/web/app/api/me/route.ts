import type { NextRequest } from 'next/server';
import { handle, json, body, E } from '@/lib/http';
import { q } from '@/lib/db';
import { requireUser, userById } from '@/lib/session';
import { buildMe } from '@/lib/account/me';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const u = await requireUser();
  return json({ user: await buildMe(u) });
});

/** แก้ชื่อที่แสดง ตัวหนังสือใหญ่ ภาษา */
export const PATCH = handle(async (req: NextRequest) => {
  const u = await requireUser();
  const b = await body<{ displayName?: unknown; bigFont?: unknown; lang?: unknown }>(req);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (b.displayName !== undefined) {
    const n = typeof b.displayName === 'string' ? b.displayName.trim() : '';
    if (!n || n.length > 100) throw E.bad();
    add('display_name', n);
  }
  if (b.bigFont !== undefined) {
    if (typeof b.bigFont !== 'boolean') throw E.bad();
    add('big_font', b.bigFont);
  }
  if (b.lang !== undefined) {
    if (b.lang !== 'th' && b.lang !== 'en') throw E.bad();
    add('lang', b.lang);
  }
  if (sets.length) {
    vals.push(u.id);
    await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  }
  const fresh = await userById(u.id);
  return json({ user: await buildMe(fresh!) });
});
