// แผน DCA และรายการรอยืนยัน (FR-33, FR-34 · BR-44, BR-45 · D-04, D-05, D-10, D-20 · flow-dca · seq-dca)
import { q, q1, tx, PG, pgCode } from '@/lib/db';
import { now as clockNow, ny } from '@/lib/clock';
import { rateForDate } from '@/lib/fx';
import { sessionClose } from '@/lib/market';
import { closeOn } from '@/lib/prices';
import { D, s2, s4 } from '@/lib/money';
import { E } from '@/lib/http';
import { dcaCompute, dcaTradeDate, monthsBetween, validMoney } from './calc';
import { PE } from './errors';
import { holdingOut, recomputeHolding, recordTransaction, resolveStock, type NewTx } from './service';

type PlanRow = {
  id: number; user_id: number; symbol: string; amount_thb: string; day_of_month: number; active: boolean; created_at: Date;
  resumed_at: Date | null;
};
type PendingRow = {
  id: number; plan_id: number; user_id: number; symbol: string; trade_date: string; close_price: string; fx_rate: string;
  usd_amount: string; fee_usd: string; shares: string; status: 'pending' | 'confirmed' | 'skipped';
  transaction_id: number | null; created_at: Date;
};

export const pendingOut = (p: PendingRow) => ({
  id: Number(p.id), planId: p.plan_id, symbol: p.symbol, tradeDate: p.trade_date, closePrice: s4(p.close_price),
  fxRate: s4(p.fx_rate), usdAmount: s2(p.usd_amount), feeUsd: s2(p.fee_usd),
  investUsd: s2(D(p.usd_amount).minus(p.fee_usd)), shares: s4(p.shares), status: p.status,
});

async function closedDays(): Promise<Set<string>> {
  const rows = await q<{ ny_date: string }>("SELECT ny_date FROM market_calendar WHERE status = 'closed'");
  return new Set(rows.map((r) => r.ny_date));
}

/** วันซื้อของรอบถัดไปที่ยังไม่ปิด (สำหรับแสดง) */
async function nextTradeDate(p: PlanRow, at: Date, closed: Set<string>): Promise<string> {
  const [y, m] = ny(at).date.slice(0, 7).split('-').map(Number);
  const ym = (k: number) => {
    const t = y * 12 + (m - 1) + k;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  };
  for (let k = 0; k < 3; k++) {
    const d = dcaTradeDate(ym(k), p.day_of_month, closed);
    if ((await sessionClose(d)) > at) return d;
  }
  return dcaTradeDate(ym(1), p.day_of_month, closed);
}

const planOut = async (p: PlanRow & { name?: string }, at: Date, closed: Set<string>) => ({
  id: p.id, symbol: p.symbol, name: p.name ?? null, amountThb: s2(p.amount_thb), dayOfMonth: p.day_of_month, active: p.active,
  createdAt: new Date(p.created_at).toISOString(), nextTradeDate: p.active ? await nextTradeDate(p, at, closed) : null,
});

export async function listPlans(userId: number) {
  const at = await clockNow();
  const closed = await closedDays();
  const rows = await q<PlanRow & { name: string }>(
    'SELECT p.*, s.name FROM dca_plans p JOIN stocks s ON s.symbol = p.symbol WHERE p.user_id = $1 ORDER BY p.symbol', [userId]);
  return { items: await Promise.all(rows.map((r) => planOut(r, at, closed))) };
}

function parseDay(v: unknown): number {
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 28) throw PE.dayOutOfRange();
  return n;
}
function parseAmount(v: unknown): string {
  const a = validMoney(v, false);
  if (!a || D(a).gte(1e10)) throw E.bad('จำนวนเงินต้องมากกว่า 0', 'Amount must be greater than 0');
  return a;
}

