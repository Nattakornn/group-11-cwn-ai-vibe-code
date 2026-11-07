'use client';
// F6 · ลองเทียบ DCA กับซื้อก้อนเดียว (FR-42, BR-54, T-09) · เฉพาะ Pro · แสดงตัวเลขอย่างเดียว ไม่สรุปว่าแบบไหนดีกว่า
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api-client';
import { fmtDate, makeT, type Dict } from '@/lib/i18n';
import { fmtNum, fmtShares, fmtSignedUsd, fmtUsd } from '@/lib/money';
import type { StudyCtx } from './server';
import s from './study.module.css';

type Res = {
  months: number; investedUsd: string;
  dca: { shares: string; valueUsd: string }; lump: { shares: string; valueUsd: string };
  diffUsd: string; valuedAt: string; priceUsed: string;
};
type Err = { code: string; message: string };

function LockIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="5" y="12" width="18" height="12" rx="3" fill="var(--gold-soft)" stroke="var(--gold)" strokeWidth="1.8" />
      <path d="M9 12V9a5 5 0 0 1 10 0v3" fill="none" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="14" cy="18" r="1.8" fill="var(--gold)" />
    </svg>
  );
}

export function Backtest({ lang, dict, ctx, initial }: {
  lang: 'th' | 'en'; dict: Dict; ctx: StudyCtx; initial: { symbol: string; monthly: string; from: string; to: string };
}) {
  const t = makeT(dict);
  const [symbol, setSymbol] = useState(initial.symbol);
  const [monthly, setMonthly] = useState(initial.monthly);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('ready');
  // เปิดหน้าแล้วรู้ทันทีว่าไม่มีสิทธิ์ (E69) · ส่งฟอร์มแล้วใช้ข้อความจาก API แทน
  const [error, setError] = useState<Err | null>(
    !ctx.loggedIn ? { code: 'UNAUTHORIZED', message: t('common.loginRequired') }
      : ctx.tier !== 'pro' ? { code: 'PRO_ONLY', message: t('bt.proOnly') } : null,
  );
  const [res, setRes] = useState<Res | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('loading'); setError(null);
    const r = await api<Res>('/api/backtest', {
      method: 'POST', lang,
      body: { symbol: symbol.trim().toUpperCase(), monthlyUsd: monthly.trim(), fromMonth: from, toMonth: to },
    });
    if (r.ok && r.data) {
      setRes(r.data);
      setState('ready');
    } else {
      setRes(null);
      setError(r.error ?? { code: 'ERROR', message: t('common.error') });
      setState('error');
    }
  };

  const L = (p: string) => `/${lang}${p}`;

  return (
    <section data-testid="backtest-page" data-state={state} className="stack">
      <div className="card card-gold">
        <div className="row" style={{ gap: 8, marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>{t('bt.title')}</h2>
          <span className="badge badge-pro" data-testid="bt-pro-badge">{t('common.proBadge')}</span>
        </div>
        <p className="muted">{t('bt.desc')}</p>
        <form onSubmit={submit} noValidate className={s.form} data-testid="bt-form">
          <div className="field">
            <label htmlFor="bt-symbol">{t('bt.symbol')}</label>
            <input id="bt-symbol" className="input num" value={symbol} autoComplete="off" placeholder={t('bt.symbolPlaceholder')}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())} data-testid="bt-symbol" />
          </div>
          <div className="field">
            <label htmlFor="bt-monthly">{t('bt.monthly')}</label>
            <input id="bt-monthly" className="input num" inputMode="decimal" value={monthly} autoComplete="off"
              onChange={(e) => setMonthly(e.target.value)} data-testid="bt-monthly" />
          </div>
          <div className="field">
            <label htmlFor="bt-from">{t('bt.from')}</label>
            <input id="bt-from" type="month" className="input num" value={from} placeholder="YYYY-MM" onChange={(e) => setFrom(e.target.value)} data-testid="bt-from" />
          </div>
          <div className="field">
            <label htmlFor="bt-to">{t('bt.to')}</label>
            <input id="bt-to" type="month" className="input num" value={to} placeholder="YYYY-MM" onChange={(e) => setTo(e.target.value)} data-testid="bt-to" />
          </div>
          <div className={s.actions}>
            <button type="submit" className="btn btn-primary" disabled={state === 'loading'} data-testid="bt-submit">{t('bt.submit')}</button>
          </div>
        </form>
      </div>

      {error && (
        <div className="error-text" role="alert" data-testid="bt-error" data-code={error.code}>
          <div className={s.lock}>
            {(error.code === 'PRO_ONLY' || error.code === 'UNAUTHORIZED') && <LockIcon />}
            <div className="stack" style={{ gap: 4 }}>
              <span data-testid="bt-error-message">{error.message}</span>
              {error.code === 'PRO_ONLY' && <Link href={L('/account')} data-testid="bt-upgrade-link">{t('bt.upgrade')}</Link>}
              {error.code === 'UNAUTHORIZED' && (
                <Link href={L('/login')} data-testid="backtest-login-required">{t('common.login')}</Link>
              )}
            </div>
          </div>
        </div>
      )}
      {state === 'loading' && <p className="muted" data-testid="bt-loading">{t('common.loading')}</p>}

      {res && (
        <div className="card stack" data-testid="bt-result">
          <div className={s.results}>
            <div className={s.tile}>
              <span className={s.label}>{t('bt.months')}</span>
              <span className={s.value} data-testid="bt-months">{t('bt.monthsValue', { n: fmtNum(res.months, 0) })}</span>
            </div>
            <div className={s.tile}>
              <span className={s.label}>{t('bt.invested')}</span>
              <span className={`num ${s.value}`} data-testid="bt-invested">{fmtUsd(res.investedUsd)}</span>
            </div>
            <div className={s.tile}>
              <span className={s.label}>{t('bt.dca')} · {t('bt.value')}</span>
              <span className={`num ${s.value}`} data-testid="bt-dca-value">{fmtUsd(res.dca.valueUsd)}</span>
              <span className={s.sub} data-testid="bt-dca-shares">{t('bt.shares', { shares: fmtShares(res.dca.shares) })}</span>
            </div>
            <div className={s.tile}>
              <span className={s.label}>{t('bt.lump')} · {t('bt.value')}</span>
              <span className={`num ${s.value}`} data-testid="bt-lump-value">{fmtUsd(res.lump.valueUsd)}</span>
              <span className={s.sub} data-testid="bt-lump-shares">{t('bt.shares', { shares: fmtShares(res.lump.shares) })}</span>
            </div>
            <div className={s.tile}>
              <span className={s.label}>{t('bt.diff')}</span>
              <span className={`num ${s.value}`} data-testid="bt-diff">{fmtSignedUsd(res.diffUsd)}</span>
            </div>
          </div>
          <p className="muted" style={{ margin: 0 }} data-testid="bt-valued-at">
            {t('bt.valuedAt', { price: fmtUsd(res.priceUsed, 4), date: fmtDate(res.valuedAt.slice(0, 10), lang) })}
          </p>
        </div>
      )}

      <div className="card" data-testid="bt-method">
        <h3>{t('bt.method.title')}</h3>
        <ul className={s.method}>
          {[1, 2, 3, 4, 5].map((i) => <li key={i}>{t(`bt.method.${i}`)}</li>)}
        </ul>
        <p className="muted" style={{ marginTop: 12, marginBottom: 0 }} data-testid="bt-note">{t('bt.note')}</p>
      </div>
    </section>
  );
}
