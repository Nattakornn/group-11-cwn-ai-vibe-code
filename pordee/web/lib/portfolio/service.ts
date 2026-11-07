// รายการซื้อขายและ holdings (flow-portfolio · seq-race-sell) · เขียนเฉพาะ transactions / holdings
import type { PoolClient } from 'pg';
import { q, q1, PG, pgCode, type Db, pool } from '@/lib/db';
import { D, s2, s4 } from '@/lib/money';
import { StockNotFound } from '@/lib/feed';
import { rateForDate } from '@/lib/fx';
import { E } from '@/lib/http';
import {
  applySell, avgCost, buyDelta, NegativeShares, normSymbol, replay, splitFactor, tradeFee,
  type HoldingState, type Split, type TxLike,
} from './calc';
import { PE } from './errors';

export type TxRow = {
  id: number; user_id: number; symbol: string; side: 'buy' | 'sell'; trade_date: string; shares: string;
  price: string; fee_usd: string; fx_rate: string; source: 'manual' | 'dca'; created_at: Date;
  /** เงิน $ ของรายการรอยืนยัน DCA ที่ผูกกับรายการนี้ (JOIN dca_pending · ไม่ใช่คอลัมน์ของ transactions) */
  dca_usd?: string | null;
};
export type HoldingRow = { user_id: number; symbol: string; shares: string; cost_usd: string; cost_thb: string; realized_usd: string };

export const txOut = (t: TxRow) => ({
  id: Number(t.id), symbol: t.symbol, side: t.side, tradeDate: t.trade_date, shares: s4(t.shares), price: s4(t.price),
  feeUsd: s2(t.fee_usd), fxRate: s4(t.fx_rate), source: t.source, createdAt: new Date(t.created_at).toISOString(),
});

export const holdingOut = (symbol: string, h: HoldingState | null) => {
  const s = h ?? { shares: D(0), costUsd: D(0), costThb: D(0), realizedUsd: D(0) };
  return {
    symbol, shares: s4(s.shares), avgCostUsd: s4(avgCost(s)), costUsd: s2(s.costUsd), costThb: s2(s.costThb),
    realizedUsd: s2(s.realizedUsd),
  };
};

export const rowToState = (r: HoldingRow): HoldingState => ({
  shares: D(r.shares), costUsd: D(r.cost_usd), costThb: D(r.cost_thb), realizedUsd: D(r.realized_usd),
});

/** หุ้นที่จดได้: มีในระบบและไม่ใช่ OTC (หุ้นถูกถอดยังจดได้เพราะอยู่ในพอร์ตได้) */
export async function resolveStock(v: unknown, db: Db = pool) {
  const sym = normSymbol(v);
  if (!sym) throw E.bad();
  const st = await q1<{ symbol: string; name: string; exchange: string; status: 'listed' | 'delisted' }>(
    'SELECT symbol, name, exchange, status FROM stocks WHERE upper(symbol) = $1', [sym], db);
  if (!st) throw new StockNotFound(sym, false);
  if (st.exchange === 'OTC') throw new StockNotFound(st.symbol, true);
  return st;
}

export async function splitsOf(symbol: string, db: Db = pool): Promise<Split[]> {
  return q<Split>('SELECT effective_date, ratio_to, ratio_from FROM splits WHERE symbol = $1', [symbol], db);
}

const toTxLike = (t: Pick<TxRow, 'side' | 'shares' | 'price' | 'fee_usd' | 'fx_rate' | 'trade_date' | 'dca_usd'>, splits: Split[]): TxLike => ({
  side: t.side, shares: t.shares, price: t.price, feeUsd: t.fee_usd, fxRate: t.fx_rate, factor: splitFactor(t.trade_date, splits),
  amountUsd: t.side === 'buy' && t.dca_usd ? t.dca_usd : null,
});

/**
 * รายการ DCA: ต้นทุน $ = เงินตามรายการรอยืนยันที่ผู้ใช้กดยืนยัน (usd_amount · BR-44 · 8.2 #4)
 * ใช้เฉพาะเมื่อจำนวนหุ้น ราคา และค่าธรรมเนียมยังตรงกับรายการรอยืนยัน (ถ้าแก้รายการแล้วกลับไปคิดตามสูตรปกติ)
 */
const TX_WITH_DCA = `SELECT t.*, dp.usd_amount AS dca_usd FROM transactions t
  LEFT JOIN dca_pending dp ON dp.transaction_id = t.id AND t.source = 'dca'
    AND dp.shares = t.shares AND dp.close_price = t.price AND dp.fee_usd = t.fee_usd`;

