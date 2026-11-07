// ค้นหาหุ้นและข้อมูลพื้นฐาน (FR-01, FR-02, FR-03, FR-07, FR-08 · BR-01 · D-14)
import { pool, q, q1, type Db } from '@/lib/db';
import { StockNotFound } from '@/lib/feed';
import type { Lang } from '@/lib/http';

export const SEARCH_LIMIT = 10;

export type StockRow = {
  symbol: string; name: string; exchange: 'NYSE' | 'NASDAQ' | 'OTC'; exchange_label: string;
  kind: 'stock' | 'etf' | 'reit'; status: 'listed' | 'delisted';
  pe: string | null; div_yield_pct: string | null; market_cap_usd: string | null; fundamentals_date: string | null;
};

export type SearchResult = { symbol: string; name: string; exchange: string; exchangeLabel: string; kind: string };
export type SearchNotice = { code: 'OTC_NOT_SUPPORTED' | 'NOT_FOUND'; message: string };

const COLS = `symbol, name, exchange, exchange_label, kind, status, pe, div_yield_pct, market_cap_usd,
  fundamentals_date::text AS fundamentals_date`;

/** ชื่อย่อแบบเทียบได้: ตัวพิมพ์ใหญ่ · `-` = `.` · ตัดช่องว่าง (FR-01) */
export const normSymbol = (s: string) => s.trim().toUpperCase().replace(/-/g, '.');

export const NOTICE = {
  otc: { th: 'ไม่รองรับหุ้นนอกตลาด NYSE / NASDAQ', en: 'OTC stocks are not supported (NYSE / NASDAQ only)' },
  notFound: { th: 'ไม่พบหุ้นนี้', en: 'Stock not found' },
} as const;

/**
 * ลำดับผลค้นหา (D-14): 0 ชื่อย่อตรงทั้งคำ · 1 ชื่อย่อขึ้นต้นด้วย · 2 ชื่อบริษัทขึ้นต้นด้วย · 3 ชื่อบริษัทมีคำค้น
 * คืน null ถ้าไม่ตรงเลย
 */
export function matchRank(query: string, row: Pick<StockRow, 'symbol' | 'name'>): number | null {
  const qs = normSymbol(query);
  const qn = query.trim().toLowerCase();
  if (!qs) return null;
  const sym = normSymbol(row.symbol);
  const name = row.name.toLowerCase();
  if (sym === qs) return 0;
  if (sym.startsWith(qs)) return 1;
  if (name.startsWith(qn)) return 2;
  if (name.includes(qn)) return 3;
  return null;
}

/** เรียงผลตามกฎ D-14 · เท่ากันเรียงชื่อย่อ A–Z · สูงสุด limit ตัว (ฟังก์ชันล้วน ไม่แตะฐานข้อมูล) */
export function rankStocks<T extends Pick<StockRow, 'symbol' | 'name'>>(query: string, rows: T[], limit = SEARCH_LIMIT): T[] {
  return rows
    .map((r) => ({ r, k: matchRank(query, r) }))
    .filter((x): x is { r: T; k: number } => x.k !== null)
    .sort((a, b) => a.k - b.k || (a.r.symbol < b.r.symbol ? -1 : a.r.symbol > b.r.symbol ? 1 : 0))
    .slice(0, limit)
    .map((x) => x.r);
}

/** GET /api/stocks?q= · ไม่รวม OTC และหุ้นที่ถูกถอด (BR-01, FR-02) */
export async function searchStocks(query: string, lang: Lang, db: Db = pool):
  Promise<{ results: SearchResult[]; notice: SearchNotice | null }> {
  const qs = normSymbol(query ?? '');
  if (!qs) return { results: [], notice: null };
  const all = await q<StockRow>(`SELECT ${COLS} FROM stocks ORDER BY symbol`, [], db);
  const ok = all.filter((s) => s.exchange !== 'OTC' && s.status === 'listed');
  const results = rankStocks(query, ok).map((s) => ({
    symbol: s.symbol, name: s.name, exchange: s.exchange, exchangeLabel: s.exchange_label, kind: s.kind,
  }));
  const otc = all.filter((s) => s.exchange === 'OTC');
  // ค้นชื่อย่อ OTC ตรงตัว → notice OTC · ไม่มีผลแต่ชื่อบริษัท OTC ตรง → notice OTC เช่นกัน
  const otcExact = otc.some((s) => normSymbol(s.symbol) === qs);
  const otcAny = otcExact || (results.length === 0 && rankStocks(query, otc).length > 0);
  let notice: SearchNotice | null = null;
  if (otcAny) notice = { code: 'OTC_NOT_SUPPORTED', message: NOTICE.otc[lang] };
  else if (results.length === 0) notice = { code: 'NOT_FOUND', message: NOTICE.notFound[lang] };
  return { results, notice };
}

/** หาหุ้นจากชื่อย่อ (ไม่สนตัวพิมพ์ · `-` = `.`) · ไม่พบ / OTC → StockNotFound (handle() ตอบ 404) · หุ้นถูกถอดคืนได้ */
export async function findStock(symbol: string, db: Db = pool): Promise<StockRow> {
  const s = await q1<StockRow>(
    `SELECT ${COLS} FROM stocks WHERE upper(replace(symbol, '-', '.')) = $1`, [normSymbol(symbol ?? '')], db);
  if (!s) throw new StockNotFound(symbol, false);
  if (s.exchange === 'OTC') throw new StockNotFound(s.symbol, true);
  return s;
}

/** รูปข้อมูลพื้นฐานตามสัญญา · ค่าที่ไม่มีเป็น null */
export function stockInfo(s: StockRow) {
  return {
    symbol: s.symbol, name: s.name, exchange: s.exchange, exchangeLabel: s.exchange_label, kind: s.kind,
    status: s.status, pe: s.pe, divYieldPct: s.div_yield_pct, marketCapUsd: s.market_cap_usd,
    fundamentalsDate: s.fundamentals_date,
  };
}
