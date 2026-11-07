// สรุปหุ้นของผู้ช่วย AI แบบแม่แบบตายตัว (FR-47, FR-48, BR-56, NFR-06, NFR-12)
// ข้อมูลเดิม = ข้อความเดิมทุกตัวอักษร · ไม่มีการสุ่ม ไม่เรียกโมเดลภายนอก
import { D, fmtPct, fmtUsd, pctChange } from '@/lib/money';
import { fmtDate, type Lang } from '@/lib/i18n';
import type { CrossKind, RsiLabel } from './indicators';

export const SUMMARY_MAX_LINES = 3;

/** คำต้องห้าม (API-CONTRACT ส่วนที่ 0 · NFR-06) ตรวจแบบไม่สนตัวพิมพ์ */
export const FORBIDDEN_WORDS = [
  'ควรซื้อ', 'ควรขาย', 'น่าซื้อ', 'น่าขาย', 'แนะนำให้ซื้อ', 'แนะนำให้ขาย',
  'should buy', 'should sell', 'recommend', 'strong buy', 'top pick',
];

export function hasForbidden(text: string): boolean {
  const t = text.toLowerCase();
  return FORBIDDEN_WORDS.some((w) => t.includes(w.toLowerCase()));
}

/** ตรวจสรุปก่อนแสดง (BR-56): 1–3 บรรทัด · ไม่มีคำต้องห้าม · ภาษาอังกฤษไม่มีอักษรไทย */
export function checkSummary(lines: string[], lang: Lang = 'th'): boolean {
  if (lines.length < 1 || lines.length > SUMMARY_MAX_LINES) return false;
  if (lines.some((l) => l.trim() === '' || l.includes('\n') || hasForbidden(l))) return false;
  if (lang === 'en' && lines.some((l) => /[฀-๿]/.test(l))) return false;
  return true;
}

export type SummaryInput = {
  symbol: string;
  delisted: boolean;
  closes: number;
  lastDate: string | null;
  lastClose: string | null;
  prevClose: string | null;
  sma50: string | null;
  sma200: string | null;
  rsi14: string | null;
  rsiLabel: RsiLabel;
  /** ป้ายตัดที่เกิดในรอบล่าสุด (ถ้ามี) */
  crossToday: CrossKind | null;
};

type Rel = 'above' | 'below' | 'equal';
const relOf = (price: string, avg: string): Rel => {
  const c = D(price).cmp(D(avg));
  return c > 0 ? 'above' : c < 0 ? 'below' : 'equal';
};

const TH_REL: Record<Rel, string> = { above: 'สูงกว่า', below: 'ต่ำกว่า', equal: 'เท่ากับ' };
const EN_REL: Record<Rel, string> = { above: 'above', below: 'below', equal: 'level with' };

export function buildSummary(x: SummaryInput, lang: Lang): string[] {
  return lang === 'en' ? buildEn(x) : buildTh(x);
}

