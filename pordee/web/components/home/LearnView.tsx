// F1 · หน้าเริ่มต้นลงทุน (FR-49 · US-38) · เนื้อหาคงที่ ไม่ยกชื่อหุ้นเป็นตัวอย่าง
import Link from 'next/link';
import type { ReactNode } from 'react';
import { makeT, type Dict, type Lang } from '@/lib/i18n';
import { Reveal } from './motion';
import { CrossDiagram, DelayDiagram, DividendDiagram, PeDiagram, RsiDiagram, ScreenerDiagram, SmaDiagram } from './LearnDiagrams';
import s from './learn.module.css';

const IDS = ['pe', 'div', 'sma', 'rsi', 'cross', 'delay', 'screener'] as const;
type Id = (typeof IDS)[number];

export function LearnView({ lang, dict }: { lang: Lang; dict: Dict }) {
  const t = makeT(dict);
  const L = (p: string) => `/${lang}${p}`;
  const k = (id: Id, key: string) => t(`learn.${id}.${key}`);

  const diagrams: Record<Id, ReactNode> = {
    pe: <PeDiagram l={{ price: k('pe', 'dPrice'), eps: k('pe', 'dEps'), result: k('pe', 'dResult') }} />,
    div: <DividendDiagram l={{ yield: k('div', 'dYield'), rest: k('div', 'dRest') }} />,
    sma: <SmaDiagram l={{ price: k('sma', 'dPrice'), s50: k('sma', 'd50'), s200: k('sma', 'd200') }} />,
    rsi: <RsiDiagram l={{ high: k('rsi', 'dHigh'), mid: k('rsi', 'dMid'), low: k('rsi', 'dLow') }} />,
    cross: <CrossDiagram l={{ golden: k('cross', 'dGolden'), death: k('cross', 'dDeath'), s50: k('cross', 'd50'), s200: k('cross', 'd200') }} />,
    delay: <DelayDiagram l={{ real: k('delay', 'dReal'), shown: k('delay', 'dShown') }} />,
    screener: <ScreenerDiagram l={{ all: k('screener', 'dAll'), pe: k('screener', 'dPe'), div: k('screener', 'dDiv'), result: k('screener', 'dResult') }} />,
  };

  return (
    <section data-testid="learn-page" data-state="ready" className={s.page} id="learn-top">
      <header className={s.head}>
        <span className={s.eyebrow}>{t('learn.eyebrow')}</span>
        <h1 className={s.title} data-testid="learn-title">{t('learn.title')}</h1>
        <p className={s.intro}>{t('learn.intro')}</p>
        <nav aria-label={t('learn.toc')} className={s.toc} data-testid="learn-toc">
          <span className={s.tocLabel}>{t('learn.toc')}</span>
          {IDS.map((id, i) => (
            <a key={id} href={`#learn-${id}`} className={s.tocItem} data-testid={`learn-toc-${id}`}>
              <span className={`num ${s.tocNum}`}>{i + 1}</span>{k(id, 'title')}
            </a>
          ))}
        </nav>
      </header>

      <div className={s.sections}>
        {IDS.map((id, i) => (
          <Reveal key={id}>
            <article id={`learn-${id}`} className={`card ${s.section}`} data-testid={`learn-section-${id}`}>
              <div className={s.text}>
                <div className={s.secHead}>
                  <span className={`num ${s.secNum}`}>{String(i + 1).padStart(2, '0')}</span>
                  <h2 className={s.h2}>{k(id, 'title')}</h2>
                </div>
                <p>{k(id, 'body')}</p>
                {id === 'screener' ? (
                  <ol className={s.steps} data-testid="learn-screener-steps">
                    {[1, 2, 3, 4].map((n) => <li key={n}>{k('screener', `step${n}`)}</li>)}
                  </ol>
                ) : (
                  <div className={s.example}>
                    <span className={s.boxLabel}>{t('learn.example')}</span>
                    <p>{k(id, 'example')}</p>
                  </div>
                )}
                <div className={s.keep}>
                  <span className={s.boxLabel}>{t('learn.keep')}</span>
                  <p>{k(id, 'keep')}</p>
                </div>
                {id !== 'screener' && (
                  <p className={s.caution}><strong>{t('learn.caution')}:</strong> {k(id, 'caution')}</p>
                )}
                {id === 'screener' && (
                  <div>
                    <Link href={L('/study/screener')} className={`btn btn-primary ${s.cta}`} data-testid="learn-cta-screener">{k('screener', 'open')}</Link>
                  </div>
                )}
              </div>
              <div className={s.visual}>{diagrams[id]}</div>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <div className={s.end} data-testid="learn-end">
          <div>
            <h2 className={s.endTitle}>{t('learn.end.title')}</h2>
            <p className={s.endBody}>{t('learn.end.body')}</p>
          </div>
          <div className={s.endActions}>
            <Link href={L('/search')} className={`btn ${s.btnGold}`} data-testid="learn-cta-search">{t('learn.end.search')}</Link>
            <Link href={L('')} className={`btn ${s.btnOutline}`} data-testid="learn-cta-home">{t('learn.end.home')}</Link>
            <a href="#learn-top" className={s.top} data-testid="learn-back-top">{t('learn.backTop')} ↑</a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
