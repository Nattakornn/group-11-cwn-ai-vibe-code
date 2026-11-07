// GET /api/portfolio และค่าธรรมเนียมของผู้ใช้ (FR-29–FR-32, FR-35, FR-39)
import { q, q1 } from '@/lib/db';
import { modeFlag } from '@/lib/bug';
import { round2 } from '@/lib/money';
import { now } from '@/lib/clock';
import { rateAt } from '@/lib/fx';
import { getQuote } from '@/lib/feed';
import { marketStatus } from '@/lib/market';
import { D, s2, s4, type Dx } from '@/lib/money';
import { E } from '@/lib/http';
import { PE } from './errors';
import { avgCost, numStr, totalReturn, validMoney, valuation } from './calc';
import { rowToState, type HoldingRow } from './service';
import { listPending } from './dca';
import { maxDecimals } from '@/lib/money';

export async function getPortfolio(userId: number) {
  const n = await now();
  const [ms, fx] = await Promise.all([marketStatus(n), rateAt(n)]);
  const rows = await q<HoldingRow & { name: string; status: 'listed' | 'delisted' }>(
    `SELECT h.*, s.name, s.status FROM holdings h JOIN stocks s ON s.symbol = h.symbol
     WHERE h.user_id = $1 ORDER BY h.symbol`, [userId]);

  let costUsd = D(0), valueUsd = D(0), costThb = D(0), valueThb = D(0), realizedUsd = D(0);
  let valuedCostUsd = D(0), valuedCostThb = D(0);
  const holdings = [];
  for (const r of rows) {
    const st = rowToState(r);
    if (modeFlag() === '1') st.costThb = round2(st.costUsd.mul(fx.rate));
    realizedUsd = realizedUsd.plus(st.realizedUsd);
    if (st.shares.lte(0)) continue; // ไม่รวมหุ้นที่ขายหมดแล้ว
    const quote = await getQuote(r.symbol, n);
    costUsd = costUsd.plus(st.costUsd);
    costThb = costThb.plus(st.costThb);
    const v = quote.price ? valuation(st.shares, quote.price, fx.rate, st.costUsd, st.costThb) : null;
    if (v) {
      valueUsd = valueUsd.plus(v.valueUsd);
      valueThb = valueThb.plus(v.valueThb);
      valuedCostUsd = valuedCostUsd.plus(st.costUsd);
      valuedCostThb = valuedCostThb.plus(st.costThb);
    }
    holdings.push({
      symbol: r.symbol, name: r.name, status: r.status, shares: s4(st.shares), avgCostUsd: s4(avgCost(st)),
      costUsd: s2(st.costUsd), costThb: s2(st.costThb),
      priceUsd: quote.price ? s4(quote.price) : null, quoteAsOf: quote.asOf, stale: quote.stale,
      valueUsd: v ? s2(v.valueUsd) : null, valueThb: v ? s2(v.valueThb) : null,
      plUsd: v ? s2(v.plUsd) : null, plThb: v ? s2(v.plThb) : null, plPct: v?.plPct ? v.plPct.toString() : null,
      realizedUsd: s2(st.realizedUsd),
    });
  }
  const div = await q1<{ s: string | null }>('SELECT sum(net_usd) AS s FROM dividend_receipts WHERE user_id = $1', [userId]);
  const dividendsNetUsd = D(div?.s ?? 0);
  // กำไรรวมคิดเฉพาะหุ้นที่มีราคา (ปกติคือทุกตัว)
  const plUsd = valueUsd.minus(valuedCostUsd);
  const plThb = valueThb.minus(valuedCostThb);
  const pct = (a: Dx, b: Dx) => (b.gt(0) ? a.div(b).mul(100).toString() : null);
  return {
    asOf: n.toISOString(), marketOpen: ms.open, lastClosedSession: ms.lastClosedSession,
    fx: { rate: fx.rate, rateDate: fx.rateDate, publishedAt: fx.publishedAt },
    totals: {
      costUsd: s2(costUsd), valueUsd: s2(valueUsd), plUsd: s2(plUsd), plPct: pct(plUsd, valuedCostUsd),
      costThb: s2(costThb), valueThb: s2(valueThb), plThb: s2(plThb),
      realizedUsd: s2(realizedUsd), dividendsNetUsd: s2(dividendsNetUsd), totalReturnUsd: s2(totalReturn(plUsd, dividendsNetUsd)),
    },
    holdings,
    pending: (await listPending(userId)).items,
  };
}

const feesOut = (r: { fee_rate_pct: string; fee_min_usd: string }) => ({
  feeRatePct: D(r.fee_rate_pct).toFixed(4), feeMinUsd: s2(r.fee_min_usd),
});

export async function getFees(userId: number) {
  const r = await q1<{ fee_rate_pct: string; fee_min_usd: string }>('SELECT fee_rate_pct, fee_min_usd FROM users WHERE id = $1', [userId]);
  if (!r) throw E.unauth();
  return feesOut(r);
}

/**
 * ตั้งอัตรา % (≥ 0 ทศนิยม ≤ 4 · ไม่มีเพดานตาม FR-31 / TEST-PLAN 8.2 #10 · จำกัดแค่ขนาดคอลัมน์ < 1,000,000)
 * และขั้นต่ำ $ (0–999,999.99 ทศนิยม ≤ 2) · ค่าผิดบอกช่องที่ผิด (R41)
 */
export async function updateFees(userId: number, b: Record<string, unknown>) {
  let rate: string | null = null, min: string | null = null;
  if (b.feeRatePct !== undefined && b.feeRatePct !== null) {
    rate = numStr(b.feeRatePct);
    if (!rate || !maxDecimals(rate, 4) || D(rate).gte(1000000)) throw PE.invalidFeeRate();
  }
  if (b.feeMinUsd !== undefined && b.feeMinUsd !== null) {
    min = validMoney(b.feeMinUsd);
    if (!min || D(min).gte(1000000)) throw PE.invalidFeeMin();
  }
  if (rate === null && min === null) throw E.bad();
  const r = await q1<{ fee_rate_pct: string; fee_min_usd: string }>(
    `UPDATE users SET fee_rate_pct = COALESCE($2::numeric, fee_rate_pct), fee_min_usd = COALESCE($3::numeric, fee_min_usd)
     WHERE id = $1 RETURNING fee_rate_pct, fee_min_usd`, [userId, rate, min]);
  return feesOut(r!);
}
