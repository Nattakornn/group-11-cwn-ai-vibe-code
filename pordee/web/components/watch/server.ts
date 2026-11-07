// ตัวช่วยฝั่งเซิร์ฟเวอร์ของหน้า F3: รวม dict core + watch และตั้งชื่อแท็บ (หน้า EN ไม่มีอักษรไทย)
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDict, isLang, type Dict, type Lang } from '@/lib/i18n';

export async function loadWatch(langParam: string): Promise<{ lang: Lang; dict: Dict }> {
  if (!isLang(langParam)) notFound();
  const lang = langParam;
  const [core, watch] = await Promise.all([getDict(lang, 'core'), getDict(lang, 'watch')]);
  return { lang, dict: { ...core, ...watch } };
}

export async function watchMeta(langParam: string, titleKey: string): Promise<Metadata> {
  const lang: Lang = langParam === 'en' ? 'en' : 'th';
  const [core, watch] = await Promise.all([getDict(lang, 'core'), getDict(lang, 'watch')]);
  return { title: `${watch[titleKey] ?? titleKey} · ${core.brand}` };
}
