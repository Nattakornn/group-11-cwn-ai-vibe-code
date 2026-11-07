// ข้อความ 2 ภาษา แยกไฟล์ต่อโมดูล: messages/<โมดูล>.th.json / .en.json
// ฝั่งเซิร์ฟเวอร์: const t = await getT(lang, 'portfolio') · ฝั่ง client: ส่ง dict ลงไปแล้วใช้ makeT(dict)
import type { Lang } from './http';
export type { Lang };
export type Dict = Record<string, string>;

export const LANGS: Lang[] = ['th', 'en'];
export const isLang = (v: string): v is Lang => v === 'th' || v === 'en';

/** แทน {name} ด้วยค่า · ไม่มีคีย์ = คืนชื่อคีย์ (จะเห็นชัดตอนตรวจ) */
export function makeT(dict: Dict) {
  return (key: string, vars?: Record<string, string | number>) => {
    let s = dict[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

export async function getDict(lang: Lang, mod: string): Promise<Dict> {
  const { messages } = await import('@/messages');
  const m = messages[mod];
  if (!m) throw new Error(`i18n module not registered: ${mod}`);
  return m[lang];
}

export async function getT(lang: Lang, mod: string) {
  return makeT(await getDict(lang, mod));
}

/** วันที่แบบอ่านง่าย: 6 พ.ย. 2569 / 6 Nov 2026 */
export function fmtDate(date: string, lang: Lang): string {
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}
/** เวลาไทย HH:mm น. ของ ISO */
export function fmtTimeTh(iso: string, lang: Lang): string {
  const t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Bangkok' }).format(new Date(iso));
  return lang === 'th' ? `${t} น.` : t;
}
/** วันที่ + เวลาไทย */
export function fmtDateTimeTh(iso: string, lang: Lang): string {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(iso));
  return `${fmtDate(d, lang)} ${fmtTimeTh(iso, lang)}`;
}
