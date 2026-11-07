// F7 · /{lang}/account (ข้อมูลจาก GET /api/me ฝั่ง client)
import { notFound } from 'next/navigation';
import { getDict, isLang } from '@/lib/i18n';
import { AccountView } from '@/components/account/AccountView';

export const dynamic = 'force-dynamic';

export default async function AccountPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const [core, account] = await Promise.all([getDict(lang, 'core'), getDict(lang, 'account')]);
  return <AccountView lang={lang} dict={{ ...core, ...account }} />;
}
