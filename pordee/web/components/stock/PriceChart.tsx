'use client';
// กราฟแท่งเทียน + เส้นค่าเฉลี่ย + ป้ายเส้นตัด และกราฟ RSI (lightweight-charts 4.2) · F2
// ตัวเลขที่ส่งให้กราฟแปลงเป็น number เพื่อวาดเท่านั้น ไม่ใช้คิดเงิน · ข้อความที่แสดงใช้ string จาก API
import { useEffect, useRef, useState } from 'react';
import { useThemeTick } from '@/components/client';
import type { IChartApi, ISeriesApi, SeriesMarker, Time, MouseEventParams } from 'lightweight-charts';
import type { Lang } from '@/lib/i18n';
import type { Bar, Cross, Point } from './format';
import styles from './stock.module.css';

type LW = typeof import('lightweight-charts');

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function palette() {
  return {
    up: cssVar('--mint', '#0f9d76'), down: cssVar('--brick', '#c2452d'), gold: cssVar('--gold', '#b58a2e'),
    info: cssVar('--info', '#2f5ea8'), ink: cssVar('--ink', '#14213d'), muted: cssVar('--muted', '#5b6577'),
    line: cssVar('--line', '#dfe3ea'), surface: cssVar('--surface', '#ffffff'),
  };
}

