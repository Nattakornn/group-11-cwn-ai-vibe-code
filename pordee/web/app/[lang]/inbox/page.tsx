// /{lang}/inbox · F3
import { InboxView } from '@/components/watch/InboxView';
import { loadWatch, watchMeta } from '@/components/watch/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return watchMeta((await params).lang, 'inbox.title');
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang, dict } = await loadWatch((await params).lang);
  return <InboxView lang={lang} dict={dict} />;
}
