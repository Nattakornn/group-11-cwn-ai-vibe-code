// A5 วิเคราะห์ · ฟังก์ชันบริสุทธิ์ + ฐานข้อมูลจริงแบบอ่านอย่างเดียว (127.0.0.1:5434) · ค่าคาดหวังจาก TEST-DATA 4.4 และ 7
// ห้ามเรียก pordee_reset ในไฟล์นี้ · ไม่เขียนตารางใด ๆ
import { afterAll, describe, expect, it } from 'vitest';
process.env.DATABASE_URL ??= 'postgres://pordee:pordee@127.0.0.1:5434/pordee';
const { pool, q } = await import('@/lib/db');
const { marketStatus } = await import('@/lib/market');
const { adjustedCloses, dailyBars } = await import('@/lib/prices');
const { D, fmtPct, fmtUsd } = await import('@/lib/money');
const { sma, rsiWilder, rsiLabel, rsiDisplay, findCrosses, computeIndicators } = await import('./indicators');
const { backtest, compareSeries, monthsInclusive, monthList, screen, BACKTEST_MAX_MONTHS } = await import('./calc');
const { buildSummary, checkSummary, hasForbidden } = await import('./summary');
const { minusMonths, isDate, normSymbol } = await import('./common');

afterAll(() => pool.end());

const T = (s: string) => new Date(s.replace(' ', 'T') + '+07:00');
const LOCK = T('2026-11-06 22:00:00');
const series = (n: number, f: (i: number) => number | string) => Array.from({ length: n }, (_, i) => String(f(i)));

// ---------------- unit test ----------------

describe('E74 BR-26 เส้น 200 วัน: 199 / 200 / 201 จุด', () => {
  for (const [n, has] of [[199, false], [200, true], [201, true]] as const) {
    it(`${n} จุด → ${has ? 'มี' : 'ไม่มี'}`, () => {
      const out = sma(series(n, (i) => 100 + i), 200);
      expect(out[n - 1] !== null).toBe(has);
      const dates = series(n, (i) => `d${String(i).padStart(4, '0')}`);
      const r = computeIndicators(dates.map((d, i) => ({ date: d, close: String(100 + i) })));
      expect(r.notEnough.sma200).toBe(!has);
      expect(r.latest.sma200 !== null).toBe(has);
    });
  }
  it('49 / 50 / 51 → เส้น 50 วัน ไม่มี / มี / มี', () => {
    expect(sma(series(49, () => 1), 50)[48]).toBeNull();
    expect(sma(series(50, () => 1), 50)[49]?.toFixed(4)).toBe('1.0000');
    expect(sma(series(51, () => 1), 50)[50]?.toFixed(4)).toBe('1.0000');
  });
  it('BR-27 ค่าเฉลี่ยคือผลรวม N ตัวล่าสุด ÷ N ปัด 4 ตำแหน่ง (ZGC คิดมือ)', () => {
    const closes = [...series(151, () => 100), ...series(49, () => 99), '150'];
    expect(sma(closes, 50)[200]!.toFixed(4)).toBe('100.0200');
    expect(sma(closes, 200)[200]!.toFixed(4)).toBe('100.0050');
  });
});

describe('E78 BR-28 RSI ต้องมีราคาปิด 15 ตัว', () => {
  for (const [n, has] of [[14, false], [15, true], [16, true]] as const) {
    it(`${n} ราคาปิด → ${has ? 'มี' : 'ไม่มี'} RSI`, () => {
      const out = rsiWilder(series(n, (i) => 100 + (i % 3) - (i % 2)));
      expect(out[n - 1] !== null).toBe(has);
      const r = computeIndicators(series(n, (i) => `d${String(i).padStart(3, '0')}`).map((d, i) => ({ date: d, close: String(100 + (i % 3)) })));
      expect(r.notEnough.rsi14).toBe(!has);
    });
  }
  it('ไม่มีขาลง = 100.00 · ไม่มีขาขึ้น = 0.00', () => {
    expect(rsiDisplay(rsiWilder(series(20, (i) => 100 + i))[19]!)).toBe('100.00');
    expect(rsiDisplay(rsiWilder(series(20, (i) => 100 - i))[19]!)).toBe('0.00');
  });
  it('Wilder: เฉลี่ยแรกจาก 14 ช่วง แล้วถ่วง 13/14', () => {
    // 14 ช่วงแรก: ขึ้น 1 ทุกช่วง แล้วลง 14 ในวันที่ 16 → avgUp = 13/14, avgDown = 1 → RS = 13/14 → RSI = 48.1481…
    const closes = [...series(15, (i) => 100 + i), '100'];
    const v = rsiWilder(closes)[15]!;
    expect(v.toDecimalPlaces(4).toFixed(4)).toBe('48.1481');
  });
});

