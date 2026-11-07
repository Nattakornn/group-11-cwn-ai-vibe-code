'use client';
// หน้าทีมงาน: โควตาแหล่งข้อมูล + สถานะ (FR-09, FR-60 · US-46) · ข้อมูลจาก GET /api/staff/feed-status · F8
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { makeT, fmtDateTimeTh, type Dict, type Lang } from '@/lib/i18n';
import { tid } from '@/lib/testid';
import { StatusNotice } from './StatusNotice';
import s from './staff.module.css';

type FeedStatus = {
  minuteUsed: number; minuteLimit: number; dayUsed: number; dayLimit: number;
  dayStartsAt: string | null; lastRequestAt: string | null; lastFetchAt: string | null;
  feedState: 'ok' | 'degraded';
};
type View =
  | { kind: 'loading' }
  | { kind: 'ready'; data: FeedStatus }
  | { kind: 'login'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'error'; message: string };

const P = 'staff';
const int = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : d; };
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** รับได้ทั้งรูปแบน (quotaStatus + feedState) และแบบซ้อน {quota:{...}} */
function normalize(raw: any): FeedStatus {
  const r = raw?.quota && typeof raw.quota === 'object' ? { ...raw.quota, ...raw } : raw ?? {};
  return {
    minuteUsed: int(r.minuteUsed, 0), minuteLimit: int(r.minuteLimit, 5) || 5,
    dayUsed: int(r.dayUsed, 0), dayLimit: int(r.dayLimit, 500) || 500,
    dayStartsAt: str(r.dayStartsAt), lastRequestAt: str(r.lastRequestAt), lastFetchAt: str(r.lastFetchAt),
    feedState: r.feedState === 'degraded' ? 'degraded' : 'ok',
  };
}

const level = (used: number, limit: number) => (used >= limit ? s.lvlFull : used / limit >= 0.6 ? s.lvlMid : s.lvlLow);

export default function StaffDashboard({ lang, dict }: { lang: Lang; dict: Dict }) {
  const t = makeT(dict);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setBusy(true);
    try {
      const r = await api('/api/staff/feed-status', { lang });
      if (my !== seq.current) return;
      if (r.ok) setView({ kind: 'ready', data: normalize(r.data) });
      else if (r.status === 401) setView({ kind: 'login', message: r.error?.code === 'UNAUTHORIZED' ? r.error.message : t('loginRequired.title') });
      else if (r.status === 403) setView({ kind: 'forbidden', message: r.error?.code === 'FORBIDDEN' ? r.error.message : t('forbidden.title') });
      else setView({ kind: 'error', message: r.error?.message || t('error.title') });
    } catch {
      if (my === seq.current) setView({ kind: 'error', message: t('error.title') });
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const state = view.kind === 'loading' ? 'loading' : view.kind === 'ready' ? 'ready' : 'error';
  const dt = (iso: string | null) => (iso ? fmtDateTimeTh(iso, lang) : t('never'));

  return (
    <section data-testid={tid(P, 'page')} data-state={state} data-view={view.kind} aria-busy={busy} className="stack" style={{ gap: 20 }}>
      {view.kind === 'login' && (
        <StatusNotice kind="login" code="401" testId={tid(P, 'login-required')} title={view.message} titleTestId={tid(P, 'error')}
          body={t('loginRequired.body')}>
          <div className={s.noticeActions}>
            <Link href={`/${lang}/login`} className="btn btn-primary" data-testid={tid(P, 'login-link')}>{t('loginRequired.cta')}</Link>
          </div>
        </StatusNotice>
      )}

      {view.kind === 'forbidden' && (
        <StatusNotice kind="forbidden" code="403" testId={tid(P, 'forbidden')} title={view.message} titleTestId={tid(P, 'error')}
          body={t('forbidden.body')}>
          <div className={s.noticeActions}>
            <Link href={`/${lang}`} className="btn btn-primary" data-testid={tid(P, 'home-link')}>{t('forbidden.cta')}</Link>
          </div>
        </StatusNotice>
      )}

      {(view.kind === 'loading' || view.kind === 'ready' || view.kind === 'error') && (
        <header className={s.head}>
          <div>
            <div className={s.eyebrow}>{t('eyebrow')}</div>
            <h1 className={s.title} data-testid={tid(P, 'title')}>{t('title')}</h1>
            <p className={s.subtitle}>{t('subtitle')}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void load()} disabled={busy} data-testid={tid(P, 'refresh')}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className={`${s.spin} ${busy ? s.spinning : ''}`}>
              <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {busy && view.kind !== 'loading' ? t('refreshing') : t('refresh')}
          </button>
        </header>
      )}

      {view.kind === 'loading' && (
        <div className="stack" aria-label={t('loading')} data-testid={tid(P, 'loading')}>
          <div className={s.skel} style={{ height: 168 }} />
          <div className={s.quotaGrid}>
            <div className={s.skel} style={{ height: 220 }} />
            <div className={s.skel} style={{ height: 220 }} />
          </div>
        </div>
      )}

      {view.kind === 'error' && (
        <div className="card stack" style={{ gap: 12 }}>
          <strong>{t('error.title')}</strong>
          <p className="error-text" role="alert" data-testid={tid(P, 'error')} style={{ margin: 0 }}>{view.message}</p>
          <div><button type="button" className="btn" onClick={() => void load()} data-testid={tid(P, 'retry')}>{t('error.retry')}</button></div>
        </div>
      )}

      {view.kind === 'ready' && <Ready d={view.data} t={t} dt={dt} />}
    </section>
  );
}

