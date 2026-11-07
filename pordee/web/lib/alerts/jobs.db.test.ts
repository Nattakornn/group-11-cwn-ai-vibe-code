// ทดสอบงาน alerts กับฐานข้อมูลจริง (E91–E104) · รันเฉพาะเมื่อตั้ง A4_TEST_DB_URL เป็นฐานข้อมูลแยกที่ลง 01–03 ไว้แล้ว
// เช่น A4_TEST_DB_URL=postgres://pordee:pordee@127.0.0.1:5434/pordee_a4test npx vitest run lib/alerts
// ห้ามชี้ไปฐานข้อมูลหลัก `pordee` เพราะไฟล์นี้เรียก pordee_reset (ล้างข้อมูลลูกค้า)
import { afterAll, describe, expect, it } from 'vitest';

const url = process.env.A4_TEST_DB_URL ?? '';
const dbName = url.split('/').pop()?.split('?')[0] ?? '';
const enabled = !!url && dbName !== 'pordee' && dbName.endsWith('_a4test');

describe.skipIf(!enabled)('งาน alerts กับฐานข้อมูลแยก (E91–E104)', async () => {
  if (!enabled) { it('ข้าม (ไม่ได้ตั้ง A4_TEST_DB_URL)', () => {}); return; }
  process.env.DATABASE_URL = url;
  process.env.ALLOW_TEST_API = '1';
  const { pool, q, q1 } = await import('../db');
  const { getQuote } = await import('../feed');
  const { runAlerts } = await import('./jobs');
  afterAll(() => pool.end());

  const T = (s: string) => new Date(s.replace(' ', 'T') + '+07:00');
  const reset = (now = '2026-11-06 22:00:00') => q('SELECT pordee_reset($1)', [T(now)]);
  /** เหมือน /api/test/feed {mode:'price', clearCache:true} แล้วเปิดหน้าหุ้น 1 ครั้ง */
  async function setPrice(symbol: string, price: string, at: string) {
    await q(`INSERT INTO feed_overrides (symbol, mode, price) VALUES ($1, 'price', $2)
             ON CONFLICT (symbol) DO UPDATE SET mode = 'price', price = EXCLUDED.price`, [symbol, price]);
    await q('DELETE FROM quote_cache WHERE symbol = $1', [symbol]);
    await getQuote(symbol, T(at));
  }
  const events = (uid = 2, sym = 'ZALR') =>
    q<{ change_pct: string; in_quiet_hours: boolean; session_date: string }>(
      'SELECT change_pct, in_quiet_hours, session_date FROM alert_events WHERE user_id = $1 AND symbol = $2 ORDER BY id', [uid, sym]);
  const mails = (uid = 2) => q<{ subject: string; to_email: string; sent_at: Date }>(
    'SELECT subject, to_email, sent_at FROM email_outbox WHERE user_id = $1 ORDER BY id', [uid]);

  const pctCases: [string, string, number, string?][] = [
    ['E91', '209.98', 0], ['E92', '210.00', 1, 'พอดีพอร์ต: ZALR +5.00%'], ['E93', '210.02', 1],
    ['E94', '209.99', 0], ['E95', '190.02', 0], ['E96', '190.00', 1, 'พอดีพอร์ต: ZALR -5.00%'], ['E97', '189.98', 1],
  ];
  for (const [id, price, n, subject] of pctCases) it(`${id} ZALR ${price} → ${n} แจ้งเตือน`, async () => {
    await reset();
    await setPrice('ZALR', price, '2026-11-06 22:00:00');
    await runAlerts(T('2026-11-06 22:00:00'));
    expect((await events()).length).toBe(n);
    const m = await mails();
    expect(m.length).toBe(n);
    if (subject) {
      expect(m[0].subject).toBe(subject);
      expect(m[0].to_email).toBe('ploy@pordee.test');
      expect(new Date(m[0].sent_at).toISOString()).toBe(T('2026-11-06 22:00:00').toISOString()); // NFR-17
    }
  });

  it('E98 ซ้ำในรอบเดิม (23:30 และหลังเที่ยงคืน 01:00) ไม่แจ้งใหม่ · E99 รอบถัดไปแจ้งใหม่', async () => {
    await reset();
    await setPrice('ZALR', '210.00', '2026-11-06 22:00:00');
    await runAlerts(T('2026-11-06 22:00:00'));
    await setPrice('ZALR', '216.00', '2026-11-06 23:30:00');
    await runAlerts(T('2026-11-06 23:30:00'));
    await q("UPDATE app_clock SET frozen_now = $1", [T('2026-11-07 01:00:00')]);
    await setPrice('ZALR', '216.00', '2026-11-07 01:00:00');
    await runAlerts(T('2026-11-07 01:00:00'));
    expect((await events()).length).toBe(1);
    await setPrice('ZALR', '210.00', '2026-11-09 22:00:00');
    const r = await runAlerts(T('2026-11-09 22:00:00'));
    const ev = await events();
    expect(ev.length).toBe(2);
    expect(ev[1].session_date).toBe('2026-11-09');
    expect(r.fired).toBeGreaterThanOrEqual(1);
  });

  it('E100–E102 ราคาเป้าหมาย AAPL $250 ของคุณพลอย', async () => {
    await reset();
    await setPrice('AAPL', '249.99', '2026-11-06 22:00:00');
    await runAlerts(T('2026-11-06 22:00:00'));
    expect((await events(2, 'AAPL')).length).toBe(0);
    await setPrice('AAPL', '250.00', '2026-11-06 22:05:00');
    await runAlerts(T('2026-11-06 22:05:00'));
    expect((await events(2, 'AAPL')).length).toBe(1);
    expect((await events(1, 'AAPL')).length).toBe(0); // คุณบีมเป้า 260
    const a = await q1<{ active: boolean }>(`SELECT active FROM alerts WHERE user_id = 2 AND symbol = 'AAPL'`);
    expect(a?.active).toBe(false);
    expect((await mails()).map((m) => m.subject)).toContain('พอดีพอร์ต: AAPL แตะ $250.00');
    await setPrice('AAPL', '251.00', '2026-11-06 22:10:00');
    await runAlerts(T('2026-11-06 22:10:00'));
    expect((await events(2, 'AAPL')).length).toBe(1);
  });

  it('E103 01:59 ก่อนช่วงเงียบ: กล่อง 1 อีเมล 1', async () => {
    await reset('2026-11-07 01:59:00');
    await setPrice('ZALR', '210.00', '2026-11-07 01:59:00');
    await runAlerts(T('2026-11-07 01:59:00'));
    expect((await events()).length).toBe(1);
    expect((await mails()).length).toBe(1);
  });

  it('E104 02:00 ช่วงเงียบ: กล่อง 1 อีเมล 0 · 03:00 ZALR 220 ไม่มีรายการใหม่', async () => {
    await reset('2026-11-07 02:00:00');
    await setPrice('ZALR', '210.00', '2026-11-07 02:00:00');
    await runAlerts(T('2026-11-07 02:00:00'));
    const ev = await events();
    expect(ev.length).toBe(1);
    expect(ev[0].in_quiet_hours).toBe(true);
    expect((await mails()).length).toBe(0);
    await setPrice('ZALR', '220.00', '2026-11-07 03:00:00');
    await runAlerts(T('2026-11-07 03:00:00'));
    expect((await events()).length).toBe(1);
    expect((await mails()).length).toBe(0);
  });

  it('ตลาดปิดไม่ทำอะไร · ราคาไม่อัปเดต (timeout) ไม่ประเมิน', async () => {
    await reset('2026-11-07 10:00:00');
    expect((await runAlerts(T('2026-11-07 10:00:00'))).skipped).toBe('market-closed');
    await reset();
    await q(`INSERT INTO feed_overrides (symbol, mode) VALUES ('ZALR', 'timeout')`);
    const r = await runAlerts(T('2026-11-06 22:00:00'));
    expect(r.staleSymbols).toContain('ZALR');
    expect((await events()).length).toBe(0);
  });
});
