'use client';
// F4 · รายการ DCA รอยืนยัน (FR-34) · ปิดปุ่มระหว่างส่ง · 409 แสดงข้อความจาก API
import { useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { fmtDate, type Lang } from '@/lib/i18n';
import type { DcaPending, mkFmt } from './shared';
import s from './portfolio.module.css';

type T = (k: string, v?: Record<string, string | number>) => string;
type F = ReturnType<typeof mkFmt>;

export function PendingSection({ items, lang, t, f, onDone }: { items: DcaPending[]; lang: Lang; t: T; f: F; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [errs, setErrs] = useState<Record<number, string>>({});
  const [ok, setOk] = useState<string | null>(null);
  const inflight = useRef<Set<number>>(new Set());

  async function act(id: number, kind: 'confirm' | 'skip') {
    if (inflight.current.has(id)) return; // กันกดซ้ำก่อน React วาดปุ่มใหม่
    inflight.current.add(id);
    setBusy((b) => ({ ...b, [id]: true }));
    setErrs((e) => { const n = { ...e }; delete n[id]; return n; });
    setOk(null);
    const r = await api(`/api/dca/pending/${id}/${kind}`, { method: 'POST', body: {}, lang });
    setBusy((b) => ({ ...b, [id]: false }));
    inflight.current.delete(id);
    if (r.ok) {
      setOk(t(kind === 'confirm' ? 'dca.confirmed' : 'dca.skipped'));
      await onDone();
      return;
    }
    setErrs((e) => ({ ...e, [id]: r.error?.message ?? String(r.status) }));
    if (r.status === 409) setDone((d) => ({ ...d, [id]: true }));
  }

  return (
    <div className="card stack" data-testid="dca-pending-section">
      <h2 style={{ margin: 0 }}>{t('dca.pendingTitle')}</h2>
      {ok && <p className="ok-text" role="status" data-testid="dca-pending-ok" style={{ margin: 0 }}>{ok}</p>}
      {items.length === 0 ? (
        <p className="muted" data-testid="dca-pending-empty" style={{ margin: 0 }}>{t('dca.noPending')}</p>
      ) : (
        <ul className={s.pendingList}>
          {items.map((p) => {
            const disabled = !!busy[p.id] || !!done[p.id];
            return (
              <li key={p.id} className={s.pending} data-testid={`dca-pending-${p.id}`} data-symbol={p.symbol}>
                <div className="spread">
                  <strong style={{ fontSize: 'var(--fs-lg)' }} data-testid={`dca-pending-symbol-${p.id}`}>{p.symbol}</strong>
                  <span className="muted" data-testid={`dca-pending-date-${p.id}`} data-value={String(p.tradeDate).slice(0, 10)}>
                    {t('dca.pendingDate', { date: fmtDate(String(p.tradeDate).slice(0, 10), lang) })}
                  </span>
                </div>
                <dl className={s.kv}>
                  <div><dt>{t('dca.p.close')}</dt><dd className="num" data-testid={`dca-pending-close-${p.id}`} data-value={p.closePrice}>{f.price(p.closePrice)}</dd></div>
                  <div><dt>{t('dca.p.fx')}</dt><dd className="num" data-testid={`dca-pending-fx-${p.id}`} data-value={p.fxRate}>{f.rate(p.fxRate, 4)}</dd></div>
                  <div><dt>{t('dca.p.usd')}</dt><dd className="num" data-testid={`dca-pending-usd-${p.id}`} data-value={p.usdAmount}>{f.usd(p.usdAmount)}</dd></div>
                  <div><dt>{t('dca.p.fee')}</dt><dd className="num" data-testid={`dca-pending-fee-${p.id}`} data-value={p.feeUsd}>{f.usd(p.feeUsd)}</dd></div>
                  <div><dt>{t('dca.p.invest')}</dt><dd className="num" data-testid={`dca-pending-invest-${p.id}`} data-value={p.investUsd}>{f.usd(p.investUsd)}</dd></div>
                  <div><dt>{t('dca.p.shares')}</dt><dd className="num" data-testid={`dca-pending-shares-${p.id}`} data-value={p.shares}>{f.shares(p.shares)}</dd></div>
                </dl>
                {errs[p.id] && <p className="error-text" role="alert" data-testid={`dca-pending-error-${p.id}`} style={{ margin: 0 }}>{errs[p.id]}</p>}
                <div className={s.formActions}>
                  <button type="button" className="btn btn-primary" disabled={disabled} aria-busy={!!busy[p.id]}
                    onClick={() => void act(p.id, 'confirm')} data-testid={`dca-confirm-${p.id}`}>
                    {busy[p.id] ? t('dca.sending') : t('dca.confirm')}
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={disabled}
                    onClick={() => void act(p.id, 'skip')} data-testid={`dca-skip-${p.id}`}>
                    {t('dca.skip')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
