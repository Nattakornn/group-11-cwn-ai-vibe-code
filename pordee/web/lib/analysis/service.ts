// งานวิเคราะห์ที่ต่อฐานข้อมูล (A5) · route เรียกฟังก์ชันในไฟล์นี้อย่างเดียว
import { q } from '@/lib/db';
import { adjustedCloses, dailyBars, lastCloseOnOrBefore } from '@/lib/prices';
import { sessionClose } from '@/lib/market';
import { thaiDate } from '@/lib/clock';
import { ApiError, E, type Lang } from '@/lib/http';
import { D, maxDecimals } from '@/lib/money';
import { SOURCE } from '@/lib/feed';
import type { UserRow } from '@/lib/session';
import { computeIndicators, type IndicatorResult } from './indicators';
import { buildSummary, checkSummary } from './summary';
import {
  backtest, BACKTEST_MAX_MONTHS, COMPARE_MAX, COMPARE_MIN, compareSeries, isMonth, monthList, monthsInclusive,
  screen, type BacktestResult, type ScreenerFilter, type ScreenerSort,
} from './calc';
import { findStock, normSymbol, resolveRange, saveHistory, viewer, type Viewer } from './common';

// ---------- ตัวชี้วัด ----------

export async function indicatorsFor(symbol: string, fromIn: unknown, toIn: unknown, v?: Viewer):
  Promise<{ symbol: string; from: string; to: string } & IndicatorResult> {
  const st = await findStock(symbol);
  const vw = v ?? (await viewer());
  const { from, to } = resolveRange(vw, fromIn, toIn);
  const closes = await adjustedCloses(st.symbol, vw.lastClosed); // T-07: เฉพาะรอบที่ปิดแล้ว
  return { symbol: st.symbol, from, to, ...computeIndicators(closes, from, to) };
}

// ---------- สรุป AI ----------

export async function summaryFor(symbol: string, lang: Lang): Promise<{ symbol: string; lines: string[]; asOf: string | null; lang: Lang }> {
  const st = await findStock(symbol);
  const vw = await viewer(null);
  const closes = await adjustedCloses(st.symbol, vw.lastClosed);
  const ind = computeIndicators(closes);
  const last = closes[closes.length - 1] ?? null;
  const prev = closes[closes.length - 2] ?? null;
  const lines = buildSummary({
    symbol: st.symbol, delisted: st.status === 'delisted', closes: closes.length,
    lastDate: last?.date ?? null, lastClose: last?.close ?? null, prevClose: prev?.close ?? null,
    sma50: ind.latest.sma50, sma200: ind.latest.sma200, rsi14: ind.latest.rsi14, rsiLabel: ind.latest.rsiLabel,
    crossToday: last ? ind.crosses.find((c) => c.date === last.date)?.kind ?? null : null,
  }, lang);
  // flow-study AI2: ไม่ผ่าน → ไม่แสดง (ต้องไม่เกิดจริง)
  if (!checkSummary(lines, lang)) throw new ApiError(500, 'SUMMARY_UNAVAILABLE', 'สรุปไม่พร้อมใช้งาน', 'Summary is unavailable');
  return { symbol: st.symbol, lines, asOf: last ? (await sessionClose(last.date)).toISOString() : null, lang };
}

// ---------- คัดกรอง ----------

const NUM_RE = /^\d+(\.\d+)?$/;
function optNum(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!NUM_RE.test(s)) throw E.bad();
  return s;
}

export async function runScreener(b: Record<string, unknown>) {
  const f: ScreenerFilter = { peMax: optNum(b.peMax), divMin: optNum(b.divMin), capMinUsd: optNum(b.capMinUsd), capMaxUsd: optNum(b.capMaxUsd) };
  const sort = b.sort ?? 'symbol';
  const dir = b.dir ?? 'asc';
  if (!['symbol', 'pe', 'div', 'cap'].includes(String(sort)) || !['asc', 'desc'].includes(String(dir))) throw E.bad();
  const rows = await q<{ symbol: string; name: string; exchange_label: string; pe: string | null; div_yield_pct: string | null; market_cap_usd: string | null }>(
    `SELECT symbol, name, exchange_label, pe, div_yield_pct, market_cap_usd FROM stocks
     WHERE exchange <> 'OTC' AND status = 'listed'`);
  const mapped = rows.map((r) => ({
    symbol: r.symbol, name: r.name, exchangeLabel: r.exchange_label,
    pe: r.pe, divYieldPct: r.div_yield_pct, marketCapUsd: r.market_cap_usd,
  }));
  return { results: screen(mapped, f, { sort: sort as ScreenerSort['sort'], dir: dir as ScreenerSort['dir'] }) };
}

// ---------- เทียบหุ้น ----------

export const compareCountError = () => new ApiError(400, 'COMPARE_COUNT', 'เทียบได้ 2–4 ตัว', 'Compare 2–4 stocks');

export async function runCompare(b: Record<string, unknown>) {
  if (!Array.isArray(b.symbols)) throw compareCountError();
  const syms = [...new Set(b.symbols.map(normSymbol).filter((s) => s !== ''))];
  if (syms.length < COMPARE_MIN || syms.length > COMPARE_MAX) throw compareCountError();
  const vw = await viewer();
  const stocks = [];
  for (const s of syms) stocks.push(await findStock(s));
  const { from, to } = resolveRange(vw, b.from, b.to);
  const series: { symbol: string; points: { date: string; pct: string }[] }[] = [];
  for (const st of stocks) {
    const bars = await dailyBars(st.symbol, from, to, true);
    series.push({ symbol: st.symbol, points: compareSeries(bars.map((x) => ({ date: x.date, close: x.close }))) });
  }
  const final = series.map((s) => ({ symbol: s.symbol, pct: s.points.length ? s.points[s.points.length - 1].pct : null }));
  if (vw.user) await saveHistory(vw.user.id, 'compare', { symbols: stocks.map((s) => s.symbol), from, to }, vw.now);
  return { from, to, series, final };
}

