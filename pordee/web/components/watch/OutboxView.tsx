'use client';
// หน้า /{lang}/outbox "อีเมลที่ส่ง" (อีเมลจำลอง) · FR-25
import { useCallback, useEffect, useState } from 'react';
import { makeT, fmtDateTimeTh } from '@/lib/i18n';
import { tid } from '@/lib/testid';
import { call, LoginRequired, Loading, PageHead, rootState, WatchTabs, type PageState, type WatchProps } from './common';
import s from './watch.module.css';

type Mail = { id: number | string; toEmail: string; subject: string; body: string; sentAt: string };

export function OutboxView({ lang, dict }: WatchProps) {
  const t = makeT(dict);
  const [state, setState] = useState<PageState>('loading');
  const [items, setItems] = useState<Mail[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await call<{ items: Mail[] }>('/api/outbox', { lang }, t('common.error'));
    if (r.status === 401) { setState('login'); return; }
    if (!r.ok || !r.data) { setError(r.error?.message ?? t('common.error')); setState('error'); return; }
    setItems(r.data.items ?? []);
    setState('ready');
  }, [lang]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section data-testid="outbox-page" data-state={rootState(state)} className="stack fade-in">
      <WatchTabs lang={lang} dict={dict} current="outbox" />
      <PageHead title={t('outbox.title')} lead={t('outbox.lead')}>
        {state === 'ready' && <span className={s.counter}><strong data-testid="outbox-count" data-count={items.length}>{items.length}</strong></span>}
      </PageHead>

      {state === 'loading' && <Loading dict={dict} page="outbox" />}
      {state === 'login' && <LoginRequired lang={lang} dict={dict} page="outbox" />}
      {state === 'error' && <p className="error-text" role="alert" data-testid="outbox-error">{error}</p>}

      {state === 'ready' && (
        <div className="card">
          {items.length === 0 ? (
            <div className={s.empty} data-testid="outbox-empty">
              <svg width="56" height="44" viewBox="0 0 56 44" aria-hidden="true">
                <rect x="3" y="3" width="50" height="38" rx="6" fill="none" stroke="var(--gold)" strokeWidth="3" />
                <path d="M5 6l23 18L51 6" fill="none" stroke="var(--gold)" strokeWidth="3" strokeLinejoin="round" />
              </svg>
              <span>{t('outbox.empty')}</span>
            </div>
          ) : (
            <ul className={`${s.list} stack`} style={{ gap: 12 }} data-testid="outbox-list">
              {items.map((m) => {
                const id = String(m.id);
                return (
                  <li key={id} className={s.mail} data-testid={tid('outbox', 'item', id)}>
                    <strong data-testid={tid('outbox', 'subject', id)} style={{ overflowWrap: 'anywhere' }}>{m.subject}</strong>
                    <dl className={s.mailMeta} style={{ margin: 0 }}>
                      <dt>{t('outbox.to')}</dt>
                      <dd data-testid={tid('outbox', 'to', id)}>{m.toEmail}</dd>
                      <dt>{t('outbox.sentAt')}</dt>
                      <dd className="num" data-testid={tid('outbox', 'time', id)}>{fmtDateTimeTh(m.sentAt, lang)}</dd>
                    </dl>
                    <p className={s.mailBody} data-testid={tid('outbox', 'body', id)}>{m.body}</p>
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
