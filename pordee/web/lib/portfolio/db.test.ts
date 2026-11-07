// ทดสอบกับฐานข้อมูลจริง (127.0.0.1:5434) ด้วยบัญชีว่าง fon@pordee.test (id 9) · ไม่เรียก pordee_reset
// ลบทุกอย่างที่สร้างของ id 9 ทั้งก่อนและหลังเทสต์
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
process.env.DATABASE_URL ??= 'postgres://pordee:pordee@127.0.0.1:5434/pordee';
process.env.ALLOW_TEST_API = '1';
const { pool, q, q1 } = await import('@/lib/db');
const { ApiError } = await import('@/lib/http');
const { createTransaction, updateTransaction, deleteTransaction } = await import('./transactions');
const { createPlan, updatePlan, confirmPending, skipPending, runDcaJob, listPending } = await import('./dca');
const { runDividendJob, dividendsReceived, dividendCalendar } = await import('./dividends');
const { updateFees, getFees } = await import('./portfolio');

const FON = 9;
const T = (s: string) => new Date(s.replace(' ', 'T') + '+07:00');
async function clean() {
  for (const t of ['dividend_receipts', 'dca_pending', 'dca_plans', 'transactions', 'holdings']) {
    await q(`DELETE FROM ${t} WHERE user_id = $1`, [FON]);
  }
  await q('UPDATE users SET fee_rate_pct = 0.15, fee_min_usd = 1.00 WHERE id = $1', [FON]);
}
const code = async (p: Promise<unknown>) => {
  try { await p; return 'ok'; } catch (e) { return e instanceof ApiError ? `${e.status} ${e.code}` : String(e); }
};
const holding = (sym: string) => q1<{ shares: string; cost_usd: string; cost_thb: string; realized_usd: string }>(
  'SELECT shares, cost_usd, cost_thb, realized_usd FROM holdings WHERE user_id = $1 AND symbol = $2', [FON, sym]);
const buy = (symbol: string, shares: string, price: string, tradeDate = '2026-02-02', extra: object = {}) =>
  createTransaction(FON, { symbol, side: 'buy', tradeDate, shares, price, ...extra });
const sell = (symbol: string, shares: string, price: string, tradeDate = '2026-11-06') =>
  createTransaction(FON, { symbol, side: 'sell', tradeDate, shares, price });

beforeAll(clean);
beforeEach(clean);
afterAll(async () => { await clean(); await pool.end(); });

