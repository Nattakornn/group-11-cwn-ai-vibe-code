'use client';
// หน้า /{lang}/watchlist · FR-18 FR-19 FR-20 · BR-16–BR-19
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Quote } from '@/lib/feed';
import { makeT, fmtTimeTh, fmtDateTimeTh } from '@/lib/i18n';
import { D, fmtPct, fmtSignedUsd, fmtUsd } from '@/lib/money';
import { tid } from '@/lib/testid';
import { QuoteBadges } from '@/components/quote';
import { call, LoginRequired, Loading, PageHead, rootState, WatchTabs, type PageState, type WatchProps } from './common';
import s from './watch.module.css';

type Item = { symbol: string; name: string; position: number; proOnly: boolean; quote: Quote | null };
type Data = { items: Item[]; used: number; limit: number; tier: 'free' | 'pro' };

export function WatchlistView({ lang, dict }: WatchProps) {
  const t = makeT(dict);
  const [state, setState] = useState<PageState>('loading');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await call<Data>('/api/watchlist', { lang }, t('common.error'));
    if (r.status === 401) { setState('login'); return false; }
    if (!r.ok || !r.data) { setError(r.error?.message ?? t('common.error')); setState('error'); return false; }
    setData(r.data);
    setState('ready');
    return true;
  }, [lang]);

  useEffect(() => { void load(); }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const sym = symbol.trim().toUpperCase();
    setBusy('add'); setError(null); setOk(null);
    let r = await call('/api/watchlist', { method: 'POST', body: { symbol: sym }, lang }, t('common.error'));
    // หุ้นถูกถอด: เตือนก่อนเพิ่ม · ยกเลิก = ไม่เพิ่ม ไม่กินโควตา (8.2 #7)
    if (r.status === 409 && r.error?.code === 'DELISTED_CONFIRM') {
      if (window.confirm(`${r.error.message}\n${t('watch.delistedConfirm')}`)) {
        r = await call('/api/watchlist', { method: 'POST', body: { symbol: sym, confirmDelisted: true }, lang }, t('common.error'));
      } else { setBusy(null); return; }
    }
    if (r.status === 401) setState('login');
    else if (!r.ok) setError(r.error?.message ?? t('common.error'));
    else { setSymbol(''); setOk(t('watch.added', { symbol: sym })); await load(); }
    setBusy(null);
  }

  async function remove(sym: string) {
    // ถามยืนยันก่อนลบ (8.2 #8 · R52): Free ที่เกิน 10 ลบแล้วเพิ่มกลับไม่ได้
    if (!window.confirm(t('watch.removeConfirm', { symbol: sym }))) return;
    setBusy(sym); setError(null); setOk(null);
    const r = await call(`/api/watchlist/${encodeURIComponent(sym)}`, { method: 'DELETE', lang }, t('common.error'));
    if (r.status === 401) setState('login');
    else if (!r.ok) setError(r.error?.message ?? t('common.error'));
    else { setOk(t('watch.removed', { symbol: sym })); await load(); }
    setBusy(null);
  }

  const full = data ? data.used >= data.limit : false;
  const hasLocked = data?.items.some((i) => i.proOnly) ?? false;

  return (
    <section data-testid="watch-page" data-state={rootState(state)} className="stack fade-in">
      <WatchTabs lang={lang} dict={dict} current="watchlist" />
      <PageHead title={t('watch.title')} lead={t('watch.lead')}>
        {data && state === 'ready' && (
          <div className="row" style={{ gap: 8 }}>
            <span className={`badge ${data.tier === 'pro' ? 'badge-pro' : 'badge-info'}`} data-testid="watch-tier">
              {data.tier === 'pro' ? t('badge.pro') : t('badge.free')}
            </span>
            <span className={s.usage}>
              <span data-testid="watch-usage" data-used={data.used} data-limit={data.limit}>{t('watch.usage', { used: data.used, limit: data.limit })}</span>
              <span className={`${s.meter} ${full ? s.full : ''}`} aria-hidden="true">
                <i style={{ width: `${Math.min(100, Math.round((data.used / Math.max(1, data.limit)) * 100))}%` }} />
              </span>
            </span>
          </div>
        )}
      </PageHead>

      {state === 'loading' && <Loading dict={dict} page="watch" />}
      {state === 'login' && <LoginRequired lang={lang} dict={dict} page="watch" />}
      {state === 'error' && <p className="error-text" role="alert" data-testid="watch-error">{error}</p>}

      {state === 'ready' && data && (
        <>
          <div className="card">
            <form className={s.addForm} onSubmit={add} data-testid="watch-add-form">
              <div className="field">
                <label htmlFor="watch-add-input">{t('watch.add.label')}</label>
                <input id="watch-add-input" className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)}
                  placeholder={t('watch.add.placeholder')} autoComplete="off" autoCapitalize="characters" spellCheck={false}
                  data-testid="watch-add-input" />
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy === 'add'} data-testid="watch-add-btn">{t('watch.add.btn')}</button>
            </form>
            {error && <p className="error-text" role="alert" style={{ marginTop: 12, marginBottom: 0 }} data-testid="watch-error">{error}</p>}
            {ok && !error && <p className="ok-text" role="status" style={{ marginTop: 12, marginBottom: 0 }} data-testid="watch-ok">{ok}</p>}
          </div>

          <div className="card">
            {data.items.length === 0 ? (
              <div className={s.empty} data-testid="watch-empty">
                <svg width="64" height="40" viewBox="0 0 64 40" aria-hidden="true">
                  <path d="M4 32 L18 20 L28 26 L44 10 L60 16" stroke="var(--gold)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{t('watch.empty')}</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table className={`table ${s.wtable}`} data-testid="watch-table">
                  <thead>
                    <tr>
                      <th>{t('watch.col.no')}</th>
                      <th>{t('watch.col.symbol')}</th>
                      <th className="r">{t('watch.col.price')}</th>
                      <th className="r">{t('watch.col.change')}</th>
                      <th>{t('watch.col.time')}</th>
                      <th className="r">{t('watch.col.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((it, i) => (
                      <Row key={it.symbol} it={it} n={i + 1} lang={lang} dict={dict} busy={busy === it.symbol} onRemove={() => remove(it.symbol)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted" style={{ margin: '12px 0 0' }}>
              {t('watch.delayNote')}
              {hasLocked && <> · <span data-testid="watch-proonly-note">{t('watch.proOnlyNote')}</span></>}
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function Row({ it, n, lang, dict, busy, onRemove }: { it: Item; n: number; lang: WatchProps['lang']; dict: WatchProps['dict']; busy: boolean; onRemove: () => void }) {
  const t = makeT(dict);
  const q = it.quote;
  const sym = it.symbol;
  const dir = !q || q.change === null ? 'flat' : D(q.change).gt(0) ? 'up' : D(q.change).lt(0) ? 'down' : 'flat';
  // R16: ราคาเก่า/หุ้นถูกถอดตอนตลาดเปิดต้องมีวันที่จริงของราคา
  const asOf = q?.asOf ? (q.marketOpen && (!q.stale || q.currentSession) && q.status !== 'delisted' ? fmtTimeTh(q.asOf, lang) : fmtDateTimeTh(q.asOf, lang)) : null;
  return (
    <tr data-testid={tid('watch', 'row', sym)} data-position={it.position} data-pro-only={it.proOnly ? 'true' : 'false'} className={it.proOnly ? s.rowLocked : undefined}>
      <td className={`${s.pos} ${s.cPos}`}>{n}</td>
      <td className={s.cSym}>
        <Link href={`/${lang}/stocks/${encodeURIComponent(sym)}`} data-testid={tid('watch', 'link', sym)} className={s.sym}>{sym}</Link>
        <span className={s.name} title={it.name}>{it.name}</span>
      </td>
      {it.proOnly ? (
        <>
          <td className={`r ${s.cPrice}`}>
            <span className="badge badge-pro" data-testid={tid('watch', 'proonly', sym)}>{t('badge.proOnly')}</span>
          </td>
          <td className={`r ${s.cChg}`}><span className="muted">—</span></td>
          <td className={s.cTime}><span className="muted">—</span></td>
        </>
      ) : (
        <>
          <td className={`r ${s.cPrice}`}>
            <span className="num" style={{ fontWeight: 600 }} data-testid={`quote-price-${sym}`}>{q?.price ? fmtUsd(q.price) : '—'}</span>
          </td>
          <td className={`r ${s.cChg}`}>
            {q && q.change !== null && q.changePct !== null ? (
              <span className={`num ${dir}`} data-testid={`quote-change-${sym}`}>
                {fmtSignedUsd(q.change)} (<span data-testid={`quote-pct-${sym}`}>{fmtPct(q.changePct)}</span>)
              </span>
            ) : <span className="muted">—</span>}
          </td>
          <td className={s.cTime}>
            <div className="row" style={{ gap: 6 }}>
              {asOf && <span className="num muted" data-testid={`quote-asof-${sym}`}>{asOf}</span>}
              {q && <QuoteBadges q={q} dict={dict} idSuffix={sym} />}
            </div>
          </td>
        </>
      )}
      <td className={s.cAct}>
        <div className={s.actions}>
          <Link href={`/${lang}/alerts?symbol=${encodeURIComponent(sym)}`} className="btn btn-sm btn-ghost" data-testid={tid('watch', 'alert', sym)}>{t('watch.setAlert')}</Link>
          <button type="button" className="btn btn-sm" onClick={onRemove} disabled={busy} aria-label={t('watch.removeAria', { symbol: sym })}
            data-testid={tid('watch', 'remove', sym)}>{t('watch.remove')}</button>
        </div>
      </td>
    </tr>
  );
}
