'use client';
// หน้า 404 สองภาษา (F8) · อ่านภาษาจาก useParams ถ้าอ่านไม่ได้ใช้ th
import Link from 'next/link';
import { useParams } from 'next/navigation';
import th from '@/messages/staff.th.json';
import en from '@/messages/staff.en.json';
import { makeT } from '@/lib/i18n';
import { StatusNotice } from '@/components/staff/StatusNotice';
import s from '@/components/staff/staff.module.css';

export default function NotFound() {
  const params = useParams<{ lang?: string }>();
  const lang = params?.lang === 'en' ? 'en' : 'th';
  const t = makeT(lang === 'en' ? en : th);
  return (
    <section data-testid="notfound-page" data-state="ready" data-lang={lang}>
      <StatusNotice kind="notfound" code="404" testId="notfound-card" title={t('notfound.title')} titleTestId="notfound-title"
        body={t('notfound.body')} bodyTestId="notfound-message">
        <div className={s.noticeActions}>
          <Link href={`/${lang}`} className="btn btn-primary" data-testid="notfound-home">{t('notfound.home')}</Link>
          <Link href={`/${lang}/search`} className="btn" data-testid="notfound-search">{t('notfound.search')}</Link>
        </div>
      </StatusNotice>
    </section>
  );
}