function baseOptions(lw: LW, lang: Lang) {
  const c = palette();
  return {
    autoSize: true,
    layout: { background: { type: lw.ColorType.Solid, color: c.surface }, textColor: c.muted, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" },
    grid: { vertLines: { color: c.line }, horzLines: { color: c.line } },
    rightPriceScale: { borderColor: c.line },
    timeScale: { borderColor: c.line },
    crosshair: { mode: lw.CrosshairMode.Normal },
    localization: { locale: lang === 'th' ? 'th-TH' : 'en-GB', priceFormatter: (p: number) => p.toFixed(2) },
  };
}

/** ใส่ data-testid ให้ลิงก์ TradingView ที่ไลบรารีสร้างไว้ในกราฟ (NFR-16 · R120) */
export function tagTvLink(el: HTMLElement | null, testid: string) {
  if (!el) return;
  const tag = () => el.querySelectorAll<HTMLAnchorElement>('a[href*="tradingview.com"]').forEach((a) => { a.dataset.testid = testid; });
  tag();
  requestAnimationFrame(tag);
  setTimeout(tag, 300);
}

/** เวลาของ crosshair → 'YYYY-MM-DD' */
function timeToDate(t: Time | undefined): string | null {
  if (t === undefined) return null;
  if (typeof t === 'string') return t;
  if (typeof t === 'number') return new Date(t * 1000).toISOString().slice(0, 10);
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

/** ย่อเส้นรายวันให้ตรงกับแท่งรายสัปดาห์: ใช้ค่าวันสุดท้ายของแต่ละสัปดาห์ วางที่วันที่ของแท่ง */
function alignToBars(points: Point[], bars: Bar[]): Point[] {
  const out: Point[] = [];
  let j = 0;
  for (let i = 0; i < bars.length; i++) {
    const start = bars[i].date;
    const next = bars[i + 1]?.date;
    let last: Point | null = null;
    while (j < points.length && points[j].date < start) j++;
    while (j < points.length && (next === undefined || points[j].date < next)) { last = points[j]; j++; }
    if (last) out.push({ date: start, value: last.value });
  }
  return out;
}

/** วันที่ของแท่งที่มีวันนั้นอยู่ (แท่งล่าสุดที่วันที่ ≤ วันนั้น) */
function barDateFor(date: string, bars: Bar[]): string | null {
  let found: string | null = null;
  for (const b of bars) { if (b.date <= date) found = b.date; else break; }
  return found;
}

export function CandleChart({ bars, sma50, sma200, show50, show200, crosses, interval, lang, labels, onHover }: {
  bars: Bar[]; sma50: Point[]; sma200: Point[]; show50: boolean; show200: boolean; crosses: Cross[];
  interval: 'day' | 'week'; lang: Lang; labels: { golden: string; death: string }; onHover: (b: Bar | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candle = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const l50 = useRef<ISeriesApi<'Line'> | null>(null);
  const l200 = useRef<ISeriesApi<'Line'> | null>(null);
  const byDate = useRef<Map<string, Bar>>(new Map());
  const hover = useRef(onHover);
  hover.current = onHover;
  const [ready, setReady] = useState(0); // รุ่นของกราฟ: เพิ่มทุกครั้งที่สร้างใหม่ (React รวมการอัปเดตได้ boolean จึงไม่พอ)
  const themeTick = useThemeTick();

  // สร้างกราฟครั้งเดียว (โหลดไลบรารีแบบแยกไฟล์ ไม่ถ่วงหน้าแรก · NFR-02)
  useEffect(() => {
    let alive = true;
    let ch: IChartApi | null = null;
    import('lightweight-charts').then((lw) => {
      if (!alive || !box.current) return;
      const c = palette();
      ch = lw.createChart(box.current, baseOptions(lw, lang));
      candle.current = ch.addCandlestickSeries({
        upColor: c.up, downColor: c.down, borderUpColor: c.up, borderDownColor: c.down, wickUpColor: c.up, wickDownColor: c.down,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });
      l50.current = ch.addLineSeries({ color: c.gold, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      l200.current = ch.addLineSeries({ color: c.info, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      ch.subscribeCrosshairMove((p: MouseEventParams<Time>) => {
        const d = timeToDate(p.time);
        hover.current(d ? byDate.current.get(d) ?? null : null);
      });
      chart.current = ch;
      tagTvLink(box.current, 'stock-chart-tv-link');
      setReady((n) => n + 1);
    });
    return () => {
      alive = false;
      ch?.remove();
      chart.current = null; candle.current = null; l50.current = null; l200.current = null;
    };
  }, [lang, themeTick]);

  // ข้อมูลแท่ง + ป้ายเส้นตัด
  useEffect(() => {
    if (!ready || !candle.current) return;
    byDate.current = new Map(bars.map((b) => [b.date, b]));
    candle.current.setData(bars.map((b) => ({
      time: b.date as Time, open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close),
    })));
    const c = palette();
    const markers: SeriesMarker<Time>[] = [];
    for (const x of crosses) {
      const at = interval === 'day' ? (byDate.current.has(x.date) ? x.date : null) : barDateFor(x.date, bars);
      if (!at) continue;
      markers.push(x.kind === 'golden'
        ? { time: at as Time, position: 'belowBar', color: c.up, shape: 'arrowUp', text: labels.golden }
        : { time: at as Time, position: 'aboveBar', color: c.down, shape: 'arrowDown', text: labels.death });
    }
    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    candle.current.setMarkers(markers);
    chart.current?.timeScale().fitContent();
  }, [ready, bars, crosses, interval, labels.golden, labels.death]);

  // เส้นค่าเฉลี่ย (เปิด/ปิดได้)
  useEffect(() => {
    if (!ready || !l50.current || !l200.current) return;
    const toLine = (pts: Point[]) => (interval === 'week' ? alignToBars(pts, bars) : pts)
      .map((p) => ({ time: p.date as Time, value: Number(p.value) }));
    l50.current.setData(show50 ? toLine(sma50) : []);
    l200.current.setData(show200 ? toLine(sma200) : []);
  }, [ready, sma50, sma200, show50, show200, interval, bars]);

  return <div ref={box} className={styles.chartBox} data-testid="stock-chart" data-ready={ready ? 'true' : 'false'} data-bars={bars.length} />;
}

export function RsiChart({ points, lang }: { points: Point[]; lang: Lang }) {
  const box = useRef<HTMLDivElement>(null);
  const series = useRef<ISeriesApi<'Line'> | null>(null);
  const chart = useRef<IChartApi | null>(null);
  const [ready, setReady] = useState(0); // รุ่นของกราฟ: เพิ่มทุกครั้งที่สร้างใหม่ (React รวมการอัปเดตได้ boolean จึงไม่พอ)
  const themeTick = useThemeTick();

  useEffect(() => {
    let alive = true;
    let ch: IChartApi | null = null;
    import('lightweight-charts').then((lw) => {
      if (!alive || !box.current) return;
      const c = palette();
      const base = baseOptions(lw, lang);
      ch = lw.createChart(box.current, { ...base, handleScroll: false, handleScale: false, rightPriceScale: { ...base.rightPriceScale, scaleMargins: { top: 0.06, bottom: 0.06 } } });
      const s = ch.addLineSeries({
        color: c.ink, lineWidth: 2, priceLineVisible: false,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      });
      s.createPriceLine({ price: 70, color: c.down, lineWidth: 1, lineStyle: lw.LineStyle.Dashed, axisLabelVisible: false, title: '70' });
      s.createPriceLine({ price: 30, color: c.up, lineWidth: 1, lineStyle: lw.LineStyle.Dashed, axisLabelVisible: false, title: '30' });
      series.current = s;
      chart.current = ch;
      tagTvLink(box.current, 'stock-rsi-tv-link');
      setReady((n) => n + 1);
    });
    return () => { alive = false; ch?.remove(); series.current = null; chart.current = null; };
  }, [lang, themeTick]);

  useEffect(() => {
    if (!ready || !series.current) return;
    series.current.setData(points.map((p) => ({ time: p.date as Time, value: Number(p.value) })));
    chart.current?.timeScale().fitContent();
  }, [ready, points]);

  return <div ref={box} className={styles.rsiBox} data-testid="stock-rsi-chart" />;
}
