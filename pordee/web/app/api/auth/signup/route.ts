import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { handle, json, body, ApiError, E } from '@/lib/http';
import { q1 } from '@/lib/db';
import { now as clockNow } from '@/lib/clock';
import { createSession, userById } from '@/lib/session';
import { buildMe } from '@/lib/account/me';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** สมัครสมาชิก (FR-52) · อีเมลของบัญชีที่รอลบยังถือว่าถูกใช้ (D-16) */
export const POST = handle(async (req: NextRequest) => {
  const b = await body<{ email?: unknown; password?: unknown; displayName?: unknown }>(req);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const displayName = typeof b.displayName === 'string' ? b.displayName.trim() : '';
  if (!EMAIL_RE.test(email) || email.length > 254 || !displayName || displayName.length > 100) throw E.bad();
  if ([...password].length < 8) {
    throw new ApiError(400, 'WEAK_PASSWORD', 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร', 'Password must be at least 8 characters');
  }
  // รหัสผ่านที่เป็นช่องว่างล้วนไม่รับ (R102 · TC-ACCT-02)
  if (!password.trim()) {
    throw new ApiError(400, 'WEAK_PASSWORD', 'รหัสผ่านต้องไม่เป็นช่องว่างล้วน', 'Password cannot be only spaces');
  }
  const taken = () => new ApiError(409, 'EMAIL_TAKEN', 'อีเมลนี้ถูกใช้แล้ว', 'This email is already in use');
  if (await q1('SELECT 1 FROM users WHERE email = $1', [email])) throw taken();

  const lang = new URL(req.url).searchParams.get('lang') === 'en' ? 'en' : 'th';
  const hash = await bcrypt.hash(password, 10);
  const row = await q1<{ id: number }>(
    `INSERT INTO users (email, password_hash, display_name, lang, created_at)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, hash, displayName, lang, await clockNow()]);
  if (!row) throw taken();

  await createSession(row.id);
  const u = await userById(row.id);
  return json({ user: await buildMe(u!) }, 201);
});
