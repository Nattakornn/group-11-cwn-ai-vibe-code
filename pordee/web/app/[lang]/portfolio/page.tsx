// F4 · หน้าพอร์ต (server component บาง ๆ) · ข้อมูลโหลดฝั่ง client ผ่าน API ของ A2
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDict, isLang, makeT } from '@/lib/i18n';
import { currentUser } from '@/lib/session';
import PortfolioClient from '@/components/portfolio/PortfolioClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const [d, c] = await Promise.all([getDict(lang, 'portfolio'), getDict(lang, 'core')]);
  return { title: `${makeT(d)('title')} · ${makeT(c)('brand')}` };
}

export default async function PortfolioPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const [dict, core, user] = await Promise.all([
    getDict(lang, 'portfolio'),
    getDict(lang, 'core'),
    currentUser().catch(() => null),
  ]);
  return <PortfolioClient lang={lang} dict={dict} core={core} loggedIn={!!user} />;
}
