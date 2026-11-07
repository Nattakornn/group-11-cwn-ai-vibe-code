// โครงหน้าเว็บกลาง: header + แถบสถานะตลาด + footer + เมนูมือถือ (หัวหน้าเป็นเจ้าของ)
import Link from 'next/link';
import type { Lang } from '@/lib/i18n';
import { makeT, type Dict, fmtDateTimeTh, fmtTimeTh } from '@/lib/i18n';
import type { MarketStatus } from '@/lib/market';
import { SOURCE } from '@/lib/feed';
import { LangSwitch, LoginLink, ThemeToggle } from './client';
import { currentUser } from '@/lib/session';
import { q1 } from '@/lib/db';

export function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#b58a2e" />
      <path d="M6 22 L12 15 L17 19 L26 9" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="9" r="2.5" fill="#fff" />
    </svg>
  );
}

export function Header({ lang, dict, isStaff, loggedIn }: { lang: Lang; dict: Dict; isStaff: boolean; loggedIn: boolean }) {
  const t = makeT(dict);
  const L = (p: string) => `/${lang}${p}`;
  return (
    <header className="site-header" data-testid="core-header">
      <div className="container bar">
        <Link href={L('')} className="brand" data-testid="core-brand"><Logo />{t('brand')}</Link>
        <nav className="nav" aria-label="main">
          <Link href={L('/watchlist')} data-testid="core-nav-watchlist">{t('nav.watchlist')}</Link>
          <Link href={L('/portfolio')} data-testid="core-nav-portfolio">{t('nav.portfolio')}</Link>
          <Link href={L('/dividends')} data-testid="core-nav-dividends">{t('nav.dividends')}</Link>
          <Link href={L('/alerts')} data-testid="core-nav-alerts">{t('nav.alerts')}</Link>
          <Link href={L('/inbox')} data-testid="core-nav-inbox">{t('nav.inbox')}{loggedIn && <InboxUnreadBadge label={t('nav.inboxUnread')} />}</Link>
          <Link href={L('/study/screener')} data-testid="core-nav-study">{t('nav.study')}</Link>
          <Link href={L('/learn')} data-testid="core-nav-learn">{t('nav.learn')}</Link>
          {isStaff && <Link href={L('/staff')} data-testid="core-nav-staff">{t('nav.staff')}</Link>}
        </nav>
        <form className="header-search" action={L('/search')} method="get" role="search">
          <input name="q" placeholder={t('search.placeholder')} aria-label={t('nav.search')} data-testid="core-search-input" />
        </form>
        {loggedIn
          ? <Link href={L('/account')} data-testid="core-nav-account">{t('nav.account')}</Link>
          : <LoginLink lang={lang} label={t('nav.login')} testid="core-nav-login" />}
        <ThemeToggle labels={{ toDark: t('theme.toDark'), toLight: t('theme.toLight') }} />
        <LangSwitch lang={lang} labels={{ th: t('lang.th'), en: t('lang.en') }} />
      </div>
    </header>
  );
}

export function MarketBar({ lang, dict, status }: { lang: Lang; dict: Dict; status: MarketStatus }) {
  const t = makeT(dict);
  const state = status.open ? (status.earlyClose ? 'early' : 'open') : 'closed';
  return (
    <div className="market-bar" data-testid="core-market-bar">
      <div className="container">
        <span className={`dot ${state === 'closed' ? '' : state}`} aria-hidden="true" />
        <strong data-testid="core-market-status" data-state={state}>
          {state === 'closed' ? t('market.closed')
            : state === 'early' ? t('market.early', { time: fmtTimeTh(status.closesAt!, lang) })
            : t('market.open')}
        </strong>
        {state === 'open' && <span data-testid="core-market-closes">{t('market.closesAt', { time: fmtTimeTh(status.closesAt!, lang) })}</span>}
        {state === 'closed' && <span data-testid="core-market-next">{t('market.nextOpen', { datetime: fmtDateTimeTh(status.nextOpen, lang) })}</span>}
        <span className="muted" style={{ color: '#aebad0' }}>{t('market.nyNote')}</span>
      </div>
    </div>
  );
}

export function Footer({ dict, lang, updatedAt }: { dict: Dict; lang?: Lang; updatedAt?: string | null }) {
  const t = makeT(dict);
  return (
    <footer className="site-footer">
      <div className="container stack" style={{ gap: 6 }}>
        <p className="disclaimer" data-testid="core-disclaimer">{t('disclaimer')}</p>
        <p data-testid="core-source">
          {t('source', { source: SOURCE })}
          {updatedAt && lang && <> · <span data-testid="core-source-updated">{t('source.updated', { datetime: fmtDateTimeTh(updatedAt, lang) })}</span></>}
        </p>
        <p>© 2026 {t('brand')}</p>
      </div>
    </footer>
  );
}

export function MobileNav({ lang, dict, loggedIn }: { lang: Lang; dict: Dict; loggedIn: boolean }) {
  const t = makeT(dict);
  const L = (p: string) => `/${lang}${p}`;
  return (
    <nav className="mobile-nav" aria-label="mobile">
      <Link href={L('')} data-testid="core-mnav-home">{t('nav.home')}</Link>
      <Link href={L('/search')} data-testid="core-mnav-search">{t('nav.search')}</Link>
      <Link href={L('/watchlist')} data-testid="core-mnav-watchlist">{t('nav.watchlist')}</Link>
      <Link href={L('/portfolio')} data-testid="core-mnav-portfolio">{t('nav.portfolio')}</Link>
      {loggedIn
        ? <Link href={L('/account')} data-testid="core-mnav-account">{t('nav.account')}</Link>
        : <LoginLink lang={lang} label={t('nav.login')} testid="core-mnav-account" />}
    </nav>
  );
}

/** ตัวเลขยังไม่อ่านของกล่องแจ้งเตือนบนเมนูหัวเว็บ (A-05 · FR-24 · R60) · 0 = ไม่แสดง */
async function InboxUnreadBadge({ label }: { label: string }) {
  const u = await currentUser();
  if (!u) return null;
  const r = await q1<{ n: number }>('SELECT count(*)::int AS n FROM alert_events WHERE user_id = $1 AND read_at IS NULL', [u.id]);
  const n = r?.n ?? 0;
  if (n <= 0) return null;
  const shown = n > 99 ? '99+' : String(n);
  return (
    <span className="nav-badge num" data-testid="core-nav-inbox-unread" data-count={n} aria-label={label.replace('{count}', String(n))}>
      {shown}
    </span>
  );
}
