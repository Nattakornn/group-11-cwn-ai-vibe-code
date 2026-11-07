'use client';
// หน้า /{lang}/alerts · FR-21 FR-22 FR-23 FR-26 · BR-20 BR-21 BR-36 BR-37
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { makeT, fmtDateTimeTh } from '@/lib/i18n';
import { fmtUsd } from '@/lib/money';
import { tid } from '@/lib/testid';
import { call, hhmm, LoginRequired, Loading, PageHead, rootState, WatchTabs, type PageState, type WatchProps } from './common';
import s from './watch.module.css';

type Alert = { id: number | string; symbol: string; kind: 'pct' | 'target'; targetPrice: string | null; direction: 'up' | 'down' | null; active: boolean; createdAt: string };
type Data = { items: Alert[]; used: number; limit: number; tier: 'free' | 'pro' };

/** ตัด $ และจุลภาคออกจากราคาที่พิมพ์ (ส่งเป็น string) */
const cleanPrice = (v: string) => v.replace(/[$,\s]/g, '');

export function AlertsView({ lang, dict, initialSymbol }: WatchProps & { initialSymbol: string }) {
  const t = makeT(dict);
  const [state, setState] = useState<PageState>('loading');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [kind, setKind] = useState<'pct' | 'target'>('pct');
  const [target, setTarget] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  const load = useCallback(async () => {
    const r = await call<Data>('/api/alerts', { lang }, t('common.error'));
    if (r.status === 401) { setState('login'); return; }
    if (!r.ok || !r.data) { setError(r.error?.message ?? t('common.error')); setState('error'); return; }
    setData(r.data);
    setState('ready');
  }, [lang]);

  useEffect(() => { void load(); }, [load]);

  async function run(key: string, path: string, method: string, body: unknown, okMsg: string | null, after?: () => void) {
    setBusy(key); setError(null); setOk(null);
    const r = await call(path, { method, body, lang }, t('common.error'));
    if (r.status === 401) setState('login');
    else if (!r.ok) {
      // หุ้นถูกถอด: API ตอบ "ไม่พบหุ้นนี้" + reason=DELISTED → บอกเหตุว่าหยุดซื้อขาย ให้ตรงกับคำเตือนตอนเพิ่มเฝ้าดู (8.2 #7)
      const delisted = (r.error as { reason?: string } | null)?.reason === 'DELISTED';
      const msg = r.error?.message ?? t('common.error');
      setError(delisted ? `${msg} · ${t('alerts.delisted')}` : msg);
    }
    else { if (okMsg) setOk(okMsg); after?.(); await load(); }
    setBusy(null);
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const sym = symbol.trim().toUpperCase();
    const body = kind === 'target' ? { symbol: sym, kind, targetPrice: cleanPrice(target) } : { symbol: sym, kind };
    void run('add', '/api/alerts', 'POST', body, t('alerts.added', { symbol: sym }), () => { setSymbol(''); setTarget(''); });
  }

  const full = data ? data.used >= data.limit : false;

  return (
    <section data-testid="alerts-page" data-state={rootState(state)} className="stack fade-in">
      <WatchTabs lang={lang} dict={dict} current="alerts" />
      <PageHead title={t('alerts.title')} lead={t('alerts.lead')}>
        {data && state === 'ready' && (
          <span className={s.usage}>
            <span data-testid="alert-usage" data-used={data.used} data-limit={data.limit}>{t('alerts.usage', { used: data.used, limit: data.limit })}</span>
            <span className={`${s.meter} ${full ? s.full : ''}`} aria-hidden="true">
              <i style={{ width: `${Math.min(100, Math.round((data.used / Math.max(1, data.limit)) * 100))}%` }} />
            </span>
          </span>
        )}
      </PageHead>

      {state === 'loading' && <Loading dict={dict} page="alerts" />}
      {state === 'login' && <LoginRequired lang={lang} dict={dict} page="alerts" />}
      {state === 'error' && <p className="error-text" role="alert" data-testid="alert-error">{error}</p>}

      {state === 'ready' && data && (
        <>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="card card-gold">
              <h2>{t('alerts.form.title')}</h2>
              <form className="stack" style={{ gap: 12 }} onSubmit={add} data-testid="alert-form">
                <div className="field">
                  <label htmlFor="alert-symbol-input">{t('alerts.form.symbol')}</label>
                  <input id="alert-symbol-input" className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)}
                    placeholder={t('alerts.form.symbolPh')} autoComplete="off" autoCapitalize="characters" spellCheck={false} data-testid="alert-symbol-input" />
                </div>
                <div className="field">
                  <span id="alert-kind-label" style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', fontWeight: 500 }}>{t('alerts.form.kind')}</span>
                  <div className={s.seg} role="radiogroup" aria-labelledby="alert-kind-label">
                    <button type="button" role="radio" aria-checked={kind === 'pct'} className={s.segBtn} onClick={() => setKind('pct')} data-testid="alert-kind-pct">{t('alerts.kind.pct')}</button>
                    <button type="button" role="radio" aria-checked={kind === 'target'} className={s.segBtn} onClick={() => setKind('target')} data-testid="alert-kind-target">{t('alerts.kind.target')}</button>
                  </div>
                </div>
                {kind === 'target' && (
                  <div className="field">
                    <label htmlFor="alert-target-input">{t('alerts.form.target')}</label>
                    <input id="alert-target-input" className="input num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)}
                      placeholder={t('alerts.form.targetPh')} autoComplete="off" data-testid="alert-target-input" />
                  </div>
                )}
                <p className="muted" style={{ margin: 0 }}>{kind === 'pct' ? t('alerts.desc.pct') : t('alerts.desc.target', { price: /^\d+(\.\d+)?$/.test(cleanPrice(target)) ? fmtUsd(cleanPrice(target)) : '…' })}</p>
                <div>
                  <button type="submit" className="btn btn-primary" disabled={busy === 'add'} data-testid="alert-add-btn">{t('alerts.form.add')}</button>
                </div>
                {error && <p className="error-text" role="alert" style={{ margin: 0 }} data-testid="alert-error">{error}</p>}
                {ok && !error && <p className="ok-text" role="status" style={{ margin: 0 }} data-testid="alert-ok">{ok}</p>}
              </form>
            </div>
            <QuietHours lang={lang} dict={dict} />
          </div>

          <div className="card">
            <h2>{t('alerts.list.title')}</h2>
            {data.items.length === 0 ? (
              <div className={s.empty} data-testid="alert-empty">{t('alerts.empty')}</div>
            ) : (
              <ul className={s.list} data-testid="alert-list">
                {data.items.map((a) => {
                  const id = String(a.id);
                  const desc = a.kind === 'pct' ? t('alerts.desc.pct')
                    : a.targetPrice === null ? t('alerts.desc.target', { price: '—' })
                    : a.direction === 'down' ? t('alerts.desc.down', { price: fmtUsd(a.targetPrice) })
                    : a.direction === 'up' ? t('alerts.desc.up', { price: fmtUsd(a.targetPrice) })
                    : t('alerts.desc.target', { price: fmtUsd(a.targetPrice) });
                  return (
                    <li key={id} className={`${s.item} ${a.active ? '' : s.inactive}`} data-testid={tid('alert', 'row', id)}
                      data-kind={a.kind} data-active={a.active ? 'true' : 'false'} data-symbol={a.symbol}>
                      <span className={`${s.icon} ${a.kind === 'target' ? s.gold : ''} ${a.active ? '' : s.off}`} aria-hidden="true">
                        {a.kind === 'pct' ? <PctIcon /> : <TargetIcon />}
                      </span>
                      <div className={s.itemMain}>
                        <div className="row" style={{ gap: 8 }}>
                          <Link href={`/${lang}/stocks/${encodeURIComponent(a.symbol)}`} className={s.sym} data-testid={tid('alert', 'symbol', id)}>{a.symbol}</Link>
                          <span className="badge badge-info" data-testid={tid('alert', 'kind', id)}>{a.kind === 'pct' ? t('alerts.kind.pct') : t('alerts.kind.target')}</span>
                          <span className={`badge ${a.active ? 'badge-up' : 'badge-halted'}`} data-testid={tid('alert', 'status', id)}>
                            {a.active ? t('alerts.status.active') : t('alerts.status.inactive')}
                          </span>
                        </div>
                        <span data-testid={tid('alert', 'desc', id)}>{desc}</span>
                        <small className="muted">{t('alerts.createdAt', { datetime: fmtDateTimeTh(a.createdAt, lang) })}</small>
                        {editing === id && (
                          <form className={s.inlineEdit} onSubmit={(e) => { e.preventDefault(); void run(`edit-${id}`, `/api/alerts/${id}`, 'PATCH', { targetPrice: cleanPrice(editVal) }, null, () => setEditing(null)); }}>
                            <input className="input num" inputMode="decimal" value={editVal} onChange={(e) => setEditVal(e.target.value)}
                              aria-label={t('alerts.form.target')} data-testid={tid('alert', 'edit-input', id)} />
                            <button type="submit" className="btn btn-sm btn-primary" disabled={busy === `edit-${id}`} data-testid={tid('alert', 'edit-save', id)}>{t('alerts.editSave')}</button>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(null)} data-testid={tid('alert', 'edit-cancel', id)}>{t('common.cancel')}</button>
                          </form>
                        )}
                      </div>
                      <div className={s.itemSide}>
                        {a.kind === 'target' && editing !== id && (
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setEditing(id); setEditVal(a.targetPrice ?? ''); }} data-testid={tid('alert', 'edit', id)}>{t('alerts.edit')}</button>
                        )}
                        <button type="button" className="btn btn-sm" disabled={busy === `tog-${id}`}
                          onClick={() => void run(`tog-${id}`, `/api/alerts/${id}`, 'PATCH', { active: !a.active }, null)} data-testid={tid('alert', 'toggle', id)}>
                          {a.active ? t('alerts.pause') : t('alerts.resume')}
                        </button>
                        <button type="button" className="btn btn-sm btn-danger" disabled={busy === `del-${id}`}
                          onClick={() => {
                            // ลบต้องถามยืนยันก่อน (สมมติฐาน 8.2 #8 · R52)
                            if (!window.confirm(t('alerts.deleteConfirm', { symbol: a.symbol }))) return;
                            void run(`del-${id}`, `/api/alerts/${id}`, 'DELETE', undefined, null);
                          }} data-testid={tid('alert', 'delete', id)}>
                          {t('alerts.delete')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function QuietHours({ lang, dict }: WatchProps) {
  const t = makeT(dict);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saved, setSaved] = useState<{ start: string; end: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await call<{ user: { quietStart: string | null; quietEnd: string | null } }>('/api/me', { lang }, '');
      const u = r.data?.user;
      if (u) {
        setStart(hhmm(u.quietStart)); setEnd(hhmm(u.quietEnd));
        setSaved(u.quietStart && u.quietEnd ? { start: hhmm(u.quietStart), end: hhmm(u.quietEnd) } : null);
      }
    })();
  }, [lang]);

  async function save(clear: boolean) {
    setBusy(true); setMsg(null); setErr(null);
    // ปุ่มล้าง = ส่ง null ทั้งคู่ · ปุ่มบันทึกส่งค่าที่กรอกตามจริง (ช่องว่าง = '' ให้ API ปฏิเสธ · สมมติฐาน 8.2 #30)
    const body = clear ? { start: null, end: null } : { start, end };
    const r = await call<Record<string, string | null>>('/api/me/quiet-hours', { method: 'PATCH', body, lang }, t('common.error'));
    if (!r.ok) setErr(r.error?.message ?? t('common.error'));
    else {
      const d = r.data ?? {};
      const ns = hhmm((d.quietStart ?? d.start ?? (d as any).user?.quietStart ?? body.start) as string | null);
      const ne = hhmm((d.quietEnd ?? d.end ?? (d as any).user?.quietEnd ?? body.end) as string | null);
      setStart(ns); setEnd(ne);
      setSaved(ns && ne ? { start: ns, end: ne } : null);
      setMsg(clear ? t('quiet.cleared') : t('quiet.saved'));
    }
    setBusy(false);
  }

  return (
    <div className="card" data-testid="quiet-section">
      <h2>{t('quiet.title')}</h2>
      <p className="muted">{t('quiet.lead')}</p>
      <p data-testid="quiet-current" data-start={saved?.start ?? ''} data-end={saved?.end ?? ''} style={{ fontWeight: 600 }}>
        {saved ? t('quiet.current', saved) : t('quiet.none')}
      </p>
      <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); void save(false); }}>
        <div className={s.formGrid}>
          <div className="field">
            <label htmlFor="quiet-start">{t('quiet.start')}</label>
            <input id="quiet-start" type="time" className="input num" value={start} onChange={(e) => setStart(e.target.value)} data-testid="quiet-start" />
          </div>
          <div className="field">
            <label htmlFor="quiet-end">{t('quiet.end')}</label>
            <input id="quiet-end" type="time" className="input num" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="quiet-end" />
          </div>
        </div>
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="quiet-save">{t('quiet.save')}</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void save(true)} data-testid="quiet-clear">{t('quiet.clear')}</button>
        </div>
        {err && <p className="error-text" role="alert" style={{ margin: 0 }} data-testid="quiet-error">{err}</p>}
        {msg && !err && <p className="ok-text" role="status" style={{ margin: 0 }} data-testid="quiet-ok">{msg}</p>}
      </form>
    </div>
  );
}

function PctIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
