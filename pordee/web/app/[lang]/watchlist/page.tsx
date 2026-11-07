// /{lang}/watchlist · F3
import { WatchlistView } from '@/components/watch/WatchlistView';
import { loadWatch, watchMeta } from '@/components/watch/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return watchMeta((await params).lang, 'watch.title');
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang, dict } = await loadWatch((await params).lang);
  return <WatchlistView lang={lang} dict={dict} />;
}
