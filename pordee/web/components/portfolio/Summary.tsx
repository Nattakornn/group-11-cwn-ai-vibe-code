'use client';
// F4 · สรุปรวมพอร์ต $ / ฿ · อัตราที่ใช้ (FR-32) · ข้อความตลาดปิด (FR-35) · คำอธิบายวิธีคิด
import { fmtDate, fmtDateTimeTh, fmtTimeTh, type Lang } from '@/lib/i18n';
import { dirOf, latestIso, type mkFmt, type Portfolio } from './shared';
import s from './portfolio.module.css';

type T = (k: string, v?: Record<string, string | number>) => string;
type F = ReturnType<typeof mkFmt>;

/** วันที่ 'YYYY-MM-DD' แม้ API ส่งมาเป็น ISO */
const ymd = (v: string) => String(v).slice(0, 10);

export function Summary({ pf, lang, t, f }: { pf: Portfolio; lang: Lang; t: T; f: F }) {
  const tot = pf.totals;
  const asOfIso = latestIso(pf.holdings.map((h) => h.quoteAsOf)) ?? pf.asOf;
  // R16: ราคาเก่า (ป้ายข้อมูลไม่อัปเดต) หรือหุ้นถูกถอด ต้องบอกวันที่จริงของราคา ไม่เขียน "(ล่าช้า 15 นาที)" · ใช้เวลาที่เก่าที่สุด
  const oldIsos = pf.holdings.filter((h) => h.stale || h.status === 'delisted').map((h) => h.quoteAsOf).filter((v): v is string => !!v);
  const oldestIso = oldIsos.length ? oldIsos.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a)) : null;
  return (
    <div className="card card-gold stack" data-testid="pf-summary">
      <div className="spread">
        <h2 style={{ margin: 0 }}>{t('summary.title')}</h2>
        {!pf.marketOpen ? (
          <span className={s.marketNote} data-testid="pf-market-closed">
            {t('market.closed', { datetime: fmtDateTimeTh(asOfIso, lang) })}
          </span>
        ) : (
          <span className={s.marketNote} data-testid="pf-market-open">
            {oldestIso
              ? t('market.openStale', { datetime: fmtDateTimeTh(oldestIso, lang) })
              : t('market.open', { time: fmtTimeTh(asOfIso, lang) })}
          </span>
        )}
      </div>

      <div className={s.summaryGrid}>
        <div className={s.tile}>
          <span className={s.tileLabel}>{t('summary.cost')}</span>
          <div className={s.pair}>
            <span className={`num ${s.big}`} data-testid="pf-total-cost-usd" data-value={tot.costUsd}>{f.usd(tot.costUsd)}</span>
            <span className={`num ${s.small}`} data-testid="pf-total-cost-thb" data-value={tot.costThb}>{f.thb(tot.costThb)}</span>
          </div>
        </div>
        <div className={s.tile}>
          <span className={s.tileLabel}>{t('summary.value')}</span>
          <div className={s.pair}>
            <span className={`num ${s.big}`} data-testid="pf-total-value-usd" data-value={tot.valueUsd}>{f.usd(tot.valueUsd)}</span>
            <span className={`num ${s.small}`} data-testid="pf-total-value-thb" data-value={tot.valueThb}>{f.thb(tot.valueThb)}</span>
          </div>
        </div>
        <div className={s.tile}>
          <span className={s.tileLabel}>{t('summary.pl')}</span>
          <div className={s.pair}>
            <span className={`num ${s.big} ${dirOf(tot.plUsd)}`}>
              <span data-testid="pf-total-pl-usd" data-value={tot.plUsd}>{f.signedUsd(tot.plUsd)}</span>
              {tot.plPct != null && tot.plPct !== '' && (
                <span style={{ fontSize: 'var(--fs-md)', marginLeft: 8 }} data-testid="pf-total-pl-pct" data-value={tot.plPct}>({f.pct(tot.plPct)})</span>
              )}
            </span>
            <span className={`num ${s.small} ${dirOf(tot.plThb)}`} data-testid="pf-total-pl-thb" data-value={tot.plThb}>{f.signedThb(tot.plThb)}</span>
          </div>
        </div>
      </div>

      <div className={s.extraRow}>
        <div className={s.extra}>
          <span>{t('summary.realized')}</span>
          <span className={`num ${dirOf(tot.realizedUsd)}`} data-testid="pf-total-realized" data-value={tot.realizedUsd}>{f.signedUsd(tot.realizedUsd)}</span>
        </div>
        <div className={s.extra}>
          <span>{t('summary.dividends')}</span>
          <span className="num" data-testid="pf-total-dividends" data-value={tot.dividendsNetUsd}>{f.usd(tot.dividendsNetUsd)}</span>
        </div>
        <div className={s.extra}>
          <span>{t('summary.totalReturn')}</span>
          <span className={`num ${dirOf(tot.totalReturnUsd)}`} data-testid="pf-total-return" data-value={tot.totalReturnUsd}>{f.signedUsd(tot.totalReturnUsd)}</span>
        </div>
      </div>

      <div className={s.fxBox} data-testid="pf-fx" data-rate={pf.fx.rate} data-rate-date={ymd(pf.fx.rateDate)}>
        <div className="stack" style={{ gap: 2 }}>
          <strong>{t('fx.label')}</strong>
          <span>
            {t('fx.value', {
              rate: f.rate(pf.fx.rate, 4),
              date: fmtDate(ymd(pf.fx.rateDate), lang),
              published: fmtDateTimeTh(pf.fx.publishedAt, lang),
            })}
          </span>
          <span className="muted">{t('fx.note')}</span>
        </div>
      </div>

      <details open data-testid="pf-explain">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('explain.title')}</summary>
        <ul className={s.explain} style={{ marginTop: 8 }}>
          <li>{t('explain.cost')}</li>
          <li>{t('explain.value')}</li>
          <li>{t('explain.avg')}</li>
          <li>{t('explain.diff')}</li>
        </ul>
      </details>
    </div>
  );
}
