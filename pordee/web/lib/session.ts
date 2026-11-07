// session กลาง · ใช้ได้ทั้ง API (requireUser) และหน้าเว็บฝั่งเซิร์ฟเวอร์ (currentUser)
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { q, q1 } from './db';
import { now as clockNow } from './clock';
import { E } from './http';

export const COOKIE = 'pd_session';
const DAYS = 30;

export type UserRow = {
  id: number; email: string; display_name: string; is_staff: boolean;
  pro_period_end: string | null; pro_auto_renew: boolean; big_font: boolean; lang: 'th' | 'en';
  fee_rate_pct: string; fee_min_usd: string; quiet_start: string | null; quiet_end: string | null;
  delete_requested_at: Date | null;
};
const COLS = `u.id, u.email, u.display_name, u.is_staff, u.pro_period_end, u.pro_auto_renew, u.big_font, u.lang,
  u.fee_rate_pct, u.fee_min_usd, u.quiet_start, u.quiet_end, u.delete_requested_at`;

/** สร้าง session แล้วตั้ง cookie · คืน token */
export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(24).toString('hex');
  const now = await clockNow();
  await q('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
    [token, userId, new Date(now.getTime() + DAYS * 86400000)]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: DAYS * 86400 });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) await q('DELETE FROM sessions WHERE token = $1', [t]);
  jar.delete(COOKIE);
}

/** ผู้ใช้ปัจจุบัน หรือ null (บัญชีที่ขอลบแล้วถือว่าไม่ได้เข้าสู่ระบบ) */
export async function currentUser(): Promise<UserRow | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const now = await clockNow();
  return q1<UserRow>(
    `SELECT ${COLS} FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > $2 AND u.delete_requested_at IS NULL`, [t, now]);
}

export async function requireUser(): Promise<UserRow> {
  const u = await currentUser();
  if (!u) throw E.unauth();
  return u;
}

export async function userById(id: number): Promise<UserRow | null> {
  return q1<UserRow>(`SELECT ${COLS} FROM users u WHERE u.id = $1`, [id]);
}