describe('E82 BR-29 ป้ายซื้อมากเกินไปดูค่าที่แสดง 2 ตำแหน่ง', () => {
  const cases: [string, string | null][] = [
    ['69.99', null], ['70.00', 'overbought'], ['70.01', 'overbought'],
    ['69.994', null], ['69.995', 'overbought'],
  ];
  for (const [v, l] of cases) it(`${v} → ${l ?? 'ไม่มี'}`, () => expect(rsiLabel(v)).toBe(l));
  it('69.995 แสดง 70.00 · 69.994 แสดง 69.99', () => {
    expect(rsiDisplay('69.995')).toBe('70.00');
    expect(rsiDisplay('69.994')).toBe('69.99');
  });
});

describe('E84 BR-30 ป้ายขายมากเกินไป', () => {
  const cases: [string, string | null][] = [['30.01', null], ['30.00', 'oversold'], ['29.99', 'oversold'], ['30.005', null], ['30.004', 'oversold']];
  for (const [v, l] of cases) it(`${v} → ${l ?? 'ไม่มี'}`, () => expect(rsiLabel(v)).toBe(l));
});

describe('BR-31 ป้ายตัด: −0.01 / 0.00 / +0.01', () => {
  const d = ['a', 'b'];
  const mk = (x: string) => [D(x)];
  it('เมื่อวานต่ำกว่า วันนี้ −0.01 → ไม่มี', () => expect(findCrosses(d, [D('99'), D('99.99')], [D('100'), D('100')])).toEqual([]));
  it('วันนี้เท่ากัน → ไม่มี', () => expect(findCrosses(d, [D('99'), D('100')], [D('100'), D('100')])).toEqual([]));
  it('วันนี้ +0.01 → Golden', () => expect(findCrosses(d, [D('99'), D('100.01')], [D('100'), D('100')])).toEqual([{ date: 'b', kind: 'golden' }]));
  it('เมื่อวานเท่ากันแล้ววันนี้สูงกว่า → ไม่มี (ต้องต่ำกว่าเมื่อวาน)', () => expect(findCrosses(d, [D('100'), D('101')], [D('100'), D('100')])).toEqual([]));
  it('Death', () => expect(findCrosses(d, [D('101'), D('99.99')], [D('100'), D('100')])).toEqual([{ date: 'b', kind: 'death' }]));
  it('ค่าว่างไม่นับ', () => expect(findCrosses(d, [null, D('101')], mk('100').concat(mk('100')))).toEqual([]));
});

describe('E154 BR-56 สรุปไม่เกิน 3 บรรทัด', () => {
  it('2 / 3 / 4 บรรทัด → ✓ / ✓ / ✗', () => {
    expect(checkSummary(['a', 'b'])).toBe(true);
    expect(checkSummary(['a', 'b', 'c'])).toBe(true);
    expect(checkSummary(['a', 'b', 'c', 'd'])).toBe(false);
  });
  it('คำต้องห้าม → ✗ (ไม่สนตัวพิมพ์)', () => {
    expect(hasForbidden('We RECOMMEND this')).toBe(true);
    expect(hasForbidden('Recommended')).toBe(true);
    expect(checkSummary(['หุ้นนี้น่าซื้อ'])).toBe(false);
    expect(checkSummary(['Strong Buy'], 'en')).toBe(false);
  });
  it('ภาษาอังกฤษห้ามมีอักษรไทย', () => expect(checkSummary(['ราคา'], 'en')).toBe(false));
});

