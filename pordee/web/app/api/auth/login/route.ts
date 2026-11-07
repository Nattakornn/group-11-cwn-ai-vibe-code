import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { handle, json, body, ApiError } from '@/lib/http';
import { q1 } from '@/lib/db';
import { createSession, userById } from '@/lib/session';
import { buildMe } from '@/lib/account/me';

export const dynamic = 'force-dynamic';

const invalidLogin = () =>
  new ApiError(401, 'INVALID_LOGIN', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', 'Incorrect email or password');

export const POST = handle(async (req: NextRequest) => {
  const b = await body<{ email?: unknown; password?: unknown }>(req);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  if (!email || !password) throw invalidLogin();

  const row = await q1<{ id: number; password_hash: string; delete_requested_at: Date | null }>(
    'SELECT id, password_hash, delete_requested_at FROM users WHERE email = $1', [email]);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) throw invalidLogin();
  if (row.delete_requested_at) {
    throw new ApiError(403, 'ACCOUNT_DELETING', 'บัญชีนี้อยู่ระหว่างการลบ เข้าสู่ระบบไม่ได้',
      'This account is being deleted and cannot log in');
  }
  await createSession(row.id);
  const u = await userById(row.id);
  return json({ user: await buildMe(u!) });
});
