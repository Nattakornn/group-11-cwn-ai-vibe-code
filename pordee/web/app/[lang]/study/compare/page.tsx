// F6 · /{lang}/study/compare (FR-17, FR-41, FR-43) · ?symbols=A,B&from=&to= = เปิดซ้ำจากประวัติ
import { notFound } from 'next/navigation';
import { getDict, isLang } from '@/lib/i18n';
import { Compare } from '@/components/study/Compare';
import { cleanSymbol, isDate, minusMonthsDate, sp, studyContext } from '@/components/study/server';

export const dynamic = 'force-dynamic';
type SP = Record<string, string | string[] | undefined>;

export default async function ComparePage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<SP> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const [q, ctx, dict] = await Promise.all([searchParams, studyContext(), getDict(lang, 'study')]);
  const symbols = [...new Set(sp(q.symbols).split(',').map(cleanSymbol).filter(Boolean))];
  const to = isDate(sp(q.to)) ? sp(q.to) : ctx.lastClosed;
  let from = isDate(sp(q.from)) ? sp(q.from) : minusMonthsDate(to, 6);
  if (!isDate(sp(q.from)) && from < ctx.historyStart) from = ctx.historyStart;
  return <Compare lang={lang} dict={dict} ctx={ctx} initial={{ symbols, from, to }} />;
}
