// /{lang}/alerts?symbol= · F3
import { AlertsView } from '@/components/watch/AlertsView';
import { loadWatch, watchMeta } from '@/components/watch/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return watchMeta((await params).lang, 'alerts.title');
}

export default async function Page({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<{ symbol?: string | string[] }> }) {
  const [{ lang: l }, sp] = await Promise.all([params, searchParams]);
  const { lang, dict } = await loadWatch(l);
  const raw = Array.isArray(sp.symbol) ? sp.symbol[0] : sp.symbol;
  const initialSymbol = (raw ?? '').trim().toUpperCase().slice(0, 12);
  return <AlertsView lang={lang} dict={dict} initialSymbol={initialSymbol} />;
}