describe('BR-53 / BR-54 คำนวณบริสุทธิ์', () => {
  it('BR-53 $100 → $110 = +10.00% · วันแรก 0', () => {
    const s = compareSeries([{ date: 'a', close: '100' }, { date: 'b', close: '110' }]);
    expect(s[0].pct).toBe('0');
    expect(fmtPct(s[1].pct)).toBe('+10.00%');
  });
  it('E68 จำนวนเดือน 2016-11 ถึง 2026-10 = 120 ✓ · 2016-10 ถึง 2026-10 = 121 ✗', () => {
    expect(monthsInclusive('2016-11', '2026-10')).toBe(120);
    expect(monthsInclusive('2016-10', '2026-10')).toBe(121);
    expect(monthsInclusive('2016-11', '2026-10') <= BACKTEST_MAX_MONTHS).toBe(true);
    expect(monthsInclusive('2016-10', '2026-10') <= BACKTEST_MAX_MONTHS).toBe(false);
    expect(monthsInclusive('2016-12', '2026-10')).toBe(119);
  });
  it('รายการเดือนข้ามปี', () => expect(monthList('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']));
  it('ส่วนต่าง = ค่าที่ปัดแล้วลบกัน', () => {
    const r = backtest(['3', '3'], '1', '1');
    // DCA 2/3 หุ้น × 1 = 0.6667 → 0.67 · ก้อนเดียว 2/3 → 0.67 · ต่าง 0.00
    expect([r.dca.valueUsd, r.lump.valueUsd, r.diffUsd, r.investedUsd]).toEqual(['0.67', '0.67', '0.00', '2.00']);
  });
  it('ตัวช่วยวันที่', () => {
    expect(minusMonths('2026-11-05', 6)).toBe('2026-05-05');
    expect(minusMonths('2026-08-31', 6)).toBe('2026-02-28');
    expect(minusMonths('2026-03-15', 6)).toBe('2025-09-15');
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('2026-02-28')).toBe(true);
    expect(normSymbol(' brk-b ')).toBe('BRK.B');
  });
});

// ---------------- ฐานข้อมูลจริง (อ่านอย่างเดียว) ----------------

const lastClosed = async (at = LOCK) => (await marketStatus(at)).lastClosedSession;
const ind = async (sym: string, at = LOCK) => computeIndicators(await adjustedCloses(sym, await lastClosed(at)));

describe('ส่วนที่ 4.4 ตัวชี้วัด ณ รอบ 2026-11-05 (E75, E79–E81, E83, E85–E87)', () => {
  it('รอบล่าสุดที่ปิดแล้ว ณ วันล็อก = 2026-11-05 (T-07)', async () => expect(await lastClosed()).toBe('2026-11-05'));
  it('E75 / E81 AAPL 50 วัน 238.8000 · 200 วัน 235.2240 · RSI 52.54 ไม่มีป้าย', async () => {
    const r = await ind('AAPL');
    expect(r.counts.closes).toBe(2853);
    expect(r.latest).toEqual({ sma50: '238.8000', sma200: '235.2240', rsi14: '52.54', rsiLabel: null });
    expect(D(r.latest.sma50!).toFixed(2)).toBe('238.80');
    expect(D(r.latest.sma200!).toFixed(2)).toBe('235.22');
  });
  it('VOO 497.50 / 490.05 / 52.54', async () => {
    const r = await ind('VOO');
    expect([D(r.latest.sma50!).toFixed(2), D(r.latest.sma200!).toFixed(2), r.latest.rsi14]).toEqual(['497.50', '490.05', '52.54']);
  });
  it('NVDA ปรับแล้ว 129.35 / 127.41 / 52.54', async () => {
    const r = await ind('NVDA');
    expect([D(r.latest.sma50!).toFixed(2), D(r.latest.sma200!).toFixed(2), r.latest.rsi14]).toEqual(['129.35', '127.41', '52.54']);
  });
  it('E80 ZUP 198.7750 / 195.0250 · RSI 100.00 ซื้อมากเกินไป', async () => {
    const r = await ind('ZUP');
    expect(r.latest).toEqual({ sma50: '198.7750', sma200: '195.0250', rsi14: '100.00', rsiLabel: 'overbought' });
  });
  it('E83 ZDN 201.2250 / 204.9750 · RSI 0.00 ขายมากเกินไป', async () => {
    const r = await ind('ZDN');
    expect(r.latest).toEqual({ sma50: '201.2250', sma200: '204.9750', rsi14: '0.00', rsiLabel: 'oversold' });
  });
  it('E71 / E79 PDNW 40 วัน ไม่มีเส้น 50/200 · RSI 51.94', async () => {
    const r = await ind('PDNW');
    expect(r.counts.closes).toBe(40);
    expect(r.notEnough).toEqual({ sma50: true, sma200: true, rsi14: false });
    expect(r.sma50).toEqual([]);
    expect(r.sma200).toEqual([]);
    expect(r.latest).toEqual({ sma50: null, sma200: null, rsi14: '51.94', rsiLabel: null });
  });
  it('E72 / E73 PDNW 49 วัน (2026-11-20 03:59:59) ไม่มี · 50 วัน (04:00:00) มี 19.9376', async () => {
    const a = await ind('PDNW', T('2026-11-20 03:59:59'));
    expect([a.counts.closes, a.latest.sma50]).toEqual([49, null]);
    const b = await ind('PDNW', T('2026-11-20 04:00:00'));
    expect([b.counts.closes, b.latest.sma50]).toEqual([50, '19.9376']);
    expect(b.sma50).toEqual([{ date: '2026-11-19', value: '19.9376' }]);
  });
  it('E85 ZGC Golden Cross 2026-11-05 (99.0200/99.7550 → 100.0200/100.0050)', async () => {
    const r = await ind('ZGC');
    expect(r.sma50.slice(-2).map((p) => p.value)).toEqual(['99.0200', '100.0200']);
    expect(r.sma200.slice(-2).map((p) => p.value)).toEqual(['99.7550', '100.0050']);
    expect(r.crosses).toEqual([{ date: '2026-11-05', kind: 'golden' }]);
  });
  it('E86 ZEQ ส่วนต่าง 0.0000 ไม่มีป้าย', async () => {
    const r = await ind('ZEQ');
    expect([r.latest.sma50, r.latest.sma200]).toEqual(['100.0000', '100.0000']);
    expect(r.crosses).toEqual([]);
  });
  it('E87 ZDC Death Cross 2026-11-05', async () => {
    const r = await ind('ZDC');
    expect(r.sma50.slice(-2).map((p) => p.value)).toEqual(['100.9800', '99.9800']);
    expect(r.sma200.slice(-2).map((p) => p.value)).toEqual(['100.2450', '99.9950']);
    expect(r.crosses).toEqual([{ date: '2026-11-05', kind: 'death' }]);
  });
  it('T-07 ไม่ใช้ราคาของรอบที่ยังไม่ปิด (ไม่มีวันที่หลัง 2026-11-05)', async () => {
    const r = await ind('AAPL');
    expect(r.rsi14[r.rsi14.length - 1].date).toBe('2026-11-05');
  });
});