export async function createPlan(userId: number, b: Record<string, unknown>) {
  const st = await resolveStock(b.symbol);
  const amount = parseAmount(b.amountThb);
  const day = parseDay(b.dayOfMonth);
  const at = await clockNow();
  try {
    const row = (await q1<PlanRow>(
      `INSERT INTO dca_plans (user_id, symbol, amount_thb, day_of_month, active, created_at)
       VALUES ($1, $2, $3, $4, true, $5) RETURNING *`, [userId, st.symbol, amount, day, at]))!;
    return { plan: await planOut({ ...row, name: st.name }, at, await closedDays()) };
  } catch (e) {
    if (pgCode(e) === PG.UNIQUE) throw PE.planExists();
    throw e;
  }
}

/** แก้เงิน วันที่ หยุด/เปิดแผน (A-07 · มีผลกับรอบถัดไป เพราะรายการที่สร้างแล้วล็อกค่าไว้ D-20) */
export async function updatePlan(userId: number, id: string, b: Record<string, unknown>) {
  if (!/^\d+$/.test(id)) throw E.notFound();
  const amount = b.amountThb !== undefined ? parseAmount(b.amountThb) : null;
  const day = b.dayOfMonth !== undefined ? parseDay(b.dayOfMonth) : null;
  let active: boolean | null = null;
  if (b.active !== undefined) {
    if (typeof b.active !== 'boolean') throw E.bad();
    active = b.active;
  }
  const row = await q1<PlanRow>(
    `UPDATE dca_plans SET amount_thb = COALESCE($3::numeric, amount_thb), day_of_month = COALESCE($4::smallint, day_of_month),
       active = COALESCE($5::boolean, active),
       -- เปิดแผนที่หยุดไว้ใหม่ = เริ่มนับจากตอนนี้ ไม่สร้างรายการย้อนหลังของช่วงที่หยุด (A-07)
       -- เก็บใน resumed_at · created_at (วันสร้างแผน) ไม่ถูกเขียนทับ (R84)
       resumed_at = CASE WHEN $5::boolean IS TRUE AND NOT active THEN $6 ELSE resumed_at END
     WHERE id = $1 AND user_id = $2 RETURNING *`, [id, userId, amount, day, active, await clockNow()]);
  if (!row) throw E.notFound();
  const st = await q1<{ name: string }>('SELECT name FROM stocks WHERE symbol = $1', [row.symbol]);
  return { plan: await planOut({ ...row, name: st?.name }, await clockNow(), await closedDays()) };
}

export async function listPending(userId: number, all = false) {
  const rows = await q<PendingRow>(
    `SELECT * FROM dca_pending WHERE user_id = $1 ${all ? '' : "AND status = 'pending'"} ORDER BY trade_date, id`, [userId]);
  return { items: rows.map(pendingOut) };
}

