// F1 · ส่วนคงที่ของหน้าแรก (server component · ไม่มี JS ฝั่งเบราว์เซอร์)
import Link from 'next/link';
import { makeT, type Dict, type Lang } from '@/lib/i18n';
import { HeroChart, ThaiPattern } from './HeroChart';
import { Reveal } from './motion';
import s from './home.module.css';

type T = ReturnType<typeof makeT>;

export function Hero({ lang, dict }: { lang: Lang; dict: Dict }) {
  const t = makeT(dict);
  const L = (p: string) => `/${lang}${p}`;
  return (
    <div className={s.hero} data-testid="home-hero">
      <ThaiPattern />
      <div className={s.heroGlow} aria-hidden="true" />
      <div className={s.heroInner}>
        <div className={s.heroCopy}>
          <span className={s.eyebrow}>{t('hero.eyebrow')}</span>
          <h1 className={s.heroTitle} data-testid="home-title">{t('hero.title')}</h1>
          <p className={s.heroSub}>{t('hero.subtitle')}</p>
          <div className={s.heroCtas}>
            <Link href={L('/learn')} className={`btn ${s.btnGold}`} data-testid="home-cta-learn">{t('hero.ctaLearn')} <Arrow /></Link>
            <Link href={L('/search')} className={`btn ${s.btnOutline}`} data-testid="home-cta-search">{t('hero.ctaSearch')}</Link>
            <Link href={L('/study/screener')} className={`btn ${s.btnText}`} data-testid="home-cta-screener">{t('hero.ctaScreener')}</Link>
          </div>
          <ul className={s.chips}>
            <li>{t('hero.chip1')}</li>
            <li>{t('hero.chip2')}</li>
            <li>{t('hero.chip3')}</li>
          </ul>
        </div>
        <div className={s.heroVisual}>
          <HeroChart caption={t('hero.chartCaption')} lineLabel={t('hero.chartLine')} smaLabel={t('hero.chartSma')} alt={t('hero.chartAlt')} />
        </div>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  watch: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  portfolio: <><path d="M12 3v9l7.8 4.5" /><circle cx="12" cy="12" r="9" /></>,
  dividends: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /><circle cx="12" cy="15.5" r="2" /></>,
  study: <><path d="M3 20h18" /><path d="M6 16V9M11 16V5M16 16v-4M21 16V8" /></>,
  learn: <><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" /><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5Z" /></>,
};

export function Features({ lang, dict }: { lang: Lang; dict: Dict }) {
  const t = makeT(dict);
  const items: { key: string; href: string }[] = [
    { key: 'watch', href: '/watchlist' },
    { key: 'portfolio', href: '/portfolio' },
    { key: 'dividends', href: '/dividends' },
    { key: 'study', href: '/study/screener' },
    { key: 'learn', href: '/learn' },
  ];
  return (
    <div className={s.block} data-testid="home-features">
      <Reveal>
        <div className={s.blockHead}>
          <h2 className={s.h2}>{t('features.title')}</h2>
          <p className="muted">{t('features.subtitle')}</p>
        </div>
      </Reveal>
      <div className={s.featureGrid}>
        {items.map((it, i) => (
          <Reveal key={it.key} delay={i * 70}>
            <Link href={`/${lang}${it.href}`} className={`${s.feature} ${it.key === 'learn' ? s.featureAccent : ''}`} data-testid={`home-feature-${it.key}`}>
              <span className={s.featureIcon}>
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {ICONS[it.key]}
                </svg>
              </span>
              <span className={s.featureTitle}>{t(`features.${it.key}.title`)}</span>
              <span className={s.featureBody}>{t(`features.${it.key}.body`)}</span>
              <span className={s.featureGo}>{t('features.go')} <Arrow /></span>
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

/** แถบ 24 ชม. เวลาไทย เริ่ม 12:00 ถึง 12:00 วันถัดไป เพื่อให้ช่วงตลาดเปิดต่อเนื่องกัน */
function TimeBand({ t }: { t: T }) {
  const W = 600;
  const x = (h: number) => Math.round(((((h - 12) % 24) + 24) % 24) / 24 * W * 10) / 10;
  const rows = [
    { label: t('time.summer'), range: t('time.summerRange'), from: 20.5, to: 27, id: 'summer' },
    { label: t('time.winter'), range: t('time.winterRange'), from: 21.5, to: 28, id: 'winter' },
  ];
  const ticks = [12, 15, 18, 21, 0, 3, 6, 9, 12];
  return (
    <div className={s.band} data-testid="home-time-band">
      {rows.map((r) => (
        <div key={r.id} className={s.bandRow}>
          <div className={s.bandLabel}>
            <span>{r.label}</span>
            <strong className="num" data-testid={`home-time-${r.id}`}>{r.range}</strong>
          </div>
          <svg viewBox={`0 0 ${W} 26`} className={s.bandSvg} aria-hidden="true" preserveAspectRatio="none">
            <rect x="0" y="8" width={W} height="10" rx="5" className={s.bandTrack} />
            <rect x={x(18)} y="8" width={x(6) - x(18)} height="10" className={s.bandNight} />
            <rect x={x(r.from)} y="4" width={Math.round((r.to - r.from) / 24 * W * 10) / 10} height="18" rx="9" className={r.id === 'summer' ? s.bandSummer : s.bandWinter} />
          </svg>
        </div>
      ))}
      <div className={s.bandAxis} aria-hidden="true">
        {ticks.map((h, i) => (
          <span key={i} className="num" style={{ left: `${(i / (ticks.length - 1)) * 100}%` }}>{String(h).padStart(2, '0')}</span>
        ))}
      </div>
      <p className={s.bandCaption}>{t('time.axis')}</p>
    </div>
  );
}

function DelayFigure({ t }: { t: T }) {
  return (
    <svg viewBox="0 0 320 120" className={s.delaySvg} role="img" aria-label={t('time.delayTitle')}>
      <line x1="20" y1="70" x2="300" y2="70" className={s.dAxis} />
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1={20 + i * 40} y1="64" x2={20 + i * 40} y2="76" className={s.dAxis} />
      ))}
      <circle cx="100" cy="70" r="9" className={s.dReal} />
      <circle cx="220" cy="70" r="9" className={s.dShown} />
      <path d="M112 50 C140 26 180 26 208 50" className={s.dArrow} markerEnd="url(#dArrowHead)" />
      <defs>
        <marker id="dArrowHead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" className={s.dArrowHead} />
        </marker>
      </defs>
      <text x="160" y="22" textAnchor="middle" className={s.dText}>{t('time.delayPlus')}</text>
      <text x="100" y="104" textAnchor="middle" className={`num ${s.dText}`}>22:00</text>
      <text x="220" y="104" textAnchor="middle" className={`num ${s.dText}`}>22:15</text>
    </svg>
  );
}

export function TimeExplainer({ dict }: { dict: Dict }) {
  const t = makeT(dict);
  return (
    <div className={s.block} data-testid="home-time">
      <div className={s.timeGrid}>
        <Reveal className={s.timeCell}>
          <div className={`card ${s.timeCard}`}>
          <h2 className={s.h2}>{t('time.title')}</h2>
          <p className="muted">{t('time.subtitle')}</p>
          <TimeBand t={t} />
          <p className={s.note}>{t('time.early')}</p>
          <p className={s.note}>{t('time.note')}</p>
          </div>
        </Reveal>
        <Reveal className={s.timeCell} delay={90}>
          <div className={`card ${s.timeCard}`}>
          <h2 className={s.h2}>{t('time.delayTitle')}</h2>
          <p>{t('time.delayBody')}</p>
          <DelayFigure t={t} />
          <div className={s.delayLegend}>
            <span><i className={`${s.legDot} ${s.legReal}`} aria-hidden="true" />{t('time.delayReal')}</span>
            <span><i className={`${s.legDot} ${s.legShown}`} aria-hidden="true" />{t('time.delayShown')}</span>
          </div>
          <p className={s.note} data-testid="home-stale-note">{t('time.staleNote')}</p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

export function ClosingCta({ lang, dict }: { lang: Lang; dict: Dict }) {
  const t = makeT(dict);
  return (
    <Reveal>
      <div className={s.cta} data-testid="home-cta-band">
        <div>
          <h2 className={s.ctaTitle}>{t('cta.title')}</h2>
          <p className={s.ctaBody}>{t('cta.body')}</p>
        </div>
        <Link href={`/${lang}/learn`} className={`btn ${s.btnGold}`} data-testid="home-cta-learn-bottom">{t('cta.button')} <Arrow /></Link>
      </div>
    </Reveal>
  );
}
