'use client';
// F4 · แผน DCA (FR-33): ตั้ง แก้เงิน/วันที่ หยุด/เริ่มต่อ · 1 แผนต่อ 1 หุ้น
import { useState } from 'react';
import { api } from '@/lib/api-client';
import { fmtDate, type Lang } from '@/lib/i18n';
import type { DcaPlan, mkFmt } from './shared';
import s from './portfolio.module.css';

type T = (k: string, v?: Record<string, string | number>) => string;
type F = ReturnType<typeof mkFmt>;

/** วันที่เป็นจำนวนเต็มถ้ากรอกเป็นตัวเลข ไม่งั้นส่งตามที่กรอกให้ API ตอบ DAY_OUT_OF_RANGE */
const dayValue = (v: string): number | string => (/^\d+$/.test(v.trim()) ? parseInt(v.trim(), 10) : v.trim());

export function DcaSection({ lang, t, tc, f, plans, listError, onChanged }: {
  lang: Lang; t: T; tc: T; f: F; plans: DcaPlan[]; listError: string | null; onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<DcaPlan | null>(null);
  const [symbol, setSymbol] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);

  function reset() { setEditing(null); setSymbol(''); setAmount(''); setDay(''); }

  function startEdit(p: DcaPlan) {
    setEditing(p); setSymbol(p.symbol); setAmount(p.amountThb); setDay(String(p.dayOfMonth));
    setError(null); setOk(null);
    if (typeof document !== 'undefined') document.getElementById('pf-dca-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null); setOk(null);
    const sym = symbol.trim().toUpperCase();
    if (!sym || !amount.trim() || !day.trim()) { setError(t('dca.required')); return; }
    setSending(true);
    const r = editing
      ? await api(`/api/dca/plans/${editing.id}`, { method: 'PATCH', body: { amountThb: amount.trim(), dayOfMonth: dayValue(day) }, lang })
      : await api('/api/dca/plans', { method: 'POST', body: { symbol: sym, amountThb: amount.trim(), dayOfMonth: dayValue(day) }, lang });
    setSending(false);
    if (!r.ok) { setError(r.error?.message ?? tc('common.error')); return; }
    reset();
    setOk(t('dca.ok'));
    await onChanged();
  }

  async function toggle(p: DcaPlan) {
    setRowBusy(p.id); setRowErr(null);
    const r = await api(`/api/dca/plans/${p.id}`, { method: 'PATCH', body: { active: !p.active }, lang });
    setRowBusy(null);
    if (!r.ok) { setRowErr(r.error?.message ?? tc('common.error')); return; }
    await onChanged();
  }

  return (
    <div className="card stack" data-testid="dca-section">
      <div className="stack" style={{ gap: 4 }}>
        <h2 style={{ margin: 0 }}>{t('dca.title')}</h2>
        <p className="muted" style={{ margin: 0 }}>{t('dca.desc')}</p>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>{t('dca.plansTitle')}</h3>
          {listError && <p className="error-text" role="alert" data-testid="dca-plans-error" style={{ margin: 0 }}>{listError}</p>}
          {rowErr && <p className="error-text" role="alert" data-testid="dca-plan-error" style={{ margin: 0 }}>{rowErr}</p>}
          {plans.length === 0 ? (
            <p className="muted" data-testid="dca-plans-empty" style={{ margin: 0 }}>{t('dca.noPlans')}</p>
          ) : (
            <ul className={s.planList}>
              {plans.map((p) => (
                <li key={p.id} className={s.plan} data-testid={`dca-plan-${p.symbol}`} data-active={p.active ? 'true' : 'false'}>
                  <div className="stack" style={{ gap: 2 }}>
                    <strong>{p.symbol}</strong>
                    <span data-testid={`dca-plan-line-${p.symbol}`}>
                      {t('dca.planLine', { amount: f.thb(p.amountThb), day: p.dayOfMonth })}
                    </span>
                    {p.active && p.nextTradeDate && (
                      <span className="muted" data-testid={`dca-plan-next-${p.symbol}`} data-value={String(p.nextTradeDate).slice(0, 10)}>
                        {t('dca.next', { date: fmtDate(String(p.nextTradeDate).slice(0, 10), lang) })}
                      </span>
                    )}
                    <span>
                      <span className={`badge ${p.active ? 'badge-up' : 'badge-halted'}`} data-testid={`dca-plan-status-${p.symbol}`}>
                        {p.active ? t('dca.active') : t('dca.paused')}
                      </span>
                    </span>
                  </div>
                  <div className={s.actions}>
                    <button type="button" className="btn btn-sm" onClick={() => startEdit(p)} data-testid={`dca-edit-${p.symbol}`}>{t('dca.edit')}</button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={rowBusy === p.id} onClick={() => void toggle(p)} data-testid={`dca-toggle-${p.symbol}`}>
                      {p.active ? t('dca.pause') : t('dca.resume')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form id="pf-dca-form" className="stack" onSubmit={save} noValidate data-testid="dca-form" data-mode={editing ? 'edit' : 'new'} style={{ gap: 12 }}>
          <h3 style={{ margin: 0 }}>{editing ? t('dca.formEdit', { symbol: editing.symbol }) : t('dca.formNew')}</h3>
          <div className={s.formGrid}>
            <div className="field">
              <label htmlFor="dca-symbol">{t('dca.symbol')}</label>
              <input id="dca-symbol" className="input" value={symbol} disabled={!!editing} onChange={(e) => setSymbol(e.target.value)}
                placeholder={t('tx.symbolPh')} autoCapitalize="characters" autoComplete="off" data-testid="dca-symbol" />
            </div>
            <div className="field">
              <label htmlFor="dca-amount">{t('dca.amount')}</label>
              <input id="dca-amount" className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="5000.00" data-testid="dca-amount" />
            </div>
            <div className="field">
              <label htmlFor="dca-day">{t('dca.day')}</label>
              <input id="dca-day" className="input num" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)}
                placeholder="25" data-testid="dca-day" />
              <span className={s.hint}>{t('dca.dayHint')}</span>
            </div>
          </div>
          {error && <p className="error-text" role="alert" data-testid="dca-error" style={{ margin: 0 }}>{error}</p>}
          {ok && <p className="ok-text" role="status" data-testid="dca-ok" style={{ margin: 0 }}>{ok}</p>}
          <div className={s.formActions}>
            <button type="submit" className="btn btn-gold" disabled={sending} aria-busy={sending} data-testid="dca-save">{t('dca.save')}</button>
            {editing && (
              <button type="button" className="btn btn-ghost" onClick={() => { reset(); setError(null); }} data-testid="dca-cancel-edit">{t('dca.cancelEdit')}</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
