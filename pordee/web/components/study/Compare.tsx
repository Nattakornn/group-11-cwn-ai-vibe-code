'use client';
// F6 · เทียบหุ้น 2–4 ตัว (FR-17, BR-53) + ช่วงตามสิทธิ์ (FR-41) + โหลด CSV (FR-43)
import { useMemo, useState } from 'react';
import { api } from '@/lib/api-client';
import { fmtDate, makeT, type Dict } from '@/lib/i18n';
import { tid } from '@/lib/testid';
import { D, fmtNum, fmtPct } from '@/lib/money';
import { CompareChart, SERIES_VARS, type Hover, type Series } from './CompareChart';
import { ExportCsv } from './ExportCsv';
import type { StudyCtx } from './server';
import s from './study.module.css';

type Res = { series: Series[]; final: { symbol: string; pct: string }[] };
const clean = (v: string) => v.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);

export function Compare({ lang, dict, ctx, initial }: {
  lang: 'th' | 'en'; dict: Dict; ctx: StudyCtx; initial: { symbols: string[]; from: string; to: string };
}) {
  const t = makeT(dict);
  const [symbols, setSymbols] = useState<string[]>(initial.symbols);
  const [input, setInput] = useState('');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('ready');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [hover, setHover] = useState<Hover>(null);

  const add = () => {
    const sym = clean(input);
    if (!sym) return;
    if (symbols.includes(sym)) { setNotice(t('cmp.duplicate', { symbol: sym })); return; }
    setSymbols([...symbols, sym]);
    setInput('');
    setNotice(null);
  };
  const remove = (sym: string) => { setSymbols(symbols.filter((x) => x !== sym)); setNotice(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('loading'); setError(null); setHover(null);
    const r = await api<Res>('/api/compare', { method: 'POST', body: { symbols, from, to }, lang });
    if (r.ok && r.data) {
      setRes(r.data);
      setState('ready');
    } else {
      setRes(null);
      setError(r.error?.message ?? t('common.error'));
      setState('error');
    }
  };

  // สีตามตำแหน่งของหุ้นในผลลัพธ์ (คงที่ตามตัวหุ้น ไม่ใช่ตามค่ามากน้อย)
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    res?.series.forEach((sr, i) => m.set(sr.symbol, `var(${SERIES_VARS[i % SERIES_VARS.length]})`));
    return m;
  }, [res]);
  const finals = useMemo(() => new Map(res?.final.map((f) => [f.symbol, f.pct]) ?? []), [res]);
  const dir = (pct: string) => (D(pct).gt(0) ? 'up' : D(pct).lt(0) ? 'down' : 'flat');

  return (
    <section data-testid="compare-page" data-state={state} className={`stack ${s.chartRoot}`}>
      <div className="card card-gold">
        <h2>{t('cmp.title')}</h2>
        <p className="muted">{t('cmp.desc')}</p>
        <form onSubmit={submit} noValidate className="stack" data-testid="cmp-form">
          <div className="field">
            <label htmlFor="cmp-symbol-input">{t('cmp.symbol')}</label>
            <div className={s.addRow}>
              <input id="cmp-symbol-input" className={`input num ${s.grow}`} value={input} autoComplete="off" placeholder={t('cmp.symbolPlaceholder')}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                data-testid="cmp-symbol-input" />
              <button type="button" className="btn" onClick={add} data-testid="cmp-add">{t('cmp.add')}</button>
            </div>
          </div>
          <div className={s.chips} data-testid="cmp-chips" aria-live="polite">
            {symbols.length === 0
              ? <span className="muted" data-testid="cmp-chips-empty">{t('cmp.chipsEmpty')}</span>
              : symbols.map((x) => (
                <span key={x} className={s.chip} data-testid={tid('cmp', 'chip', x)}>
                  {colorOf.has(x) && <span className={s.swatch} style={{ background: colorOf.get(x) }} aria-hidden="true" />}
                  {x}
                  <button type="button" className={s.chipX} onClick={() => remove(x)} aria-label={t('cmp.remove', { symbol: x })}
                    data-testid={tid('cmp', 'remove', x)}>✕</button>
                </span>
              ))}
          </div>
          <span className="muted" data-testid="cmp-chips-count">{t('cmp.chipsCount', { n: fmtNum(symbols.length, 0) })}</span>
          {notice && <span className="muted" data-testid="cmp-notice">{notice}</span>}
          <div className={s.form}>
            <div className="field">
              <label htmlFor="cmp-from">{t('cmp.from')}</label>
              <input id="cmp-from" type="date" className="input num" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="cmp-from" />
            </div>
            <div className="field">
              <label htmlFor="cmp-to">{t('cmp.to')}</label>
              <input id="cmp-to" type="date" className="input num" value={to} onChange={(e) => setTo(e.target.value)} data-testid="cmp-to" />
            </div>
            <div className={s.actions}>
              <button type="submit" className="btn btn-primary" disabled={state === 'loading'} data-testid="cmp-submit">{t('cmp.submit')}</button>
            </div>
          </div>
          <span className="muted" data-testid="cmp-earliest">
            {t('common.tierLimit', { tier: ctx.tier === 'pro' ? 'Pro' : 'Free', date: fmtDate(ctx.historyStart, lang) })}
          </span>
        </form>
      </div>

      {error && <p className="error-text" role="alert" data-testid="cmp-error">{error}</p>}
      {state === 'loading' && <p className="muted" data-testid="cmp-loading">{t('common.loading')}</p>}

      {res && (
        <div className="card stack" data-testid="cmp-result">
          <div className="spread">
            <h3 style={{ margin: 0 }}>{t('cmp.final')}</h3>
            <span className="muted" data-testid="cmp-hover-date">
              {hover ? t('cmp.hoverDate', { date: fmtDate(hover.date, lang) }) : t('cmp.hoverHint')}
            </span>
          </div>
          <ul className={s.legend} aria-label={t('cmp.legend')}>
            {res.series.map((sr) => {
              const fin = finals.get(sr.symbol);
              const hv = hover?.values[sr.symbol];
              return (
                <li key={sr.symbol} className={s.legendItem} data-testid={tid('cmp', 'legend', sr.symbol)}>
                  <span className={s.legendTop}>
                    <span className={s.swatch} style={{ background: colorOf.get(sr.symbol) }} aria-hidden="true" />
                    {sr.symbol}
                  </span>
                  <span className={`num ${s.legendVal} ${fin ? dir(fin) : 'flat'}`} data-testid={tid('cmp', 'final', sr.symbol)}>
                    {fin === undefined ? '—' : fmtPct(fin)}
                  </span>
                  <span className={`num ${s.legendHover}`}>{hover ? (hv === undefined ? '—' : fmtPct(hv)) : ' '}</span>
                </li>
              );
            })}
          </ul>
          <CompareChart series={res.series} label={t('cmp.chartLabel')} onHover={setHover} />
          <p className="muted" style={{ margin: 0 }}>{t('cmp.formula')}</p>
        </div>
      )}

      <ExportCsv lang={lang} dict={dict} symbols={symbols} from={from} to={to} tier={ctx.tier} />
    </section>
  );
}
