'use client';
// หน้าค้นหาหุ้น (F2) · FR-01, FR-02 · GET /api/stocks?q= (ไม่กินโควตา)
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { makeT, type Dict, type Lang } from '@/lib/i18n';
import { tid } from '@/lib/testid';
import { friendly } from './format';
import styles from './stock.module.css';

type Result = { symbol: string; name: string; exchange: string; exchangeLabel: string; kind: string };
type Notice = { code: 'OTC_NOT_SUPPORTED' | 'NOT_FOUND' | string; message: string };
type Resp = { results: Result[]; notice: Notice | null };

const SUGGEST = ['AAPL', 'VOO', 'NVDA', 'KO', 'BRK.B'];

export function SearchView({ lang, dict, initialQ }: { lang: Lang; dict: Dict; initialQ: string }) {
  const t = makeT(dict);
  const router = useRouter();
  const [input, setInput] = useState(initialQ);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(initialQ.trim() ? 'loading' : 'ready');
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  useEffect(() => { setInput(initialQ); }, [initialQ]);

  useEffect(() => {
    const q = initialQ.trim();
    if (!q) { setData(null); setError(null); setState('ready'); return; }
    let alive = true;
    setState('loading'); setError(null);
    api<Resp>(`/api/stocks?q=${encodeURIComponent(q)}`, { lang }).then((r) => {
      if (!alive) return;
      if (r.ok && r.data) { setData(r.data); setState('ready'); }
      else { setError(friendly(r.error, t('error.generic'))); setState('error'); }
    }).catch(() => { if (alive) { setError({ code: 'NETWORK', message: t('error.network') }); setState('error'); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ, lang]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    router.push(q ? `/${lang}/search?q=${encodeURIComponent(q)}` : `/${lang}/search`);
  };

  const stockHref = (s: string) => `/${lang}/stocks/${encodeURIComponent(s)}`;
  const q = initialQ.trim();

  return (
    <section data-testid="search-page" data-state={state} className="stack">
      <div className="card card-gold">
        <h1>{t('search.title')}</h1>
        <p className="muted">{t('search.lead')}</p>
        <form className={styles.searchForm} onSubmit={submit} role="search" data-testid="search-form">
          <div className="field">
            <label htmlFor="search-q">{t('search.label')}</label>
            <input id="search-q" name="q" className="input" value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={t('search.placeholder')} autoComplete="off" autoCapitalize="characters" spellCheck={false} data-testid="search-input" />
          </div>
          <button type="submit" className="btn btn-primary" data-testid="search-submit">{t('search.submit')}</button>
        </form>
      </div>

      {!q && (
        <div className={styles.suggest} data-testid="search-hint">
          <span className="muted">{t('search.hint')} · {t('search.try')}</span>
          {SUGGEST.map((s) => (
            <Link key={s} href={stockHref(s)} className="badge badge-info" data-testid={tid('search', 'suggest', s)}>{s}</Link>
          ))}
        </div>
      )}

      {state === 'loading' && <p className="muted" data-testid="search-loading">…</p>}

      {state === 'error' && error && (
        <p className="error-text" role="alert" data-testid="search-error" data-code={error.code}>{error.message}</p>
      )}

      {state === 'ready' && q && data && (
        <>
          {data.notice && (
            <div className={styles.notice} role="status" data-testid="search-notice" data-code={data.notice.code}>
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={{ flex: 'none', marginTop: 2 }}>
                <circle cx="10" cy="10" r="9" fill="none" stroke="var(--gold)" strokeWidth="2" />
                <path d="M10 5.5v5.5M10 13.6v.9" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>{data.notice.message}</span>
            </div>
          )}
          {data.results.length > 0 && (
            <>
              <p className="muted" data-testid="search-count" style={{ margin: 0 }}>{t('search.count', { n: data.results.length, q })}</p>
              <ul className={styles.results} data-testid="search-results">
                {data.results.map((r, i) => {
                  const kindLabel = dict[`kind.${String(r.kind).toLowerCase()}`] ?? r.kind;
                  return (
                    <li key={r.symbol} className="fade-in" style={{ animationDelay: `${i * 30}ms` }}>
                      <Link href={stockHref(r.symbol)} className={styles.resultLink} data-testid={tid('stock', 'result', r.symbol)} aria-label={`${r.symbol} · ${r.name} · ${t('search.open')}`}>
                        <span className={styles.resultSym}>{r.symbol}</span>
                        <span className={styles.resultName}>{r.name}</span>
                        <span className={styles.resultMeta}>
                          <span className="badge badge-info">{r.exchangeLabel}</span>
                          {kindLabel && <span className="badge badge-halted">{kindLabel}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