describe('รายการซื้อขาย (FR-27, FR-28)', () => {
  it('E106–E110 ค่าธรรมเนียมตามค่าตั้ง', async () => {
    const fees = [];
    for (const p of ['666.00', '666.67', '700.00', '669.00', '670.00', '671.00']) fees.push((await buy('ZA02', '1', p)).transaction.feeUsd);
    fees.push((await buy('ZA02', '10', '100.00')).transaction.feeUsd);
    expect(fees).toEqual(['1.00', '1.00', '1.05', '1.00', '1.01', '1.01', '1.50']);
  });
  it('E111–E113 ทศนิยมหุ้น · ราคา 0', async () => {
    expect(await code(buy('ZA02', '0.123', '10'))).toBe('ok');
    expect(await code(buy('ZA02', '0.1234', '10'))).toBe('ok');
    expect(await code(buy('ZA02', '0.12345', '10'))).toBe('400 INVALID_SHARES');
    expect(await code(buy('ZA02', '1', '0'))).toBe('400 INVALID_PRICE');
    expect(await code(buy('NOPE', '1', '10'))).toContain('NOT_FOUND');
  });
  it('E118 E121 E120 ต้นทุนเฉลี่ย $120.18 · ขาย 5 @ $130 กำไร $48.10 · ต้นทุน ฿ ตามอัตราวันซื้อ', async () => {
    await buy('ZA01', '10', '100.00', '2026-02-02');
    const b = await buy('ZA01', '10', '140.00', '2026-03-02');
    expect([b.holding.avgCostUsd, b.holding.costUsd, b.holding.costThb]).toEqual(['120.1800', '2403.60', '83124.50']);
    const s = await sell('ZA01', '5', '130.00');
    expect([s.transaction.feeUsd, s.holding.realizedUsd, s.holding.shares, s.holding.avgCostUsd]).toEqual(['1.00', '48.10', '15.0000', '120.1800']);
  });
  it('E114–E116 ขาย 19.9999 ✓ · ขายเกิน 409 มีหุ้นไม่พอ · ขายเท่าที่มีเหลือ 0', async () => {
    await buy('ZA01', '20', '100');
    expect(await code(sell('ZA01', '20.0001', '130'))).toBe('409 INSUFFICIENT_SHARES');
    expect(await code(sell('ZA01', '19.9999', '130'))).toBe('ok');
    expect(await code(sell('ZA01', '0.0001', '130'))).toBe('ok');
    expect((await holding('ZA01'))!.shares).toBe('0.0000');
    expect((await holding('ZA01'))!.cost_usd).toBe('0.00');
    expect(await code(sell('ZA01', '0.0001', '130'))).toBe('409 INSUFFICIENT_SHARES');
    expect(await code(sell('VOO', '1', '130'))).toBe('409 INSUFFICIENT_SHARES');
  });
  it('E117 ขายพร้อมกัน 2 คำขอ → 1 สำเร็จ 1 ได้ 409 · เหลือ 0.0000', async () => {
    await buy('ZA01', '20', '100');
    const r = await Promise.all([code(sell('ZA01', '20', '130')), code(sell('ZA01', '20', '130'))]);
    expect(r.sort()).toEqual(['409 INSUFFICIENT_SHARES', 'ok']);
    expect((await holding('ZA01'))!.shares).toBe('0.0000');
    const n = await q1<{ n: number }>("SELECT count(*)::int AS n FROM transactions WHERE user_id = $1 AND side = 'sell'", [FON]);
    expect(n!.n).toBe(1);
  });
  it('D-08 แก้ให้ขายก่อนซื้อ → 409 และไม่เปลี่ยน · ลบรายการซื้อที่ขายไปแล้ว → 409 · ลบรายการขาย → คิดใหม่', async () => {
    const b1 = await buy('ZA01', '10', '100.00', '2026-02-02');
    await buy('ZA01', '10', '140.00', '2026-03-02');
    const s = await sell('ZA01', '15', '130.00', '2026-04-01');
    expect(await code(updateTransaction(FON, String(b1.transaction.id), { tradeDate: '2026-05-01' }))).toBe('409 INSUFFICIENT_SHARES');
    expect(await code(deleteTransaction(FON, String(b1.transaction.id)))).toBe('409 INSUFFICIENT_SHARES');
    expect((await holding('ZA01'))!.shares).toBe('5.0000');
    const d = await deleteTransaction(FON, String(s.transaction.id));
    expect([d.holding.shares, d.holding.costUsd, d.holding.realizedUsd]).toEqual(['20.0000', '2403.60', '0.00']);
    // แก้ราคาแล้วคิดค่าธรรมเนียมใหม่
    const u = await updateTransaction(FON, String(b1.transaction.id), { price: '120.00' });
    expect([u.transaction.feeUsd, u.holding.costUsd]).toEqual(['1.80', '2603.90']);
    expect(await code(updateTransaction(999999999, String(b1.transaction.id), { price: '1' }))).toBe('404 NOT_FOUND');
  });
  it('รายการย้อนหลัง → คิดใหม่ทั้งหุ้นตามวันที่', async () => {
    await buy('ZA01', '10', '140.00', '2026-03-02');
    const r = await buy('ZA01', '10', '100.00', '2026-02-02');
    expect([r.holding.shares, r.holding.costUsd, r.holding.costThb]).toEqual(['20.0000', '2403.60', '83124.50']);
  });
  it('FR-31 ค่าธรรมเนียมของตัวเอง 0% ขั้นต่ำ 0 → E119 เฉลี่ย $120.00', async () => {
    expect(await updateFees(FON, { feeRatePct: '0', feeMinUsd: '0' })).toEqual({ feeRatePct: '0.0000', feeMinUsd: '0.00' });
    await buy('ZA01', '10', '100', '2026-02-02');
    const r = await buy('ZA01', '10', '140', '2026-03-02');
    expect(r.holding.avgCostUsd).toBe('120.0000');
    expect(await code(updateFees(FON, { feeRatePct: '-1' }))).toBe('400 INVALID_FEE_RATE'); // รอบแก้บั๊ก ทีม D: error บอกช่อง (R41)
    expect((await getFees(FON)).feeRatePct).toBe('0.0000');
  });
});

