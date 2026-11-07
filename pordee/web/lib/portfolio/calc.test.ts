// กฎเงินของพอร์ต (ไม่ต่อฐานข้อมูล) · ค่าคาดหวังจาก TEST-DATA ส่วนที่ 7.6 และ 7.7
import { describe, expect, it } from 'vitest';
import { D } from '@/lib/money';
import {
  applySell, avgCost, dcaCompute, dcaTradeDate, dividendCompute, eligibleShares, emptyHolding, monthsBetween,
  NegativeShares, replay, splitFactor, totalReturn, tradeFee, validDate, validMoney, validPrice, validShares, valuation,
  type TxLike,
} from './calc';

const CLOSED = new Set(['2026-11-26', '2026-12-25', '2027-01-01']);
const buy = (shares: string, price: string, fx: string, ratePct = '0.15', min = '1.00'): TxLike => ({
  side: 'buy', shares, price, fxRate: fx, feeUsd: tradeFee(shares, price, ratePct, min).toFixed(2),
});
const sell = (shares: string, price: string, fx = '33.60', ratePct = '0.15', min = '1.00'): TxLike => ({
  side: 'sell', shares, price, fxRate: fx, feeUsd: tradeFee(shares, price, ratePct, min).toFixed(2),
});
const ZA01 = [buy('10', '100.00', '34.0000'), buy('10', '140.00', '35.0000')];

describe('ค่าธรรมเนียม BR-38, BR-39', () => {
  it('E106 1 @ $666.00 → $1.00', () => expect(tradeFee('1', '666.00', '0.15', '1').toFixed(2)).toBe('1.00'));
  it('E107 1 @ $666.67 → $1.00', () => expect(tradeFee('1', '666.67', '0.15', '1').toFixed(2)).toBe('1.00'));
  it('E108 1 @ $700.00 → $1.05', () => expect(tradeFee('1', '700.00', '0.15', '1').toFixed(2)).toBe('1.05'));
  it('E109 10 @ $100.00 → $1.50', () => expect(tradeFee('10', '100.00', '0.15', '1').toFixed(2)).toBe('1.50'));
  it('E110 $669 / $670 / $671 → $1.00 / $1.01 / $1.01', () => {
    expect(['669.00', '670.00', '671.00'].map((p) => tradeFee('1', p, '0.15', '1').toFixed(2))).toEqual(['1.00', '1.01', '1.01']);
  });
  it('E121 ขาย 5 @ $130 ค่าธรรมเนียม $0.975 → ขั้นต่ำ $1.00', () => expect(tradeFee('5', '130.00', '0.15', '1').toFixed(2)).toBe('1.00'));
});

describe('จำนวนหุ้น BR-40 และข้อมูลเข้า', () => {
  it('E111–E113 0.123 ✓ · 0.1234 ✓ · 0.12345 ✗', () => {
    expect([validShares('0.123'), validShares('0.1234'), validShares('0.12345')]).toEqual(['0.123', '0.1234', null]);
  });
  it('0 / ติดลบ / ข้อความ ✗', () => {
    expect([validShares('0'), validShares('-1'), validShares('abc'), validShares('')]).toEqual([null, null, null, null]);
    expect([validPrice('0'), validPrice('130'), validMoney('1.005'), validMoney('0')]).toEqual([null, '130', null, '0']);
    expect([validDate('2026-02-30'), validDate('2026-11-30')]).toEqual([null, '2026-11-30']);
  });
});

