// อีเมลจำลองที่ส่งแล้วของผู้ใช้เอง (FR-25 · NFR-17)
import { handle, json } from '@/lib/http';
import { q } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const u = await requireUser();
  const rows = await q<{ id: number; to_email: string; subject: string; body: string; sent_at: Date }>(
    `SELECT id, to_email, subject, body, sent_at FROM email_outbox
     WHERE user_id = $1 ORDER BY sent_at DESC, id DESC LIMIT 500`, [u.id]);
  return json({
    items: rows.map((r) => ({ id: r.id, toEmail: r.to_email, subject: r.subject, body: r.body,
      sentAt: new Date(r.sent_at).toISOString() })),
  });
});
