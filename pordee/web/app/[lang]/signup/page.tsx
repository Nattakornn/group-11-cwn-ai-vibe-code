// F7 · /{lang}/signup
import { notFound } from 'next/navigation';
import { getDict, isLang } from '@/lib/i18n';
import { SignupForm } from '@/components/account/SignupForm';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SignupPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<SP> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const [core, account] = await Promise.all([getDict(lang, 'core'), getDict(lang, 'account')]);
  return <SignupForm lang={lang} dict={{ ...core, ...account }} next={one(sp.next)} />;
}
