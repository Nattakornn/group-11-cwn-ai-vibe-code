'use client';
// F6 · ประวัติการเทียบ/การลอง 20 รายการล่าสุด (FR-44, BR-55) · กดแล้วเปิดหน้าเดิมพร้อมค่าเดิม (ไม่รันใหม่เอง)
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { fmtDate, fmtDateTimeTh, makeT, type Dict } from '@/lib/i18n';
import { tid } from '@/lib/testid';
import { fmtNum, fmtUsd } from '@/lib/money';
import { fmtMonth, isNonNegNumber } from './format';
import s from './study.module.css';

type Item = { id: number | string; kind: 'compare' | 'backtest' | string; params: Record<string, unknown>; createdAt: string };

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const pick = (p: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) { const v = str(p[k]); if (v) return v; } return ''; };

/** ลิงก์เปิดซ้ำ + ข้อความสรุปพารามิเตอร์ */
function describe(it: Item, lang: 'th' | 'en', t: ReturnType<typeof makeT>) {
  const p = it.params ?? {};
  if (it.kind === 'backtest') {
    const symbol = pick(p, 'symbol');
    const monthly = pick(p, 'monthlyUsd', 'monthly');
    const from = pick(p, 'fromMonth', 'from').slice(0, 7);
    const to = pick(p, 'toMonth', 'to').slice(0, 7);
    const qs = new URLSearchParams({ symbol, monthly, from, to });
    return {
      href: `/${lang}/study/backtest?${qs}`,
      text: t('hist.params.backtest', {
        symbol, monthly: isNonNegNumber(monthly) ? fmtUsd(monthly) : monthly || '—',
        from: fmtMonth(from, lang), to: fmtMonth(to, lang),
      }),
    };
  }
  const symbols = Array.isArray(p.symbols) ? (p.symbols as unknown[]).map(str).filter(Boolean) : [];
  const from = pick(p, 'from'), to = pick(p, 'to');
  const qs = new URLSearchParams({ symbols: symbols.join(','), from, to });
  const d = (x: string) => (/^\d{4}-\d{2}-\d{2}$/.test(x) ? fmtDate(x, lang) : x || '—');
  return { href: `/${lang}/study/compare?${qs}`, text: t('hist.params.compare', { symbols: symbols.join(', ') || '—', from: d(from), to: d(to) }) };
}

export function History({ lang, dict, loggedIn }: { lang: 'th' | 'en'; dict: Dict; loggedIn: boolean }) {
  const t = makeT(dict);
  const [items, setItems] = useState<Item[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(loggedIn ? 'loading' : 'error');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  useEffect(() => {
    if (!loggedIn) return;
    void api<{ items: Item[] }>('/api/history', { lang }).then((r) => {
      if (r.ok && r.data) { setItems(r.data.items); setState('ready'); }
      else { setError(r.error); setState('error'); }
    });
  }, [lang, loggedIn]);

  const needLogin = !loggedIn || error?.code === 'UNAUTHORIZED';

  return (
    <section data-testid="history-page" data-state={state} className="stack">
      <div className="card card-gold">
        <div className="spread">
          <h2 style={{ margin: 0 }}>{t('hist.title')}</h2>
          {items && <span className="badge badge-info num" data-testid="hist-count">{t('hist.count', { n: fmtNum(items.length, 0) })}</span>}
        </div>
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>{t('hist.desc')}</p>
      </div>

      {needLogin && (
        <div className="card" data-testid="history-login-required">
          <p>{t('common.loginRequired')}</p>
          <Link href={`/${lang}/login?next=${encodeURIComponent(`/${lang}/study/history`)}`} className="btn btn-primary" data-testid="hist-login-link">{t('common.login')}</Link>
        </div>
      )}
      {!needLogin && error && <p className="error-text" role="alert" data-testid="hist-error">{error.message}</p>}
      {state === 'loading' && <p className="muted" data-testid="hist-loading">{t('common.loading')}</p>}

      {items && items.length === 0 && <p className="card muted" data-testid="hist-empty">{t('hist.empty')}</p>}
      {items && items.length > 0 && (
        <ul className={s.histList} data-testid="hist-list">
          {items.map((it) => {
            const d = describe(it, lang, t);
            const kindKey = it.kind === 'backtest' ? 'hist.kind.backtest' : 'hist.kind.compare';
            return (
              <li key={it.id}>
                <Link href={d.href} className={s.histItem} data-testid={tid('hist', 'item', it.id)} data-kind={it.kind}>
                  <span className={`badge ${it.kind === 'backtest' ? 'badge-pro' : 'badge-info'}`} data-testid={tid('hist', 'kind', it.id)}>{t(kindKey)}</span>
                  <span className={s.histParams} data-testid={tid('hist', 'params', it.id)}>{d.text}</span>
                  <span className={s.histTime} data-testid={tid('hist', 'time', it.id)}>{fmtDateTimeTh(it.createdAt, lang)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
