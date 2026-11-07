'use client';
// F1 · ส่วนที่ดึงข้อมูลจริงของหน้าแรก: สถานะตลาด (/api/market/status) + จำนวนหุ้นที่รองรับ (/api/screener ไม่ใส่เงื่อนไข)
// ห้ามเรียก /api/stocks/:symbol หรือดึงราคาสดจากหน้านี้ (โควตา Mock Feed 5 ครั้ง/นาทีทั้งเว็บ)
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api-client';
import { makeT, fmtDate, fmtDateTimeTh, fmtTimeTh, type Dict, type Lang } from '@/lib/i18n';
import { CountUp, Reveal } from './motion';
import s from './home.module.css';

type Status = { now: string; open: boolean; earlyClose: boolean; sessionDate: string | null; closesAt: string | null; nextOpen: string; lastClosedSession: string };
type PageState = 'loading' | 'ready' | 'error';

const Ctx = createContext<(st: PageState) => void>(() => {});

/** รากของหน้าแรก: <section data-testid="home-page" data-state> */
export function HomeRoot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PageState>('loading');
  return (
    <Ctx.Provider value={setState}>
      <section data-testid="home-page" data-state={state} className={s.page}>{children}</section>
    </Ctx.Provider>
  );
}

const HOUR = 3_600_000;
/** ชั่วโมงของวันตามเวลาไทย (UTC+7 ไม่มีเวลาออมแสง) เป็นทศนิยม */
const hourTh = (iso: string) => {
  const d = new Date(iso);
  return (d.getUTCHours() + 7 + d.getUTCMinutes() / 60) % 24;
};
function nyClock(iso: string, lang: Lang) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/New_York' }).format(d);
  return `${fmtDate(date, lang)} ${time}`;
}
function duration(ms: number, t: ReturnType<typeof makeT>) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts: string[] = [];
  if (d) parts.push(t('dur.d', { n: d }));
  if (h || d) parts.push(t('dur.h', { n: h }));
  parts.push(t('dur.m', { n: m }));
  return parts.join(' ');
}

/** จุดบนวงกลมหน้าปัด 24 ชม. (00 อยู่ด้านบน หมุนตามเข็ม) */
const C = 90;
const pt = (h: number, r: number) => {
  const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
  return [Math.round((C + r * Math.cos(a)) * 10) / 10, Math.round((C + r * Math.sin(a)) * 10) / 10] as const;
};
function arc(h1: number, h2: number, r: number) {
  const span = ((h2 - h1) % 24 + 24) % 24;
  const [x1, y1] = pt(h1, r);
  const [x2, y2] = pt(h1 + span, r);
  return `M${x1} ${y1} A${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${x2} ${y2}`;
}

function Dial({ st, t }: { st: Status; t: ReturnType<typeof makeT> }) {
  // ช่วงตลาดเปิดของรอบนี้ (ถ้าเปิดอยู่) หรือรอบถัดไป (ถ้าปิด) เป็นเวลาไทย
  let start: number;
  let end: number;
  if (st.open && st.closesAt) {
    const close = new Date(st.closesAt).getTime();
    start = hourTh(new Date(close - (st.earlyClose ? 3.5 : 6.5) * HOUR).toISOString());
    end = hourTh(st.closesAt);
  } else {
    start = hourTh(st.nextOpen);
    end = (start + 6.5) % 24;
  }
  const nowH = hourTh(st.now);
  const [nx, ny] = pt(nowH, 62);
  const ticks = Array.from({ length: 24 }, (_, i) => i);
  return (
    <figure className={s.dial} data-testid="home-market-dial">
      <svg viewBox="0 0 180 180" role="img" aria-label={t('market.dialTitle')}>
        <circle cx={C} cy={C} r="72" className={s.dialTrack} />
        <path d={arc(start, end, 72)} className={`${s.dialSession} ${st.open ? s.dialSessionOpen : ''}`} />
        {ticks.map((h) => {
          const [x1, y1] = pt(h, h % 6 === 0 ? 56 : 60);
          const [x2, y2] = pt(h, 64);
          return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} className={h % 6 === 0 ? s.dialTickMajor : s.dialTick} />;
        })}
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = pt(h, 44);
          return <text key={h} x={x} y={y} className={s.dialLabel} textAnchor="middle" dominantBaseline="central">{String(h).padStart(2, '0')}</text>;
        })}
        <line x1={C} y1={C} x2={nx} y2={ny} className={s.dialHand} />
        <circle cx={C} cy={C} r="5" className={s.dialHub} />
        <circle cx={nx} cy={ny} r="4" className={s.dialHub} />
      </svg>
      <figcaption className={s.dialLegend}>
        <span><i className={`${s.legDot} ${s.legSession}`} aria-hidden="true" />{t('market.dialSession')}</span>
        <span><i className={`${s.legDot} ${s.legNow}`} aria-hidden="true" />{t('market.dialNow')}</span>
      </figcaption>
    </figure>
  );
}

