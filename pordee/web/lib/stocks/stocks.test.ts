// A1 หุ้นและกราฟ · ทดสอบกับฐานข้อมูลจริงแบบอ่านอย่างเดียว (ไม่เรียก pordee_reset / getQuote)
// ค่าคาดหวังจาก TEST-DATA ส่วนที่ 7 · นาฬิกาส่งตรงเป็นวันล็อก 2026-11-06 22:00 ไทย
import { afterAll, describe, expect, it } from 'vitest';
process.env.DATABASE_URL ??= 'postgres://pordee:pordee@127.0.0.1:5434/pordee';
const { pool } = await import('@/lib/db');
const { searchStocks, rankStocks, findStock } = await import('./search');
const { getCandles, toWeekly, minusMonths, mondayOf } = await import('./candles');
const { D } = await import('@/lib/money');

const T = (s: string) => new Date(s.replace(' ', 'T') + '+07:00');
const LOCK = T('2026-11-06 22:00:00');
afterAll(() => pool.end());

const errOf = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { status?: number; code?: string; th?: string; en?: string; extra?: Record<string, unknown>; otc?: boolean }; }
  throw new Error('expected error');
};

describe('ค้นหา FR-01, FR-02, BR-01, D-14', () => {
  it('E01 AAPL → Apple Inc. · NASDAQ', async () => {
    const r = await searchStocks('AAPL', 'th');
    expect(r.results[0]).toMatchObject({ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' });
    expect(r.notice).toBeNull();
  });
  it('E02 VOO → พบ · NYSE (Arca)', async () => {
    const r = await searchStocks('voo', 'th');
    expect(r.results[0]).toMatchObject({ symbol: 'VOO', exchange: 'NYSE', exchangeLabel: 'NYSE Arca', kind: 'etf' });
  });
  it('E03 NSRGY → ไม่มีผล + notice OTC 2 ภาษา', async () => {
    const th = await searchStocks('NSRGY', 'th');
    expect(th.results).toEqual([]);
    expect(th.notice).toEqual({ code: 'OTC_NOT_SUPPORTED', message: 'ไม่รองรับหุ้นนอกตลาด NYSE / NASDAQ' });
    const en = await searchStocks('nsrgy', 'en');
    expect(en.notice?.message).toBe('OTC stocks are not supported (NYSE / NASDAQ only)');
  });
  it('E04 OLDC (ถูกถอด) → ไม่พบหุ้นนี้', async () => {
    const r = await searchStocks('OLDC', 'th');
    expect(r.results).toEqual([]);
    expect(r.notice).toEqual({ code: 'NOT_FOUND', message: 'ไม่พบหุ้นนี้' });
    expect((await searchStocks('OLDC', 'en')).notice?.message).toBe('Stock not found');
  });
  it('E05 brk-b → BRK.B', async () => {
    expect((await searchStocks('brk-b', 'th')).results[0]?.symbol).toBe('BRK.B');
    expect((await searchStocks('Brk.B', 'th')).results[0]?.symbol).toBe('BRK.B');
  });
  it('E06 Apple → AAPL เป็นผลแรก', async () => {
    expect((await searchStocks('Apple', 'th')).results[0]?.symbol).toBe('AAPL');
  });
  it('สูงสุด 10 ตัว · ไม่มี OTC / ถูกถอด', async () => {
    const r = await searchStocks('Z', 'th');
    expect(r.results).toHaveLength(10);
    const all = await searchStocks('o', 'th');
    expect(all.results.map((x) => x.symbol)).not.toContain('OLDC');
    expect(all.results.map((x) => x.symbol)).not.toContain('NSRGY');
  });
  it('ลำดับ: ตรงทั้งคำ → ชื่อย่อขึ้นต้น → ชื่อขึ้นต้น → ชื่อมีคำ · เท่ากัน A–Z', () => {
    const rows = [
      { symbol: 'ZZZ', name: 'Has Ab Inside' },
      { symbol: 'XAB', name: 'Ab Corp' },
      { symbol: 'ABC', name: 'Something' },
      { symbol: 'AB', name: 'Exact' },
      { symbol: 'ABD', name: 'Other' },
      { symbol: 'QQQ', name: 'Nothing' },
    ];
    expect(rankStocks('ab', rows).map((r) => r.symbol)).toEqual(['AB', 'ABC', 'ABD', 'XAB', 'ZZZ']);
  });
  it('หาหุ้นสำหรับหน้าหุ้น: ถูกถอดเปิดได้ · OTC / ไม่พบ → 404', async () => {
    expect((await findStock('oldc')).status).toBe('delisted');
    expect((await findStock('brk-b')).symbol).toBe('BRK.B');
    expect((await errOf(findStock('NSRGY'))).otc).toBe(true);
    expect((await errOf(findStock('NOPE'))).otc).toBe(false);
  });
});

describe('แท่งเทียน FR-10, BR-32, T-07', () => {
  it('E77 AAPL สัปดาห์ 26–30 ต.ค. 2569', async () => {
    const r = await getCandles('AAPL', { interval: 'week', from: '2026-10-26', to: '2026-10-30' }, 'free', LOCK);
    expect(r.bars).toHaveLength(1);
    expect(r.bars[0]).toMatchObject({ date: '2026-10-26', open: '238.3680', close: '239.8080', high: '243.3226', low: '237.1762' });
  });
  it('รายสัปดาห์: from กลางสัปดาห์ยังได้แท่งเต็มสัปดาห์ · สัปดาห์ที่ยังไม่จบแสดงถึงรอบล่าสุด (D-13)', async () => {
    const r = await getCandles('AAPL', { interval: 'week', from: '2026-10-28' }, 'free', LOCK);
    expect(r.bars[0]).toMatchObject({ date: '2026-10-26', open: '238.3680', close: '239.8080' });
    expect(r.bars.at(-1)).toMatchObject({ date: '2026-11-02', close: '240.0000' });
    expect(r.to).toBe('2026-11-05');
  });
  it('toWeekly รวม volume และ high/low แบบ decimal', () => {
    const w = toWeekly([
      { date: '2026-10-26', open: '10.0000', high: '9.5000', low: '8.0000', close: '9.0000', volume: 1 },
      { date: '2026-10-27', open: '9.0000', high: '10.5000', low: '8.5000', close: '10.0000', volume: 2 },
      { date: '2026-11-02', open: '10.0000', high: '11.0000', low: '9.0000', close: '10.5000', volume: 3 },
    ]);
    expect(w).toEqual([
      { date: '2026-10-26', open: '10.0000', high: '10.5000', low: '8.0000', close: '10.0000', volume: 3 },
      { date: '2026-11-02', open: '10.0000', high: '11.0000', low: '9.0000', close: '10.5000', volume: 3 },
    ]);
  });
  it('E88 NVDA 2024-06-07 ปรับแล้ว 114.2960 · ราคาจริง 1142.9600', async () => {
    const adj = await getCandles('NVDA', { from: '2024-06-07', to: '2024-06-07' }, 'pro', LOCK);
    const raw = await getCandles('NVDA', { from: '2024-06-07', to: '2024-06-07', adjusted: '0' }, 'pro', LOCK);
    expect(adj.bars[0].close).toBe('114.2960');
    expect(D(adj.bars[0].close).toFixed(2)).toBe('114.30');
    expect(raw.adjusted).toBe(false);
    expect(raw.bars[0].close).toBe('1142.9600');
  });
  it('E89 NVDA 2024-06-10 = 113.67 ทั้ง 2 โหมด · ไม่มีแท่งลดเกิน 1% ในโหมดปรับแล้ว', async () => {
    const adj = await getCandles('NVDA', { from: '2024-06-03', to: '2024-06-14' }, 'pro', LOCK);
    const raw = await getCandles('NVDA', { from: '2024-06-10', to: '2024-06-10', adjusted: '0' }, 'pro', LOCK);
    const d10 = adj.bars.find((b) => b.date === '2024-06-10')!;
    expect(D(d10.close).toFixed(2)).toBe('113.67');
    expect(D(raw.bars[0].close).toFixed(2)).toBe('113.67');
    for (let k = 1; k < adj.bars.length; k++) {
      expect(D(adj.bars[k].close).div(adj.bars[k - 1].close).minus(1).gt(-0.01)).toBe(true);
    }
  });
  it('T-07 to เกินรอบที่ปิดแล้ว → ตัดที่ 2026-11-05 · ค่าเริ่มต้น day / 6 เดือน / adjusted', async () => {
    const r = await getCandles('AAPL', { to: '2026-12-31' }, 'free', LOCK);
    expect(r.to).toBe('2026-11-05');
    expect(r.bars.at(-1)?.date).toBe('2026-11-05');
    const d = await getCandles('AAPL', {}, 'free', LOCK);
    expect([d.interval, d.adjusted, d.from, d.to]).toEqual(['day', true, '2026-05-05', '2026-11-05']);
  });
  it('ช่วยคิดวันที่', () => {
    expect(minusMonths('2026-08-31', 6)).toBe('2026-02-28');
    expect(minusMonths('2026-03-15', 6)).toBe('2025-09-15');
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
  });
  it('interval / วันที่ผิด → 400 INVALID_INPUT', async () => {
    expect((await errOf(getCandles('AAPL', { interval: 'month' }, 'free', LOCK))).code).toBe('INVALID_INPUT');
    expect((await errOf(getCandles('AAPL', { from: '2026-02-30' }, 'free', LOCK))).code).toBe('INVALID_INPUT');
  });
});

describe('สิทธิ์ย้อนหลัง BR-22, BR-23 ณ วันล็อก', () => {
  it('E61 Free: 2025-11-07 ✓ / 2025-11-06 ✓ / 2025-11-05 ✗ พร้อมข้อความ', async () => {
    expect((await getCandles('AAPL', { from: '2025-11-07' }, 'free', LOCK)).bars[0].date).toBe('2025-11-07');
    const ok = await getCandles('AAPL', { from: '2025-11-06' }, 'free', LOCK);
    expect([ok.earliestAllowed, ok.bars[0].date]).toEqual(['2025-11-06', '2025-11-06']);
    const e = await errOf(getCandles('AAPL', { from: '2025-11-05' }, 'free', LOCK));
    expect([e.status, e.code]).toEqual([403, 'RANGE_NOT_ALLOWED']);
    expect(e.th).toBe('ระดับ Free ดูย้อนหลังได้ถึง 6 พ.ย. 2568');
    expect(e.en).toBe('Free members can view history back to 6 Nov 2025');
    expect(e.extra).toEqual({ earliestAllowed: '2025-11-06' });
  });
  it('E62 Pro: 2016-11-07 ✓ / 2016-11-06 ✓ (อาทิตย์ แท่งแรก 7 พ.ย.) / 2016-11-05 ✗', async () => {
    expect((await getCandles('AAPL', { from: '2016-11-07', to: '2016-12-01' }, 'pro', LOCK)).bars[0].date).toBe('2016-11-07');
    expect((await getCandles('AAPL', { from: '2016-11-06', to: '2016-12-01' }, 'pro', LOCK)).bars[0].date).toBe('2016-11-07');
    const e = await errOf(getCandles('AAPL', { from: '2016-11-05' }, 'pro', LOCK));
    expect([e.status, e.code, e.th]).toEqual([403, 'RANGE_NOT_ALLOWED', 'ระดับ Pro ดูย้อนหลังได้ถึง 6 พ.ย. 2559']);
  });
  it('รายสัปดาห์ไม่ดึงข้อมูลเก่ากว่าสิทธิ์ แม้วันจันทร์ของสัปดาห์แรกจะเก่ากว่า', async () => {
    // 2025-11-06 เป็นวันพฤหัส · วันจันทร์ 2025-11-03 เก่ากว่าสิทธิ์ Free
    const r = await getCandles('AAPL', { interval: 'week', from: '2025-11-06', to: '2025-11-14' }, 'free', LOCK);
    expect(r.bars.map((b) => b.date)).toEqual(['2025-11-06', '2025-11-10']);
  });
});
