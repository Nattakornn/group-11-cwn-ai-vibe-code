// TC-CHART-10 · ค่าขอบตัวชี้วัดระดับกฎ (ทีมสร้างเว็บรัน ผลถูกอ่านโดย e2e/tests/5.2-chart.spec.ts)
// ข้อมูลและผลที่คาดหวังคัดจาก TEST-PLAN.md TC-CHART-10 · ฟังก์ชันบริสุทธิ์ ไม่แตะฐานข้อมูล
import { describe, expect, it } from 'vitest';
import { D } from '@/lib/money';
import { sma, rsiWilder, rsiDisplay, rsiLabel, findCrosses } from './indicators';

describe('TC-CHART-10 RSI ป้ายดูจากค่าที่แสดง 2 ตำแหน่ง (BR-29 BR-30)', () => {
  const cases: [string, string, 'overbought' | 'oversold' | null][] = [
    ['69.994', '69.99', null], ['69.995', '70.00', 'overbought'], ['70.01', '70.01', 'overbought'],
    ['30.01', '30.01', null], ['30.00', '30.00', 'oversold'], ['29.99', '29.99', 'oversold'],
  ];
  for (const [raw, shown, label] of cases) {
    it(`RSI ${raw} → แสดง ${shown} ป้าย ${label ?? 'ไม่มี'}`, () => {
      expect(rsiDisplay(raw)).toBe(shown);
      expect(rsiLabel(raw)).toBe(label);
    });
  }
});

describe('TC-CHART-10 Cross ±0.01 เท่ากันไม่นับ (BR-31)', () => {
  // ส่วนต่าง = เส้นสั้น − เส้นยาว · เส้นยาวคงที่ 100
  const run = (yesterday: string, today: string) => {
    const long = [D(100), D(100)];
    const short = [D(100).plus(yesterday), D(100).plus(today)];
    return findCrosses(['d0', 'd1'], short, long).map((c) => c.kind);
  };
  const cases: [string, string, string[]][] = [
    ['-0.01', '-0.01', []], ['-0.01', '0.00', []], ['-0.01', '0.01', ['golden']],
    ['0.01', '-0.01', ['death']], ['0.01', '0.00', []], ['0.01', '0.01', []],
    ['0.00', '0.01', []], ['0.00', '-0.01', []],
  ];
  for (const [y, t, want] of cases) {
    it(`เมื่อวาน ${y} → วันนี้ ${t} = ${want[0] ?? 'ไม่มีป้าย'}`, () => { expect(run(y, t)).toEqual(want); });
  }
});

describe('TC-CHART-10 ขั้นต่ำของข้อมูล (BR-26 BR-28)', () => {
  const series = (n: number) => Array.from({ length: n }, (_, i) => String(100 + (i % 3)));
  for (const [n, has] of [[14, false], [15, true], [16, true]] as const) {
    it(`RSI ${n} ราคาปิด → ${has ? 'มีค่า' : 'ไม่มีค่า'}`, () => { expect(rsiWilder(series(n)).at(-1) !== null).toBe(has); });
  }
  for (const [n, has] of [[199, false], [200, true], [201, true]] as const) {
    it(`เส้น 200 วัน ${n} ราคาปิด → ${has ? 'มีค่า' : 'ไม่มีค่า'}`, () => { expect(sma(series(n), 200).at(-1) !== null).toBe(has); });
  }
});
