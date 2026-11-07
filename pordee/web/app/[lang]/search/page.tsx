// F2 · หน้าค้นหาหุ้น /{lang}/search?q= (FR-01, FR-02)
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getDict, isLang } from '@/lib/i18n';
import { SearchView } from '@/components/stock/SearchView';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: lang === 'en' ? 'Search stocks · Pordee Port' : 'ค้นหาหุ้น · พอดีพอร์ต' };
}

export default async function SearchPage({ params, searchParams }: {
  params: Promise<{ lang: string }>; searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const q = Array.isArray(sp.q) ? sp.q[0] ?? '' : sp.q ?? '';
  const dict = await getDict(lang, 'stock');
  return <SearchView lang={lang} dict={dict} initialQ={q} />;
}
