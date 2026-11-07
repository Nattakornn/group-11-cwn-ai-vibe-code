// root layout (มีภาษาใน path) · หัวหน้าเป็นเจ้าของ
import '@fontsource/ibm-plex-sans-thai/400.css';
import '@fontsource/ibm-plex-sans-thai/500.css';
import '@fontsource/ibm-plex-sans-thai/600.css';
import '@fontsource/ibm-plex-sans-thai/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '../globals.css';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { getDict, isLang } from '@/lib/i18n';
import { currentUser } from '@/lib/session';
import { now } from '@/lib/clock';
import { marketStatus } from '@/lib/market';
import { lastPriceUpdate } from '@/lib/feed';
import { modeFlag } from '@/lib/bug';
import { Footer, Header, MarketBar, MobileNav } from '@/components/chrome';
import { ReadyMarker } from '@/components/client';

export const dynamic = 'force-dynamic';
/** title ตามภาษา (หน้า EN ห้ามมีอักษรไทย · NFR-05) */
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return lang === 'en'
    ? { title: 'Pordee Port · US Stock Insight', description: 'US stock data, made easy to read' }
    : { title: 'พอดีพอร์ต · ข้อมูลหุ้นอเมริกา', description: 'ข้อมูลหุ้นอเมริกา อ่านง่าย เป็นภาษาไทย' };
}

export default async function LangLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const [user, n, dict] = await Promise.all([currentUser(), now(), getDict(lang, 'core')]);
  const status = await marketStatus(n);
  const updatedAt = await lastPriceUpdate(n).catch(() => null);
  const saved = (await cookies()).get('pd_theme')?.value;
  const theme = saved === 'light' || saved === 'dark' ? saved : undefined;
  return (
    <html lang={lang} data-theme={theme} data-ready="false" data-bug-mode={modeFlag()} className={user?.big_font ? 'big' : undefined}>
      <body>
        <ReadyMarker />
        <Header lang={lang} dict={dict} isStaff={!!user?.is_staff} loggedIn={!!user} />
        <MarketBar lang={lang} dict={dict} status={status} />
        <main className="container page" id="main">{children}</main>
        <Footer dict={dict} lang={lang} updatedAt={updatedAt} />
        <MobileNav lang={lang} dict={dict} loggedIn={!!user} />
      </body>
    </html>
  );
}