/** คิด holdings ของหุ้นตัวนี้ใหม่ทั้งหมดตามลำดับวันที่ (FR-28 · D-08) · ติดลบ → 409 */
export async function recomputeHolding(c: PoolClient, userId: number, symbol: string): Promise<HoldingState | null> {
  await c.query('SELECT 1 FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE', [userId, symbol]);
  const txs = await q<TxRow>(
    `${TX_WITH_DCA} WHERE t.user_id = $1 AND t.symbol = $2 ORDER BY t.trade_date, t.id`, [userId, symbol], c);
  if (txs.length === 0) {
    await c.query('DELETE FROM holdings WHERE user_id = $1 AND symbol = $2', [userId, symbol]);
    return null;
  }
  const splits = await splitsOf(symbol, c);
  let st: HoldingState;
  try {
    st = replay(txs.map((t) => toTxLike(t, splits)));
  } catch (e) {
    if (e instanceof NegativeShares) throw PE.insufficient();
    throw e;
  }
  await c.query(
    `INSERT INTO holdings (user_id, symbol, shares, cost_usd, cost_thb, realized_usd) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, symbol) DO UPDATE SET shares = EXCLUDED.shares, cost_usd = EXCLUDED.cost_usd,
       cost_thb = EXCLUDED.cost_thb, realized_usd = EXCLUDED.realized_usd`,
    [userId, symbol, st.shares.toFixed(4), st.costUsd.toFixed(2), st.costThb.toFixed(2), st.realizedUsd.toFixed(2)]);
  return st;
}

export type NewTx = {
  symbol: string; side: 'buy' | 'sell'; tradeDate: string; shares: string; price: string; feeUsd: string; fxRate: string;
  source: 'manual' | 'dca';
  /** เงิน $ ที่จ่ายจริง (รายการ DCA = usd_amount ของรายการรอยืนยัน) */
  amountUsd?: string;
};

/**
 * บันทึกรายการ 1 รายการ แล้วอัปเดต holdings ในทรานแซกชันเดียวกัน
 * ขาย: UPDATE holdings SET shares = shares − x โดยให้ CHECK holdings_shares_nonneg เป็นด่านสุดท้าย (seq-race-sell)
 * รายการย้อนหลัง (มีรายการวันที่หลังกว่าอยู่แล้ว) → คิดใหม่ทั้งหุ้น
 */
export async function recordTransaction(c: PoolClient, userId: number, t: NewTx, createdAt: Date) {
  const tx = (await q1<TxRow>(
    `INSERT INTO transactions (user_id, symbol, side, trade_date, shares, price, fee_usd, fx_rate, source, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [userId, t.symbol, t.side, t.tradeDate, t.shares, t.price, t.feeUsd, t.fxRate, t.source, createdAt], c))!;

  const later = await q1('SELECT 1 FROM transactions WHERE user_id = $1 AND symbol = $2 AND id <> $3 AND trade_date > $4 LIMIT 1',
    [userId, t.symbol, tx.id, t.tradeDate], c);
  if (later) {
    const st = await recomputeHolding(c, userId, t.symbol);
    return { transaction: txOut(tx), holding: holdingOut(t.symbol, st) };
  }

  const like = toTxLike({ ...tx, dca_usd: t.source === 'dca' ? t.amountUsd ?? null : null }, await splitsOf(t.symbol, c));
  if (t.side === 'buy') {
    const d = buyDelta(like);
    const h = (await q1<HoldingRow>(
      `INSERT INTO holdings (user_id, symbol, shares, cost_usd, cost_thb, realized_usd) VALUES ($1, $2, $3, $4, $5, 0)
       ON CONFLICT (user_id, symbol) DO UPDATE SET shares = holdings.shares + EXCLUDED.shares,
         cost_usd = holdings.cost_usd + EXCLUDED.cost_usd, cost_thb = holdings.cost_thb + EXCLUDED.cost_thb
       RETURNING *`,
      [userId, t.symbol, d.shares.toFixed(4), d.costUsd.toFixed(2), d.costThb.toFixed(2)], c))!;
    return { transaction: txOut(tx), holding: holdingOut(t.symbol, rowToState(h)) };
  }

  // ขาย: ล็อกแถวแล้วคิดต้นทุนที่ตัดออกตามสัดส่วน (D-07) · หุ้นไม่พอให้ CHECK ปฏิเสธ
  const cur = await q1<HoldingRow>('SELECT * FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE', [userId, t.symbol], c);
  if (!cur) throw PE.insufficient();
  const next = applySell(rowToState(cur), like);
  const x = D(like.shares).mul(D(like.factor ?? 1));
  let h: HoldingRow;
  try {
    h = (await q1<HoldingRow>(
      `UPDATE holdings SET shares = shares - $3, cost_usd = $4, cost_thb = $5, realized_usd = $6
       WHERE user_id = $1 AND symbol = $2 RETURNING *`,
      [userId, t.symbol, x.toFixed(4), next.costUsd.toFixed(2), next.costThb.toFixed(2), next.realizedUsd.toFixed(2)], c))!;
  } catch (e) {
    if (pgCode(e) === PG.CHECK) throw PE.insufficient();
    throw e;
  }
  return { transaction: txOut(tx), holding: holdingOut(t.symbol, rowToState(h)) };
}

/** ค่าที่ใช้คิด fee / fx ของรายการใหม่ */
export async function feeAndRate(
  c: Db, userId: number, shares: string, price: string, tradeDate: string, feeUsd: string | null,
): Promise<{ feeUsd: string; fxRate: string }> {
  const u = await q1<{ fee_rate_pct: string; fee_min_usd: string }>(
    'SELECT fee_rate_pct, fee_min_usd FROM users WHERE id = $1', [userId], c);
  const f = feeUsd ?? tradeFee(shares, price, u!.fee_rate_pct, u!.fee_min_usd).toFixed(2);
  const fx = await rateForDate(tradeDate, c);
  return { feeUsd: D(f).toFixed(2), fxRate: fx.rate };
}