// ---------- ลองเทียบ DCA ----------

export const rangeTooLong = () =>
  new ApiError(400, 'RANGE_TOO_LONG', 'ลองเทียบได้ไม่เกิน 120 เดือน', 'Backtests are limited to 120 months');

export const monthNotComplete = (thisMonth: string) =>
  new ApiError(400, 'MONTH_NOT_COMPLETE', `เดือน ${thisMonth} ยังไม่จบ เลือกเดือนสุดท้ายได้ถึงเดือนก่อนหน้า`,
    `${thisMonth} is not over yet. Choose an end month before it.`, { field: 'toMonth' });

export async function runBacktest(user: UserRow, b: Record<string, unknown>):
  Promise<BacktestResult & { symbol: string; fromMonth: string; toMonth: string; monthlyUsd: string; valuedAt: string; priceUsed: string }> {
  const vw = await viewer(user);
  if (vw.tier !== 'pro') throw E.proOnly();
  const monthly = typeof b.monthlyUsd === 'number' ? String(b.monthlyUsd) : typeof b.monthlyUsd === 'string' ? b.monthlyUsd.trim() : '';
  if (!maxDecimals(monthly, 2) || !D(monthly).gt(0)) {
    throw E.bad('จำนวนเงินต่อเดือนต้องมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง', 'Monthly amount must be greater than 0 with at most 2 decimal places');
  }
  if (!isMonth(b.fromMonth) || !isMonth(b.toMonth) || b.fromMonth > b.toMonth) throw E.bad();
  const fromMonth = b.fromMonth, toMonth = b.toMonth;
  if (monthsInclusive(fromMonth, toMonth) > BACKTEST_MAX_MONTHS) throw rangeTooLong(); // ตรวจจำนวนเดือนเท่านั้น
  // R96 · สมมติฐาน 8.2 #6: เดือนที่ยังไม่จบ (เดือนปัจจุบันตามวันไทยขึ้นไป) ลองเทียบไม่ได้ เพราะผลจะเปลี่ยนทุกวัน
  const thisMonth = thaiDate(vw.now).slice(0, 7);
  if (toMonth >= thisMonth) throw monthNotComplete(thisMonth);
  const st = await findStock(b.symbol);

  // ราคาปิดปรับของวันทำการแรกของแต่ละเดือน (เฉพาะรอบที่ปิดแล้ว)
  const [ty, tm] = toMonth.split('-').map(Number);
  const endOfTo = `${toMonth}-${String(new Date(Date.UTC(ty, tm, 0)).getUTCDate()).padStart(2, '0')}`;
  const bars = await dailyBars(st.symbol, `${fromMonth}-01`, endOfTo < vw.lastClosed ? endOfTo : vw.lastClosed, true);
  const firstOfMonth = new Map<string, string>();
  for (const x of bars) { const m = x.date.slice(0, 7); if (!firstOfMonth.has(m)) firstOfMonth.set(m, x.close); }
  const buys: string[] = [];
  for (const m of monthList(fromMonth, toMonth)) {
    const p = firstOfMonth.get(m);
    if (!p) throw new ApiError(400, 'INVALID_INPUT', `ไม่มีราคาของ ${st.symbol} ในเดือน ${m}`, `No ${st.symbol} price data for ${m}`, { month: m });
    buys.push(p);
  }
  // มูลค่าที่ราคาปิดรอบล่าสุด (ปรับแตกพาร์)
  const lastRaw = await lastCloseOnOrBefore(st.symbol, vw.lastClosed);
  if (!lastRaw) throw E.bad();
  const lastBar = (await dailyBars(st.symbol, lastRaw.trade_date, lastRaw.trade_date, true))[0];
  const r = backtest(buys, monthly, lastBar.close);
  await saveHistory(user.id, 'backtest', { symbol: st.symbol, monthlyUsd: D(monthly).toFixed(2), fromMonth, toMonth }, vw.now);
  return { symbol: st.symbol, fromMonth, toMonth, monthlyUsd: D(monthly).toFixed(2), ...r, valuedAt: lastBar.date, priceUsed: lastBar.close };
}

// ---------- CSV ----------

export const CSV_DISCLAIMER = {
  th: 'ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน',
  en: 'For educational purposes only. Not investment advice.',
} as const;

const csvCell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export async function exportCsv(user: UserRow, symbolIn: unknown, fromIn: unknown, toIn: unknown, adjustedIn: unknown, lang: Lang) {
  const vw = await viewer(user);
  if (vw.tier !== 'pro') throw E.proOnly();
  if (!symbolIn) throw E.bad();
  const st = await findStock(symbolIn);
  const { from, to } = resolveRange(vw, fromIn, toIn);
  const adjusted = adjustedIn !== '0' && adjustedIn !== 'false';
  const bars = await dailyBars(st.symbol, from, to, adjusted);
  const lines = [
    `# Source: ${SOURCE}`,
    `# ${CSV_DISCLAIMER[lang]}`,
    'date,open,high,low,close,volume',
    ...bars.map((x) => [x.date, x.open, x.high, x.low, x.close, String(x.volume)].map(csvCell).join(',')),
  ];
  return {
    filename: `${st.symbol}_${from}_${to}${adjusted ? '' : '_actual'}.csv`,
    body: '﻿' + lines.join('\n') + '\n',
  };
}