export function HomeLive({ lang, dict }: { lang: Lang; dict: Dict }) {
  const t = makeT(dict);
  const setPage = useContext(Ctx);
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setPage('loading');
    const [m, sc] = await Promise.all([
      api<Status>('/api/market/status', { lang }).catch(() => null),
      api<{ results: unknown[] }>('/api/screener', { lang, body: {} }).catch(() => null),
    ]);
    if (sc?.ok && Array.isArray(sc.data?.results)) setCount(sc.data!.results.length);
    if (m?.ok && m.data) { setSt(m.data); setPage('ready'); }
    else { setErr(m?.error?.message || t('market.error')); setPage('error'); }
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const state = !st ? 'loading' : st.open ? (st.earlyClose ? 'early' : 'open') : 'closed';

  return (
    <>
      <Reveal className={s.marketWrap}>
        <div className={`card ${s.marketCard}`} data-testid="home-market" data-state={err ? 'error' : st ? state : 'loading'}>
          <div className={s.marketHead}>
            <div>
              <h2 className={s.h2}>{t('market.title')}</h2>
              <p className="muted" style={{ margin: 0 }}>{t('market.subtitle')}</p>
            </div>
            {st && (
              <span className={`${s.pill} ${state === 'closed' ? s.pillClosed : state === 'early' ? s.pillEarly : s.pillOpen}`}
                data-testid="home-market-status" data-state={state}>
                <span className={s.pillDot} aria-hidden="true" />
                {t(`market.${state}`)}
              </span>
            )}
          </div>

          {err && (
            <div className="stack" style={{ gap: 10 }}>
              <p className="error-text" data-testid="home-error" role="alert" style={{ margin: 0 }}>{err}</p>
              <div><button type="button" className="btn btn-sm" onClick={() => void load()} data-testid="home-market-retry">{t('market.retry')}</button></div>
            </div>
          )}

          {!st && !err && (
            <div className={s.skeletonRow} data-testid="home-market-loading" aria-busy="true">
              <span className={s.skeleton} /><span className={s.skeleton} /><span className={s.skeleton} />
              <span className="muted">{t('market.loading')}</span>
            </div>
          )}

          {st && (
            <div className={s.marketBody}>
              <div className={s.marketMain}>
                {st.open && st.closesAt && (
                  <div className={s.kv}>
                    <span className={s.kvLabel}>{t('market.closesLabel')}</span>
                    <strong className={`num ${s.kvBig}`} data-testid="home-market-closes">{fmtTimeTh(st.closesAt, lang)}</strong>
                  </div>
                )}
                <div className={s.kv}>
                  <span className={s.kvLabel}>{t('market.nextOpen')}</span>
                  <strong className={`num ${st.open ? '' : s.kvBig}`} data-testid="home-market-next">{fmtDateTimeTh(st.nextOpen, lang)}</strong>
                  {!st.open && (
                    <span className={s.countdown} data-testid="home-market-countdown">
                      {t('market.countdown', { left: duration(new Date(st.nextOpen).getTime() - new Date(st.now).getTime(), t) })}
                    </span>
                  )}
                </div>
                <div className={s.kv}>
                  <span className={s.kvLabel}>{t('market.lastClosed')}</span>
                  <strong className="num" data-testid="home-market-last">{fmtDate(st.lastClosedSession, lang)}</strong>
                </div>
              </div>
              <Dial st={st} t={t} />
              <div className={s.clocks}>
                <div className={s.clock}>
                  <span className={s.kvLabel}>{t('market.nowTh')}</span>
                  <strong className="num" data-testid="home-clock-th">{fmtDateTimeTh(st.now, lang)}</strong>
                </div>
                <div className={s.clock}>
                  <span className={s.kvLabel}>{t('market.nowNy')}</span>
                  <strong className="num" data-testid="home-clock-ny">{nyClock(st.now, lang)}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </Reveal>

      <Reveal>
        <div className={s.stats} data-testid="home-stats">
          <h2 className={s.srOnly}>{t('stats.title')}</h2>
          <div className={s.statCard}>
            <CountUp value={count} testid="home-stat-stocks" className={s.statNum} />
            <span className={s.statLabel}>{t('stats.stocks')}</span>
            <span className={s.statNote}>{t('stats.stocksNote')}</span>
          </div>
          <div className={s.statCard}>
            <CountUp value={2} testid="home-stat-exchanges" className={s.statNum} />
            <span className={s.statLabel}>{t('stats.exchanges')}</span>
            <span className={s.statNote}>{t('stats.exchangesNote')}</span>
          </div>
          <div className={s.statCard}>
            <CountUp value={15} testid="home-stat-delay" className={s.statNum} />
            <span className={s.statLabel}>{t('stats.delay')}</span>
            <span className={s.statNote}>{t('stats.delayNote')}</span>
          </div>
          <div className={s.statCard}>
            <CountUp value={2} testid="home-stat-langs" className={s.statNum} />
            <span className={s.statLabel}>{t('stats.langs')}</span>
            <span className={s.statNote}>{t('stats.langsNote')}</span>
          </div>
        </div>
      </Reveal>
    </>
  );
}
