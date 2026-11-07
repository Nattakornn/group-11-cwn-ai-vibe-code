// F5 ปันผล (FR-36–FR-39) · server component บาง ๆ โหลด dict แล้วส่งให้ client
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDict, isLang } from '@/lib/i18n';
import { DividendsView } from '@/components/dividends/DividendsView';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const dict = await getDict(lang, 'dividends');
  return { title: dict['meta.title'] };
}

export default async function DividendsPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const m = typeof sp.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : null;
  const [dict, core] = await Promise.all([getDict(lang, 'dividends'), getDict(lang, 'core')]);
  return <DividendsView lang={lang} dict={dict} core={core} initialMonth={m} />;
}