describe('DCA (FR-33, FR-34)', () => {
  it('แผน: วัน 29 → 400 · ซ้ำ → 409', async () => {
    expect(await code(createPlan(FON, { symbol: 'VOO', amountThb: '5000', dayOfMonth: 29 }))).toBe('400 DAY_OUT_OF_RANGE');
    expect(await code(createPlan(FON, { symbol: 'VOO', amountThb: '5000', dayOfMonth: 25 }))).toBe('ok');
    expect(await code(createPlan(FON, { symbol: 'voo', amountThb: '1000', dayOfMonth: 1 }))).toBe('409 PLAN_EXISTS');
  });
  it('E125 E122 E128 E126 ยังไม่ปิด → ไม่มี · 04:00 → 0.2837 · ยืนยันซ้ำ 200 + 409 · ธ.ค. → 28 ธ.ค.', async () => {
    const { plan } = await createPlan(FON, { symbol: 'VOO', amountThb: '5000.00', dayOfMonth: 25 });
    await q('UPDATE dca_plans SET created_at = $2 WHERE id = $1', [plan.id, T('2026-10-30 09:00:00')]);
    expect((await runDcaJob(T('2026-11-26 03:59:59'), { userId: FON })).created).toBe(0);
    expect((await runDcaJob(T('2026-11-26 04:00:00'), { userId: FON })).created).toBe(1);
    expect((await runDcaJob(T('2026-11-26 04:00:00'), { userId: FON })).created).toBe(0);
    const [p] = (await listPending(FON)).items;
    expect([p.tradeDate, p.usdAmount, p.feeUsd, p.investUsd, p.closePrice, p.fxRate, p.shares])
      .toEqual(['2026-11-25', '142.86', '1.00', '141.86', '500.0000', '35.0000', '0.2837']);
    const r = await Promise.all([code(confirmPending(FON, String(p.id))), code(confirmPending(FON, String(p.id)))]);
    expect(r.sort()).toEqual(['409 ALREADY_DONE', 'ok']);
    expect((await holding('VOO'))!.shares).toBe('0.2837');
    expect(await code(skipPending(FON, String(p.id)))).toBe('409 ALREADY_DONE');

    expect((await runDcaJob(T('2026-12-29 04:00:00'), { userId: FON })).created).toBe(1);
    const [d] = (await listPending(FON)).items;
    expect(d.tradeDate).toBe('2026-12-28');
    expect((await skipPending(FON, String(d.id))).item.status).toBe('skipped');
    let msg = '';
    try { await confirmPending(FON, String(d.id)); } catch (e) { msg = (e as InstanceType<typeof ApiError>).en; }
    expect(msg).toBe('This item was skipped');
    // หยุดแผนแล้วไม่สร้าง
    await updatePlan(FON, String(plan.id), { active: false });
    expect((await runDcaJob(T('2027-01-27 04:00:00'), { userId: FON })).created).toBe(0);
  });
});

describe('ปันผล (FR-36, FR-37 · BR-49)', () => {
  it('E140–E142 ซื้อ 30 พ.ย. ได้ $4.34 · 1 และ 2 ธ.ค. ไม่ได้', async () => {
    // รอบแก้บั๊ก ทีม D: ห้ามจดวันอนาคต (8.2 #9) → ล็อกนาฬิกาเป็น 3 ธ.ค. 2569 ระหว่าง test นี้ แล้วคืนค่าเดิม
    const prevEnv = process.env.ALLOW_TEST_API;
    const prevClock = (await q1<{ frozen_now: Date | null }>('SELECT frozen_now FROM app_clock WHERE id = 1'))?.frozen_now ?? null;
    process.env.ALLOW_TEST_API = '1';
    await q('UPDATE app_clock SET frozen_now = $1 WHERE id = 1', [T('2026-12-03 10:00:00')]);
    try {
    await buy('KO', '10', '68', '2026-11-30');
    await buy('KO', '5', '68', '2026-12-01');
    await buy('KO', '7', '68', '2026-12-02');
    const cal = await dividendCalendar(FON, '2026-12');
    expect(cal.items.find((i) => i.symbol === 'KO')?.sharesHeld).toBe('10.0000');
    expect((await runDividendJob(T('2026-12-14 23:59:59'), { userId: FON })).created).toBe(0);
    expect((await runDividendJob(T('2026-12-15 22:00:00'), { userId: FON })).created).toBe(1);
    expect((await runDividendJob(T('2026-12-15 22:00:00'), { userId: FON })).created).toBe(0);
    const r = await dividendsReceived(FON);
    expect(r.items.map((i) => [i.symbol, i.shares, i.grossUsd, i.netUsd, i.netThb])).toEqual([['KO', '10.0000', '5.10', '4.34', '151.90']]);
    expect(r.monthly).toEqual([{ month: '2026-12', netUsd: '4.34', netThb: '151.90' }]);
    } finally {
      await q('UPDATE app_clock SET frozen_now = $1 WHERE id = 1', [prevClock]);
      if (prevEnv === undefined) delete process.env.ALLOW_TEST_API; else process.env.ALLOW_TEST_API = prevEnv;
    }
  });
});
