'use client';
// ส่วนที่ใช้ร่วมกันของหน้า F3 (เฝ้าดู แจ้งเตือน กล่องแจ้งเตือน อีเมลที่ส่ง)
import Link from 'next/link';
import { api, type ApiResult } from '@/lib/api-client';
import { makeT, type Dict, type Lang } from '@/lib/i18n';
import s from './watch.module.css';

export type PageState = 'loading' | 'ready' | 'error' | 'login';
export type WatchProps = { lang: Lang; dict: Dict };

/** api() ที่ไม่ throw แม้เครือข่ายล่ม */
export async function call<T = any>(path: string, opts: { method?: string; body?: unknown; lang: Lang }, fallback: string): Promise<ApiResult<T>> {
  try {
    return await api<T>(path, opts);
  } catch {
    return { ok: false, status: 0, data: null, error: { code: 'NETWORK', message: fallback } };
  }
}

/** 'HH:mm:ss' → 'HH:mm' */
export const hhmm = (v: string | null | undefined) => (v ? v.slice(0, 5) : '');

export function WatchTabs({ lang, dict, current }: WatchProps & { current: 'watchlist' | 'alerts' | 'inbox' | 'outbox' }) {
  const t = makeT(dict);
  const tabs = ['watchlist', 'alerts', 'inbox', 'outbox'] as const;
  return (
    <nav className={s.tabs} aria-label={t('watch.title')}>
      {tabs.map((k) => (
        <Link key={k} href={`/${lang}/${k}`} className={s.tab} aria-current={k === current ? 'page' : undefined} data-testid={`watch-nav-${k}`}>
          {t(`tab.${k}`)}
        </Link>
      ))}
    </nav>
  );
}

export function LoginRequired({ lang, dict, page }: WatchProps & { page: string }) {
  const t = makeT(dict);
  return (
    <div className={`card ${s.center}`} data-testid={`${page}-login-required`}>
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="27" fill="var(--gold-soft)" />
        <rect x="18" y="26" width="20" height="15" rx="3" fill="var(--gold)" />
        <path d="M22 26v-4a6 6 0 0 1 12 0v4" stroke="var(--gold)" strokeWidth="3" fill="none" />
      </svg>
      <p>{t('common.loginRequired')}</p>
      <Link href={`/${lang}/login?next=${encodeURIComponent(`/${lang}/${page === 'watch' ? 'watchlist' : page}`)}`} className="btn btn-primary" data-testid={`${page}-login-link`}>{t('login.link')}</Link>
    </div>
  );
}

export function Loading({ dict, page }: { dict: Dict; page: string }) {
  const t = makeT(dict);
  return <p className="muted" data-testid={`${page}-loading`} aria-live="polite">{t('common.loading')}</p>;
}

export function PageHead({ title, lead, children }: { title: string; lead: string; children?: React.ReactNode }) {
  return (
    <div className="spread" style={{ alignItems: 'flex-end' }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ marginBottom: 4 }}>{title}</h1>
        <p className="muted" style={{ margin: 0 }}>{lead}</p>
      </div>
      {children}
    </div>
  );
}

/** data-state ของราก: login นับเป็น error */
export const rootState = (st: PageState) => (st === 'login' ? 'error' : st);
