// F1 · หน้าเริ่มต้นลงทุน /{lang}/learn (FR-49 · US-38)
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getDict, isLang } from '@/lib/i18n';
import { LearnView } from '@/components/home/LearnView';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: lang === 'en' ? 'Start investing · Pordee Port' : 'เริ่มต้นลงทุน · พอดีพอร์ต' };
}

export default async function LearnPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dict = await getDict(lang, 'home');
  return <LearnView lang={lang} dict={dict} />;
}
