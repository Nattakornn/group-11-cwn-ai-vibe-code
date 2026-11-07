// กฎตัดสินแจ้งเตือน (ฟังก์ชันบริสุทธิ์ ไม่ต้องใช้ฐานข้อมูล) · ค่าจาก TEST-DATA ส่วนที่ 7
import { describe, expect, it } from 'vitest';
import { pctChange } from '../money';
import {
  directionFor, emailBody, emailSubject, inQuietHours, isHHmm, pctHit, shouldTrigger, targetHit, type AlertLike,
} from './rules';
import { orderSymbols } from './jobs';

const pctAlert: AlertLike = { kind: 'pct', target_price: null, direction: null, active: true };
/** ZALR ปิดวันก่อน $200.00 */
const zalr = (price: string) => ({ price, changePct: pctChange('200.00', price).toString(), stale: false, status: 'listed' as const });

describe('แจ้งเตือน 5% ด้วยค่าจริง (BR-33, BR-34 · D-01)', () => {
  const cases: [string, string, boolean][] = [
    ['E91 +4.99%', '209.98', false],
    ['E92 +5.00%', '210.00', true],
    ['E93 +5.01%', '210.02', true],
    ['E94 ค่าจริง 4.995% (แสดง 5.00%)', '209.99', false],
    ['E95 −4.99%', '190.02', false],
    ['E96 −5.00%', '190.00', true],
    ['E97 −5.01%', '189.98', true],
  ];
  for (const [id, price, hit] of cases) it(`${id}: ZALR $${price} → ${hit ? 'แจ้ง' : 'ไม่แจ้ง'}`, () => {
    expect(shouldTrigger(pctAlert, zalr(price))).toBe(hit);
  });
  it('E94 % จริงคือ 4.995 ไม่ถูกปัดเป็น 5.00 ก่อนเทียบ', () => {
    expect(pctChange('200.00', '209.99').toString()).toBe('4.995');
    expect(pctHit('4.995')).toBe(false);
    expect(pctHit('4.9999999')).toBe(false);
    expect(pctHit('-4.9999999')).toBe(false);
    expect(pctHit('5')).toBe(true);
    expect(pctHit('-5')).toBe(true);
  });
  it('ไม่มี % (ไม่มีราคาปิดวันก่อน) → ไม่แจ้ง', () => {
    expect(pctHit(null)).toBe(false);
    expect(shouldTrigger(pctAlert, { price: '210.00', changePct: null, stale: false })).toBe(false);
  });
});

describe('ราคาที่ไม่อัปเดตไม่ประเมิน (D-02)', () => {
  it('stale = true ไม่แจ้งแม้ % ถึง', () => {
    expect(shouldTrigger(pctAlert, { ...zalr('220.00'), stale: true })).toBe(false);
  });
  it('ไม่มีราคา / ราคา 0 / หุ้นถูกถอด → ไม่แจ้ง', () => {
    expect(shouldTrigger(pctAlert, { price: null, changePct: '10', stale: false })).toBe(false);
    expect(shouldTrigger(pctAlert, { price: '0.0000', changePct: '-100', stale: false })).toBe(false);
    expect(shouldTrigger(pctAlert, { ...zalr('220.00'), status: 'delisted' })).toBe(false);
  });
  it('แจ้งเตือนที่ปิดอยู่ไม่ประเมิน', () => {
    expect(shouldTrigger({ ...pctAlert, active: false }, zalr('220.00'))).toBe(false);
  });
});

describe('ราคาเป้าหมาย (BR-36 · A-32)', () => {
  it('ทิศทางจากราคาตอนตั้ง: เป้า $250 ตอนราคา $240 = up · เป้าต่ำกว่า = down · เท่ากัน = down', () => {
    expect(directionFor('250.00', '240.00')).toBe('up');
    expect(directionFor('230.00', '240.00')).toBe('down');
    expect(directionFor('240.00', '240.00')).toBe('down');
  });
  const ploy: AlertLike = { kind: 'target', target_price: '250.0000', direction: 'up', active: true };
  const beam: AlertLike = { kind: 'target', target_price: '260.0000', direction: 'up', active: true };
  const aapl = (price: string) => ({ price, changePct: pctChange('240.00', price).toString(), stale: false });
  it('E100 AAPL $249.99 → ไม่แจ้ง (เป้า 250)', () => {
    expect(shouldTrigger(ploy, aapl('249.99'))).toBe(false);
  });
  it('E101 AAPL $250.00 → แจ้งคุณพลอย · คุณบีม (เป้า 260) ไม่แจ้ง', () => {
    expect(shouldTrigger(ploy, aapl('250.00'))).toBe(true);
    expect(shouldTrigger(beam, aapl('250.00'))).toBe(false);
  });
  it('BR-36 $250.01 → แจ้ง', () => {
    expect(shouldTrigger(ploy, aapl('250.01'))).toBe(true);
  });
  it('E102 แตะซ้ำหลังแจ้ง (active = false) → ไม่แจ้ง', () => {
    expect(shouldTrigger({ ...ploy, active: false }, aapl('251.00'))).toBe(false);
  });
  it('ทิศลง: ราคา ≤ เป้า', () => {
    expect(targetHit('down', '200.00', '200.01')).toBe(false);
    expect(targetHit('down', '200.00', '200.00')).toBe(true);
    expect(targetHit('down', '200.00', '199.99')).toBe(true);
  });
});

