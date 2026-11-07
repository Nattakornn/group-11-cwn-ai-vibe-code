// F6 · โครงร่วมของหน้าศึกษา: หัวเรื่อง + แถบแท็บ 4 หน้า
import { notFound } from 'next/navigation';
import { getDict, isLang, makeT } from '@/lib/i18n';
import { StudyTabs } from '@/components/study/StudyTabs';
import s from '@/components/study/study.module.css';

export const dynamic = 'force-dynamic';

export default async function StudyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dict = await getDict(lang, 'study');
  const t = makeT(dict);
  return (
    <div className="fade-in">
      <div className={s.head}>
        <h1>{t('title')}</h1>
        <p>{t('intro')}</p>
      </div>
      <StudyTabs lang={lang} dict={dict} />
      {children}
    </div>
  );
}
