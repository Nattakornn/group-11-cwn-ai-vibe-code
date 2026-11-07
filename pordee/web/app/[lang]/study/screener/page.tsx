// F6 · /{lang}/study/screener (FR-45, FR-46)
import { notFound } from 'next/navigation';
import { getDict, isLang } from '@/lib/i18n';
import { Screener } from '@/components/study/Screener';

export const dynamic = 'force-dynamic';

export default async function ScreenerPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return <Screener lang={lang} dict={await getDict(lang, 'study')} />;
}
