// กฎเงินของพอร์ต · ฟังก์ชันบริสุทธิ์ (ไม่ต่อฐานข้อมูล) ทดสอบได้ใน calc.test.ts
// เงินทุกตัวคิดด้วย decimal.js ผ่าน @/lib/money (NFR-11)
import { D, Dec, fee, round2, sharesDown, maxDecimals, type Dx, type Num } from '@/lib/money';
import { modeFlag } from '@/lib/bug';

// ---------- ค่าธรรมเนียม (BR-38, BR-39) ----------
/** มูลค่ารายการ = round2(จำนวนหุ้น × ราคา) */
export const tradeValue = (shares: Num, price: Num): Dx => round2(D(shares).mul(D(price)));
/** ค่าธรรมเนียมของรายการ = max(round2(มูลค่า × อัตรา%), ขั้นต่ำ) */
export const tradeFee = (shares: Num, price: Num, ratePct: Num, minUsd: Num): Dx =>
  fee(tradeValue(shares, price), ratePct, minUsd);

// ---------- แตกพาร์ (D-12: transactions เก็บค่าจริง · holdings แบบปรับแล้ว) ----------
export type Split = { effective_date: string; ratio_to: number | string; ratio_from: number | string };
/** ตัวคูณจำนวนหุ้นของรายการวันที่ date ให้เป็นหน่วยหลังแตกพาร์ทุกครั้งที่มีผลหลังวันนั้น (ถึง upTo ถ้าระบุ) */
export function splitFactor(date: string, splits: Split[], upTo?: string): Dx {
  let f = D(1);
  for (const s of splits) {
    if (date < s.effective_date && (!upTo || s.effective_date <= upTo)) f = f.mul(D(s.ratio_to)).div(D(s.ratio_from));
  }
  return f;
}

// ---------- holdings (BR-41, BR-42, BR-43, BR-47 · D-07) ----------
export type HoldingState = { shares: Dx; costUsd: Dx; costThb: Dx; realizedUsd: Dx };
export type TxLike = {
  side: 'buy' | 'sell';
  /** จำนวนหุ้นตามที่จด (ค่าจริงของวันนั้น) */
  shares: Num;
  price: Num;
  feeUsd: Num;
  fxRate: Num;
  /** ตัวคูณแตกพาร์ (ไม่ระบุ = 1) */
  factor?: Num;
  /** เงิน $ ที่จ่ายจริงทั้งรายการ (รวมค่าธรรมเนียม) ถ้ามี เช่นรายการ DCA = เงินตามรายการรอยืนยัน (BR-44 · 8.2 #4) */
  amountUsd?: Num | null;
};

export const emptyHolding = (): HoldingState => ({ shares: D(0), costUsd: D(0), costThb: D(0), realizedUsd: D(0) });

/** ซื้อ: ต้นทุน $ += มูลค่า + ค่าธรรมเนียม · ต้นทุน ฿ += round2(ต้นทุนรายการ × อัตราวันซื้อ) */
export function buyDelta(t: TxLike): HoldingState {
  const lotUsd = t.amountUsd != null ? D(t.amountUsd) : tradeValue(t.shares, t.price).plus(D(t.feeUsd));
  return {
    shares: D(t.shares).mul(D(t.factor ?? 1)),
    costUsd: lotUsd,
    costThb: round2(lotUsd.mul(D(t.fxRate))),
    realizedUsd: D(0),
  };
}

export function applyBuy(s: HoldingState, t: TxLike): HoldingState {
  const d = buyDelta(t);
  return {
    shares: s.shares.plus(d.shares), costUsd: s.costUsd.plus(d.costUsd),
    costThb: s.costThb.plus(d.costThb), realizedUsd: s.realizedUsd,
  };
}

/**
 * ขาย: ต้นทุนที่ตัดออก = round2(ต้นทุน $ × ขาย ÷ ที่มี) (= round2(ต้นทุนเฉลี่ย × จำนวน))
 * กำไรที่รับรู้ = round2(หุ้น × ราคา) − ค่าธรรมเนียม − ต้นทุนที่ตัดออก · ต้นทุน ฿ ที่เหลือ = round2(ต้นทุน ฿ × คงเหลือ ÷ ที่มี)
 * ถ้าหุ้นไม่พอ คืนสถานะที่หุ้นติดลบ (ให้ CHECK ในฐานข้อมูลหรือ replay เป็นคนปฏิเสธ) และ ok = false
 */
