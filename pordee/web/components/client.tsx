'use client';
// คอมโพเนนต์ฝั่งเบราว์เซอร์กลาง (หัวหน้าเป็นเจ้าของ)
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/** ตั้ง <html data-ready="true"> เมื่อหน้าโหลดและ hydrate เสร็จ */
export function ReadyMarker() {
  useEffect(() => { document.documentElement.dataset.ready = 'true'; }, []);
  return null;
}

/** สลับภาษาโดยอยู่หน้าเดิม (FR-57) */
export function LangSwitch({ lang, labels }: { lang: 'th' | 'en'; labels: { th: string; en: string } }) {
  const path = usePathname() ?? `/${lang}`;
  const swap = (to: 'th' | 'en') => {
    const rest = path.replace(/^\/(th|en)/, '');
    const q = typeof window !== 'undefined' ? window.location.search : '';
    return `/${to}${rest}${q}`;
  };
  return (
    <div className="lang-switch" data-testid="core-lang-switch">
      <Link href={swap('th')} aria-current={lang === 'th'} data-testid="core-lang-th">{labels.th}</Link>
      <Link href={swap('en')} aria-current={lang === 'en'} data-testid="core-lang-en">{labels.en}</Link>
    </div>
  );
}

/** ลิงก์เข้าสู่ระบบที่ส่งหน้าปัจจุบันไปเป็น ?next= */
export function LoginLink({ lang, label, testid }: { lang: 'th' | 'en'; label: string; testid: string }) {
  const path = usePathname() ?? `/${lang}`;
  const next = /\/(login|signup)$/.test(path) ? '' : `?next=${encodeURIComponent(path)}`;
  return <Link href={`/${lang}/login${next}`} data-testid={testid}>{label}</Link>;
}

const THEME_EVENT = 'pordee:theme';
const effectiveTheme = (): 'light' | 'dark' => {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** ปุ่มสลับโหมดสว่าง / มืด · จำค่าใน cookie pd_theme (layout อ่านไปใส่ data-theme ตั้งแต่ฝั่งเซิร์ฟเวอร์ ไม่กระพริบ) */
export function ThemeToggle({ labels }: { labels: { toDark: string; toLight: string } }) {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  useEffect(() => {
    setTheme(effectiveTheme());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => setTheme(effectiveTheme());
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  const toggle = () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.cookie = `pd_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  const label = theme === 'dark' ? labels.toLight : labels.toDark;
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}
      data-testid="core-theme-toggle" data-theme-current={theme ?? ''}>
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}

/** ตัวนับที่เพิ่มขึ้นทุกครั้งที่ธีมเปลี่ยน (ใช้สร้างกราฟใหม่ให้สีตรงธีม) */
export function useThemeTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const fn = () => setN((x) => x + 1);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    window.addEventListener(THEME_EVENT, fn);
    mq.addEventListener('change', fn);
    return () => { window.removeEventListener(THEME_EVENT, fn); mq.removeEventListener('change', fn); };
  }, []);
  return n;
}
