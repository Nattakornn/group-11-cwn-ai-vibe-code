// /{lang}/outbox · F3
import { OutboxView } from '@/components/watch/OutboxView';
import { loadWatch, watchMeta } from '@/components/watch/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return watchMeta((await params).lang, 'outbox.title');
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang, dict } = await loadWatch((await params).lang);
  return <OutboxView lang={lang} dict={dict} />;
}