export function applySell(s: HoldingState, t: TxLike): HoldingState & { ok: boolean } {
  const x = D(t.shares).mul(D(t.factor ?? 1));
  if (s.shares.lte(0) || x.gt(s.shares)) {
    return { ...s, shares: s.shares.minus(x), ok: false };
  }
  const outUsd = x.eq(s.shares) ? s.costUsd : round2(s.costUsd.mul(x).div(s.shares));
  // ต้นทุน ฿ ที่เหลือ = round2(ต้นทุน ฿ × หุ้นคงเหลือ ÷ หุ้นทั้งหมด) ปัดครึ่งขึ้นครั้งเดียวกับยอดคงเหลือ (BR-39 · TEST-PLAN 8.2 #1)
  const outThb = x.eq(s.shares) ? s.costThb : s.costThb.minus(round2(s.costThb.mul(s.shares.minus(x)).div(s.shares)));
  const proceeds = tradeValue(t.shares, t.price).minus(D(t.feeUsd));
  const realized = proceeds.minus(outUsd);
  const costOut = modeFlag() === '1' && !x.eq(s.shares) ? proceeds : outUsd;
  return {
    shares: s.shares.minus(x), costUsd: s.costUsd.minus(costOut), costThb: s.costThb.minus(outThb),
    realizedUsd: s.realizedUsd.plus(realized), ok: true,
  };
}

export class NegativeShares extends Error {
  constructor(public index: number) { super('negative shares'); }
}

/** คิด holdings ใหม่ทั้งหุ้นตามลำดับที่ส่งมา (เรียงวันที่แล้ว) · ช่วงใดหุ้นติดลบ → NegativeShares (D-08) */
export function replay(txs: TxLike[]): HoldingState {
  let s = emptyHolding();
  txs.forEach((t, i) => {
    if (t.side === 'buy') s = applyBuy(s, t);
    else {
      const r = applySell(s, t);
      if (!r.ok) throw new NegativeShares(i);
      s = { shares: r.shares, costUsd: r.costUsd, costThb: r.costThb, realizedUsd: r.realizedUsd };
    }
  });
  return s;
}

/** ต้นทุนเฉลี่ย = ต้นทุน $ ÷ จำนวนหุ้น (BR-42) · ไม่มีหุ้น = 0 */
export const avgCost = (s: Pick<HoldingState, 'shares' | 'costUsd'>): Dx =>
  s.shares.gt(0) ? s.costUsd.div(s.shares) : D(0);

// ---------- มูลค่าและกำไร (BR-46, BR-47, BR-50) ----------
export type Valuation = { valueUsd: Dx; valueThb: Dx; plUsd: Dx; plThb: Dx; plPct: Dx | null };
/** มูลค่า $ = round2(หุ้น × ราคา) · มูลค่า ฿ = round2(มูลค่า $ × อัตราล่าสุด) · กำไร = มูลค่า − ต้นทุน */
export function valuation(shares: Num, price: Num, rate: Num, costUsd: Num, costThb: Num): Valuation {
  const valueUsd = round2(D(shares).mul(D(price)));
  const valueThb = round2(valueUsd.mul(D(rate)));
  const plUsd = valueUsd.minus(D(costUsd));
  return {
    valueUsd, valueThb, plUsd, plThb: valueThb.minus(D(costThb)),
    plPct: D(costUsd).gt(0) ? plUsd.div(D(costUsd)).mul(100) : null,
  };
}

/** ผลตอบแทนรวมปันผล = กำไรจากราคา + ปันผลหลังภาษีที่ได้รับแล้ว (BR-50) */
export const totalReturn = (plUsd: Num, dividendsNetUsd: Num): Dx => D(plUsd).plus(D(dividendsNetUsd));

