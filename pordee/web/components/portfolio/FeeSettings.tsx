'use client';
// F4 · ตั้งค่าธรรมเนียมของตัวเอง (FR-31) · GET / PATCH /api/me/fees
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { Lang } from '@/lib/i18n';
import type { Fees } from './shared';
import s from './portfolio.module.css';

type T = (k: string, v?: Record<string, string | number>) => string;

export function FeeSettings({ lang, t, tc, fees, onSaved }: { lang: Lang; t: T; tc: T; fees: Fees | null; onSaved: (f: Fees) => void }) {
  const [rate, setRate] = useState(fees?.feeRatePct ?? '');
  const [min, setMin] = useState(fees?.feeMinUsd ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (fees) { setRate(fees.feeRatePct); setMin(fees.feeMinUsd); }
  }, [fees]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null); setOk(null); setSending(true);
    const r = await api<Fees>('/api/me/fees', { method: 'PATCH', body: { feeRatePct: rate.trim(), feeMinUsd: min.trim() }, lang });
    setSending(false);
    if (!r.ok) { setError(r.error?.message ?? tc('common.error')); return; }
    setOk(t('fee.ok'));
    onSaved(r.data && r.data.feeRatePct !== undefined ? r.data : { feeRatePct: rate.trim(), feeMinUsd: min.trim() });
  }

  return (
    <form className="card stack" onSubmit={save} noValidate data-testid="fee-form">
      <h2 style={{ margin: 0 }}>{t('fee.title')}</h2>
      <p className="muted" style={{ margin: 0 }}>{t('fee.desc')}</p>
      <div className={s.formGrid}>
        <div className="field">
          <label htmlFor="fee-rate">{t('fee.rate')}</label>
          <input id="fee-rate" className="input num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} data-testid="fee-rate" />
        </div>
        <div className="field">
          <label htmlFor="fee-min">{t('fee.min')}</label>
          <input id="fee-min" className="input num" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} data-testid="fee-min" />
        </div>
      </div>
      {error && <p className="error-text" role="alert" data-testid="fee-error" style={{ margin: 0 }}>{error}</p>}
      {ok && <p className="ok-text" role="status" data-testid="fee-ok" style={{ margin: 0 }}>{ok}</p>}
      <div className={s.formActions}>
        <button type="submit" className="btn" disabled={sending} aria-busy={sending} data-testid="fee-save">{t('fee.save')}</button>
      </div>
    </form>
  );
}
