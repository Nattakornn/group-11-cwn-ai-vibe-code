'use client';
// หน้าหุ้น (F2) · FR-03, FR-07, FR-10–FR-16, FR-47, FR-48
// GET /api/stocks/:symbol เรียกครั้งเดียวต่อการเปิดหน้า (กินโควตา) · กราฟ/ตัวชี้วัดใช้ /candles และ /indicators
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiResult } from '@/lib/api-client';
import { makeT, fmtDate, type Dict, type Lang } from '@/lib/i18n';
import { fmtNum } from '@/lib/money';
import { tid } from '@/lib/testid';
import type { Quote } from '@/lib/feed';
import { QuoteLine } from '@/components/quote';
import { CandleChart, RsiChart } from './PriceChart';
import { friendly, fmtCap, fmtPrice, fmtVol, fmtWhen, isDate, minusMonths, type Bar, type Candles, type Indicators, type Stock } from './format';
import styles from './stock.module.css';

type StockResp = { stock: Stock; quote: Quote };
type ApiErr = { code: string; message: string };

// กันเรียกซ้ำตอน React strict mode (effect รัน 2 รอบใน dev) · 1 ครั้งต่อการเปิดหน้า
const once = new WeakMap<object, Promise<ApiResult<StockResp>>>();

export function StockView({ lang, symbol, dict, core }: { lang: Lang; symbol: string; dict: Dict; core: Dict }) {
  const t = makeT(dict);
  const ct = makeT(core);
  const enc = encodeURIComponent(symbol);
  const pageKey = useRef<object>({});

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<StockResp | null>(null);
  const [error, setError] = useState<ApiErr | null>(null);

  useEffect(() => {
    let alive = true;
    let p = once.get(pageKey.current);
    if (!p) { p = api<StockResp>(`/api/stocks/${enc}`, { lang }); once.set(pageKey.current, p); }
    p.then((r) => {
      if (!alive) return;
      if (r.ok && r.data) { setData(r.data); setState('ready'); }
      else { setError(friendly(r.error, ct('common.error'))); setState('error'); }
    }).catch(() => { if (alive) { setError({ code: 'NETWORK', message: ct('common.error') }); setState('error'); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enc, lang]);

  return (
    <section data-testid="stock-page" data-state={state} data-symbol={symbol} className="stack">
      <Link href={`/${lang}/search`} className={styles.back} data-testid="stock-back">{t('page.back')}</Link>

      {state === 'loading' && (
        <div className="card" aria-busy="true"><span className="muted" data-testid="stock-loading">{t('page.loading')}</span></div>
      )}

      {state === 'error' && error && (
        <div className="card stack" style={{ gap: 8 }}>
          <h1 className={styles.symbol}>{symbol}</h1>
          <p className="error-text" role="alert" data-testid="stock-error" data-code={error.code}>{error.message}</p>
        </div>
      )}

      {state === 'ready' && data && (
        <>
          <Hero data={data} lang={lang} dict={dict} core={core} />
          <div className={styles.layout}>
            <ChartPanel symbol={symbol} lang={lang} dict={dict} />
            <div className={styles.side}>
              <Fundamentals stock={data.stock} lang={lang} dict={dict} />
              <SummaryPanel symbol={symbol} lang={lang} dict={dict} core={core} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- ส่วนหัว ราคา และปุ่ม
function Hero({ data, lang, dict, core }: { data: StockResp; lang: Lang; dict: Dict; core: Dict }) {
  const t = makeT(dict);
  const { stock, quote } = data;
  const kindKey = `kind.${String(stock.kind).toLowerCase()}`;
  const kindLabel = dict[kindKey] ?? stock.kind;
  return (
    <div className="card card-gold fade-in">
      <div className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.symbolRow}>
            <h1 className={styles.symbol} data-testid="stock-symbol">{stock.symbol}</h1>
            <span className="badge badge-info" data-testid="stock-exchange">{stock.exchangeLabel}</span>
            {kindLabel && <span className="badge badge-halted" data-testid="stock-kind">{kindLabel}</span>}
          </div>
          <div className={styles.company} data-testid="stock-name">{stock.name}</div>
          <QuoteLine q={quote} lang={lang} dict={core} id={stock.symbol} size="lg" />
          {(stock.status === 'delisted' || quote.status === 'delisted') && (
            <p className="muted" data-testid="stock-delisted-note" style={{ margin: 0 }}>{t('page.delisted')}</p>
          )}
        </div>
        <WatchActions symbol={stock.symbol} lang={lang} dict={dict} delisted={stock.status === 'delisted' || quote.status === 'delisted'} />
      </div>
    </div>
  );
}

function WatchActions({ symbol, lang, dict, delisted = false }: { symbol: string; lang: Lang; dict: Dict; delisted?: boolean }) {
  const t = makeT(dict);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'login'; text: string; code?: string } | null>(null);
  // อยู่ในรายการแล้ว (เพิ่มสำเร็จ หรือ API ตอบว่ามีแล้ว) → ปุ่มไม่ชวนกดเพิ่มซ้ำ (R51 · TC-WATCH-01)
  const [inList, setInList] = useState(false);

  const add = async () => {
    setBusy(true); setMsg(null);
    try {
      let r = await api<unknown>('/api/watchlist', { method: 'POST', body: { symbol }, lang });
      // หุ้นถูกถอด: เตือนก่อนเพิ่ม · ยกเลิก = ไม่เพิ่ม ไม่กินโควตา (8.2 #7 · R50)
      if (r.status === 409 && r.error?.code === 'DELISTED_CONFIRM') {
        if (!window.confirm(`${r.error.message}\n${t('action.delistedConfirm')}`)) return;
        r = await api<unknown>('/api/watchlist', { method: 'POST', body: { symbol, confirmDelisted: true }, lang });
      }
      if (r.ok) { setInList(true); setMsg({ kind: 'ok', text: t('action.watchOk', { symbol }) }); }
      else if (r.status === 409 && r.error?.code === 'ALREADY_IN_LIST') { setInList(true); setMsg({ kind: 'error', text: r.error.message, code: r.error.code }); }
      else if (r.status === 401) setMsg({ kind: 'login', text: r.error?.message ?? '', code: r.error?.code });
      else { const e = friendly(r.error, t('error.generic')); setMsg({ kind: 'error', text: e.message, code: e.code }); }
    } catch {
      setMsg({ kind: 'error', text: t('error.network'), code: 'NETWORK' });
    } finally { setBusy(false); }
  };

  return (
    <div className={styles.actions}>
      <button type="button" className="btn btn-primary" onClick={add} disabled={busy || inList} data-testid="stock-watch-btn" data-state={inList ? 'added' : 'idle'}>
        {busy ? t('action.watching') : inList ? t('action.watchAdded') : t('action.watch')}
      </button>
      {/* หุ้นถูกถอดตั้งแจ้งเตือนไม่ได้ (API ตอบ 404) → ไม่แสดงปุ่มที่พาไปทางตัน (R50 · 8.2 #7) เหตุผลอยู่ใน stock-delisted-note */}
      {!delisted && <Link href={`/${lang}/alerts?symbol=${encodeURIComponent(symbol)}`} className="btn" data-testid="stock-alert-link">{t('action.alert')}</Link>}
      {msg && (
        <div className={msg.kind === 'ok' ? 'ok-text' : 'error-text'} role="status" data-testid="stock-watch-msg" data-state={msg.kind === 'ok' ? 'ok' : 'error'} data-code={msg.code}>
          {msg.text}{' '}
          {msg.kind === 'ok' && <Link href={`/${lang}/watchlist`} data-testid="stock-watch-view">{t('action.watchView')}</Link>}
          {msg.kind === 'login' && <Link href={`/${lang}/login?next=${encodeURIComponent(`/${lang}/stocks/${symbol}`)}`} data-testid="stock-watch-login">{t('action.login')}</Link>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- ข้อมูลพื้นฐาน (FR-07)
function Fundamentals({ stock, lang, dict }: { stock: Stock; lang: Lang; dict: Dict }) {
  const t = makeT(dict);
  const none = <span className={styles.noneValue}>{t('fund.none')}</span>;
  const items: { key: string; label: string; value: React.ReactNode; title?: string }[] = [
    { key: 'pe', label: t('fund.pe'), value: stock.pe === null ? none : <span className="num">{fmtNum(stock.pe, 2)}</span> },
    { key: 'div', label: t('fund.div'), value: stock.divYieldPct === null ? none : <span className="num">{fmtNum(stock.divYieldPct, 2)}%</span> },
    { key: 'cap', label: t('fund.cap'), value: stock.marketCapUsd === null ? none : <span className="num">{fmtCap(stock.marketCapUsd)}</span> },
  ];
  return (
    <div className="card" data-testid="stock-fundamentals">
      <h2>{t('fund.title')}</h2>
      <div className={styles.fundGrid}>
        {items.map((it) => (
          <div key={it.key} className={styles.fundItem}>
            <span className={styles.label}>{it.label}</span>
            <span className={styles.value} data-testid={tid('stock', it.key)}>{it.value}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ margin: '10px 0 0' }} data-testid="stock-fund-date">
        {t('fund.date', { date: stock.fundamentalsDate ? fmtDate(stock.fundamentalsDate, lang) : t('fund.none') })}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- กราฟ + ตัวชี้วัด
type Range = { from: string; to: string };

function ChartPanel({ symbol, lang, dict }: { symbol: string; lang: Lang; dict: Dict }) {
  const t = makeT(dict);
  const enc = encodeURIComponent(symbol);

  const [interval, setIntervalKind] = useState<'day' | 'week'>('day');
  const [adjusted, setAdjusted] = useState(true);
  const [applied, setApplied] = useState<Range | null>(null); // null = ค่าเริ่มต้นของ API
  const [fromIn, setFromIn] = useState('');
  const [toIn, setToIn] = useState('');
  const [latestTo, setLatestTo] = useState<string | null>(null);

  const [candles, setCandles] = useState<Candles | null>(null);
  const [cState, setCState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rangeErr, setRangeErr] = useState<ApiErr | null>(null);

  const [indRange, setIndRange] = useState<Range | null>(null);
  const [ind, setInd] = useState<Indicators | null>(null);
  const [iState, setIState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [indErr, setIndErr] = useState<ApiErr | null>(null);

  const [show50, setShow50] = useState(true);
  const [show200, setShow200] = useState(true);
  const [hovered, setHovered] = useState<Bar | null>(null);
  const [tableOpen, setTableOpen] = useState(false);

  const seq = useRef(0);
  // ช่วงของกราฟที่แสดงอยู่ · หลัง error ช่องวันที่ต้องกลับมาบอกช่วงเดียวกับกราฟ (R26)
  const shownRef = useRef<Candles | null>(null);
  shownRef.current = candles;
  const revertInputs = () => {
    const cur = shownRef.current;
    if (cur) { setFromIn(cur.from); setToIn(cur.to); }
  };

  // แท่งเทียน (ไม่กินโควตา)
  useEffect(() => {
    const my = ++seq.current;
    setCState('loading');
    const qs = new URLSearchParams({ interval, adjusted: adjusted ? '1' : '0' });
    if (applied) { qs.set('from', applied.from); qs.set('to', applied.to); }
    api<Candles>(`/api/stocks/${enc}/candles?${qs}`, { lang }).then((r) => {
      if (my !== seq.current) return;
      if (r.ok && r.data) {
        const c = r.data;
        setCandles(c); setCState('ready'); setRangeErr(null);
        setFromIn(c.from); setToIn(c.to);
        setLatestTo((v) => v ?? c.to);
        setIndRange((v) => (applied ? applied : v ?? { from: c.from, to: c.to }));
      } else {
        setRangeErr(friendly(r.error, t('error.generic'))); setCState(candles ? 'ready' : 'error'); revertInputs();
      }
    }).catch(() => { if (my === seq.current) { setRangeErr({ code: 'NETWORK', message: t('error.network') }); setCState(candles ? 'ready' : 'error'); revertInputs(); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enc, lang, interval, adjusted, applied]);

  // ตัวชี้วัด (คิดจากราคาปรับแล้วเสมอ ไม่ขึ้นกับปุ่มราคาจริง · A-34)
  useEffect(() => {
    if (!indRange) return;
    let alive = true;
    setIState('loading');
    const qs = new URLSearchParams({ from: indRange.from, to: indRange.to });
    api<Indicators>(`/api/stocks/${enc}/indicators?${qs}`, { lang }).then((r) => {
      if (!alive) return;
      if (r.ok && r.data) { setInd(r.data); setIState('ready'); setIndErr(null); }
      else { setIndErr(friendly(r.error, t('error.generic'))); setIState('error'); }
    }).catch(() => { if (alive) { setIndErr({ code: 'NETWORK', message: t('error.network') }); setIState('error'); } });
    return () => { alive = false; };
  }, [enc, lang, indRange]);

  const apply = (from: string, to: string) => {
    if (!isDate(from) || !isDate(to) || from > to) {
      setRangeErr({ code: 'INVALID_RANGE', message: t('range.invalid') });
      revertInputs();
      return;
    }
    setRangeErr(null);
    setFromIn(from); setToIn(to);
    setApplied({ from, to });
  };

  const preset = (months: number | 'max') => {
    if (!candles) return;
    const to = latestTo ?? candles.to;
    let from = months === 'max' ? candles.earliestAllowed : minusMonths(to, months);
    if (from < candles.earliestAllowed) from = candles.earliestAllowed;
    apply(from, to);
  };

  const onHover = useCallback((b: Bar | null) => setHovered(b), []);
  const bars = candles?.bars ?? [];
  const shown = hovered ?? bars[bars.length - 1] ?? null;
  const modeLabel = adjusted ? t('chart.adjusted') : t('chart.raw');
  const otherLabel = adjusted ? t('chart.raw') : t('chart.adjusted');

  return (
    <div className="stack" style={{ minWidth: 0 }}>
      <div className="card" data-testid="stock-chart-card" data-state={cState} data-interval={interval} data-adjusted={adjusted ? '1' : '0'}>
        <div className={styles.toolbar}>
          <h2 style={{ margin: 0 }}>{t('chart.title')}</h2>
          <div className={styles.seg} role="group" aria-label={t('chart.interval')}>
            <button type="button" aria-pressed={interval === 'day'} onClick={() => setIntervalKind('day')} data-testid="stock-interval-day">{t('chart.day')}</button>
            <button type="button" aria-pressed={interval === 'week'} onClick={() => setIntervalKind('week')} data-testid="stock-interval-week">{t('chart.week')}</button>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className="row" style={{ gap: 8 }}>
            <span className="badge badge-info" data-testid="stock-adjusted-state" data-state={adjusted ? 'adjusted' : 'raw'}>{t('chart.showing', { mode: modeLabel })}</span>
            <button type="button" className="btn btn-sm" aria-pressed={!adjusted} onClick={() => setAdjusted((v) => !v)}
              data-testid="stock-adjusted-toggle" data-state={adjusted ? 'adjusted' : 'raw'} title={t('chart.adjustedHint')}>
              {t('chart.switchTo', { mode: otherLabel })}
            </button>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <label className={styles.toggle}>
              <input type="checkbox" checked={show50} onChange={(e) => setShow50(e.target.checked)} data-testid="stock-sma50-toggle" />
              <span className={styles.swatch} style={{ background: 'var(--gold)' }} aria-hidden="true" />{t('ind.sma50')}
            </label>
            <label className={styles.toggle}>
              <input type="checkbox" checked={show200} onChange={(e) => setShow200(e.target.checked)} data-testid="stock-sma200-toggle" />
              <span className={styles.swatch} style={{ background: 'var(--info)' }} aria-hidden="true" />{t('ind.sma200')}
            </label>
          </div>
        </div>

        <form className={styles.rangeRow} onSubmit={(e) => { e.preventDefault(); apply(fromIn, toIn); }} data-testid="stock-range-form">
          <div className="field">
            <label htmlFor="stock-range-from">{t('range.from')}</label>
            <input id="stock-range-from" type="date" className="input" value={fromIn} onChange={(e) => setFromIn(e.target.value)} data-testid="stock-range-from" />
          </div>
          <div className="field">
            <label htmlFor="stock-range-to">{t('range.to')}</label>
            <input id="stock-range-to" type="date" className="input" value={toIn} onChange={(e) => setToIn(e.target.value)} data-testid="stock-range-to" />
          </div>
          <button type="submit" className="btn btn-primary" data-testid="stock-range-apply">{t('range.apply')}</button>
        </form>
        <div className={styles.presets}>
          {([['p3m', 3], ['p6m', 6], ['p1y', 12], ['p5y', 60], ['max', 'max']] as const).map(([k, m]) => (
            <button key={k} type="button" className={styles.chip} onClick={() => preset(m)} disabled={!candles} data-testid={tid('stock-range', k)}>{t(`range.${k}`)}</button>
          ))}
        </div>
        {candles && <p className="muted" style={{ margin: '0 0 8px' }} data-testid="stock-range-earliest" data-date={candles.earliestAllowed}>{t('range.earliest', { date: fmtDate(candles.earliestAllowed, lang) })}</p>}
        {rangeErr && <p className="error-text" role="alert" data-testid="stock-range-error" data-code={rangeErr.code}>{rangeErr.message}</p>}

        <div className={styles.ohlc} data-testid="stock-ohlc" aria-live="polite">
          {shown ? (
            <>
              <span><span className={styles.k}>{t('ohlc.date')}</span><span data-testid="stock-ohlc-date" data-date={shown.date}>{fmtDate(shown.date, lang)}</span></span>
              <span><span className={styles.k}>{t('ohlc.open')}</span><span className="num" data-testid="stock-ohlc-open" data-value={shown.open}>{fmtPrice(shown.open)}</span></span>
              <span><span className={styles.k}>{t('ohlc.high')}</span><span className="num" data-testid="stock-ohlc-high" data-value={shown.high}>{fmtPrice(shown.high)}</span></span>
              <span><span className={styles.k}>{t('ohlc.low')}</span><span className="num" data-testid="stock-ohlc-low" data-value={shown.low}>{fmtPrice(shown.low)}</span></span>
              <span><span className={styles.k}>{t('ohlc.close')}</span><span className="num" data-testid="stock-ohlc-close" data-value={shown.close}>{fmtPrice(shown.close)}</span></span>
            </>
          ) : <span className="muted">{t('ohlc.hint')}</span>}
        </div>

        <div style={{ position: 'relative' }}>
          <CandleChart bars={bars} sma50={ind?.sma50 ?? []} sma200={ind?.sma200 ?? []} show50={show50} show200={show200}
            crosses={ind?.crosses ?? []} interval={interval} lang={lang} onHover={onHover}
            labels={{ golden: t('cross.golden'), death: t('cross.death') }} />
          {cState === 'loading' && <div className={styles.chartOverlay} data-testid="stock-chart-loading">{t('chart.loading')}</div>}
          {cState !== 'loading' && candles && bars.length === 0 && <div className={styles.chartOverlay} data-testid="stock-chart-empty">{t('chart.empty')}</div>}
        </div>
        {interval === 'week' && <p className="muted" style={{ margin: '8px 0 0' }}>{t('chart.weekNote')}</p>}

        {bars.length > 0 && (
          <details className={styles.details} onToggle={(e) => setTableOpen((e.target as HTMLDetailsElement).open)} data-testid="stock-bars">
            <summary data-testid="stock-bars-toggle">{t('bars.toggle')}</summary>
            {tableOpen && (
              <div className={`${styles.tableScroll} table-wrap`}>
                <table className="table">
                  <thead><tr>
                    <th>{t('ohlc.date')}</th><th className="r">{t('ohlc.open')}</th><th className="r">{t('ohlc.high')}</th>
                    <th className="r">{t('ohlc.low')}</th><th className="r">{t('ohlc.close')}</th><th className="r">{t('ohlc.volume')}</th>
                  </tr></thead>
                  <tbody>
                    {[...bars].reverse().map((b) => (
                      <tr key={b.date} data-testid={tid('stock', 'bar', b.date)}>
                        <td>{fmtDate(b.date, lang)}</td>
                        <td className="r num">{fmtPrice(b.open)}</td>
                        <td className="r num">{fmtPrice(b.high)}</td>
                        <td className="r num">{fmtPrice(b.low)}</td>
                        <td className="r num" data-testid={tid('stock', 'bar-close', b.date)} data-value={b.close}>{fmtPrice(b.close)}</td>
                        <td className="r num">{fmtVol(b.volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>
        )}
      </div>

      <IndicatorPanel ind={ind} state={iState} err={indErr} lang={lang} dict={dict} />
    </div>
  );
}

function IndicatorPanel({ ind, state, err, lang, dict }: { ind: Indicators | null; state: 'loading' | 'ready' | 'error'; err: ApiErr | null; lang: Lang; dict: Dict }) {
  const t = makeT(dict);
  const lastDate = ind ? (ind.rsi14.at(-1)?.date ?? ind.sma50.at(-1)?.date ?? ind.sma200.at(-1)?.date ?? null) : null;
  const label = ind?.latest.rsiLabel ?? null;

  return (
    <div className="card" data-testid="stock-indicators" data-state={state}>
      <div className="spread" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{t('ind.title')}</h2>
        {lastDate && <span className="muted" data-testid="stock-ind-asof">{t('ind.latestAt', { date: fmtDate(lastDate, lang) })}</span>}
      </div>
      <p className="muted">{t('ind.note')}</p>

      {state === 'error' && err && <p className="error-text" role="alert" data-testid="stock-indicators-error" data-code={err.code}>{err.message}</p>}
      {state === 'loading' && !ind && <p className="muted" data-testid="stock-indicators-loading">{t('ind.loading')}</p>}

      {ind && (
        <div className="stack">
          <div className={styles.latestGrid}>
            <div className={styles.latestItem} style={{ borderLeftColor: 'var(--gold)' }}>
              <div className="muted">{t('ind.sma50')}</div>
              {ind.notEnough.sma50 || ind.latest.sma50 === null
                ? <span className={styles.notEnough} data-testid="stock-sma50-notenough">{t('ind.notEnough50')}</span>
                : <span className={`num ${styles.value}`} data-testid="stock-sma50-latest" data-value={ind.latest.sma50}>{fmtNum(ind.latest.sma50, 2)}</span>}
            </div>
            <div className={styles.latestItem} style={{ borderLeftColor: 'var(--info)' }}>
              <div className="muted">{t('ind.sma200')}</div>
              {ind.notEnough.sma200 || ind.latest.sma200 === null
                ? <span className={styles.notEnough} data-testid="stock-sma200-notenough">{t('ind.notEnough200')}</span>
                : <span className={`num ${styles.value}`} data-testid="stock-sma200-latest" data-value={ind.latest.sma200}>{fmtNum(ind.latest.sma200, 2)}</span>}
            </div>
          </div>

          <div>
            <div className={styles.rsiHead}>
              <h3 style={{ margin: 0 }}>{t('rsi.title')}</h3>
              {ind.notEnough.rsi14 || ind.latest.rsi14 === null
                ? <span className={styles.notEnough} data-testid="stock-rsi-notenough">{t('rsi.notEnough')}</span>
                : <>
                    <span className={`num ${styles.rsiValue}`} data-testid="stock-rsi-value" data-value={ind.latest.rsi14}>{fmtNum(ind.latest.rsi14, 2)}</span>
                    {label === 'overbought' && <span className="badge badge-down" data-testid="stock-rsi-label" data-state="overbought">{t('rsi.overbought')}</span>}
                    {label === 'oversold' && <span className="badge badge-up" data-testid="stock-rsi-label" data-state="oversold">{t('rsi.oversold')}</span>}
                    {label === null && <span className="muted" data-testid="stock-rsi-neutral">{t('rsi.neutral')}</span>}
                  </>}
            </div>
            {!ind.notEnough.rsi14 && ind.rsi14.length > 0 && <RsiChart points={ind.rsi14} lang={lang} />}
            <p className="muted" style={{ margin: '6px 0 0' }}>{t('rsi.help')}</p>
          </div>

          <div data-testid="stock-crosses">
            <h3>{t('cross.title')}</h3>
            {ind.crosses.length === 0
              ? <p className="muted" data-testid="stock-cross-none">{t('cross.none')}</p>
              : (
                <ul className={styles.crossList}>
                  {[...ind.crosses].reverse().map((c) => (
                    <li key={`${c.date}-${c.kind}`} data-testid={tid('stock', 'cross', c.date)} data-kind={c.kind}>
                      <span className={`badge ${c.kind === 'golden' ? 'badge-up' : 'badge-down'}`}>{c.kind === 'golden' ? t('cross.golden') : t('cross.death')}</span>
                      <span>{fmtDate(c.date, lang)}</span>
                      <span className="muted">{c.kind === 'golden' ? t('cross.goldenDesc') : t('cross.deathDesc')}</span>
                    </li>
                  ))}
                </ul>
              )}
            <p className="muted" style={{ margin: '6px 0 0' }}>{t('cross.note')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- สรุปหุ้นนี้ (FR-47, FR-48 · ไม่มีช่องพิมพ์ถาม)
function SummaryPanel({ symbol, lang, dict, core }: { symbol: string; lang: Lang; dict: Dict; core: Dict }) {
  const t = makeT(dict);
  const ct = makeT(core);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [lines, setLines] = useState<string[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [err, setErr] = useState<ApiErr | null>(null);

  const run = async () => {
    setState('loading'); setErr(null);
    try {
      const r = await api<{ lines: string[]; asOf: string }>(`/api/stocks/${encodeURIComponent(symbol)}/summary`, { method: 'POST', body: {}, lang });
      if (r.ok && r.data) { setLines((r.data.lines ?? []).slice(0, 3)); setAsOf(r.data.asOf ?? null); setState('ready'); }
      else { setErr(friendly(r.error, ct('common.error'))); setState('error'); }
    } catch { setErr({ code: 'NETWORK', message: ct('common.error') }); setState('error'); }
  };

  return (
    <div className="card" data-testid="stock-summary" data-state={state}>
      <h2>{t('summary.title')}</h2>
      <p className="muted">{t('summary.lead')}</p>
      <button type="button" className="btn btn-gold" onClick={run} disabled={state === 'loading'} data-testid="stock-summary-btn">
        {state === 'loading' ? t('summary.loading') : t('summary.btn')}
      </button>
      {state === 'ready' && (
        <div className={styles.summaryBox} style={{ marginTop: 12 }} data-testid="stock-summary-result">
          {lines.map((l, i) => <p key={i} data-testid={`stock-summary-line-${i + 1}`}>{l}</p>)}
          {asOf && <small className="muted" data-testid="stock-summary-asof">{t('summary.asOf', { datetime: fmtWhen(asOf, lang) })}</small>}
        </div>
      )}
      {state === 'error' && err && <p className="error-text" role="alert" style={{ marginTop: 12 }} data-testid="stock-summary-error" data-code={err.code}>{err.message}</p>}
    </div>
  );
}
