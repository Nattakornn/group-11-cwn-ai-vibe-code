import { describe, it, expect } from 'vitest';
import { addMonthsClamped, periodFrom, nextPeriod, renewalsDue, shouldPurge } from './rules';
import { thaiDate } from '../clock';
import { tierOf } from '../tier';

const LOCK = new Date('2026-11-06T22:00:00+07:00');

describe('รอบ Pro (BR-24, A-15)', () => {
  it('addMonthsClamped ใช้วันสุดท้ายของเดือนถ้าไม่มีวันนั้น', () => {
    expect(addMonthsClamped('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('สมัคร 6 พ.ย. 2569 → รอบแรกจบ 5 ธ.ค. · รอบที่ 2 เริ่ม 6 ธ.ค.', () => {
    expect(periodFrom('2026-11-06')).toEqual({ start: '2026-11-06', end: '2026-12-05' });
    expect(nextPeriod('2026-12-05').start).toBe('2026-12-06');
  });

  it('E64: สมัคร 2027-01-31 → รอบถัดไปเริ่ม 2027-02-28', () => {
    const first = periodFrom('2027-01-31');
    expect(first.end).toBe('2027-02-27');
    expect(nextPeriod(first.end).start).toBe('2027-02-28');
  });

  it('E63: รอบ 10 ต.ค.–9 พ.ย. → รอบใหม่ 10 พ.ย.–9 ธ.ค.', () => {
    expect(nextPeriod('2026-11-09')).toEqual({ start: '2026-11-10', end: '2026-12-09' });
  });

  it('E63: ต่ออายุเมื่อวันไทย > วันจบรอบเท่านั้น', () => {
    expect(renewalsDue('2026-11-09', thaiDate(new Date('2026-11-09T23:59:59+07:00')))).toEqual([]);
    expect(renewalsDue('2026-11-09', thaiDate(new Date('2026-11-10T00:00:00+07:00'))))
      .toEqual([{ start: '2026-11-10', end: '2026-12-09' }]);
  });

  it('ต่อหลายรอบจนครอบคลุมวันนี้', () => {
    expect(renewalsDue('2026-11-09', '2027-01-15')).toEqual([
      { start: '2026-11-10', end: '2026-12-09' },
      { start: '2026-12-10', end: '2027-01-09' },
      { start: '2027-01-10', end: '2027-02-09' },
    ]);
  });

  it('E65–E67: ยกเลิกแล้วใช้ได้ถึงจบรอบ 9 พ.ย. (BR-25)', () => {
    const nam = { pro_period_end: '2026-11-09' };
    expect(tierOf(nam, new Date('2026-11-09T22:00:00+07:00'))).toBe('pro');
    expect(tierOf(nam, new Date('2026-11-10T00:00:00+07:00'))).toBe('free');
    expect(tierOf(nam, new Date('2026-11-11T12:00:00+07:00'))).toBe('free');
  });
});

describe('ลบบัญชี (BR-57, A-22)', () => {
  it('E157: ขอ 2026-11-01 → วันที่ 28 ยังไม่ลบ · 1 ธ.ค. และ 2 ธ.ค. ต้องลบ', () => {
    expect(shouldPurge('2026-11-01', '2026-11-29')).toBe(false);
    expect(shouldPurge('2026-11-01', '2026-12-01')).toBe(true);
    expect(shouldPurge('2026-11-01', '2026-12-02')).toBe(true);
  });

  it('E157: 30 พ.ย. (วันที่ 29) อยู่ในช่วงที่ลบได้ ลบก่อนสิ้นวันที่ 29', () => {
    // A-22 "ข้อมูลต้องหายก่อนสิ้นวันที่ 29" · สัญญา: ≥ 29 ลบ
    expect(shouldPurge('2026-11-01', '2026-11-30')).toBe(true);
  });

  it('del1 (ขอ 2026-11-05 10:00) ณ วันล็อกยังไม่ถูกลบ', () => {
    const req = thaiDate(new Date('2026-11-05T10:00:00+07:00'));
    expect(req).toBe('2026-11-05');
    expect(shouldPurge(req, thaiDate(LOCK))).toBe(false);
  });

  it('del2 (ขอ 2026-10-07 10:00) ณ วันล็อกถูกลบ', () => {
    const req = thaiDate(new Date('2026-10-07T10:00:00+07:00'));
    expect(shouldPurge(req, thaiDate(LOCK))).toBe(true);
  });

  it('ใช้วันที่ไทย: ขอ 23:30 ไทย นับเป็นวันนั้น', () => {
    const req = thaiDate(new Date('2026-11-01T16:30:00Z')); // 23:30 ไทย
    expect(req).toBe('2026-11-01');
  });
});