describe('ต้นทุนเฉลี่ยและกำไรที่รับรู้ BR-41–BR-43 · D-07', () => {
  it('E118 ต้นทุนเฉลี่ย ZA01 = $2,403.60 ÷ 20 = $120.18', () => {
    const s = replay(ZA01);
    expect([s.costUsd.toFixed(2), avgCost(s).toFixed(2), s.costThb.toFixed(2)]).toEqual(['2403.60', '120.18', '83124.50']);
  });
  it('E119 ค่าธรรมเนียม 0% → $120.00', () => {
    const s = replay([buy('10', '100', '34', '0', '0'), buy('10', '140', '35', '0', '0')]);
    expect(avgCost(s).toFixed(2)).toBe('120.00');
  });
  it('E121 ขาย 5 @ $130 กำไรที่รับรู้ $48.10 · E120 เหลือ 15 หุ้น เฉลี่ยยัง $120.18', () => {
    const s = replay([...ZA01, sell('5', '130.00')]);
    expect(s.realizedUsd.toFixed(2)).toBe('48.10');
    expect(s.shares.toFixed(4)).toBe('15.0000');
    expect(avgCost(s).toFixed(2)).toBe('120.18');
    expect(s.costUsd.toFixed(2)).toBe('1802.70');
    expect(s.costThb.toFixed(2)).toBe('62343.38'); // round2(83,124.50 × 15 ÷ 20 = 62,343.375) ปัดครึ่งขึ้น (TEST-PLAN 8.2 #1)
  });
  it('E114–E116 ขาย 19.9999 ✓ · 20 ✓ เหลือ 0 ต้นทุน 0 · 20.0001 ✗', () => {
    const base = replay(ZA01);
    expect(applySell(base, sell('19.9999', '130')).ok).toBe(true);
    const all = applySell(base, sell('20', '130'));
    expect([all.ok, all.shares.toFixed(4), all.costUsd.toFixed(2), all.costThb.toFixed(2)]).toEqual([true, '0.0000', '0.00', '0.00']);
    const over = applySell(base, sell('20.0001', '130'));
    expect([over.ok, over.shares.isNeg()]).toEqual([false, true]);
    expect(() => replay([...ZA01, sell('20.0001', '130')])).toThrow(NegativeShares);
  });
  it('D-08 ขายก่อนซื้อตามวันที่ → ติดลบ', () => {
    expect(() => replay([sell('1', '100'), ...ZA01])).toThrow(NegativeShares);
    expect(applySell(emptyHolding(), sell('1', '100')).ok).toBe(false);
  });
  it('D-12 แตกพาร์ NVDA 10:1 (2024-06-10): ซื้อ 1 หุ้นก่อนแตก = 10 หุ้นใน holdings ต้นทุนเท่าเดิม', () => {
    const sp = [{ effective_date: '2024-06-10', ratio_to: 10, ratio_from: 1 }];
    expect(splitFactor('2024-06-07', sp).toString()).toBe('10');
    expect(splitFactor('2024-06-10', sp).toString()).toBe('1');
    const s = replay([{ ...buy('1', '1142.96', '35'), factor: splitFactor('2024-06-07', sp) }]);
    expect([s.shares.toFixed(4), s.costUsd.toFixed(2)]).toEqual(['10.0000', '1144.67']);
  });
});

describe('มูลค่าและกำไร $ / ฿ BR-46, BR-47', () => {
  const za = replay(ZA01);
  it('E132 วันล็อก $130 × 33.60: ฿87,360.00 กำไร ฿4,235.50 / $196.40', () => {
    const v = valuation(za.shares, '130.00', '33.6000', za.costUsd, za.costThb);
    expect([za.costThb.toFixed(2), v.valueThb.toFixed(2), v.plThb.toFixed(2), v.plUsd.toFixed(2)])
      .toEqual(['83124.50', '87360.00', '4235.50', '196.40']);
  });
  it('E133 ก่อน 18:00 × 33.50: ฿87,100.00 กำไร ฿3,975.50', () => {
    const v = valuation(za.shares, '130.00', '33.5000', za.costUsd, za.costThb);
    expect([v.valueThb.toFixed(2), v.plThb.toFixed(2), v.plUsd.toFixed(2)]).toEqual(['87100.00', '3975.50', '196.40']);
  });
  it('E134 VOO คุณบีม: เฉลี่ย $486.00 · ต้นทุน ฿33,539.00 · มูลค่า ฿33,600.00 · กำไร ฿61.00 ($28.00)', () => {
    const s = replay([buy('1', '480.00', '34.0000'), buy('1', '490.00', '35.0000')]);
    const v = valuation(s.shares, '500.00', '33.6000', s.costUsd, s.costThb);
    expect([avgCost(s).toFixed(2), s.costThb.toFixed(2), v.valueThb.toFixed(2), v.plThb.toFixed(2), v.plUsd.toFixed(2)])
      .toEqual(['486.00', '33539.00', '33600.00', '61.00', '28.00']);
  });
  it('BR-50 ผลตอบแทนรวม $196.40 + $42.50 = $238.90 · ไม่มีปันผลเท่ากับกำไรจากราคา', () => {
    expect(totalReturn('196.40', '42.50').toFixed(2)).toBe('238.90');
    expect(totalReturn('2296.90', '0').toFixed(2)).toBe('2296.90');
    expect(totalReturn('2296.90', '144.50').toFixed(2)).toBe('2441.40'); // E144
  });
});

