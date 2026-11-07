'use client';
// หน้าข้อผิดพลาดของส่วนเนื้อหา (F8 · NFR-10) · header/footer ยังอยู่ เว็บไม่ล่ม · มีปุ่มลองใหม่
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { startTransition, useEffect } from 'react';
import th from '@/messages/staff.th.json';
import en from '@/messages/staff.en.json';
import { makeT } from '@/lib/i18n';
import { StatusNotice } from '@/components/staff/StatusNotice';
import s from '@/components/staff/staff.module.css';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ lang?: string }>();
  const router = useRouter();
  const lang = params?.lang === 'en' ? 'en' : 'th';
  const t = makeT(lang === 'en' ? en : th);

  useEffect(() => { console.error(error); }, [error]);

  const retry = () => startTransition(() => { router.refresh(); reset(); });

  return (
    <section data-testid="error-page" data-state="error" data-lang={lang}>
      <StatusNotice kind="error" testId="error-card" title={t('errorpage.title')} titleTestId="error-title"
        body={t('errorpage.body')} bodyTestId="error-message">
        <div className={s.noticeActions}>
          <button type="button" className="btn btn-primary" onClick={retry} data-testid="error-retry">{t('errorpage.retry')}</button>
          <Link href={`/${lang}`} className="btn" data-testid="error-home">{t('errorpage.home')}</Link>
        </div>
        {error?.digest && <div className={s.noticeRef} data-testid="error-ref">{t('errorpage.ref', { ref: error.digest })}</div>}
      </StatusNotice>
    </section>
  );
}
