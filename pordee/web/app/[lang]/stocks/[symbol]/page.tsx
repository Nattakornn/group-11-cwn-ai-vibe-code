// F2 · หน้าหุ้น /{lang}/stocks/[symbol] (FR-03, FR-07, FR-10–FR-16, FR-47, FR-48)
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getDict, isLang } from '@/lib/i18n';
import { StockView } from '@/components/stock/StockView';
import { normSymbol } from '@/components/stock/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: string; symbol: string }> }): Promise<Metadata> {
  const { lang, symbol } = await params;
  return { title: `${normSymbol(symbol)} · ${lang === 'en' ? 'Pordee Port' : 'พอดีพอร์ต'}` };
}

export default async function StockPage({ params }: { params: Promise<{ lang: string; symbol: string }> }) {
  const { lang, symbol } = await params;
  if (!isLang(lang)) notFound();
  const sym = normSymbol(symbol);
  const [dict, core] = await Promise.all([getDict(lang, 'stock'), getDict(lang, 'core')]);
  return <StockView key={sym} lang={lang} symbol={sym} dict={dict} core={core} />;
}
