// ปันผล (FR-36–FR-38 · BR-48, BR-49 · D-11 · flow-dividend)
import { q } from '@/lib/db';
import { now as clockNow, thaiDate } from '@/lib/clock';
import { rateForDate } from '@/lib/fx';
import { D, s2, s4 } from '@/lib/money';
import { E } from '@/lib/http';
import { dividendCompute, eligibleShares, type Split } from './calc';
import { splitsOf } from './service';

type DivRow = { id: number; symbol: string; xd_date: string; pay_date: string; amount_per_share: string };
type TxMini = { user_id: number; symbol: string; side: 'buy' | 'sell'; trade_date: string; shares: string };

/** ปฏิทินเดือน YYYY-MM (ไม่ส่ง = เดือนไทยของวันนี้): หุ้นในพอร์ตและรายการเฝ้าดูที่มีวัน XD หรือวันจ่ายในเดือนนั้น */
export async function dividendCalendar(userId: number, monthIn: string | null) {
  const month = monthIn ?? thaiDate(await clockNow()).slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw E.bad();
  const rows = await q<DivRow & { name: string }>(
    `SELECT d.*, s.name FROM dividends d JOIN stocks s ON s.symbol = d.symbol
     WHERE (to_char(d.xd_date, 'YYYY-MM') = $2 OR to_char(d.pay_date, 'YYYY-MM') = $2)
       AND d.symbol IN (
         SELECT symbol FROM holdings WHERE user_id = $1 AND shares > 0
         UNION SELECT symbol FROM watchlist_items WHERE user_id = $1
         UNION SELECT symbol FROM transactions WHERE user_id = $1)
     ORDER BY d.xd_date, d.symbol`, [userId, month]);
  const items = [];
  for (const r of rows) {
    const txs = await q<TxMini>(
      'SELECT user_id, symbol, side, trade_date, shares FROM transactions WHERE user_id = $1 AND symbol = $2', [userId, r.symbol]);
    const held = eligibleShares(txs, r.xd_date, await splitsOf(r.symbol));
    items.push({
      symbol: r.symbol, name: r.name, xdDate: r.xd_date, payDate: r.pay_date, amountPerShare: s4(r.amount_per_share),
      sharesHeld: s4(held),
    });
  }
  // แสดงเฉพาะหุ้นที่ยังอยู่ในพอร์ต/เฝ้าดู หรือมีสิทธิ์ (หุ้นที่ขายหมดก่อน XD และไม่ได้เฝ้าดูไม่ต้องแสดง)
  const inList = new Set((await q<{ symbol: string }>(
    `SELECT symbol FROM holdings WHERE user_id = $1 AND shares > 0 UNION SELECT symbol FROM watchlist_items WHERE user_id = $1`,
    [userId])).map((r) => r.symbol));
  return { month, items: items.filter((i) => inList.has(i.symbol) || D(i.sharesHeld).gt(0)) };
}

type ReceiptRow = {
  symbol: string; pay_date: string; shares: string; gross_usd: string; tax_usd: string; net_usd: string; fx_rate: string; net_thb: string;
};

export async function dividendsReceived(userId: number) {
  const rows = await q<ReceiptRow>(
    'SELECT * FROM dividend_receipts WHERE user_id = $1 ORDER BY pay_date DESC, symbol', [userId]);
  const monthly = new Map<string, { netUsd: ReturnType<typeof D>; netThb: ReturnType<typeof D> }>();
  let totalUsd = D(0), totalThb = D(0);
  for (const r of rows) {
    const m = r.pay_date.slice(0, 7);
    const cur = monthly.get(m) ?? { netUsd: D(0), netThb: D(0) };
    monthly.set(m, { netUsd: cur.netUsd.plus(r.net_usd), netThb: cur.netThb.plus(r.net_thb) });
    totalUsd = totalUsd.plus(r.net_usd);
    totalThb = totalThb.plus(r.net_thb);
  }
  return {
    items: rows.map((r) => ({
      symbol: r.symbol, payDate: r.pay_date, shares: s4(r.shares), grossUsd: s2(r.gross_usd), taxUsd: s2(r.tax_usd),
      netUsd: s2(r.net_usd), fxRate: s4(r.fx_rate), netThb: s2(r.net_thb),
    })),
    monthly: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, netUsd: s2(v.netUsd), netThb: s2(v.netThb) })),
    totalNetUsd: s2(totalUsd),
    totalNetThb: s2(totalThb),
  };
}

/** งาน dividends: วันไทยของ now ≥ วันจ่าย → บันทึกให้ทุกคนที่ถือก่อนวัน XD (ON CONFLICT DO NOTHING) */
export async function runDividendJob(at: Date, only?: { userId: number }) {
  const today = thaiDate(at);
  const divs = await q<DivRow>('SELECT * FROM dividends WHERE pay_date <= $1 ORDER BY pay_date, id', [today]);
  let created = 0;
  for (const d of divs) {
    const txs = await q<TxMini>(
      `SELECT t.user_id, t.symbol, t.side, t.trade_date, t.shares FROM transactions t
       WHERE t.symbol = $1 AND t.trade_date < $2 AND ($4::int IS NULL OR t.user_id = $4)
         AND NOT EXISTS (SELECT 1 FROM dividend_receipts r WHERE r.user_id = t.user_id AND r.dividend_id = $3)
       ORDER BY t.user_id, t.trade_date, t.id`, [d.symbol, d.xd_date, d.id, only?.userId ?? null]);
    if (txs.length === 0) continue;
    const splits: Split[] = await splitsOf(d.symbol);
    const byUser = new Map<number, TxMini[]>();
    for (const t of txs) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t]);
    const fx = await rateForDate(d.pay_date);
    for (const [userId, list] of byUser) {
      const shares = eligibleShares(list, d.xd_date, splits);
      if (shares.lte(0)) continue;
      const c = dividendCompute(shares, d.amount_per_share, fx.rate);
      const ins = await q(
        `INSERT INTO dividend_receipts (user_id, dividend_id, symbol, pay_date, shares, gross_usd, tax_usd, net_usd, fx_rate, net_thb)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (user_id, dividend_id) DO NOTHING RETURNING id`,
        [userId, d.id, d.symbol, d.pay_date, shares.toFixed(4), c.grossUsd.toFixed(2), c.taxUsd.toFixed(2),
          c.netUsd.toFixed(2), fx.rate, c.netThb.toFixed(2)]);
      created += ins.length;
    }
  }
  return { created };
}