// ---------- DCA (BR-44, BR-45 · D-05) ----------
export type DcaCalc = { usdAmount: Dx; feeUsd: Dx; investUsd: Dx; shares: Dx };
/** USD = round2(บาท ÷ อัตรา) · ค่าธรรมเนียมจาก USD · ลงทุน = USD − ค่าธรรมเนียม · หุ้น = ปัดลง 4 ตำแหน่ง(ลงทุน ÷ ราคาปิด) */
export function dcaCompute(amountThb: Num, rate: Num, closePrice: Num, ratePct: Num = '0.15', minUsd: Num = '1.00'): DcaCalc {
  const usdAmount = round2(D(amountThb).div(D(rate)));
  const feeUsd = fee(usdAmount, ratePct, minUsd);
  const investUsd = usdAmount.minus(feeUsd);
  const shares = investUsd.gt(0) ? sharesDown(investUsd.div(D(closePrice))) : D(0);
  return { usdAmount, feeUsd, investUsd, shares };
}

const isoDow = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};
const addDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
/** วันทำการ: จันทร์–ศุกร์ ที่ไม่อยู่ในวันปิดของ market_calendar */
export const isTradingDate = (date: string, closed: Set<string>) => isoDow(date) <= 5 && !closed.has(date);
/** วันกำหนดของแผน (ปี-เดือน, วันที่) ถ้าตลาดปิดเลื่อนไปวันทำการถัดไป (BR-45) */
export function dcaTradeDate(yearMonth: string, day: number, closed: Set<string>): string {
  let d = `${yearMonth}-${String(day).padStart(2, '0')}`;
  while (!isTradingDate(d, closed)) d = addDay(d);
  return d;
}
/** รายการเดือน 'YYYY-MM' ตั้งแต่ from ถึง to (รวมทั้งสองข้าง) */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

// ---------- ปันผล (BR-48, BR-49) ----------
export type DividendCalc = { grossUsd: Dx; taxUsd: Dx; netUsd: Dx; netThb: Dx };
export const DIVIDEND_NET = '0.85';
/** ก่อนภาษี = round2(หุ้น × ปันผล) · หลังภาษี = round2(ก่อนภาษี × 0.85) · บาท = round2(หลังภาษี × อัตราวันจ่าย) */
export function dividendCompute(shares: Num, perShare: Num, rate: Num): DividendCalc {
  const grossUsd = round2(D(shares).mul(D(perShare)));
  const netUsd = round2(grossUsd.mul(DIVIDEND_NET));
  return { grossUsd, taxUsd: grossUsd.minus(netUsd), netUsd, netThb: round2(netUsd.mul(D(rate))) };
}
/** หุ้นที่มีสิทธิ์ = ผลรวมรายการที่ trade_date < วัน XD (ซื้อบวก ขายลบ · ปรับแตกพาร์ถึงวัน XD) (BR-49 · D-11) */
export function eligibleShares(
  txs: { side: 'buy' | 'sell'; trade_date: string; shares: Num }[], xdDate: string, splits: Split[] = [],
): Dx {
  let s = D(0);
  for (const t of txs) {
    if (t.trade_date >= xdDate) continue;
    const x = D(t.shares).mul(splitFactor(t.trade_date, splits, xdDate));
    s = t.side === 'buy' ? s.plus(x) : s.minus(x);
  }
  return Dec.max(s, 0);
}

// ---------- ตรวจข้อมูลเข้า ----------
const NUM_RE = /^\d+(?:\.\d+)?$/;
/** แปลงค่าที่รับมาเป็นสตริงตัวเลข (รับ number ได้แต่แปลงเป็น string ทันที) */
export function numStr(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return NUM_RE.test(s) ? s : null;
}
/** จำนวนหุ้น > 0 และทศนิยมไม่เกิน 4 (BR-40) */
export function validShares(v: unknown): string | null {
  const s = numStr(v);
  return s && maxDecimals(s, 4) && D(s).gt(0) ? s : null;
}
/** ราคา > 0 ทศนิยมไม่เกิน 4 */
export function validPrice(v: unknown): string | null {
  const s = numStr(v);
  return s && maxDecimals(s, 4) && D(s).gt(0) ? s : null;
}
/** เงิน ≥ 0 ทศนิยมไม่เกิน 2 */
export function validMoney(v: unknown, allowZero = true): string | null {
  const s = numStr(v);
  if (!s || !maxDecimals(s, 2)) return null;
  return allowZero ? s : D(s).gt(0) ? s : null;
}
export function validDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}
/** ชื่อย่อ: ตัวใหญ่ · '-' = '.' */
export const normSymbol = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().toUpperCase().replace(/-/g, '.') : null;
