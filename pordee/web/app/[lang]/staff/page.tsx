// หน้าทีมงาน (F8 · FR-09, FR-60) · server component บาง ๆ ส่ง dict ให้ client
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getDict, isLang } from '@/lib/i18n';
import StaffDashboard from '@/components/staff/StaffDashboard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const dict = await getDict(lang, 'staff');
  return { title: dict['meta.title'], robots: { index: false } };
}

export default async function StaffPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dict = await getDict(lang, 'staff');
  return <StaffDashboard lang={lang} dict={dict} />;
}
