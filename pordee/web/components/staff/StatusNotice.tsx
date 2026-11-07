// การ์ดแจ้งสถานะแบบเต็มหน้า (401 / 403 / 404 / error) พร้อมภาพประกอบ SVG ที่เขียนเอง · F8
import type { ReactNode } from 'react';
import s from './staff.module.css';

export type NoticeKind = 'login' | 'forbidden' | 'notfound' | 'error';

export function NoticeArt({ kind }: { kind: NoticeKind }) {
  const grid = [50, 95, 140, 185].map((y) => <line key={y} x1="20" x2="300" y1={y} y2={y} className={s.artGrid} strokeWidth="1" />);
  return (
    <svg viewBox="0 0 320 220" className={s.noticeArt} aria-hidden="true" focusable="false">
      {grid}
      {kind === 'notfound' && (
        <>
          <path d="M20 170 L60 150 L95 158 L130 120 L160 128" className={s.artLine} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M160 128 L200 128 L240 128" className={s.artGold} strokeWidth="3" strokeDasharray="4 8" strokeLinecap="round" />
          <circle cx="160" cy="128" r="6" className={s.artDot} />
          <text x="236" y="96" textAnchor="middle" className={s.artText} fontSize="46">404</text>
          <circle cx="262" cy="150" r="18" className={s.artGold} strokeWidth="4" />
          <line x1="275" y1="163" x2="292" y2="180" className={s.artGold} strokeWidth="5" strokeLinecap="round" />
        </>
      )}
      {kind === 'error' && (
        <>
          <path d="M20 160 L60 140 L95 150 L130 110 L150 118" className={s.artLine} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M150 118 L165 90 L178 140 L192 100 L205 128" className={s.artBrick} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M205 128 L245 112 L295 82" className={s.artGold} strokeWidth="3" strokeDasharray="4 8" strokeLinecap="round" />
          <circle cx="295" cy="82" r="6" className={s.artDot} />
          <path d="M248 40 a20 20 0 1 1 -6 14" className={s.artGold} strokeWidth="4" strokeLinecap="round" />
          <path d="M240 44 L242 56 L254 53" className={s.artGold} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {(kind === 'login' || kind === 'forbidden') && (
        <>
          <path d="M20 170 L60 150 L95 158 L130 122 L170 132 L210 96 L300 70" className={s.artLine} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 170 L60 150 L95 158 L130 122 L170 132 L210 96 L300 70 L300 200 L20 200 Z" className={s.artFill} opacity=".55" />
          <rect x="196" y="112" width="72" height="62" rx="12" className={`${kind === 'forbidden' ? s.artBrick : s.artGold} ${s.artLock}`} strokeWidth="4" />
          <path d="M210 112 v-14 a22 22 0 0 1 44 0 v14" className={kind === 'forbidden' ? s.artBrick : s.artGold} strokeWidth="4" strokeLinecap="round" />
          <circle cx="232" cy="140" r="6" className={s.artDot} />
          <line x1="232" y1="146" x2="232" y2="158" className={s.artGold} strokeWidth="4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function StatusNotice({ kind, code, title, body, children, testId, titleTestId, bodyTestId }: {
  kind: NoticeKind; code?: string; title: string; body: ReactNode; children?: ReactNode;
  testId: string; titleTestId?: string; bodyTestId?: string;
}) {
  return (
    <div className={`card card-gold fade-in ${s.notice}`} data-testid={testId} role={kind === 'error' ? 'alert' : undefined}>
      <NoticeArt kind={kind} />
      <div>
        {code && <div className={s.noticeCode}>{code}</div>}
        <h1 className={s.noticeTitle} data-testid={titleTestId}>{title}</h1>
        <p className={s.noticeBody} data-testid={bodyTestId}>{body}</p>
        {children}
      </div>
    </div>
  );
}
