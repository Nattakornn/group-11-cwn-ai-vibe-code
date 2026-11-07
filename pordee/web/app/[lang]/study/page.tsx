// F6 · /{lang}/study → หน้าคัดกรอง
import { redirect } from 'next/navigation';

export default async function StudyIndex({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  redirect(`/${lang === 'en' ? 'en' : 'th'}/study/screener`);
}