type SRow = { symbol: string; pe: string | null; divYieldPct: string | null; marketCapUsd: string | null };
const stockRows = async () =>
  (await q<{ symbol: string; pe: string | null; div_yield_pct: string | null; market_cap_usd: string | null }>(
    `SELECT symbol, pe, div_yield_pct, market_cap_usd FROM stocks WHERE exchange <> 'OTC' AND status = 'listed'`))
    .map((r): SRow => ({ symbol: r.symbol, pe: r.pe, divYieldPct: r.div_yield_pct, marketCapUsd: r.market_cap_usd }));

describe('คัดกรอง E145–E147 (BR-51, BR-52)', () => {
  it('E145 P/E ≤ 20 → BRK.B, JNJ, PG', async () => {
    expect(screen(await stockRows(), { peMax: '20' }).map((r) => r.symbol)).toEqual(['BRK.B', 'JNJ', 'PG']);
  });
  it('E146 ปันผล ≥ 3 → JNJ, KO, O', async () => {
    expect(screen(await stockRows(), { divMin: '3' }).map((r) => r.symbol)).toEqual(['JNJ', 'KO', 'O']);
  });
  it('E147 ทั้งคู่ → JNJ', async () => {
    expect(screen(await stockRows(), { peMax: '20', divMin: '3' }).map((r) => r.symbol)).toEqual(['JNJ']);
  });
  it('E148 ค่าเริ่มต้นเรียง A–Z · ไม่รวม OTC / ถูกถอด', async () => {
    const all = screen(await stockRows(), {}).map((r) => r.symbol);
    expect(all).toEqual([...all].sort());
    expect(all).not.toContain('OLDC');
    expect(all).not.toContain('NSRGY');
  });
  it('เรียงตาม P/E มาก → น้อย ค่าว่างอยู่ท้าย', async () => {
    const r = screen(await stockRows(), {}, { sort: 'pe', dir: 'desc' });
    const firstNull = r.findIndex((x) => x.pe === null);
    if (firstNull >= 0) expect(r.slice(firstNull).every((x) => x.pe === null)).toBe(true);
    for (let i = 1; i < (firstNull < 0 ? r.length : firstNull); i++) expect(D(r[i - 1].pe!).gte(D(r[i].pe!))).toBe(true);
  });
});

