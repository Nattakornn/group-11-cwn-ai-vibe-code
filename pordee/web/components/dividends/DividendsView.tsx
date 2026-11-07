'use client';
// F5 ปันผล (FR-36–FR-39) · หน้าเว็บไม่คิดเงินเอง แสดงค่าจาก API ด้วย fmtUsd / fmtThb เท่านั้น
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { makeT, fmtDate, fmtDateTimeTh, type Dict, type Lang } from '@/lib/i18n';
import { D, fmtNum, fmtShares, fmtThb, fmtUsd } from '@/lib/money';
import { tid } from '@/lib/testid';
import s from './dividends.module.css';

// ---------- ชนิดข้อมูลตามสัญญา (API-CONTRACT ส่วนที่ 1, 3) ----------
type CalItem = { symbol: string; xdDate: string; payDate: string; amountPerShare: string; sharesHeld: string | null };
type RcvItem = { symbol: string; payDate: string; shares: string; grossUsd: string; taxUsd: string; netUsd: string; fxRate: string; netThb: string };
type Monthly = { month: string; netUsd: string; netThb: string };
type Received = { items: RcvItem[]; monthly: Monthly[]; totalNetUsd: string };
type Totals = { plUsd: string; dividendsNetUsd: string; totalReturnUsd: string };
type Portfolio = { asOf: string | null; totals: Totals };
type ApiErr = { code: string; message: string } | null;

const P = 'div';
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

