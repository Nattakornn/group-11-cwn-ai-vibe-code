'use client';
// F6 · คัดกรองหุ้น (FR-45, FR-46 · BR-51, BR-52) · ไม่มีป้ายจัดลำดับหรือป้ายชี้ว่าตัวไหนดี
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { makeT, type Dict } from '@/lib/i18n';
import { tid } from '@/lib/testid';
import { fmtNum } from '@/lib/money';
import { fmtCap, isNonNegNumber } from './format';
import s from './study.module.css';

type Row = { symbol: string; name: string; exchangeLabel: string; pe: string | null; divYieldPct: string | null; marketCapUsd: string | null };
type Col = 'symbol' | 'pe' | 'div' | 'cap';
type Dir = 'asc' | 'desc';
type Filters = { peMax: string; divMin: string; capMinUsd: string; capMaxUsd: string };
const EMPTY: Filters = { peMax: '', divMin: '', capMinUsd: '', capMaxUsd: '' };

export function Screener({ lang, dict }: { lang: 'th' | 'en'; dict: Dict }) {
  const t = makeT(dict);
  const [form, setForm] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<{ col: Col; dir: Dir }>({ col: 'symbol', dir: 'asc' });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const seq = useRef(0);
  const run = useCallback(async (f: Filters, so: { col: Col; dir: Dir }) => {
    const my = ++seq.current;
    setState('loading');
    setError(null);
    const body: Record<string, string> = { sort: so.col, dir: so.dir };
    if (f.peMax.trim()) body.peMax = f.peMax.trim();
    if (f.divMin.trim()) body.divMin = f.divMin.trim();
    if (f.capMinUsd.trim()) body.capMinUsd = f.capMinUsd.trim();
    if (f.capMaxUsd.trim()) body.capMaxUsd = f.capMaxUsd.trim();
    const r = await api<{ results: Row[] }>('/api/screener', { method: 'POST', body, lang });
    if (my !== seq.current) return; // ตอบช้ากว่าคำขอใหม่ ทิ้งไป
    if (r.ok && r.data) {
      setRows(r.data.results);
      setState('ready');
    } else {
      setRows(null); // R91: ไม่แสดงผลเก่าคู่กับ error
      setError(r.error?.message ?? t('common.error'));
      setState('error');
    }
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void run(EMPTY, { col: 'symbol', dir: 'asc' }); }, [run]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const bad = Object.values(form).some((v) => v.trim() !== '' && !isNonNegNumber(v));
    if (bad) { ++seq.current; setRows(null); setError(t('scr.invalidNumber')); setState('error'); return; }
    setApplied(form);
    void run(form, sort);
  };
  const reset = () => {
    setForm(EMPTY);
    setApplied(EMPTY);
    const so = { col: 'symbol' as Col, dir: 'asc' as Dir };
    setSort(so);
    void run(EMPTY, so);
  };
  const sortBy = (col: Col) => {
    const so: { col: Col; dir: Dir } = sort.col === col ? { col, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' };
    setSort(so);
    void run(applied, so);
  };

  const field = (key: keyof Filters, label: string, id: string, cap = false) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input num" inputMode="decimal" autoComplete="off" value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} data-testid={id} />
      {cap && <span className={s.hint} data-testid={`${id}-hint`}>
        {isNonNegNumber(form[key]) ? t('scr.capHint', { value: fmtCap(form[key]) }) : ' '}
      </span>}
    </div>
  );

  const th = (col: Col, label: string, right = false, extra = '') => {
    const on = sort.col === col;
    return (
      <th className={`${right ? 'r' : ''} ${extra}`} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={`${s.sortBtn} ${on ? s.sortOn : ''}`} onClick={() => sortBy(col)}
          data-testid={tid('scr', 'sort', col)} data-dir={on ? sort.dir : undefined}
          title={on ? t(sort.dir === 'asc' ? 'scr.sortAsc' : 'scr.sortDesc') : undefined}>
          {label}<span className={s.arrow} aria-hidden="true">{on ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
        </button>
      </th>
    );
  };
  const none = <span className={s.none}>{t('common.none')}</span>;

  return (
    <section data-testid="screener-page" data-state={state} className="stack">
      <div className="card card-gold">
        <h2>{t('scr.title')}</h2>
        <p className="muted">{t('scr.desc')}</p>
        <form onSubmit={submit} noValidate className="stack" style={{ gap: 12 }} data-testid="scr-form">
          <div className={`${s.form} ${s.formTop}`}>
            {field('peMax', t('scr.peMax'), 'scr-pe-max')}
            {field('divMin', t('scr.divMin'), 'scr-div-min')}
            {field('capMinUsd', t('scr.capMin'), 'scr-cap-min', true)}
            {field('capMaxUsd', t('scr.capMax'), 'scr-cap-max', true)}
          </div>
          <div className={s.actions}>
            <button type="submit" className="btn btn-primary" data-testid="scr-submit" disabled={state === 'loading'}>{t('scr.submit')}</button>
            <button type="button" className="btn btn-ghost" onClick={reset} data-testid="scr-reset">{t('scr.reset')}</button>
          </div>
        </form>
      </div>

      {error && <p className="error-text" role="alert" data-testid="scr-error">{error}</p>}

      {state !== 'error' && <div className="card">
        <div className="spread" style={{ marginBottom: 8 }}>
          <strong data-testid="scr-count" aria-live="polite">
            {rows === null ? t('common.loading') : t('scr.count', { n: fmtNum(rows.length, 0) })}
          </strong>
          {state === 'loading' && rows !== null && <span className="muted" data-testid="scr-loading">{t('common.loading')}</span>}
        </div>
        <div className="table-wrap">
          <table className="table" data-testid="scr-table">
            <thead>
              <tr>
                {th('symbol', t('scr.col.symbol'))}
                <th className={s.hideSm}>{t('scr.col.name')}</th>
                <th className={s.hideSm}>{t('scr.col.exchange')}</th>
                {th('pe', t('scr.col.pe'), true)}
                {th('div', t('scr.col.div'), true)}
                {th('cap', t('scr.col.cap'), true)}
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.symbol} data-testid={tid('scr', 'row', r.symbol)}>
                  <td className={s.symbolCell}>
                    <Link href={`/${lang}/stocks/${encodeURIComponent(r.symbol)}`} data-testid={tid('scr', 'link', r.symbol)}>{r.symbol}</Link>
                  </td>
                  <td className={`${s.nameCell} ${s.hideSm}`} title={r.name}>{r.name}</td>
                  <td className={s.hideSm}><span className="badge badge-info">{r.exchangeLabel}</span></td>
                  <td className="r num" data-testid={tid('scr', 'cell-pe', r.symbol)}>{r.pe === null ? none : fmtNum(r.pe, 2)}</td>
                  <td className="r num" data-testid={tid('scr', 'cell-div', r.symbol)}>{r.divYieldPct === null ? none : `${fmtNum(r.divYieldPct, 2)}%`}</td>
                  <td className="r num" data-testid={tid('scr', 'cell-cap', r.symbol)} title={r.marketCapUsd ?? undefined}>
                    {r.marketCapUsd === null ? none : fmtCap(r.marketCapUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows !== null && rows.length === 0 && <p className="muted" data-testid="scr-empty" style={{ marginTop: 12 }}>{t('scr.empty')}</p>}
        <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>{t('scr.note')}</p>
      </div>}
    </section>
  );
}
