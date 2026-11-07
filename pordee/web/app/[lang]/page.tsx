// F1 · หน้าแรก /{lang}
// ใช้เฉพาะ /api/market/status และ /api/screener (ไม่กินโควตา Mock Feed) · ห้ามดึงราคาสดจากหน้านี้
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getDict, isLang } from '@/lib/i18n';
import { HomeLive, HomeRoot } from '@/components/home/HomeLive';
import { ClosingCta, Features, Hero, TimeExplainer } from '@/components/home/HomeSections';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: lang === 'en' ? 'Pordee Port · US stock insight' : 'พอดีพอร์ต · ข้อมูลหุ้นอเมริกาเป็นภาษาไทย' };
}

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dict = await getDict(lang, 'home');
  return (
    <HomeRoot>
      <Hero lang={lang} dict={dict} />
      <HomeLive lang={lang} dict={dict} />
      <Features lang={lang} dict={dict} />
      <TimeExplainer dict={dict} />
      <ClosingCta lang={lang} dict={dict} />
    </HomeRoot>
  );
}
