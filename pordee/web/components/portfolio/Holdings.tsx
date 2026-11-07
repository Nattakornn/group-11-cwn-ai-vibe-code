'use client';
// F4 · ตารางหุ้นที่ถือ (FR-29) · บนจอแคบกลายเป็นการ์ดด้วย CSS (DOM ชุดเดียว testid ไม่ซ้ำ)
import Link from 'next/link';
import type { Lang } from '@/lib/i18n';
import { dirOf, type mkFmt, type Portfolio } from './shared';
import s from './portfolio.module.css';

type T = (k: string, v?: Record<string, string | number>) => string;
type F = ReturnType<typeof mkFmt>;

export function Holdings({ pf, lang, t, tc, f }: { pf: Portfolio; lang: Lang; t: T; tc: T; f: F }) {
  const rows = pf.holdings;
  return (
    <div className="card stack" data-testid="pf-holdings">
      <h2 style={{ margin: 0 }}>{t('holdings.title')}</h2>
      {rows.length === 0 ? (
        <p className="muted" data-testid="pf-empty" style={{ margin: 0 }}>{t('holdings.empty')}</p>
      ) : (
        <div className="table-wrap">
          <table className={s.rtable}>
            <thead>
              <tr>
                <th scope="col">{t('col.symbol')}</th>
                <th scope="col">{t('col.shares')}</th>
                <th scope="col">{t('col.avg')}</th>
                <th scope="col">{t('col.price')}</th>
                <th scope="col">{t('col.valueUsd')}</th>
                <th scope="col">{t('col.costThb')}</th>
                <th scope="col">{t('col.valueThb')}</th>
                <th scope="col">{t('col.plUsd')}</th>
                <th scope="col">{t('col.plThb')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.symbol} data-testid={`pf-row-${h.symbol}`} data-stale={h.stale ? 'true' : 'false'} data-status={h.status}>
                  <td>
                    <div className={s.symCell}>
                      <Link href={`/${lang}/stocks/${encodeURIComponent(h.symbol)}`} data-testid={`pf-link-${h.symbol}`}>{h.symbol}</Link>
                      <span className={s.name}>{h.name}</span>
                      {(h.stale || h.status === 'delisted') && (
                        <span className={s.badges}>
                          {h.stale && <span className="badge badge-stale" data-testid={`pf-stale-${h.symbol}`}>{tc('badge.stale')}</span>}
                          {h.status === 'delisted' && <span className="badge badge-halted" data-testid={`pf-halted-${h.symbol}`}>{tc('badge.halted')}</span>}
                        </span>
                      )}
                    </div>
                  </td>
                  <td data-label={t('col.shares')}>
                    <span className="num" data-testid={`pf-shares-${h.symbol}`} data-value={h.shares}>{f.shares(h.shares)}</span>
                  </td>
                  <td data-label={t('col.avg')}>
                    <span className="num" data-testid={`pf-avg-${h.symbol}`} data-value={h.avgCostUsd}>{f.usd(h.avgCostUsd)}</span>
                  </td>
                  <td data-label={t('col.price')}>
                    <span className="num" data-testid={`pf-price-${h.symbol}`} data-value={h.priceUsd ?? ''}>
                      {h.priceUsd == null ? t('noPrice') : f.price(h.priceUsd)}
                    </span>
                  </td>
                  <td data-label={t('col.valueUsd')}>
                    <span className="num" data-testid={`pf-value-usd-${h.symbol}`} data-value={h.valueUsd ?? ''}>{f.usd(h.valueUsd)}</span>
                  </td>
                  <td data-label={t('col.costThb')}>
                    <span className="num" data-testid={`pf-cost-thb-${h.symbol}`} data-value={h.costThb}>{f.thb(h.costThb)}</span>
                  </td>
                  <td data-label={t('col.valueThb')}>
                    <span className="num" data-testid={`pf-value-thb-${h.symbol}`} data-value={h.valueThb ?? ''}>{f.thb(h.valueThb)}</span>
                  </td>
                  <td data-label={t('col.plUsd')}>
                    <span className={`num ${dirOf(h.plUsd)}`} data-testid={`pf-pl-usd-${h.symbol}`} data-value={h.plUsd ?? ''}>{f.signedUsd(h.plUsd)}</span>
                    {h.plPct != null && h.plPct !== '' && (
                      <span className={`num ${s.sub} ${dirOf(h.plPct)}`} data-testid={`pf-pl-pct-${h.symbol}`} data-value={h.plPct}>{f.pct(h.plPct)}</span>
                    )}
                  </td>
                  <td data-label={t('col.plThb')}>
                    <span className={`num ${dirOf(h.plThb)}`} data-testid={`pf-pl-thb-${h.symbol}`} data-value={h.plThb ?? ''}>{f.signedThb(h.plThb)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
