// ตัวชี้วัด (flow-indicators · BR-26 ถึง BR-31) · ฟังก์ชันบริสุทธิ์ ไม่แตะฐานข้อมูล
// ค่าทุกตัวคิดด้วย decimal.js · รับราคาปิดแบบปรับแตกพาร์แล้ว เรียงจากเก่าไปใหม่
import { D, Dec, round4, type Dx, type Num } from '@/lib/money';

export const SMA_SHORT = 50;
export const SMA_LONG = 200;
export const RSI_PERIOD = 14;

export type Point = { date: string; value: string };
export type CrossKind = 'golden' | 'death';
export type RsiLabel = 'overbought' | 'oversold' | null;

/**
 * ค่าเฉลี่ย N วัน (BR-26, BR-27): ตำแหน่ง i = ผลรวมราคาปิด N ตัวล่าสุดถึง i ÷ N (ปัด 4 ตำแหน่ง)
 * ตำแหน่งที่ข้อมูลยังไม่ครบ N ตัว = null
 */
export function sma(closes: Num[], n: number): (Dx | null)[] {
  const out: (Dx | null)[] = new Array(closes.length).fill(null);
  if (n <= 0) return out;
  let sum = D(0);
  for (let i = 0; i < closes.length; i++) {
    sum = sum.plus(D(closes[i]));
    if (i >= n) sum = sum.minus(D(closes[i - n]));
    if (i >= n - 1) out[i] = round4(sum.div(n));
  }
  return out;
}

/**
 * RSI แบบ Wilder (BR-28, A-16): ต้องมีราคาปิดอย่างน้อย period + 1 ตัว
 * เฉลี่ยแรก = ค่าเฉลี่ยขึ้น/ลงของ period ช่วงแรก แล้ว (เดิม × (period − 1) + ใหม่) ÷ period
 * ไม่มีขาลง = 100 · ไม่มีขาขึ้น = 0 · คืนค่าจริง (ไม่ปัด) ตำแหน่งที่ยังคิดไม่ได้ = null
 */
export function rsiWilder(closes: Num[], period = RSI_PERIOD): (Dx | null)[] {
  const out: (Dx | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let avgUp = D(0);
  let avgDown = D(0);
  for (let i = 1; i <= period; i++) {
    const ch = D(closes[i]).minus(D(closes[i - 1]));
    if (ch.gt(0)) avgUp = avgUp.plus(ch);
    else avgDown = avgDown.plus(ch.neg());
  }
  avgUp = avgUp.div(period);
  avgDown = avgDown.div(period);
  out[period] = rsiOf(avgUp, avgDown);
  for (let i = period + 1; i < closes.length; i++) {
    const ch = D(closes[i]).minus(D(closes[i - 1]));
    const up = ch.gt(0) ? ch : D(0);
    const down = ch.lt(0) ? ch.neg() : D(0);
    avgUp = avgUp.mul(period - 1).plus(up).div(period);
    avgDown = avgDown.mul(period - 1).plus(down).div(period);
    out[i] = rsiOf(avgUp, avgDown);
  }
  return out;
}

function rsiOf(avgUp: Dx, avgDown: Dx): Dx {
  if (avgDown.isZero()) return D(100); // ไม่มีขาลง (รวมกรณีราคานิ่งทั้งช่วง)
  if (avgUp.isZero()) return D(0);
  const rs = avgUp.div(avgDown);
  return D(100).minus(D(100).div(rs.plus(1)));
}

/** RSI ที่แสดง: ปัดครึ่งขึ้น 2 ตำแหน่ง */
export const rsiDisplay = (v: Num): string => D(v).toDecimalPlaces(2, Dec.ROUND_HALF_UP).toFixed(2);

/** ป้าย RSI ดูจากค่าที่แสดง 2 ตำแหน่ง (BR-29, BR-30): ≥ 70.00 ซื้อมากเกินไป · ≤ 30.00 ขายมากเกินไป */
export function rsiLabel(v: Num | null | undefined): RsiLabel {
  if (v === null || v === undefined) return null;
  const shown = D(rsiDisplay(v));
  if (shown.gte(70)) return 'overbought';
  if (shown.lte(30)) return 'oversold';
  return null;
}

/**
 * ป้ายตัด (BR-31): Golden = เมื่อวานเส้นสั้น < เส้นยาว และวันนี้เส้นสั้น > เส้นยาว · Death กลับกัน · เท่ากันไม่นับ
 * เทียบค่าที่ปัด 4 ตำแหน่งแล้ว (ค่าเดียวกับที่ API ส่ง)
 */
export function findCrosses(dates: string[], short: (Dx | null)[], long: (Dx | null)[]): { date: string; kind: CrossKind }[] {
  const out: { date: string; kind: CrossKind }[] = [];
  for (let i = 1; i < dates.length; i++) {
    const s0 = short[i - 1], l0 = long[i - 1], s1 = short[i], l1 = long[i];
    if (!s0 || !l0 || !s1 || !l1) continue;
    if (s0.lt(l0) && s1.gt(l1)) out.push({ date: dates[i], kind: 'golden' });
    else if (s0.gt(l0) && s1.lt(l1)) out.push({ date: dates[i], kind: 'death' });
  }
  return out;
}

export type IndicatorResult = {
  sma50: Point[];
  sma200: Point[];
  rsi14: Point[];
  latest: { sma50: string | null; sma200: string | null; rsi14: string | null; rsiLabel: RsiLabel };
  crosses: { date: string; kind: CrossKind }[];
  notEnough: { sma50: boolean; sma200: boolean; rsi14: boolean };
  counts: { closes: number };
};

/**
 * คิดตัวชี้วัดทั้งหมดจากราคาปิดทั้งชุด แล้วตัดเฉพาะช่วง [from, to] สำหรับเส้นและป้ายตัด
 * latest = ค่าของวันสุดท้ายในชุด (รอบล่าสุดที่ปิดแล้ว)
 */
export function computeIndicators(closes: { date: string; close: string }[], from = '0000-01-01', to = '9999-12-31'): IndicatorResult {
  const dates = closes.map((c) => c.date);
  const vals = closes.map((c) => c.close);
  const s50 = sma(vals, SMA_SHORT);
  const s200 = sma(vals, SMA_LONG);
  const rsi = rsiWilder(vals, RSI_PERIOD);
  const inRange = (d: string) => d >= from && d <= to;
  const series = (arr: (Dx | null)[], fmt: (v: Dx) => string): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i < dates.length; i++) {
      const v = arr[i];
      if (v && inRange(dates[i])) pts.push({ date: dates[i], value: fmt(v) });
    }
    return pts;
  };
  const f4 = (v: Dx) => v.toFixed(4);
  const last = dates.length - 1;
  const lastRsi = last >= 0 ? rsi[last] : null;
  return {
    sma50: series(s50, f4),
    sma200: series(s200, f4),
    rsi14: series(rsi, (v) => rsiDisplay(v)),
    latest: {
      sma50: last >= 0 && s50[last] ? s50[last]!.toFixed(4) : null,
      sma200: last >= 0 && s200[last] ? s200[last]!.toFixed(4) : null,
      rsi14: lastRsi ? rsiDisplay(lastRsi) : null,
      rsiLabel: rsiLabel(lastRsi),
    },
    crosses: findCrosses(dates, s50, s200).filter((c) => inRange(c.date)),
    notEnough: {
      sma50: closes.length < SMA_SHORT,
      sma200: closes.length < SMA_LONG,
      rsi14: closes.length < RSI_PERIOD + 1,
    },
    counts: { closes: closes.length },
  };
}