function Ready({ d, t, dt }: { d: FeedStatus; t: ReturnType<typeof makeT>; dt: (iso: string | null) => string }) {
  const ok = d.feedState === 'ok';
  return (
    <>
      <div className={`${s.hero} fade-in`} data-testid={tid(P, 'feed-card')}>
        <div style={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
          <div className={s.heroLabel}>{t('feed.label')}</div>
          <span className={`${s.statePill} ${ok ? s.ok : s.degraded}`} data-testid={tid(P, 'feed-state')} data-state={d.feedState} role="status">
            <span className={`${s.stateDot} ${ok ? s.ok : s.degraded}`} aria-hidden="true" />
            <span style={{ color: '#fff' }}>{ok ? t('feed.ok') : t('feed.degraded')}</span>
          </span>
          <p className={s.heroHint}>{ok ? t('feed.okHint') : t('feed.degradedHint')}</p>
          <div className={s.heroSource}>{t('feed.source')} · <strong data-testid={tid(P, 'feed-source')}>Pordee Mock Feed</strong></div>
        </div>
        <div className={s.times}>
          <div className={s.timeBox}>
            <span className={s.timeLabel}>{t('lastFetch.label')}</span>
            <span className={s.timeValue} data-testid={tid(P, 'last-fetch')} data-value={d.lastFetchAt ?? ''}>{dt(d.lastFetchAt)}</span>
          </div>
          <div className={s.timeBox}>
            <span className={s.timeLabel}>{t('lastRequest.label')}</span>
            <span className={s.timeValue} data-testid={tid(P, 'last-request')} data-value={d.lastRequestAt ?? ''}>{dt(d.lastRequestAt)}</span>
          </div>
        </div>
      </div>

      <div className={s.quotaGrid}>
        <MinuteCard d={d} t={t} />
        <DayCard d={d} t={t} dt={dt} />
      </div>

      <div className="card">
        <h2 style={{ fontSize: 'var(--fs-md)' }}>{t('rules.title')}</h2>
        <ul className={s.rules} data-testid={tid(P, 'rules')}>
          {[1, 2, 3, 4].map((i) => <li key={i}><span>{i}</span><span>{t(`rules.${i}`)}</span></li>)}
        </ul>
      </div>
    </>
  );
}

function LeftChip({ used, limit, t, id }: { used: number; limit: number; t: ReturnType<typeof makeT>; id: string }) {
  const left = Math.max(0, limit - used);
  return <span className={s.chip} data-testid={tid(P, id)}>{left === 0 ? t('full') : t('left', { n: left })}</span>;
}

/** วงแหวน 5 ช่อง ช่องละ 1 คำขอ */
function MinuteCard({ d, t }: { d: FeedStatus; t: ReturnType<typeof makeT> }) {
  const n = d.minuteLimit, used = Math.min(d.minuteUsed, n);
  const r = 46, c = 2 * Math.PI * r, gap = n > 1 ? 7 : 0, seg = c / n - gap;
  return (
    <div className={`card ${s.quotaCard} ${level(d.minuteUsed, n)}`} data-testid={tid(P, 'minute-card')}>
      <div className={s.quotaHead}>
        <div>
          <h2 className={s.quotaTitle}>{t('minute.title')}</h2>
          <p className={s.quotaHint}>{t('minute.hint', { limit: n })}</p>
        </div>
        <LeftChip used={d.minuteUsed} limit={n} t={t} id="quota-minute-left" />
      </div>
      <div className={s.ringRow}>
        <svg className={s.ring} width="120" height="120" viewBox="0 0 120 120" role="img"
          aria-label={`${d.minuteUsed} / ${n}`} data-testid={tid(P, 'quota-minute-meter')}>
          <g transform="rotate(-90 60 60)">
            {Array.from({ length: n }, (_, i) => (
              <circle key={i} cx="60" cy="60" r={r} fill="none" strokeWidth="12" strokeLinecap="butt"
                className={i < used ? s.ringUsed : s.ringTrack}
                strokeDasharray={`${seg} ${c - seg}`} strokeDashoffset={-(i * (c / n) + gap / 2)} />
            ))}
          </g>
          <text x="60" y="68" textAnchor="middle" className={s.ringText}>{Math.round((used / n) * 100)}%</text>
        </svg>
        <div className="stack" style={{ gap: 4 }}>
          <span className="muted">{t('used')}</span>
          <span className={s.big} data-testid={tid(P, 'quota-minute')} data-used={d.minuteUsed} data-limit={n}>
            {d.minuteUsed} <span className={s.bigLimit}>/ {n}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function DayCard({ d, t, dt }: { d: FeedStatus; t: ReturnType<typeof makeT>; dt: (iso: string | null) => string }) {
  const n = d.dayLimit;
  const pct = Math.min(100, (d.dayUsed / n) * 100);
  return (
    <div className={`card ${s.quotaCard} ${level(d.dayUsed, n)}`} data-testid={tid(P, 'day-card')}>
      <div className={s.quotaHead}>
        <div>
          <h2 className={s.quotaTitle}>{t('day.title')}</h2>
          <p className={s.quotaHint}>{t('day.hint', { limit: n })}</p>
        </div>
        <LeftChip used={d.dayUsed} limit={n} t={t} id="quota-day-left" />
      </div>
      <span className={s.big} data-testid={tid(P, 'quota-day')} data-used={d.dayUsed} data-limit={n}>
        {d.dayUsed} <span className={s.bigLimit}>/ {n}</span>
      </span>
      <div className="stack" style={{ gap: 6 }}>
        <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={d.dayUsed}
          aria-label={t('day.title')} data-testid={tid(P, 'quota-day-meter')}>
          <div className={s.barFill} style={{ width: pct > 0 ? `max(6px, ${pct}%)` : 0 }} />
          <div className={s.barTicks} />
        </div>
        <div className={s.barScale} aria-hidden="true"><span>0</span><span>{n / 2}</span><span>{n}</span></div>
      </div>
      <div className={s.meta}>
        <span data-testid={tid(P, 'quota-daystart')} data-value={d.dayStartsAt ?? ''}>
          {t('day.start', { datetime: dt(d.dayStartsAt) })}
        </span>
      </div>
    </div>
  );
}
