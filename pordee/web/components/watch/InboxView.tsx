'use client';
// หน้า /{lang}/inbox · FR-24 · A-05 (ตัวนับยังไม่อ่าน) · BR-37 (ป้ายช่วงเงียบ)
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { makeT, fmtDateTimeTh } from '@/lib/i18n';
import { D, fmtPct, fmtUsd } from '@/lib/money';
import { tid } from '@/lib/testid';
import { call, LoginRequired, Loading, PageHead, rootState, WatchTabs, type PageState, type WatchProps } from './common';
import s from './watch.module.css';

type Item = { id: number | string; alertId: number | string; symbol: string; kind: 'pct' | 'target'; price: string | null; changePct: string | null;
  triggeredAt: string; inQuietHours: boolean; read: boolean };
type Data = { items: Item[]; unread: number };

export function InboxView({ lang, dict }: WatchProps) {
  const t = makeT(dict);
  const [state, setState] = useState<PageState>('loading');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const r = await call<Data>('/api/inbox', { lang }, t('common.error'));
    if (r.status === 401) { setState('login'); return; }
    if (!r.ok || !r.data) { setError(r.error?.message ?? t('common.error')); setState('error'); return; }
    setData(r.data);
    setState('ready');
  }, [lang]);

  useEffect(() => { void load(); }, [load]);

  async function markRead(ids: string[], key: string) {
    setBusy(key); setError(null);
    for (const id of ids) {
      const r = await call(`/api/inbox/${encodeURIComponent(id)}/read`, { method: 'POST', body: {}, lang }, t('common.error'));
      if (r.status === 401) { setState('login'); setBusy(null); return; }
      if (!r.ok) { setError(r.error?.message ?? t('common.error')); break; }
    }
    await load();
    router.refresh(); // ให้ตัวเลขยังไม่อ่านที่หัวเว็บ (core-nav-inbox) อัปเดตตาม
    setBusy(null);
  }

  const unreadIds = data?.items.filter((i) => !i.read).map((i) => String(i.id)) ?? [];

  return (
    <section data-testid="inbox-page" data-state={rootState(state)} className="stack fade-in">
      <WatchTabs lang={lang} dict={dict} current="inbox" />
      <PageHead title={t('inbox.title')} lead={t('inbox.lead')}>
        {data && state === 'ready' && (
          <div className="row" style={{ gap: 8 }}>
            <span className={s.counter}>
              {t('inbox.unreadLabel')} <strong data-testid="inbox-unread" data-count={data.unread}>{data.unread}</strong> {t('inbox.unreadUnit')}
            </span>
            {unreadIds.length > 0 && (
              <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void markRead(unreadIds, 'all')} data-testid="inbox-read-all">
                {t('inbox.markAll')}
              </button>
            )}
          </div>
        )}
      </PageHead>

      {state === 'loading' && <Loading dict={dict} page="inbox" />}
      {state === 'login' && <LoginRequired lang={lang} dict={dict} page="inbox" />}
      {error && state !== 'login' && <p className="error-text" role="alert" data-testid="inbox-error">{error}</p>}

      {state === 'ready' && data && (
        <div className="card">
          {data.items.length === 0 ? (
            <div className={s.empty} data-testid="inbox-empty">
              <svg width="56" height="44" viewBox="0 0 56 44" aria-hidden="true">
                <rect x="3" y="3" width="50" height="38" rx="8" fill="none" stroke="var(--gold)" strokeWidth="3" />
                <path d="M3 26h14l4 6h14l4-6h14" fill="none" stroke="var(--gold)" strokeWidth="3" strokeLinejoin="round" />
              </svg>
              <span>{t('inbox.empty')}</span>
            </div>
          ) : (
            <ul className={s.list} data-testid="inbox-list">
              {data.items.map((it) => {
                const id = String(it.id);
                const dir = it.changePct === null ? 'flat' : D(it.changePct).gt(0) ? 'up' : D(it.changePct).lt(0) ? 'down' : 'flat';
                return (
                  <li key={id} className={`${s.item} ${it.read ? '' : s.unread}`} data-testid={tid('inbox', 'item', id)}
                    data-read={it.read ? 'true' : 'false'} data-quiet={it.inQuietHours ? 'true' : 'false'} data-symbol={it.symbol} data-kind={it.kind}>
                    <span className={`${s.icon} ${it.kind === 'target' ? s.gold : ''}`} aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                      </svg>
                    </span>
                    <div className={s.itemMain}>
                      <div className="row" style={{ gap: 8 }}>
                        <Link href={`/${lang}/stocks/${encodeURIComponent(it.symbol)}`} className={s.sym} data-testid={tid('inbox', 'symbol', id)}>{it.symbol}</Link>
                        <span className="muted" data-testid={tid('inbox', 'kind', id)}>{it.kind === 'target' ? t('inbox.kind.target') : t('inbox.kind.pct')}</span>
                        {!it.read && <span className="badge badge-stale" data-testid={tid('inbox', 'new', id)}>{t('inbox.new')}</span>}
                        {it.inQuietHours && <span className="badge badge-info" data-testid={tid('inbox', 'quiet', id)}>{t('inbox.quiet')}</span>}
                      </div>
                      <div className="row" style={{ gap: 10 }}>
                        <span className="num" style={{ fontWeight: 600, fontSize: 'var(--fs-lg)' }} data-testid={tid('inbox', 'price', id)}>
                          {it.price ? fmtUsd(it.price) : '—'}
                        </span>
                        {it.changePct !== null && (
                          <span className={`num ${dir}`} data-testid={tid('inbox', 'pct', id)}>{fmtPct(it.changePct)}</span>
                        )}
                      </div>
                      <small className="muted num" data-testid={tid('inbox', 'time', id)}>{fmtDateTimeTh(it.triggeredAt, lang)}</small>
                    </div>
                    {!it.read && (
                      <div className={s.itemSide}>
                        <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void markRead([id], id)} data-testid={tid('inbox', 'read', id)}>
                          {t('inbox.markRead')}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