describe('E150 เทียบ ZUP กับ AAPL 2026-10-30 ถึง 2026-11-05', () => {
  it('ZUP +0.10% · AAPL +0.08%', async () => {
    const pct = async (s: string) => {
      const pts = compareSeries((await dailyBars(s, '2026-10-30', '2026-11-05')).map((b) => ({ date: b.date, close: b.close })));
      expect(pts[0].pct).toBe('0');
      return fmtPct(pts[pts.length - 1].pct);
    };
    expect(await pct('ZUP')).toBe('+0.10%');
    expect(await pct('AAPL')).toBe('+0.08%');
  });
});

describe('E151 ลองเทียบ DCA VOO $100/เดือน 2025-11 ถึง 2026-10', () => {
  it('DCA $1,236.07 · ก้อนเดียว $1,259.97 · ส่วนต่าง −$23.90', async () => {
    const bars = await dailyBars('VOO', '2025-11-01', '2026-10-31');
    const first = new Map<string, string>();
    for (const b of bars) if (!first.has(b.date.slice(0, 7))) first.set(b.date.slice(0, 7), b.close);
    const buys = monthList('2025-11', '2026-10').map((m) => first.get(m)!);
    expect(buys).toHaveLength(12);
    expect(D(buys[0]).toFixed(2)).toBe('476.20');
    expect(first.has('2026-01')).toBe(true);
    const last = (await adjustedCloses('VOO', await lastClosed())).at(-1)!;
    expect(D(buys[11]).toFixed(2)).toBe('495.00');
    expect([last.date, D(last.close).toFixed(2)]).toEqual(['2026-11-05', '500.00']);
    const r = backtest(buys, '100', last.close);
    expect(r.months).toBe(12);
    expect(r.investedUsd).toBe('1200.00');
    expect(fmtUsd(r.dca.valueUsd)).toBe('$1,236.07');
    expect(fmtUsd(r.lump.valueUsd)).toBe('$1,259.97');
    expect(fmtUsd(r.diffUsd)).toBe('-$23.90');
  });
});

describe('E153 สรุป AI ทั้ง 60 ตัว (BR-56 · NFR-06 · NFR-12)', () => {
  it('ทุกตัว ≤ 3 บรรทัด ไม่มีคำต้องห้าม และสร้าง 2 ครั้งได้ข้อความเดิม', async () => {
    const lc = await lastClosed();
    const stocks = await q<{ symbol: string; status: string }>(`SELECT symbol, status FROM stocks WHERE exchange <> 'OTC' ORDER BY symbol`);
    expect(stocks.length).toBeGreaterThan(0);
    for (const s of stocks) {
      const closes = await adjustedCloses(s.symbol, lc);
      const r = computeIndicators(closes);
      const last = closes.at(-1) ?? null;
      const input = {
        symbol: s.symbol, delisted: s.status === 'delisted', closes: closes.length,
        lastDate: last?.date ?? null, lastClose: last?.close ?? null, prevClose: closes.at(-2)?.close ?? null,
        sma50: r.latest.sma50, sma200: r.latest.sma200, rsi14: r.latest.rsi14, rsiLabel: r.latest.rsiLabel,
        crossToday: last ? r.crosses.find((c) => c.date === last.date)?.kind ?? null : null,
      };
      for (const lang of ['th', 'en'] as const) {
        const a = buildSummary(input, lang);
        expect(checkSummary(a, lang), `${s.symbol} ${lang}: ${a.join(' | ')}`).toBe(true);
        expect(buildSummary(input, lang)).toEqual(a);
      }
    }
  }, 60_000);
  it('AAPL ภาษาอังกฤษ', async () => {
    const closes = await adjustedCloses('AAPL', await lastClosed());
    const r = computeIndicators(closes);
    const lines = buildSummary({
      symbol: 'AAPL', delisted: false, closes: closes.length, lastDate: closes.at(-1)!.date, lastClose: closes.at(-1)!.close,
      prevClose: closes.at(-2)!.close, sma50: r.latest.sma50, sma200: r.latest.sma200, rsi14: r.latest.rsi14, rsiLabel: r.latest.rsiLabel, crossToday: null,
    }, 'en');
    expect(lines).toEqual([
      'AAPL closed at $240.00 on 5 Nov 2026 (+0.52% from the previous session).',
      'The close is above the 50-day average ($238.80) and above the 200-day average ($235.22).',
      'The 14-day RSI is 52.54, within the middle range between 30 and 70.',
    ]);
  });
});
