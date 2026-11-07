// ทดสอบแกนกลางกับฐานข้อมูลจริง (ต้องเปิด pordee-db ที่ 127.0.0.1:5434) · ค่าคาดหวังจาก TEST-DATA ส่วนที่ 7
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
process.env.DATABASE_URL ??= 'postgres://pordee:pordee@127.0.0.1:5434/pordee';
process.env.ALLOW_TEST_API = '1';
const { pool, q } = await import('./db');
const { marketStatus } = await import('./market');
const { getQuote, quotaStatus } = await import('./feed');
const { fee, round2, sharesDown, D, fmtPct, pctChange } = await import('./money');
const { rateAt } = await import('./fx');
const { minusYears } = await import('./clock');

const T = (s: string) => new Date(s.replace(' ', 'T') + '+07:00');
const reset = (now = '2026-11-06 22:00:00') => q('SELECT pordee_reset($1)', [T(now)]);
afterAll(() => pool.end());

describe('สถานะตลาด BR-02 ถึง BR-08 (E07–E31)', () => {
  const cases: [string, string, boolean][] = [
    ['E07', '2026-11-09 21:29:59', false], ['E08', '2026-11-09 21:30:00', true], ['E09', '2026-11-09 21:31:00', true],
    ['E10', '2026-11-10 03:59:59', true], ['E11', '2026-11-10 04:00:00', false], ['E12', '2026-11-10 04:01:00', false],
    ['E13', '2026-04-07 20:29:59', false], ['E14', '2026-04-07 20:30:00', true], ['E15', '2026-04-08 02:59:59', true],
    ['E16', '2026-04-08 03:00:00', false], ['E17', '2026-03-06 20:30:00', false], ['E18', '2026-03-09 20:30:00', true],
    ['E19', '2026-10-30 20:30:00', true], ['E20a', '2026-11-02 20:30:00', false], ['E20b', '2026-11-02 21:30:00', true],
    ['E21', '2026-11-25 22:00:00', true], ['E22', '2026-11-26 22:00:00', false], ['E23', '2026-11-27 22:00:00', true],
    ['E24', '2026-12-25 22:00:00', false], ['E25', '2026-11-28 00:59:59', true], ['E26', '2026-11-28 01:00:00', false],
    ['E27a', '2026-12-25 00:59:59', true], ['E27b', '2026-12-25 01:00:00', false], ['E28', '2026-11-14 03:59:59', true],
    ['E29', '2026-11-14 04:00:00', false], ['E30', '2026-11-14 21:30:00', false], ['E31', '2026-11-16 21:30:00', true],
  ];
  for (const [id, at, open] of cases) it(`${id} ${at} → ${open ? 'เปิด' : 'ปิด'}`, async () => {
    expect((await marketStatus(T(at))).open).toBe(open);
  });
  it('E22 เวลาเปิดครั้งถัดไป 27 พ.ย. 21:30', async () => {
    expect((await marketStatus(T('2026-11-26 22:00:00'))).nextOpen).toBe(T('2026-11-27 21:30:00').toISOString());
  });
  it('E23 ปิดเร็ว', async () => {
    const s = await marketStatus(T('2026-11-27 22:00:00'));
    expect(s.earlyClose).toBe(true);
    expect(s.closesAt).toBe(T('2026-11-28 01:00:00').toISOString());
  });
});