describe('ช่วงเงียบ [เริ่ม, จบ) เวลาไทย (BR-37)', () => {
  it('E103 01:59 ก่อนช่วงเงียบ 02:00–07:00 → ส่งอีเมล', () => {
    expect(inQuietHours('01:59:00', '02:00:00', '07:00:00')).toBe(false);
  });
  it('E104 02:00 เริ่มช่วงเงียบ → ไม่ส่ง · 03:00 ยังเงียบ', () => {
    expect(inQuietHours('02:00:00', '02:00:00', '07:00:00')).toBe(true);
    expect(inQuietHours('03:00:00', '02:00:00', '07:00:00')).toBe(true);
  });
  it('E105 06:59:59 ไม่ส่ง / 07:00:00 ส่ง', () => {
    expect(inQuietHours('06:59:59', '02:00:00', '07:00:00')).toBe(true);
    expect(inQuietHours('07:00:00', '02:00:00', '07:00:00')).toBe(false);
  });
  it('รูปแบบ HH:mm ใช้ได้เหมือน HH:mm:ss', () => {
    expect(inQuietHours('06:59:59', '02:00', '07:00')).toBe(true);
    expect(inQuietHours('07:00:00', '02:00', '07:00')).toBe(false);
  });
  it('ข้ามเที่ยงคืน 22:00–07:00', () => {
    expect(inQuietHours('21:59:59', '22:00', '07:00')).toBe(false);
    expect(inQuietHours('22:00:00', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('23:30:00', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('00:00:00', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('06:59:59', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('07:00:00', '22:00', '07:00')).toBe(false);
    expect(inQuietHours('12:00:00', '22:00', '07:00')).toBe(false);
  });
  it('ไม่ได้ตั้ง หรือเริ่ม = จบ → ไม่เงียบ', () => {
    expect(inQuietHours('03:00:00', null, null)).toBe(false);
    expect(inQuietHours('03:00:00', '02:00', null)).toBe(false);
    expect(inQuietHours('03:00:00', '03:00', '03:00')).toBe(false);
  });
  it('ตรวจรูปแบบ HH:mm', () => {
    expect(isHHmm('02:00')).toBe(true);
    expect(isHHmm('23:59')).toBe(true);
    expect(isHHmm('24:00')).toBe(false);
    expect(isHHmm('2:00')).toBe(false);
    expect(isHHmm('02:60')).toBe(false);
    expect(isHHmm(null)).toBe(false);
  });
});

describe('อีเมลจำลอง (FR-25)', () => {
  const base = { symbol: 'ZALR', kind: 'pct' as const, price: '210.0000', changePct: '5', prevClose: '200.0000',
    targetPrice: null, triggeredAt: '2026-11-06T15:00:00.000Z' };
  it('หัวเรื่อง 5% ทั้ง 2 ภาษา', () => {
    expect(emailSubject({ ...base, lang: 'th' })).toBe('พอดีพอร์ต: ZALR +5.00%');
    expect(emailSubject({ ...base, lang: 'en' })).toBe('Pordee Port: ZALR +5.00%');
    expect(emailSubject({ ...base, lang: 'th', price: '190.0000', changePct: '-5' })).toBe('พอดีพอร์ต: ZALR -5.00%');
  });
  it('หัวเรื่องราคาเป้าหมายใช้ราคาเป้า', () => {
    const t = { ...base, symbol: 'AAPL', kind: 'target' as const, price: '252.0000', changePct: '5', prevClose: '240.0000', targetPrice: '250.0000' };
    expect(emailSubject({ ...t, lang: 'th' })).toBe('พอดีพอร์ต: AAPL แตะ $250.00');
    expect(emailSubject({ ...t, lang: 'en' })).toBe('Pordee Port: AAPL reached $250.00');
  });
  it('เนื้อหามีเวลาไทยและที่มา · อังกฤษไม่มีอักษรไทย · ไม่มีคำต้องห้าม (NFR-05, NFR-06)', () => {
    const banned = /ควรซื้อ|ควรขาย|น่าซื้อ|น่าขาย|แนะนำให้ซื้อ|แนะนำให้ขาย|should buy|should sell|recommend|strong buy|top pick/i;
    for (const kind of ['pct', 'target'] as const) {
      const th = emailBody({ ...base, kind, targetPrice: '210.0000', lang: 'th' });
      const en = emailBody({ ...base, kind, targetPrice: '210.0000', lang: 'en' });
      expect(th).toContain('22:00');
      expect(th).toContain('Pordee Mock Feed');
      expect(en).toContain('22:00');
      expect(en).not.toMatch(/[฀-๿]/);
      expect(th).not.toMatch(banned);
      expect(en).not.toMatch(banned);
      expect(emailSubject({ ...base, kind, lang: 'en' })).not.toMatch(/[฀-๿]/);
    }
  });
});

describe('ลำดับหุ้นที่อ่านราคาในงาน alerts (D-02)', () => {
  it('ตัวที่มีที่พักสดก่อน แล้วตัวที่ถูกสั่งราคา แล้วตัวอื่น A–Z · ไม่ซ้ำ', () => {
    expect(orderSymbols(['ZA01', 'AAPL', 'ZALR', 'MSFT', 'AAPL', 'VOO'], new Set(['ZALR', 'MSFT']), new Set(['VOO'])))
      .toEqual(['MSFT', 'ZALR', 'VOO', 'AAPL', 'ZA01']);
  });
});
