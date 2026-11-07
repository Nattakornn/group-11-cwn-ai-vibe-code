// คำขอของ /api/transactions (FR-27, FR-28 · BR-38–BR-43 · D-08)
import { q, q1, tx } from '@/lib/db';
import { now, ny } from '@/lib/clock';
import { E } from '@/lib/http';
import { numStr, validDate, validMoney, validPrice, validShares } from './calc';
import { D, maxDecimals } from '@/lib/money';
import { PE } from './errors';
import { feeAndRate, recomputeHolding, recordTransaction, resolveStock, txOut, holdingOut, type TxRow } from './service';

export async function listTransactions(userId: number) {
  const rows = await q<TxRow>(
    'SELECT * FROM transactions WHERE user_id = $1 ORDER BY trade_date DESC, id DESC', [userId]);
  return { items: rows.map(txOut) };
}

const blank = (v: unknown) => v === undefined || v === null || v === '';

/** ราคาไม่ผ่าน: ถ้าเป็นตัวเลข > 0 แต่ทศนิยมเกิน 4 ตำแหน่ง บอกเรื่องทศนิยม (ไม่ใช่ "ต้องมากกว่า 0") */
function badPrice(v: unknown) {
  const s = numStr(v);
  return s && D(s).gt(0) && !maxDecimals(s, 4) ? PE.priceDecimals() : PE.invalidPrice();
}

/** วันที่ซื้อขายต้องไม่อยู่ในอนาคต (เทียบวันที่นิวยอร์กของนาฬิการะบบ · TEST-PLAN 8.2 #9) */
async function rejectFuture(tradeDate: string) {
  if (tradeDate > ny(await now()).date) throw PE.futureDate();
}

function parseSide(v: unknown): 'buy' | 'sell' {
  if (v !== 'buy' && v !== 'sell') throw E.bad();
  return v;
}

export async function createTransaction(userId: number, b: Record<string, unknown>) {
  const stock = await resolveStock(b.symbol);
  const side = parseSide(b.side);
  const tradeDate = validDate(b.tradeDate);
  if (!tradeDate) throw E.bad();
  await rejectFuture(tradeDate);
  const shares = validShares(b.shares);
  if (!shares) throw PE.invalidShares();
  const price = validPrice(b.price);
  if (!price) throw badPrice(b.price);
  let feeIn: string | null = null;
  if (!blank(b.feeUsd)) {
    feeIn = validMoney(b.feeUsd);
    if (!feeIn) throw E.bad();
  }
  const createdAt = await now();
  return tx(async (c) => {
    const { feeUsd, fxRate } = await feeAndRate(c, userId, shares, price, tradeDate, feeIn);
    return recordTransaction(c, userId,
      { symbol: stock.symbol, side, tradeDate, shares, price, feeUsd, fxRate, source: 'manual' }, createdAt);
  });
}

const parseId = (v: string) => {
  if (!/^\d+$/.test(v)) throw E.notFound();
  return v;
};

/** แก้รายการแล้วคิด holdings ใหม่ทั้งหุ้น · ไม่ส่ง feeUsd แต่จำนวน/ราคาเปลี่ยน → คิดค่าธรรมเนียมใหม่ตามค่าตั้ง */
export async function updateTransaction(userId: number, id: string, b: Record<string, unknown>) {
  parseId(id);
  const patch: { symbol?: string; side?: 'buy' | 'sell'; tradeDate?: string; shares?: string; price?: string; feeUsd?: string } = {};
  if (!blank(b.symbol)) patch.symbol = (await resolveStock(b.symbol)).symbol;
  if (!blank(b.side)) patch.side = parseSide(b.side);
  if (!blank(b.tradeDate)) {
    const d = validDate(b.tradeDate);
    if (!d) throw E.bad();
    await rejectFuture(d);
    patch.tradeDate = d;
  }
  if (b.shares !== undefined) {
    const s = validShares(b.shares);
    if (!s) throw PE.invalidShares();
    patch.shares = s;
  }
  if (b.price !== undefined) {
    const p = validPrice(b.price);
    if (!p) throw badPrice(b.price);
    patch.price = p;
  }
  if (!blank(b.feeUsd)) {
    const f = validMoney(b.feeUsd);
    if (!f) throw E.bad();
    patch.feeUsd = f;
  }
  return tx(async (c) => {
    const old = await q1<TxRow>('SELECT * FROM transactions WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId], c);
    if (!old) throw E.notFound();
    const symbol = patch.symbol ?? old.symbol;
    const side = patch.side ?? old.side;
    const tradeDate = patch.tradeDate ?? old.trade_date;
    const shares = patch.shares ?? old.shares;
    const price = patch.price ?? old.price;
    const valueChanged = patch.shares !== undefined || patch.price !== undefined;
    const fr = await feeAndRate(c, userId, shares, price, tradeDate, patch.feeUsd ?? (valueChanged ? null : old.fee_usd));
    const row = (await q1<TxRow>(
      `UPDATE transactions SET symbol = $3, side = $4, trade_date = $5, shares = $6, price = $7, fee_usd = $8, fx_rate = $9
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId, symbol, side, tradeDate, shares, price, fr.feeUsd, tradeDate === old.trade_date ? old.fx_rate : fr.fxRate], c))!;
    // ล็อกตามลำดับชื่อย่อเพื่อเลี่ยง deadlock
    const syms = [...new Set([old.symbol, symbol])].sort();
    const out: Record<string, ReturnType<typeof holdingOut>> = {};
    for (const s of syms) out[s] = holdingOut(s, await recomputeHolding(c, userId, s));
    return { transaction: txOut(row), holding: out[symbol] };
  });
}

export async function deleteTransaction(userId: number, id: string) {
  parseId(id);
  return tx(async (c) => {
    const old = await q1<TxRow>('DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId], c);
    if (!old) throw E.notFound();
    const st = await recomputeHolding(c, userId, old.symbol);
    return { ok: true, transaction: txOut(old), holding: holdingOut(old.symbol, st) };
  });
}
