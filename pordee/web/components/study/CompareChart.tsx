'use client';
// F6 · กราฟเส้น % เทียบหุ้น (lightweight-charts 4.2) · ทุกเส้นเริ่ม 0% · เส้นประที่ 0%
import { useEffect, useRef, useState } from 'react';
import { fmtPct } from '@/lib/money';
import s from './study.module.css';
import { tagTvLink } from '@/components/stock/PriceChart';

export type Series = { symbol: string; points: { date: string; pct: string }[] };
export type Hover = { date: string; values: Record<string, string | undefined> } | null;

export const SERIES_VARS = ['--s1', '--s2', '--s3', '--s4'] as const;

type BD = { year: number; month: number; day: number };
const toDate = (t: unknown): string | null => {
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object' && 'year' in (t as BD)) {
    const b = t as BD;
    return `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
  }
  if (typeof t === 'number') return new Date(t * 1000).toISOString().slice(0, 10);
  return null;
};

export function CompareChart({ series, label, onHover }: { series: Series[]; label: string; onHover: (h: Hover) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const [scheme, setScheme] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => setScheme((n) => n + 1);
    mq.addEventListener('change', fn);
    window.addEventListener('pordee:theme', fn);
    return () => { mq.removeEventListener('change', fn); window.removeEventListener('pordee:theme', fn); };
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || series.length === 0) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import('lightweight-charts').then((lc) => {
      if (disposed || !box.current) return;
      const css = getComputedStyle(el);
      const v = (name: string) => css.getPropertyValue(name).trim();
      const chart = lc.createChart(el, {
        autoSize: true,
        layout: { background: { type: lc.ColorType.Solid, color: 'transparent' }, textColor: v('--muted'), fontFamily: v('--mono') || 'monospace' },
        grid: { vertLines: { visible: false }, horzLines: { color: v('--line') } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
        crosshair: { mode: lc.CrosshairMode.Magnet },
        localization: { priceFormatter: (p: number) => fmtPct(p.toFixed(6)) },
        handleScroll: false,
        handleScale: false,
      });
      tagTvLink(el, 'cmp-chart-tv-link');
      const lookup = new Map<string, Map<string, string>>();
      series.forEach((sr, i) => {
        const line = chart.addLineSeries({
          color: v(SERIES_VARS[i % SERIES_VARS.length]),
          lineWidth: 2,
          title: sr.symbol,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerRadius: 4,
          priceFormat: { type: 'custom', formatter: (p: number) => fmtPct(p.toFixed(6)), minMove: 0.01 },
        });
        // ค่าสำหรับวาดเท่านั้น (ตัวเลขที่แสดงใช้สตริงจาก API)
        line.setData(sr.points.map((p) => ({ time: p.date, value: Number(p.pct) })));
        if (i === 0) line.createPriceLine({ price: 0, color: v('--muted'), lineWidth: 1, lineStyle: lc.LineStyle.Dashed, axisLabelVisible: false, title: '' });
        lookup.set(sr.symbol, new Map(sr.points.map((p) => [p.date, p.pct])));
      });
      chart.timeScale().fitContent();
      chart.subscribeCrosshairMove((param) => {
        const d = toDate(param.time);
        if (!d || !param.point) { hoverRef.current(null); return; }
        const values: Record<string, string | undefined> = {};
        for (const sr of series) values[sr.symbol] = lookup.get(sr.symbol)?.get(d);
        hoverRef.current({ date: d, values });
      });
      cleanup = () => chart.remove();
    });
    return () => { disposed = true; cleanup?.(); };
  }, [series, scheme]);

  return <div ref={box} className={s.chartBox} role="img" aria-label={label} data-testid="cmp-chart" />;
}
