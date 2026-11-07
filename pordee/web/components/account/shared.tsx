// F7 บัญชี · ของที่ใช้ร่วมกันใน login / signup / account
import type { Dict, Lang } from '@/lib/i18n';
import { makeT } from '@/lib/i18n';
import s from './account.module.css';

/** รับเฉพาะ path ภายในเว็บ (กัน open redirect) · ไม่ผ่าน = หน้าพอร์ต */
export function safeNext(next: string | undefined | null, lang: Lang): string {
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') && !next.startsWith('/api/')) return next;
  return `/${lang}/portfolio`;
}

/** วันที่ 'YYYY-MM-DD' + n วัน (คิดตามปฏิทิน ไม่เกี่ยวกับ "ตอนนี้") */
export function plusDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 9v5M10 6.2v.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** แผงซ้ายของหน้า login / signup: ภาพประกอบ SVG ที่เขียนเอง + จุดเด่น 3 ข้อ */
export function AuthArt({ dict }: { dict: Dict }) {
  const t = makeT(dict);
  return (
    <aside className={s.art} aria-hidden="false">
      <p className={s.artTitle}>{t('art.title')}</p>
      <svg className={s.artSvg} viewBox="0 0 360 200" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="f7area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#34c79d" stopOpacity=".35" />
            <stop offset="1" stopColor="#34c79d" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="8" y="10" width="344" height="180" rx="16" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.12)" />
        {[50, 90, 130, 170].map((y) => <line key={y} x1="24" x2="336" y1={y} y2={y} stroke="rgba(255,255,255,.08)" />)}
        <path d="M24 150 L64 138 L100 146 L140 112 L178 120 L214 88 L252 98 L292 62 L336 48 L336 180 L24 180 Z" fill="url(#f7area)" />
        <path d="M24 150 L64 138 L100 146 L140 112 L178 120 L214 88 L252 98 L292 62 L336 48" fill="none" stroke="#34c79d" strokeWidth="3"
          strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="336" cy="48" r="5" fill="#fff" />
        <g transform="translate(40 34)">
          <rect width="112" height="40" rx="10" fill="rgba(255,255,255,.1)" />
          <rect x="12" y="12" width="40" height="6" rx="3" fill="rgba(255,255,255,.55)" />
          <rect x="12" y="24" width="64" height="5" rx="2.5" fill="#d8b25a" />
        </g>
        <g transform="translate(300 140)">
          <circle r="26" fill="#b58a2e" />
          <circle r="19" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2" />
          <path d="M-6 -9 h8 a5 5 0 0 1 0 10 h-8 h9 a5 5 0 0 1 0 10 h-9 Z M-3 -13 v26" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
        </g>
      </svg>
      <ul className={s.artList}>
        <li>{t('art.p1')}</li>
        <li>{t('art.p2')}</li>
        <li>{t('art.p3')}</li>
      </ul>
    </aside>
  );
}