describe('Mock Feed และโควตา BR-09 ถึง BR-15', () => {
  beforeEach(() => reset());
  it('E32 วันล็อก AAPL $241.00 @ 21:45 +0.42%', async () => {
    const qt = await getQuote('AAPL', T('2026-11-06 22:00:00'));
    expect(D(qt.price!).toFixed(2)).toBe('241.00');
    expect(qt.asOf).toBe(T('2026-11-06 21:45:00').toISOString());
    expect(fmtPct(qt.changePct!)).toBe('+0.42%');
    expect(qt.stale).toBe(false);
  });
  it('E33 21:59:59 → $240.80 @ 21:40', async () => {
    const qt = await getQuote('AAPL', T('2026-11-06 21:59:59'));
    expect(D(qt.price!).toFixed(2)).toBe('240.80');
  });
  it('E35–E37 ที่พัก 14:59 / 15:00 (ป้าย) / 15:01 ขอใหม่', async () => {
    await getQuote('AAPL', T('2026-11-06 22:00:00'));
    const a = await getQuote('AAPL', T('2026-11-06 22:14:59'));
    expect([D(a.price!).toFixed(2), a.stale]).toEqual(['241.00', false]);
    const b = await getQuote('AAPL', T('2026-11-06 22:15:00'));
    expect([D(b.price!).toFixed(2), b.stale]).toEqual(['241.00', true]);
    expect((await quotaStatus(T('2026-11-06 22:15:00'))).dayUsed).toBe(1);
    const c = await getQuote('AAPL', T('2026-11-06 22:15:01'));
    expect([D(c.price!).toFixed(2), c.stale]).toEqual(['242.00', false]);
    expect((await quotaStatus(T('2026-11-06 22:15:01'))).dayUsed).toBe(2);
  });
  it('E38–E40 โควตา 5 ครั้งใน 60 วินาที', async () => {
    const syms = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'VOO'];
    for (let k = 0; k < 5; k++) expect((await getQuote(syms[k], T(`2026-11-06 22:00:${String(k * 10).padStart(2, '0')}`))).stale).toBe(false);
    const ko = await getQuote('KO', T('2026-11-06 22:00:50'));
    expect([D(ko.price!).toFixed(2), ko.stale]).toEqual(['68.00', true]);
    const ko2 = await getQuote('KO', T('2026-11-06 22:01:01'));
    expect(ko2.stale).toBe(false);
  });
  it('E45 ราคา 0 → ราคาปิด + ป้าย', async () => {
    await q("INSERT INTO feed_overrides VALUES ('AAPL','zero',NULL)");
    const qt = await getQuote('AAPL', T('2026-11-06 22:00:00'));
    expect([D(qt.price!).toFixed(2), qt.stale]).toEqual(['240.00', true]);
  });
  it('E49 แหล่งไม่ตอบหลังมีที่พัก → ราคาเดิม + ป้าย และนับโควตา', async () => {
    await getQuote('AAPL', T('2026-11-06 22:00:00'));
    await q("INSERT INTO feed_overrides VALUES ('AAPL','timeout',NULL)");
    const qt = await getQuote('AAPL', T('2026-11-06 22:15:01'));
    expect([D(qt.price!).toFixed(2), qt.stale]).toEqual(['241.00', true]);
    expect((await quotaStatus(T('2026-11-06 22:15:01'))).dayUsed).toBe(2);
  });
  it('ตลาดปิด → ราคาปิดล่าสุด ไม่มีป้าย (A-14)', async () => {
    const qt = await getQuote('AAPL', T('2026-11-06 12:00:00'));
    expect([D(qt.price!).toFixed(2), qt.stale, qt.marketOpen]).toEqual(['240.00', false, false]);
  });
});

describe('เงินและอัตรา', () => {
  it('E106–E110 ค่าธรรมเนียม', () => {
    expect(['666.00', '666.67', '700.00', '1000.00', '669.00', '670.00', '671.00'].map((v) => fee(v).toFixed(2)))
      .toEqual(['1.00', '1.00', '1.05', '1.50', '1.00', '1.01', '1.01']);
  });
  it('E122 DCA', () => {
    const usd = round2(D(5000).div(35)); const inv = usd.minus(fee(usd));
    expect([usd.toFixed(2), inv.toFixed(2), sharesDown(inv.div(500)).toFixed(4)]).toEqual(['142.86', '141.86', '0.2837']);
  });
  it('E94 ค่าจริง 4.995% ไม่ถึง 5', () => { expect(pctChange(200, '209.99').gte(5)).toBe(false); });
  it('E129–E131 อัตรา', async () => {
    expect((await rateAt(T('2026-11-06 17:59:59'))).rate).toBe('33.5000');
    expect((await rateAt(T('2026-11-06 18:00:00'))).rate).toBe('33.6000');
    expect((await rateAt(T('2026-11-07 12:00:00'))).rate).toBe('33.6000');
    expect((await rateAt(T('2026-11-09 18:00:00'))).rate).toBe('35.0000');
  });
  it('E61 วันแรกย้อนหลัง Free', () => { expect(minusYears('2026-11-06', 1)).toBe('2025-11-06'); });
});
