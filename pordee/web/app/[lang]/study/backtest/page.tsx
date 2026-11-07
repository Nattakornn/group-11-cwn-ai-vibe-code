// F6 · /{lang}/study/backtest (FR-42, BR-54) · ?symbol=&monthly=&from=YYYY-MM&to=YYYY-MM = เปิดซ้ำจากประวัติ
import { notFound } from 'next/navigation';
import { getDict, isLang } from '@/lib/i18n';
import { Backtest } from '@/components/study/Backtest';
import { cleanSymbol, isMonth, minusMonths, sp, studyContext } from '@/components/study/server';

export const dynamic = 'force-dynamic';
type SP = Record<string, string | string[] | undefined>;

export default async function BacktestPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<SP> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const [q, ctx, dict] = await Promise.all([searchParams, studyContext(), getDict(lang, 'study')]);
  const defTo = minusMonths(ctx.lastClosed.slice(0, 7), 1);
  const to = isMonth(sp(q.to)) ? sp(q.to) : defTo;
  const from = isMonth(sp(q.from)) ? sp(q.from) : minusMonths(to, 11);
  const monthly = /^\d+(\.\d+)?$/.test(sp(q.monthly)) ? sp(q.monthly) : '100';
  return <Backtest lang={lang} dict={dict} ctx={ctx} initial={{ symbol: cleanSymbol(sp(q.symbol)), monthly, from, to }} />;
}