describe('DCA BR-44, BR-45', () => {
  it('E122 ฿5,000 ÷ 35 = $142.86 − $1.00 = $141.86 ÷ $500 = 0.2837', () => {
    const r = dcaCompute('5000.00', '35.0000', '500.00');
    expect([r.usdAmount.toFixed(2), r.feeUsd.toFixed(2), r.investUsd.toFixed(2), r.shares.toFixed(4)])
      .toEqual(['142.86', '1.00', '141.86', '0.2837']);
  });
  it('E123 ราคา $141.86 → 1.0000', () => expect(dcaCompute('5000', '35', '141.86').shares.toFixed(4)).toBe('1.0000'));
  it('E124 ราคา $141.87 → 0.9999 (ปัดลง)', () => expect(dcaCompute('5000', '35', '141.87').shares.toFixed(4)).toBe('0.9999'));
  it('เงินไม่พอค่าธรรมเนียม → 0 หุ้น', () => expect(dcaCompute('30', '35', '500').shares.toFixed(4)).toBe('0.0000'));
  it('E127 25 ต.ค. 2569 (อาทิตย์) → 2026-10-26', () => expect(dcaTradeDate('2026-10', 25, CLOSED)).toBe('2026-10-26'));
  it('BR-45 25 พ.ย. (พุธ) ใช้วันนั้น · E126 25 ธ.ค. (หยุด) → 28 ธ.ค.', () => {
    expect(dcaTradeDate('2026-11', 25, CLOSED)).toBe('2026-11-25');
    expect(dcaTradeDate('2026-12', 25, CLOSED)).toBe('2026-12-28');
  });
  it('D-10 ตามทำย้อนหลังทุกเดือน', () => {
    expect(monthsBetween('2026-10', '2027-01')).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
  });
});

describe('ปันผล BR-48, BR-49', () => {
  const c = (sh: string, per: string) => dividendCompute(sh, per, '35.0000');
  it('E135 JNJ 50 × $1.30 = $65.00 → $55.25 → ฿1,933.75', () => {
    const r = c('50', '1.30');
    expect([r.grossUsd.toFixed(2), r.taxUsd.toFixed(2), r.netUsd.toFixed(2), r.netThb.toFixed(2)]).toEqual(['65.00', '9.75', '55.25', '1933.75']);
  });
  it('E136 O 200 × $0.27 = $54.00 → $45.90 → ฿1,606.50', () => {
    const r = c('200', '0.27');
    expect([r.netUsd.toFixed(2), r.netThb.toFixed(2)]).toEqual(['45.90', '1606.50']);
  });
  it('E137 KO 100 × $0.51 = $51.00 → $43.35 → ฿1,517.25', () => {
    const r = c('100', '0.51');
    expect([r.netUsd.toFixed(2), r.netThb.toFixed(2)]).toEqual(['43.35', '1517.25']);
  });
  it('E138 สรุป ธ.ค. $144.50 / ฿5,057.50', () => {
    const rs = [c('50', '1.30'), c('200', '0.27'), c('100', '0.51')];
    const usd = rs.reduce((a, r) => a.plus(r.netUsd), D(0));
    const thb = rs.reduce((a, r) => a.plus(r.netThb), D(0));
    expect([usd.toFixed(2), thb.toFixed(2)]).toEqual(['144.50', '5057.50']);
  });
  it('E139 O 1 หุ้น $0.27 × 0.85 = $0.2295 → $0.23', () => expect(c('1', '0.27').netUsd.toFixed(2)).toBe('0.23'));
  it('BR-48 $50.00 → $42.50 × 35.00 = ฿1,487.50', () => {
    const r = dividendCompute('100', '0.50', '35.00');
    expect([r.netUsd.toFixed(2), r.netThb.toFixed(2)]).toEqual(['42.50', '1487.50']);
  });
  it('E140 KO 10 หุ้น → $5.10 → $4.34', () => expect(c('10', '0.51').netUsd.toFixed(2)).toBe('4.34'));
  it('E140–E142 สิทธิ์: ซื้อ 30 พ.ย. ได้ · 1 ธ.ค. ไม่ได้ · 2 ธ.ค. ไม่ได้ (XD 1 ธ.ค.)', () => {
    const t = (d: string) => [{ side: 'buy' as const, trade_date: d, shares: '10' }];
    expect(['2026-11-30', '2026-12-01', '2026-12-02'].map((d) => eligibleShares(t(d), '2026-12-01').toFixed(4)))
      .toEqual(['10.0000', '0.0000', '0.0000']);
  });
  it('ขายก่อน XD หักออก', () => {
    expect(eligibleShares([
      { side: 'buy', trade_date: '2026-02-02', shares: '100' }, { side: 'sell', trade_date: '2026-11-01', shares: '40' },
      { side: 'sell', trade_date: '2026-12-01', shares: '60' },
    ], '2026-12-01').toFixed(4)).toBe('60.0000');
  });
});
