'use client';
// F4 · จดรายการซื้อ/ขาย (FR-27) · แก้/ลบ (FR-28) · ค่าธรรมเนียมเว้นว่าง = API คิดให้ตามค่าตั้ง
import { useRef, useState } from 'react';
import { D } from '@/lib/money';
import { api } from '@/lib/api-client';
import { fmtDate, type Lang } from '@/lib/i18n';
import { nyDate, type Fees, type mkFmt, type Tx } from './shared';
import s from './portfolio.module.css';

type T = (k: string, v?: Record<string, string | number>) => string;
type F = ReturnType<typeof mkFmt>;
type Side = 'buy' | 'sell';

export function TxSection({ lang, t, tc, f, txs, listError, fees, symbols, defaultDate, onChanged, aside }: {
  lang: Lang; t: T; tc: T; f: F; txs: Tx[]; listError: string | null; fees: Fees | null;
  symbols: string[]; defaultDate: string; onChanged: () => Promise<void>; aside?: React.ReactNode;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<Side>('buy');
  const [date, setDate] = useState(() => nyDate(defaultDate));
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [fee, setFee] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const inflight = useRef(false);

  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [rowOk, setRowOk] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null); setSymbol(''); setSide('buy'); setDate(nyDate(defaultDate)); setShares(''); setPrice(''); setFee('');
  }

  function startEdit(x: Tx) {
    setEditingId(x.id); setSymbol(x.symbol); setSide(x.side); setDate(String(x.tradeDate).slice(0, 10));
    setShares(x.shares); setPrice(x.price); setFee(x.feeUsd ?? '');
    setError(null); setOk(null); setConfirmDel(null);
    if (typeof document !== 'undefined') document.getElementById('pf-tx-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inflight.current) return;
    setError(null); setOk(null);
    const sym = symbol.trim().toUpperCase();
    if (!sym || !date || !shares.trim() || !price.trim()) { setError(t('tx.required')); return; }
    const body: Record<string, string> = { symbol: sym, side, tradeDate: date, shares: shares.trim(), price: price.trim() };
    if (fee.trim() !== '') body.feeUsd = fee.trim();
    inflight.current = true; setSending(true);
    const r = editingId === null
      ? await api<{ transaction: Tx }>('/api/transactions', { method: 'POST', body, lang })
      : await api<{ transaction: Tx }>(`/api/transactions/${editingId}`, { method: 'PATCH', body, lang });
    inflight.current = false; setSending(false);
    if (!r.ok) { setError(r.error?.message ?? tc('common.error')); return; }
    const wasEdit = editingId !== null;
    const feeUsd = r.data?.transaction?.feeUsd;
    resetForm();
    setOk(wasEdit ? t('tx.okUpdate') : t('tx.ok', { fee: f.usd(feeUsd) }));
    await onChanged();
  }

  async function del(id: number) {
    setRowBusy(id); setRowErr(null); setRowOk(null);
    const r = await api(`/api/transactions/${id}`, { method: 'DELETE', lang });
    setRowBusy(null); setConfirmDel(null);
    if (!r.ok) { setRowErr(r.error?.message ?? tc('common.error')); return; }
    if (editingId === id) resetForm();
    setRowOk(t('tx.okDelete'));
    await onChanged();
  }

  const sourceLabel = (src: string) => (['manual', 'dca', 'dividend'].includes(src) ? t(`tx.source.${src}`) : src);

  return (
    <>
      <div className="grid-2" style={{ alignItems: 'start' }}>
      <form id="pf-tx-form" className="card stack" onSubmit={submit} noValidate data-testid="tx-form" data-mode={editingId === null ? 'new' : 'edit'}>
        <h2 style={{ margin: 0 }}>{editingId === null ? t('tx.title') : t('tx.editTitle', { id: editingId })}</h2>

        <div className="field">
          <span className="muted">{t('tx.side')}</span>
          <div className={s.seg} role="group" aria-label={t('tx.side')}>
            <button type="button" className={s.buy} aria-pressed={side === 'buy'} onClick={() => setSide('buy')} data-testid="tx-side-buy">{t('tx.buy')}</button>
            <button type="button" className={s.sell} aria-pressed={side === 'sell'} onClick={() => setSide('sell')} data-testid="tx-side-sell">{t('tx.sell')}</button>
          </div>
        </div>

        <div className={s.formGrid}>
          <div className="field">
            <label htmlFor="tx-symbol">{t('tx.symbol')}</label>
            <input id="tx-symbol" className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder={t('tx.symbolPh')}
              autoCapitalize="characters" autoComplete="off" list="pf-symbol-list" data-testid="tx-symbol" />
            <datalist id="pf-symbol-list">{symbols.map((x) => <option key={x} value={x} />)}</datalist>
          </div>
          <div className="field">
            <label htmlFor="tx-date">{t('tx.date')}</label>
            <input id="tx-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} data-testid="tx-date" />
          </div>
          <div className="field">
            <label htmlFor="tx-shares">{t('tx.shares')}</label>
            <input id="tx-shares" className="input num" inputMode="decimal" value={shares} onChange={(e) => setShares(e.target.value)}
              placeholder="0.0000" data-testid="tx-shares" />
            <span className={s.hint}>{t('tx.sharesHint')}</span>
          </div>
          <div className="field">
            <label htmlFor="tx-price">{t('tx.price')}</label>
            <input id="tx-price" className="input num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00" data-testid="tx-price" />
          </div>
          <div className="field">
            <label htmlFor="tx-fee">{t('tx.fee')}</label>
            <input id="tx-fee" className="input num" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)}
              placeholder={t('tx.feePh')} data-testid="tx-fee" />
            {fees && <span className={s.hint} data-testid="tx-fee-hint">{t('tx.feeHint', { rate: D(fees.feeRatePct).toFixed(), min: f.usd(fees.feeMinUsd) })}</span>}
          </div>
        </div>

        {error && <p className="error-text" role="alert" data-testid="tx-error" style={{ margin: 0 }}>{error}</p>}
        {ok && <p className="ok-text" role="status" data-testid="tx-ok" style={{ margin: 0 }}>{ok}</p>}

        <div className={s.formActions}>
          <button type="submit" className="btn btn-primary" disabled={sending} aria-busy={sending} data-testid="tx-submit">
            {sending ? t('tx.sending') : editingId === null ? t('tx.submit') : t('tx.update')}
          </button>
          {editingId !== null && (
            <button type="button" className="btn btn-ghost" onClick={() => { resetForm(); setError(null); }} data-testid="tx-cancel-edit">{t('tx.cancelEdit')}</button>
          )}
        </div>
      </form>
      {aside}
      </div>

      <div className="card stack" data-testid="tx-list">
        <h2 style={{ margin: 0 }}>{t('tx.listTitle')}</h2>
        {listError && <p className="error-text" role="alert" data-testid="tx-list-error" style={{ margin: 0 }}>{listError}</p>}
        {rowErr && <p className="error-text" role="alert" data-testid="tx-row-error" style={{ margin: 0 }}>{rowErr}</p>}
        {rowOk && <p className="ok-text" role="status" data-testid="tx-row-ok" style={{ margin: 0 }}>{rowOk}</p>}
        {txs.length === 0 ? (
          <p className="muted" data-testid="tx-empty" style={{ margin: 0 }}>{t('tx.listEmpty')}</p>
        ) : (
          <div className="table-wrap">
            <table className={s.rtable}>
              <thead>
                <tr>
                  <th scope="col">{t('tx.colDate')}</th>
                  <th scope="col">{t('tx.colSide')}</th>
                  <th scope="col">{t('tx.colSymbol')}</th>
                  <th scope="col">{t('tx.colShares')}</th>
                  <th scope="col">{t('tx.colPrice')}</th>
                  <th scope="col">{t('tx.colFee')}</th>
                  <th scope="col">{t('tx.colFx')}</th>
                  <th scope="col">{t('tx.colSource')}</th>
                  <th scope="col">{t('tx.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((x) => (
                  <tr key={x.id} data-testid={`tx-row-${x.id}`} data-symbol={x.symbol} data-side={x.side} data-editing={editingId === x.id ? 'true' : undefined}>
                    <td><span data-testid={`tx-date-${x.id}`} data-value={String(x.tradeDate).slice(0, 10)}>{fmtDate(String(x.tradeDate).slice(0, 10), lang)}</span></td>
                    <td data-label={t('tx.colSide')}>
                      <span className={`badge ${x.side === 'buy' ? 'badge-up' : 'badge-down'}`} data-testid={`tx-side-${x.id}`}>{x.side === 'buy' ? t('tx.buy') : t('tx.sell')}</span>
                    </td>
                    <td data-label={t('tx.colSymbol')}><strong data-testid={`tx-symbol-${x.id}`}>{x.symbol}</strong></td>
                    <td data-label={t('tx.colShares')}><span className="num" data-testid={`tx-shares-${x.id}`} data-value={x.shares}>{f.shares(x.shares)}</span></td>
                    <td data-label={t('tx.colPrice')}><span className="num" data-testid={`tx-price-${x.id}`} data-value={x.price}>{f.price(x.price)}</span></td>
                    <td data-label={t('tx.colFee')}><span className="num" data-testid={`tx-fee-${x.id}`} data-value={x.feeUsd}>{f.usd(x.feeUsd)}</span></td>
                    <td data-label={t('tx.colFx')}><span className="num" data-testid={`tx-fx-${x.id}`} data-value={x.fxRate ?? ''}>{f.rate(x.fxRate, 4)}</span></td>
                    <td data-label={t('tx.colSource')}><span data-testid={`tx-source-${x.id}`}>{sourceLabel(x.source)}</span></td>
                    <td data-label={t('tx.colActions')}>
                      <div className={s.actions}>
                        {confirmDel === x.id ? (
                          <>
                            <button type="button" className="btn btn-sm btn-danger" disabled={rowBusy === x.id} onClick={() => void del(x.id)} data-testid={`tx-delete-confirm-${x.id}`}>{t('tx.deleteConfirm')}</button>
                            <button type="button" className="btn btn-sm btn-ghost" disabled={rowBusy === x.id} onClick={() => setConfirmDel(null)} data-testid={`tx-delete-cancel-${x.id}`}>{t('tx.deleteCancel')}</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="btn btn-sm" onClick={() => startEdit(x)} data-testid={`tx-edit-${x.id}`}>{t('tx.edit')}</button>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setConfirmDel(x.id); setRowErr(null); setRowOk(null); }} data-testid={`tx-delete-${x.id}`}>{t('tx.delete')}</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
