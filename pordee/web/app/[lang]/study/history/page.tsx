// F6 · /{lang}/study/history (FR-44, BR-55)
import { notFound } from 'next/navigation';
import { getDict, isLang } from '@/lib/i18n';
import { History } from '@/components/study/History';
import { studyContext } from '@/components/study/server';

export const dynamic = 'force-dynamic';

export default async function HistoryPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const [ctx, dict] = await Promise.all([studyContext(), getDict(lang, 'study')]);
  return <History lang={lang} dict={dict} loggedIn={ctx.loggedIn} />;
}
