// กฎตัดสินของแจ้งเตือน (ฟังก์ชันบริสุทธิ์ ไม่แตะฐานข้อมูล) · flow-alert ใน DESIGN
// BR-33, BR-34 (5% ด้วยค่าจริง D-01) · BR-36 (ราคาเป้าหมาย A-32) · BR-37 (ช่วงเงียบ [เริ่ม, จบ) ข้ามเที่ยงคืนได้)
import { D, fmtPct, fmtUsd } from '../money';
import { fmtDateTimeTh, type Lang } from '../i18n';

export const PCT_THRESHOLD = '5';

/** |% เปลี่ยน| ≥ 5 ด้วยค่าจริง ไม่ปัด (4.995 ไม่ถึง) */
export function pctHit(changePct: string | null | undefined): boolean {
  if (changePct === null || changePct === undefined || changePct === '') return false;
  return D(changePct).abs().gte(PCT_THRESHOLD);
}

export type Direction = 'up' | 'down';

/** ทิศทางของราคาเป้าหมาย: เป้าสูงกว่าราคาตอนตั้ง = up ไม่งั้น down (A-32) */
export function directionFor(target: string, currentPrice: string | null | undefined): Direction {
  if (currentPrice === null || currentPrice === undefined) return 'up';
  return D(target).gt(currentPrice) ? 'up' : 'down';
}

/** ถึงหรือผ่านเป้าตามทิศทาง (BR-36) */
export function targetHit(direction: Direction, target: string, price: string | null | undefined): boolean {
  if (price === null || price === undefined) return false;
  return direction === 'up' ? D(price).gte(target) : D(price).lte(target);
}

export type AlertLike = { kind: 'pct' | 'target'; target_price: string | null; direction: Direction | null; active: boolean };
export type QuoteLike = { price: string | null; changePct: string | null; stale: boolean; status?: 'listed' | 'delisted' };

/** ตัดสินแจ้งเตือน 1 รายการกับราคา 1 ค่า · stale / ไม่มีราคา / ถูกถอด = ไม่ประเมิน (D-02) */
export function shouldTrigger(a: AlertLike, quote: QuoteLike): boolean {
  if (!a.active) return false;
  if (quote.stale || quote.price === null || quote.status === 'delisted') return false;
  if (D(quote.price).lte(0)) return false;
  if (a.kind === 'pct') return pctHit(quote.changePct);
  if (!a.target_price || !a.direction) return false;
  return targetHit(a.direction, a.target_price, quote.price);
}

/** 'HH:mm' หรือ 'HH:mm:ss' -> วินาทีนับจากเที่ยงคืน · รูปแบบผิด = null */
export function toSeconds(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]), s = Number(m[3] ?? '0');
  if (h > 23 || mi > 59 || s > 59) return null;
  return h * 3600 + mi * 60 + s;
}

/** 'HH:mm' ที่ถูกต้อง (00:00–23:59) */
export const isHHmm = (v: unknown): v is string => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) && toSeconds(v) !== null;

/**
 * เวลาไทย (time 'HH:mm:ss') อยู่ในช่วงเงียบ [start, end) ไหม (BR-37)
 * start < end: start ≤ t < end · start > end (ข้ามเที่ยงคืน): t ≥ start หรือ t < end · ไม่ได้ตั้ง / เท่ากัน = ไม่เงียบ
 */
export function inQuietHours(time: string, start: string | null | undefined, end: string | null | undefined): boolean {
  const t = toSeconds(time), s = toSeconds(start), e = toSeconds(end);
  if (t === null || s === null || e === null || s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** 'HH:mm:ss' -> 'HH:mm' */
export const hhmm = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null);

// ---------- อีเมลจำลอง (FR-25) ----------
export type EmailInput = {
  lang: Lang; symbol: string; kind: 'pct' | 'target'; price: string; changePct: string | null;
  prevClose: string | null; targetPrice: string | null; triggeredAt: string /* ISO */;
};

export function emailSubject(e: EmailInput): string {
  const brand = e.lang === 'en' ? 'Pordee Port' : 'พอดีพอร์ต';
  if (e.kind === 'target') {
    const tp = fmtUsd(e.targetPrice ?? e.price);
    return e.lang === 'en' ? `${brand}: ${e.symbol} reached ${tp}` : `${brand}: ${e.symbol} แตะ ${tp}`;
  }
  return `${brand}: ${e.symbol} ${fmtPct(e.changePct ?? '0')}`;
}

export function emailBody(e: EmailInput): string {
  const at = fmtDateTimeTh(e.triggeredAt, e.lang);
  const price = fmtUsd(e.price);
  const pct = e.changePct !== null ? fmtPct(e.changePct) : null;
  const prev = e.prevClose !== null ? fmtUsd(e.prevClose) : null;
  const lines: string[] = [];
  if (e.lang === 'en') {
    if (e.kind === 'target') {
      lines.push(`${e.symbol} reached your target price of ${fmtUsd(e.targetPrice ?? e.price)}.`);
      lines.push(`Price: ${price}${pct ? ` (${pct} from the previous close${prev ? ` ${prev}` : ''})` : ''}`);
      lines.push('This target alert is now turned off.');
    } else {
      lines.push(`${e.symbol} moved ${pct} from the previous close${prev ? ` of ${prev}` : ''}.`);
      lines.push(`Price: ${price}`);
    }
    lines.push(`Time: ${at} (Thailand time)`);
    lines.push('Source: Pordee Mock Feed (delayed about 15 minutes)');
    lines.push('For educational purposes only. Not investment advice.');
  } else {
    if (e.kind === 'target') {
      lines.push(`${e.symbol} แตะราคาเป้าหมาย ${fmtUsd(e.targetPrice ?? e.price)} แล้ว`);
      lines.push(`ราคา ${price}${pct ? ` (${pct} จากราคาปิดวันก่อน${prev ? ` ${prev}` : ''})` : ''}`);
      lines.push('แจ้งเตือนราคาเป้าหมายนี้ปิดแล้ว');
    } else {
      lines.push(`${e.symbol} ราคาเปลี่ยน ${pct} จากราคาปิดวันก่อน${prev ? ` ${prev}` : ''}`);
      lines.push(`ราคา ${price}`);
    }
    lines.push(`เวลา ${at} (เวลาไทย)`);
    lines.push('ที่มา: Pordee Mock Feed (ล่าช้าประมาณ 15 นาที)');
    lines.push('ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน');
  }
  return lines.join('\n');
}
