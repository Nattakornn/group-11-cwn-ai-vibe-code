'use client';
// F6 · แถบแท็บสลับ 4 หน้าศึกษา
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { makeT, type Dict } from '@/lib/i18n';
import s from './study.module.css';

const TABS = ['screener', 'compare', 'backtest', 'history'] as const;

export function StudyTabs({ lang, dict }: { lang: 'th' | 'en'; dict: Dict }) {
  const t = makeT(dict);
  const path = usePathname() ?? '';
  return (
    <nav className={s.tabs} aria-label={t('tabs.label')} data-testid="study-tabs">
      {TABS.map((name) => {
        const href = `/${lang}/study/${name}`;
        const active = path.startsWith(href);
        return (
          <Link key={name} href={href} className={`${s.tab} ${active ? s.tabActive : ''}`}
            aria-current={active ? 'page' : undefined} data-testid={`study-tab-${name}`}>
            {t(`tab.${name}`)}
          </Link>
        );
      })}
    </nav>
  );
}