async function doneError(userId: number, id: string): Promise<never> {
  const r = await q1<{ status: string }>('SELECT status FROM dca_pending WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!r) throw E.notFound();
  throw r.status === 'skipped' ? PE.alreadySkipped() : PE.alreadyConfirmed();
}

/** ยืนยัน: UPDATE … WHERE status = 'pending' ได้ 0 แถว → 409 · สำเร็จ → บันทึกรายการซื้อในทรานแซกชันเดียวกัน (seq-dca) */
export async function confirmPending(userId: number, id: string) {
  if (!/^\d+$/.test(id)) throw E.notFound();
  const at = await clockNow();
  const out = await tx(async (c) => {
    const p = await q1<PendingRow>(
      `UPDATE dca_pending SET status = 'confirmed' WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *`,
      [id, userId], c);
    if (!p) return null;
    const t: NewTx = {
      symbol: p.symbol, side: 'buy', tradeDate: p.trade_date, shares: p.shares, price: p.close_price,
      feeUsd: s2(p.fee_usd), fxRate: p.fx_rate, source: 'dca', amountUsd: s2(p.usd_amount),
    };
    const r = await recordTransaction(c, userId, t, at);
    const done = (await q1<PendingRow>('UPDATE dca_pending SET transaction_id = $2 WHERE id = $1 RETURNING *',
      [p.id, r.transaction.id], c))!;
    // มีรายการวันหลังกว่า → recordTransaction คิดใหม่ทั้งหุ้นก่อนผูก transaction_id · คิดซ้ำหลังผูกให้ต้นทุนใช้เงินตามรายการรอยืนยัน
    const later = await q1('SELECT 1 FROM transactions WHERE user_id = $1 AND symbol = $2 AND id <> $3 AND trade_date > $4 LIMIT 1',
      [userId, p.symbol, r.transaction.id, p.trade_date], c);
    if (later) return { item: pendingOut(done), ...r, holding: holdingOut(p.symbol, await recomputeHolding(c, userId, p.symbol)) };
    return { item: pendingOut(done), ...r };
  });
  if (!out) return doneError(userId, id);
  return out;
}

export async function skipPending(userId: number, id: string) {
  if (!/^\d+$/.test(id)) throw E.notFound();
  const p = await q1<PendingRow>(
    `UPDATE dca_pending SET status = 'skipped' WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *`, [id, userId]);
  if (!p) return doneError(userId, id);
  return { item: pendingOut(p) };
}

/**
 * งาน dca: ทุกแผนที่เปิดอยู่ ทุกเดือนตั้งแต่สร้างแผนถึงเดือนนี้ (D-10)
 * วันกำหนดเลื่อนตาม BR-45 · สร้างเมื่อ now ≥ เวลาปิดของรอบนั้น และรอบนั้นปิดหลังสร้างแผน · มีราคาปิด
 */
export async function runDcaJob(at: Date, only?: { userId: number }) {
  const closed = await closedDays();
  const plans = await q<PlanRow & { fee_rate_pct: string; fee_min_usd: string }>(
    `SELECT p.*, u.fee_rate_pct, u.fee_min_usd FROM dca_plans p JOIN users u ON u.id = p.user_id
     WHERE p.active AND u.delete_requested_at IS NULL AND ($1::int IS NULL OR p.user_id = $1) ORDER BY p.id`,
    [only?.userId ?? null]);
  const nowMonth = ny(at).date.slice(0, 7);
  let created = 0;
  for (const p of plans) {
    // เริ่มนับจากวันสร้างแผน หรือวันที่เปิดแผนใหม่ล่าสุด (ไม่สร้างรอบของช่วงที่หยุด)
    const planCreated = new Date(p.created_at);
    const createdAt = p.resumed_at && new Date(p.resumed_at) > planCreated ? new Date(p.resumed_at) : planCreated;
    for (const m of monthsBetween(ny(createdAt).date.slice(0, 7), nowMonth)) {
      const td = dcaTradeDate(m, p.day_of_month, closed);
      const closeAt = await sessionClose(td);
      if (at < closeAt || closeAt <= createdAt) continue;
      if (await q1('SELECT 1 FROM dca_pending WHERE plan_id = $1 AND trade_date = $2', [p.id, td])) continue;
      const price = await closeOn(p.symbol, td);
      if (!price) continue;
      const fx = await rateForDate(td);
      const r = dcaCompute(p.amount_thb, fx.rate, price, p.fee_rate_pct, p.fee_min_usd);
      if (r.shares.lte(0)) continue; // เงินไม่พอค่าธรรมเนียม ซื้อไม่ได้
      const ins = await q(
        `INSERT INTO dca_pending (plan_id, user_id, symbol, trade_date, close_price, fx_rate, usd_amount, fee_usd, shares, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10) ON CONFLICT (plan_id, trade_date) DO NOTHING RETURNING id`,
        [p.id, p.user_id, p.symbol, td, price, fx.rate, r.usdAmount.toFixed(2), r.feeUsd.toFixed(2), r.shares.toFixed(4), at]);
      created += ins.length;
    }
  }
  return { created };
}