// ---------- วันที่ (ไม่เกี่ยวกับเงิน) ----------
/** วันที่ไทย YYYY-MM-DD ของ ISO */
const bkkDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(iso));
function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + by;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}
function monthLabel(ym: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${ym}-15T12:00:00Z`));
}
/** ปันผลต่อหุ้น: 4 ตำแหน่งจาก API ตัด 00 ท้ายออก เช่น 0.2700 → $0.27 · 0.1234 → $0.1234 (แสดงผลเท่านั้น) */
const fmtPerShare = (v: string) => fmtUsd(v, 4).replace(/(\.\d\d)00$/, '$1');
const sign = (v: string) => (D(v).gt(0) ? 'up' : D(v).lt(0) ? 'down' : 'flat');

export function DividendsView({ lang, dict, core, initialMonth }: { lang: Lang; dict: Dict; core: Dict; initialMonth: string | null }) {
  const t = makeT(dict);
  const tc = makeT(core);

  const [today, setToday] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [cal, setCal] = useState<CalItem[] | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [rcv, setRcv] = useState<Received | null>(null);
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [error, setError] = useState<ApiErr>(null);
  const [booted, setBooted] = useState(false);
  const calReq = useRef(0);

  const fail = useCallback((status: number, err: ApiErr) => {
    if (status === 401) setNeedLogin(true);
    else setError(err ?? { code: 'UNKNOWN', message: tc('common.error') });
  }, [tc]);

  // โหลดครั้งแรก: นาฬิกาเว็บ ปันผลที่ได้รับ ผลตอบแทน
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [st, r, p] = await Promise.all([
          api<{ now: string }>('/api/market/status', { lang }),
          api<Received>('/api/dividends/received', { lang }),
          api<Portfolio>('/api/portfolio', { lang }),
        ]);
        if (!alive) return;
        const nowDay = st.ok && st.data?.now ? bkkDate(st.data.now) : null;
        setToday(nowDay);
        if (!st.ok) fail(st.status, st.error);
        setMonth(initialMonth && YM.test(initialMonth) ? initialMonth : (nowDay ?? bkkDate(new Date().toISOString())).slice(0, 7));
        if (r.ok && r.data) setRcv(r.data); else fail(r.status, r.error);
        if (p.ok && p.data) setPf(p.data); else fail(p.status, p.error);
      } catch {
        if (alive) setError({ code: 'NETWORK', message: tc('common.error') });
      } finally {
        if (alive) setBooted(true);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // ปฏิทินของเดือนที่เลือก
  useEffect(() => {
    if (!month || needLogin) return;
    const id = ++calReq.current;
    setCalLoading(true);
    (async () => {
      try {
        const r = await api<{ items: CalItem[] }>(`/api/dividends/calendar?month=${month}`, { lang });
        if (id !== calReq.current) return;
        if (r.ok && r.data) setCal(r.data.items ?? []); else { setCal([]); fail(r.status, r.error); }
      } catch {
        if (id === calReq.current) setError({ code: 'NETWORK', message: tc('common.error') });
      } finally {
        if (id === calReq.current) setCalLoading(false);
      }
    })();
    // จำเดือนไว้ใน URL เพื่อเปิดซ้ำได้
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('month', month);
      window.history.replaceState(null, '', u.toString());
    } catch { /* ไม่สำคัญ */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, lang, needLogin]);

  const ready = booted && month !== null && cal !== null && !calLoading;
  const state = needLogin ? 'ready' : error ? 'error' : ready ? 'ready' : 'loading';

  return (
    <section data-testid="dividends-page" data-state={state} className="stack fade-in" style={{ gap: 24 }}>
      <header className={s.head}>
        <h1 data-testid={tid(P, 'title')}>{t('title')}</h1>
        <p>{t('subtitle')}</p>
      </header>

      {needLogin ? (
        <div className={`card ${s.loginBox}`} data-testid="dividends-login-required">
          <p>{t('loginRequired')}</p>
          <Link href={`/${lang}/login?next=${encodeURIComponent(`/${lang}/dividends`)}`} className="btn btn-primary" data-testid={tid(P, 'login-link')}>{t('loginCta')}</Link>
        </div>
      ) : (
        <>
          {error && <p className="error-text" role="alert" data-testid="dividends-error" data-code={error.code}>{error.message}</p>}
          {!booted && <p className="muted" data-testid={tid(P, 'loading')}>{t('loading')}</p>}

          {booted && (
            <>
              <Returns t={t} lang={lang} pf={pf} />
              {month && (
                <Calendar t={t} lang={lang} month={month} today={today} items={cal} loading={calLoading}
                  onPrev={() => setMonth(m => (m ? shiftMonth(m, -1) : m))} onNext={() => setMonth(m => (m ? shiftMonth(m, 1) : m))} />
              )}
              <ReceivedSection t={t} lang={lang} data={rcv} />
            </>
          )}
        </>
      )}
    </section>
  );
}

type T = ReturnType<typeof makeT>;

// ---------- ผลตอบแทน 2 ค่า (FR-39 · BR-50) ----------
function Returns({ t, lang, pf }: { t: T; lang: Lang; pf: Portfolio | null }) {
  if (!pf) return null;
  const { plUsd, dividendsNetUsd, totalReturnUsd } = pf.totals;
  return (
    <section className="stack" aria-labelledby="div-ret-h" data-testid={tid(P, 'returns')}>
      <h2 id="div-ret-h">{t('ret.title')}</h2>
      <div className={s.returns}>
        <div className={`card ${s.retCard}`}>
          <span className={s.retLabel}>{t('ret.price')}</span>
          <span className={`num ${s.retValue} ${sign(plUsd)}`} data-testid={tid(P, 'return-price')}>{fmtUsd(plUsd)}</span>
          <p className={s.retHelp}>{t('ret.priceHelp')}</p>
        </div>
        <div className={`card card-gold ${s.retCard}`}>
          <span className={s.retLabel}>{t('ret.total')}</span>
          <span className={`num ${s.retValue} ${sign(totalReturnUsd)}`} data-testid={tid(P, 'return-total')}>{fmtUsd(totalReturnUsd)}</span>
          <p className={s.retHelp}>{t('ret.totalHelp')}</p>
        </div>
      </div>
      <p className={s.formula} data-testid={tid(P, 'return-formula')}>
        {t('ret.formula', { price: fmtUsd(plUsd), div: fmtUsd(dividendsNetUsd), total: fmtUsd(totalReturnUsd) })}
      </p>
      {pf.asOf && <span className="muted" data-testid={tid(P, 'return-asof')}>{t('ret.asOf', { datetime: fmtDateTimeTh(pf.asOf, lang) })}</span>}
    </section>
  );
}

// ---------- ปฏิทินรายเดือน (FR-36) ----------
function Calendar({ t, lang, month, today, items, loading, onPrev, onNext }: {
  t: T; lang: Lang; month: string; today: string | null; items: CalItem[] | null; loading: boolean; onPrev: () => void; onNext: () => void;
}) {
  const label = monthLabel(month, lang);
  const sorted = useMemo(
    () => [...(items ?? [])].sort((a, b) => a.xdDate.localeCompare(b.xdDate) || a.payDate.localeCompare(b.payDate) || a.symbol.localeCompare(b.symbol)),
    [items],
  );
  // วันที่มีเหตุการณ์ในเดือนนี้
  const marks = useMemo(() => {
    const m = new Map<string, { xd: string[]; pay: string[] }>();
    const add = (d: string, k: 'xd' | 'pay', sym: string) => {
      if (!d.startsWith(month)) return;
      const e = m.get(d) ?? { xd: [], pay: [] };
      e[k].push(sym);
      m.set(d, e);
    };
    for (const it of sorted) { add(it.xdDate, 'xd', it.symbol); add(it.payDate, 'pay', it.symbol); }
    return m;
  }, [sorted, month]);

  const [y, mo] = month.split('-').map(Number);
  const firstDow = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const wds = t('cal.weekdays').split(',');
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <section className="card stack" aria-labelledby="div-cal-h" data-testid={tid(P, 'calendar')} data-month={month}>
      <div className="spread">
        <div>
          <h2 id="div-cal-h" style={{ marginBottom: 2 }}>{t('cal.title')}</h2>
          <p className="muted" style={{ margin: 0 }}>{t('cal.desc')}</p>
        </div>
      </div>

      <div className={s.monthNav}>
        <button type="button" className={`btn ${s.navBtn}`} onClick={onPrev} aria-label={t('cal.prevAria')} data-testid={tid(P, 'month-prev')}>
          <span aria-hidden="true">‹</span><span className={s.navText}>{t('cal.prev')}</span>
        </button>
        <h3 className={s.monthLabel} aria-live="polite" data-testid={tid(P, 'month-label')} data-month={month}>{label}</h3>
        <button type="button" className={`btn ${s.navBtn}`} onClick={onNext} aria-label={t('cal.nextAria')} data-testid={tid(P, 'month-next')}>
          <span className={s.navText}>{t('cal.next')}</span><span aria-hidden="true">›</span>
        </button>
      </div>

      <div>
        <div className={s.grid} role="grid" aria-label={t('cal.gridAria', { month: label })} data-testid={tid(P, 'grid')}>
          {wds.map(w => <div key={w} className={s.wd} role="columnheader">{w}</div>)}
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} className={`${s.day} ${s.dayEmpty}`} aria-hidden="true" />;
            const date = `${month}-${String(d).padStart(2, '0')}`;
            const e = marks.get(date);
            const aria = [fmtDate(date, lang), e?.xd.length ? t('cal.dayXd', { symbols: e.xd.join(', ') }) : '', e?.pay.length ? t('cal.dayPay', { symbols: e.pay.join(', ') }) : '']
              .filter(Boolean).join(' · ');
            const cls = [s.day, date === today ? s.today : '', e?.pay.length ? s.hasPay : e?.xd.length ? s.hasXd : ''].join(' ');
            return (
              <div key={date} className={cls} role="gridcell" aria-label={aria} title={aria} data-testid={tid(P, 'day', date)}
                data-xd={e?.xd.join(',') || undefined} data-pay={e?.pay.join(',') || undefined}>
                <span className={s.dayNum}>{d}</span>
                {e && (
                  <span className={s.marks} aria-hidden="true">
                    {e.xd.map(sym => <span key={`x${sym}`} className={`${s.mark} ${s.markXd}`} />)}
                    {e.pay.map(sym => <span key={`p${sym}`} className={`${s.mark} ${s.markPay}`} />)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className={s.legend}>
          <span><i className={`${s.mark} ${s.markXd}`} aria-hidden="true" />{t('cal.legendXd')}</span>
          <span><i className={`${s.mark} ${s.markPay}`} aria-hidden="true" />{t('cal.legendPay')}</span>
          <span><i className={s.legendToday} aria-hidden="true" />{t('cal.legendToday')}</span>
        </div>
      </div>

      {loading && <p className="muted" data-testid={tid(P, 'cal-loading')}>{t('cal.loading')}</p>}
      {!loading && items !== null && sorted.length === 0 && <p className={s.empty} data-testid={tid(P, 'cal-empty')}>{t('cal.empty')}</p>}
      {!loading && sorted.length > 0 && (
        <ul className={s.items} style={{ listStyle: 'none', padding: 0 }} data-testid={tid(P, 'cal-list')}>
          {sorted.map(it => {
            const id = `${it.symbol}-${it.xdDate}`;
            const held = it.sharesHeld !== null && D(it.sharesHeld).gt(0);
            return (
              <li key={id} className={s.item} data-testid={tid(P, 'cal', id)}>
                <div className={s.itemHead}>
                  <Link href={`/${lang}/stocks/${encodeURIComponent(it.symbol)}`} className={s.symbol} data-testid={tid(P, 'cal-link', id)}>{it.symbol}</Link>
                  {held ? <span className="badge badge-up">{t('cal.badgeHeld')}</span> : <span className="badge badge-info">{t('cal.badgeWatch')}</span>}
                </div>
                <dl className={s.facts}>
                  <dt>{t('cal.amount')}</dt>
                  <dd className={`num ${s.big}`} data-testid={tid(P, 'cal-amount', id)}>{fmtPerShare(it.amountPerShare)}</dd>
                  <dt>{t('cal.xd')}</dt>
                  <dd className={s.strong} data-testid={tid(P, 'cal-xd', id)} data-date={it.xdDate}>{fmtDate(it.xdDate, lang)}</dd>
                  <dt>{t('cal.pay')}</dt>
                  <dd className={s.strong} data-testid={tid(P, 'cal-pay', id)} data-date={it.payDate}>{fmtDate(it.payDate, lang)}</dd>
                  <dt>{t('cal.shares')}</dt>
                  <dd className={held ? 'num' : undefined} data-testid={tid(P, 'cal-shares', id)} data-value={it.sharesHeld ?? ''}>
                    {held ? fmtShares(it.sharesHeld!) : <span className="muted">{t('cal.notHeld')}</span>}
                  </dd>
                </dl>
                {/* BR-49 · R89: ถึงวัน XD แล้ว ซื้อตอนนี้ไม่ได้ปันผลรอบนี้ จึงไม่บอกให้ "ถือก่อนวันนี้" อีก */}
                {today !== null && it.xdDate <= today
                  ? <p className={s.help} data-testid={tid(P, 'cal-xd-passed', id)}>{t('cal.xdPassed')}</p>
                  : <p className={s.help}>{t('cal.xdHelp')}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------- ปันผลที่ได้รับแล้ว + สรุปรายเดือน (FR-37, FR-38 · BR-48) ----------
function ReceivedSection({ t, lang, data }: { t: T; lang: Lang; data: Received | null }) {
  if (!data) return null;
  const items = data.items ?? [];
  const monthly = [...(data.monthly ?? [])].sort((a, b) => b.month.localeCompare(a.month));
  // เดือนที่มีรายการแต่ไม่มีในสรุป (กันหาย) จะแสดงท้ายสุด
  const extra = Array.from(new Set(items.map(i => i.payDate.slice(0, 7)))).filter(m => !monthly.some(x => x.month === m)).sort().reverse();

  return (
    <section className="card stack" aria-labelledby="div-rcv-h" data-testid={tid(P, 'received')}>
      <div>
        <h2 id="div-rcv-h" style={{ marginBottom: 2 }}>{t('rcv.title')}</h2>
        <p className="muted" style={{ margin: 0 }}>{t('rcv.note')}</p>
      </div>

      <div className={s.total}>
        <span className={s.totalLabel}>{t('total.label')}</span>
        <span className={`num ${s.totalVal}`} data-testid={tid(P, 'total-net')}>{fmtUsd(data.totalNetUsd)}</span>
      </div>

      {items.length === 0 && monthly.length === 0 && <p className={s.empty} data-testid={tid(P, 'rcv-empty')}>{t('rcv.empty')}</p>}

      {monthly.length > 0 && <h3 style={{ margin: '8px 0 0', fontSize: 'var(--fs-lg)' }}>{t('monthly.title')}</h3>}
      {[...monthly.map(m => m.month), ...extra].map(ym => {
        const sum = monthly.find(x => x.month === ym);
        const rows = items.filter(i => i.payDate.startsWith(ym))
          .sort((a, b) => a.payDate.localeCompare(b.payDate) || a.symbol.localeCompare(b.symbol));
        return (
          <div key={ym} className={s.monthBlock} data-testid={tid(P, 'month', ym)}>
            {sum && (
              <div className={s.monthSum}>
                <span className={s.monthSumName}>{monthLabel(ym, lang)}</span>
                <span className={s.monthSumVals}>
                  <span className={`num ${s.monthThb}`} data-testid={tid(P, 'monthly', `${ym}-thb`)}>{fmtThb(sum.netThb, 2, lang)}</span>
                  <span className={`num ${s.monthUsd}`} data-testid={tid(P, 'monthly', `${ym}-usd`)}>{fmtUsd(sum.netUsd)}</span>
                </span>
              </div>
            )}
            {rows.length > 0 && (
              <ul className={s.items} style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
                {rows.map(r => {
                  const id = `${r.symbol}-${r.payDate}`;
                  return (
                    <li key={id} className={`${s.item} ${s.itemRcv}`} data-testid={tid(P, 'rcv', id)}>
                      <div className={s.itemHead}>
                        <span className={s.symbol}>{r.symbol}</span>
                        <span className="muted" data-testid={tid(P, 'rcv-date', id)}>{t('rcv.paidOn', { date: fmtDate(r.payDate, lang) })}</span>
                      </div>
                      <dl className={s.facts}>
                        <dt>{t('rcv.shares')}</dt>
                        <dd className="num" data-testid={tid(P, 'rcv-shares', id)}>{fmtShares(r.shares)}</dd>
                        <dt>{t('rcv.gross')}</dt>
                        <dd className="num" data-testid={tid(P, 'rcv-gross', id)}>{fmtUsd(r.grossUsd)}</dd>
                        <dt>{t('rcv.tax')}</dt>
                        <dd className="num down" data-testid={tid(P, 'rcv-tax', id)}>{fmtUsd(r.taxUsd)}</dd>
                        <dt>{t('rcv.net')}</dt>
                        <dd className={`num ${s.strong}`} data-testid={tid(P, 'rcv-net-usd', id)}>{fmtUsd(r.netUsd)}</dd>
                        <dt>{t('rcv.netThb')}</dt>
                        <dd className={`num ${s.strong}`} data-testid={tid(P, 'rcv-net-thb', id)}>{fmtThb(r.netThb, 2, lang)}</dd>
                        <dt>{t('rcv.fx')}</dt>
                        <dd data-testid={tid(P, 'rcv-fx', id)}>{t('rcv.fxValue', { rate: fmtNum(r.fxRate, 4) })}</dd>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      {monthly.length === 0 && items.length > 0 && <p className="muted" data-testid={tid(P, 'monthly-empty')}>{t('monthly.empty')}</p>}
    </section>
  );
}