function buildTh(x: SummaryInput): string[] {
  if (!x.lastClose || !x.lastDate) return [`${x.symbol} ยังไม่มีข้อมูลราคาปิดให้สรุป`];
  const lines: string[] = [];
  const chg = x.prevClose ? ` (${fmtPct(pctChange(x.prevClose, x.lastClose))} จากรอบก่อนหน้า)` : '';
  const del = x.delisted ? ' · หุ้นนี้หยุดซื้อขายแล้ว' : '';
  lines.push(`${x.symbol} ราคาปิดรอบ ${fmtDate(x.lastDate, 'th')} อยู่ที่ ${fmtUsd(x.lastClose)}${chg}${del}`);

  let ma: string;
  if (x.sma50 && x.sma200) {
    ma = `ราคาปิด${TH_REL[relOf(x.lastClose, x.sma50)]}เส้นค่าเฉลี่ย 50 วัน (${fmtUsd(x.sma50)}) และ${TH_REL[relOf(x.lastClose, x.sma200)]}เส้นค่าเฉลี่ย 200 วัน (${fmtUsd(x.sma200)})`;
    if (x.crossToday === 'golden') ma += ' · รอบนี้เกิดป้าย Golden Cross (เส้น 50 วันตัดขึ้นเหนือเส้น 200 วัน)';
    if (x.crossToday === 'death') ma += ' · รอบนี้เกิดป้าย Death Cross (เส้น 50 วันตัดลงใต้เส้น 200 วัน)';
  } else if (x.sma50) {
    ma = `ราคาปิด${TH_REL[relOf(x.lastClose, x.sma50)]}เส้นค่าเฉลี่ย 50 วัน (${fmtUsd(x.sma50)}) · ข้อมูลยังไม่พอสำหรับเส้น 200 วัน (มี ${x.closes} วันทำการ)`;
  } else {
    ma = `ข้อมูลยังไม่พอสำหรับเส้นค่าเฉลี่ย 50 วันและ 200 วัน (มี ${x.closes} วันทำการ)`;
  }
  lines.push(ma);

  if (x.rsi14 === null) lines.push('ข้อมูลยังไม่พอสำหรับ RSI 14 วัน (ต้องมี 15 วันทำการ)');
  else if (x.rsiLabel === 'overbought') lines.push(`RSI 14 วันอยู่ที่ ${x.rsi14} ตั้งแต่ 70 ขึ้นไป เข้าเกณฑ์ป้าย "ซื้อมากเกินไป" ของตัวชี้วัดนี้`);
  else if (x.rsiLabel === 'oversold') lines.push(`RSI 14 วันอยู่ที่ ${x.rsi14} ตั้งแต่ 30 ลงมา เข้าเกณฑ์ป้าย "ขายมากเกินไป" ของตัวชี้วัดนี้`);
  else lines.push(`RSI 14 วันอยู่ที่ ${x.rsi14} อยู่ในช่วงกลางระหว่าง 30 ถึง 70`);
  return lines;
}

function buildEn(x: SummaryInput): string[] {
  if (!x.lastClose || !x.lastDate) return [`${x.symbol} has no closing price data to summarize yet.`];
  const lines: string[] = [];
  const chg = x.prevClose ? ` (${fmtPct(pctChange(x.prevClose, x.lastClose))} from the previous session)` : '';
  const del = x.delisted ? ' This stock is no longer traded.' : '';
  lines.push(`${x.symbol} closed at ${fmtUsd(x.lastClose)} on ${fmtDate(x.lastDate, 'en')}${chg}.${del}`);

  let ma: string;
  if (x.sma50 && x.sma200) {
    ma = `The close is ${EN_REL[relOf(x.lastClose, x.sma50)]} the 50-day average (${fmtUsd(x.sma50)}) and ${EN_REL[relOf(x.lastClose, x.sma200)]} the 200-day average (${fmtUsd(x.sma200)}).`;
    if (x.crossToday === 'golden') ma += ' A Golden Cross formed in this session (the 50-day line moved above the 200-day line).';
    if (x.crossToday === 'death') ma += ' A Death Cross formed in this session (the 50-day line moved below the 200-day line).';
  } else if (x.sma50) {
    ma = `The close is ${EN_REL[relOf(x.lastClose, x.sma50)]} the 50-day average (${fmtUsd(x.sma50)}). Not enough data for the 200-day average yet (${x.closes} trading days).`;
  } else {
    ma = `Not enough data for the 50-day and 200-day averages yet (${x.closes} trading days).`;
  }
  lines.push(ma);

  if (x.rsi14 === null) lines.push('Not enough data for the 14-day RSI yet (needs 15 trading days).');
  else if (x.rsiLabel === 'overbought') lines.push(`The 14-day RSI is ${x.rsi14}, at or above 70, which meets this indicator's "overbought" label.`);
  else if (x.rsiLabel === 'oversold') lines.push(`The 14-day RSI is ${x.rsi14}, at or below 30, which meets this indicator's "oversold" label.`);
  else lines.push(`The 14-day RSI is ${x.rsi14}, within the middle range between 30 and 70.`);
  return lines;
}
