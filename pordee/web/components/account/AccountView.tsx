'use client';
// F7 · หน้าบัญชี (FR-40, FR-41, FR-52–FR-58 · NFR-03) · ไม่มีช่องรหัสผ่านใด ๆ ในหน้านี้ (NFR-08)
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { fmtDate, makeT, type Dict, type Lang } from '@/lib/i18n';
import { CheckIcon, plusDays } from './shared';
import s from './account.module.css';

type Usage = { used: number | string; limit: number | string };
export type Me = {
  id: number; email: string; displayName: string; isStaff: boolean; tier: 'free' | 'pro';
  proPeriodEnd: string | null; proAutoRenew: boolean; bigFont: boolean; lang: Lang;
  usage: { watchlist: Usage; alerts: Usage }; historyStart: string;
};
type Subscription = { periodStart: string; periodEnd: string; amountThb: string; paid: boolean };
type PageState = 'loading' | 'ready' | 'error';
type Busy = null | 'upgrade' | 'cancel' | 'resume' | 'bigfont' | 'lang' | 'logout' | 'delete';

const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

export function AccountView({ lang, dict }: { lang: Lang; dict: Dict }) {
  const t = makeT(dict);
  const [state, setState] = useState<PageState>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [paid, setPaid] = useState<Subscription | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ user: Me }>('/api/me', { lang });
    if (r.ok && r.data?.user) { setMe(r.data.user); setNeedLogin(false); setState('ready'); return true; }
    if (r.status === 401) { setMe(null); setNeedLogin(true); setState('ready'); return false; }
    setError(r.error?.message ?? t('common.error')); setState('error');
    return false;
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const fail = (msg: string | undefined) => { setError(msg ?? t('common.error')); };

  async function upgrade() {
    setBusy('upgrade'); setError(null);
    const r = await api<{ user: Me; subscription: Subscription }>('/api/billing/upgrade', { method: 'POST', lang });
    if (r.ok && r.data) {
      setPaid(r.data.subscription);
      if (r.data.user) setMe(r.data.user); else await load();
    } else fail(r.error?.message);
    setBusy(null);
  }

  async function cancelRenew() {
    setBusy('cancel'); setError(null);
    const r = await api('/api/billing/cancel', { method: 'POST', lang });
    if (r.ok) { setCancelled(true); await load(); } else fail(r.error?.message);
    setBusy(null);
  }

  async function resumeRenew() {
    setBusy('resume'); setError(null);
    const r = await api('/api/billing/resume', { method: 'POST', lang });
    if (r.ok) { setCancelled(false); await load(); } else fail(r.error?.message);
    setBusy(null);
  }

  async function patchMe(body: { bigFont?: boolean; lang?: Lang }, kind: Busy, after: () => void) {
    setBusy(kind); setError(null);
    const r = await api('/api/me', { method: 'PATCH', body, lang });
    if (r.ok) { after(); return; }
    fail(r.error?.message); setBusy(null);
  }

  async function logout() {
    setBusy('logout'); setError(null);
    const r = await api('/api/auth/logout', { method: 'POST', lang });
    if (r.ok) { window.location.href = `/${lang}/login?notice=loggedOut`; return; }
    fail(r.error?.message); setBusy(null);
  }

  async function requestDelete() {
    if (!confirmDelete) return;
    setBusy('delete'); setError(null);
    const r = await api('/api/account/delete', { body: { confirm: true }, lang });
    if (r.ok) { window.location.href = `/${lang}/login?notice=deleted`; return; }
    fail(r.error?.message); setBusy(null);
  }

  const errorBox = error && <p className="error-text" role="alert" data-testid="acct-error">{error}</p>;

  if (state === 'loading') {
    return (
      <section data-testid="account-page" data-state="loading" className="stack">
        <h1>{t('acct.title')}</h1>
        <p className="muted" data-testid="acct-loading">{t('common.loading')}</p>
      </section>
    );
  }

  if (needLogin || !me) {
    return (
      <section data-testid="account-page" data-state={state} className="stack">
        <h1>{t('acct.title')}</h1>
        {errorBox}
        {needLogin && (
          <div className="card stack" data-testid="account-login-required" style={{ maxWidth: 520 }}>
            <p style={{ margin: 0 }}>{t('acct.loginRequired')}</p>
            <div className="row">
              <Link className="btn btn-primary" href={`/${lang}/login?next=${encodeURIComponent(`/${lang}/account`)}`} data-testid="account-login-link">
                {t('acct.toLogin')}
              </Link>
            </div>
          </div>
        )}
      </section>
    );
  }

  const pro = me.tier === 'pro';
  const end = day(me.proPeriodEnd);
  const disabled = busy !== null;
  const showUpgrade = !pro || paid !== null;

  return (
    <section data-testid="account-page" data-state={state} className="stack fade-in">
      <div className={s.head}>
        <div className={s.who}>
          <span className={s.avatar} aria-hidden="true">{Array.from(me.displayName || me.email)[0]?.toUpperCase()}</span>
          <div className={s.whoText}>
            <h1 data-testid="acct-name">{me.displayName}</h1>
            <span className="muted" data-testid="acct-email">{me.email}</span>
          </div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={logout} disabled={disabled} data-testid="acct-logout">
          {t('acct.logout')}
        </button>
      </div>

      {errorBox}

      <div className={showUpgrade ? s.layout : s.layoutSingle}>
       <div className={s.main}>
        <div className={s.pair}>
        {/* ระดับสมาชิกและรอบ (FR-58) */}
        <div className={`card ${pro ? 'card-gold' : ''}`} data-testid="acct-membership">
          <h2>{t('acct.membership')}</h2>
          <div className={s.tierRow}>
            <span className={`${s.tierBig} ${pro ? s.tierPro : s.tierFree}`} data-testid="acct-tier" data-tier={me.tier}>
              {pro ? 'Pro' : 'Free'}
            </span>
            {pro && <span className="badge badge-pro">{t('badge.pro')}</span>}
          </div>
          <div className={s.meta}>
            <span data-testid="acct-period">
              {pro && end ? t('acct.periodEnd', { date: fmtDate(end, lang) })
                : end ? t('acct.periodExpired', { date: fmtDate(end, lang) })
                : t('acct.periodNone')}
            </span>
            {pro && end && (
              <span data-testid="acct-renew" data-renew={me.proAutoRenew ? 'on' : 'off'} className={me.proAutoRenew ? 'up' : 'muted'}>
                {me.proAutoRenew ? t('acct.renewOn', { date: fmtDate(plusDays(end, 1), lang) }) : t('acct.renewOff', { date: fmtDate(end, lang) })}
              </span>
            )}
            <span className="muted" data-testid="acct-history-start">{t('acct.historyStart', { date: fmtDate(day(me.historyStart)!, lang) })}</span>
          </div>
          {cancelled && <p className="ok-text" style={{ marginTop: 12 }} data-testid="acct-cancel-ok">{t('acct.cancelled')}</p>}
          {pro && me.proAutoRenew && (
            <div className="stack" style={{ gap: 6, marginTop: 14 }}>
              <div><button type="button" className="btn btn-sm" onClick={cancelRenew} disabled={disabled} data-testid="acct-cancel">
                {busy === 'cancel' ? t('acct.saving') : t('acct.cancel')}
              </button></div>
              <small>{t('acct.cancelNote')}</small>
            </div>
          )}
          {pro && end && !me.proAutoRenew && (
            <div className="stack" style={{ gap: 6, marginTop: 14 }}>
              <div><button type="button" className="btn btn-sm" onClick={resumeRenew} disabled={disabled} data-testid="acct-resume">
                {busy === 'resume' ? t('acct.saving') : t('acct.resume')}
              </button></div>
              <small>{t('acct.resumeNote', { date: fmtDate(plusDays(end, 1), lang) })}</small>
            </div>
          )}
        </div>

        {/* การใช้งาน (FR-58 · A-12) */}
        <div className="card" data-testid="acct-usage">
          <h2>{t('acct.usage')}</h2>
          <div className="stack">
            <Meter testid="acct-usage-watchlist" label={t('acct.usageWatchlist', { used: String(me.usage.watchlist.used), limit: String(me.usage.watchlist.limit) })}
              used={me.usage.watchlist.used} limit={me.usage.watchlist.limit} />
            <Meter testid="acct-usage-alerts" label={t('acct.usageAlerts', { used: String(me.usage.alerts.used), limit: String(me.usage.alerts.limit) })}
              used={me.usage.alerts.used} limit={me.usage.alerts.limit} />
          </div>
        </div>

        </div>

        {/* การแสดงผล (FR-40 · NFR-03 · FR-57) */}
        <div className="card" data-testid="acct-settings">
          <h2>{t('acct.settings')}</h2>
          <div className={s.settingRow}>
            <label className={s.settingText} htmlFor="acct-bigfont">
              <strong>{t('acct.bigFont')}</strong>
              <small>{t('acct.bigFontHint')}</small>
            </label>
            <span className={s.toggle}>
              <input id="acct-bigfont" type="checkbox" role="switch" checked={me.bigFont} disabled={disabled} aria-checked={me.bigFont}
                onChange={(e) => {
                  const v = e.target.checked;
                  setMe({ ...me, bigFont: v });
                  void patchMe({ bigFont: v }, 'bigfont', () => window.location.reload());
                }}
                data-testid="acct-bigfont" data-state={me.bigFont ? 'on' : 'off'} />
              <span className={s.track} aria-hidden="true" />
            </span>
          </div>
          <div className={s.settingRow}>
            <label className={s.settingText} htmlFor="acct-lang">
              <strong>{t('acct.lang')}</strong>
              <small>{t('acct.langHint')}</small>
            </label>
            <select id="acct-lang" className={`select ${s.langSelect}`} value={me.lang} disabled={disabled}
              onChange={(e) => {
                const v = e.target.value === 'en' ? 'en' : 'th';
                setMe({ ...me, lang: v });
                void patchMe({ lang: v }, 'lang', () => { window.location.href = `/${v}/account`; });
              }}
              data-testid="acct-lang">
              <option value="th">{t('acct.langTh')}</option>
              <option value="en">{t('acct.langEn')}</option>
            </select>
          </div>
          {(busy === 'bigfont' || busy === 'lang') && <small data-testid="acct-saving">{t('acct.saving')}</small>}
        </div>

        {/* ลบบัญชี (FR-53, FR-54 · BR-57) */}
        <div className={`card ${s.danger}`} data-testid="acct-danger">
          <h2>{t('acct.dangerTitle')}</h2>
          {!showDelete ? (
            <button type="button" className="btn" onClick={() => { setShowDelete(true); setConfirmDelete(false); }} disabled={disabled} data-testid="acct-delete">
              {t('acct.delete')}
            </button>
          ) : (
            <div className={s.deleteBox} data-testid="acct-delete-panel">
              <strong>{t('acct.deleteIntro')}</strong>
              <ul data-testid="acct-delete-explain">
                <li>{t('acct.deleteExplain1')}</li>
                <li>{t('acct.deleteExplain2')}</li>
                <li>{t('acct.deleteExplain3')}</li>
              </ul>
              <label className={s.confirmLine}>
                <input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} data-testid="acct-delete-confirm" />
                <span>{t('acct.deleteConfirm')}</span>
              </label>
              <div className="row">
                <button type="button" className="btn btn-danger" onClick={requestDelete} disabled={!confirmDelete || disabled} data-testid="acct-delete-submit">
                  {busy === 'delete' ? t('acct.deleting') : t('acct.deleteSubmit')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowDelete(false)} disabled={disabled} data-testid="acct-delete-cancel">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
       </div>
       <aside className={s.side}>
        {/* อัปเกรด Pro ผ่านหน้าชำระเงินจำลอง (FR-55) */}
        {showUpgrade && (
          <div className={`card ${s.upgrade}`} data-testid="acct-upgrade-card">
            <h2>{t('acct.upgradeTitle')}</h2>
            <div className={s.price}>
              <span className={`${s.priceNum} num`}>{t('acct.price')}</span><span className="muted">{t('acct.perMonth')}</span>
            </div>
            <ul className={s.benefits}>
              <li data-testid="acct-benefit-watchlist"><span className={s.check}><CheckIcon /></span>{t('acct.benefitWatch')}</li>
              <li data-testid="acct-benefit-alerts"><span className={s.check}><CheckIcon /></span>{t('acct.benefitAlerts')}</li>
              <li data-testid="acct-benefit-history"><span className={s.check}><CheckIcon /></span>{t('acct.benefitHistory')}</li>
            </ul>
            {paid ? (
              <div className={s.receipt} role="status" data-testid="acct-upgrade-ok">
                <span className={s.check}><CheckIcon /></span>
                <div className={s.receiptBody}>
                  <strong>{t('acct.paid')}</strong>
                  <span>{t('acct.paidDetail', { amount: paid.amountThb, start: fmtDate(day(paid.periodStart)!, lang), end: fmtDate(day(paid.periodEnd)!, lang) })}</span>
                </div>
              </div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <button type="button" className={`btn btn-gold ${s.full}`} onClick={upgrade} disabled={disabled} data-testid="acct-upgrade">
                  {busy === 'upgrade' ? t('acct.paying') : t('acct.upgrade')}
                </button>
                <small>{t('acct.mockNote')}</small>
              </div>
            )}
          </div>
        )}

       </aside>
      </div>
    </section>
  );
}

function Meter({ testid, label, used, limit }: { testid: string; label: string; used: number | string; limit: number | string }) {
  const u = Number(used), l = Number(limit);
  const pct = l > 0 ? Math.min(100, Math.round((u / l) * 100)) : 0;
  const full = l > 0 && u >= l;
  return (
    <div className={s.meter}>
      <div className={s.meterTop}><span data-testid={testid} data-used={String(used)} data-limit={String(limit)}>{label}</span></div>
      <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={l} aria-valuenow={u} aria-label={label}>
        <div className={`${s.fill} ${full ? s.fillFull : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
