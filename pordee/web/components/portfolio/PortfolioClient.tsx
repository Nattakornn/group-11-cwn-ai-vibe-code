'use client';
// F4 · หน้าพอร์ต: สรุป $/฿ · ตารางหุ้น · รายการรอยืนยัน DCA · จดรายการซื้อขาย · ค่าธรรมเนียม · แผน DCA
// ไม่คิดเงินเอง ทุกตัวเลขมาจาก API (API-CONTRACT ส่วนที่ 3)
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api-client';
import { makeT, type Dict, type Lang } from '@/lib/i18n';
import { mkFmt, type DcaPending, type DcaPlan, type Fees, type Portfolio, type Tx } from './shared';
import { Summary } from './Summary';
import { Holdings } from './Holdings';
import { PendingSection } from './PendingSection';
import { TxSection } from './TxSection';
import { FeeSettings } from './FeeSettings';
import { DcaSection } from './DcaSection';
import s from './portfolio.module.css';

type State = 'loading' | 'ready' | 'error';

export default function PortfolioClient({ lang, dict, core, loggedIn }: { lang: Lang; dict: Dict; core: Dict; loggedIn: boolean }) {
  const t = useMemo(() => makeT(dict), [dict]);
  const tc = useMemo(() => makeT(core), [core]);
  const f = useMemo(() => mkFmt(lang), [lang]);

  const [state, setState] = useState<State>(loggedIn ? 'loading' : 'ready');
  const [needLogin, setNeedLogin] = useState(!loggedIn);
  const [error, setError] = useState<string | null>(null);
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txErr, setTxErr] = useState<string | null>(null);
  const [fees, setFees] = useState<Fees | null>(null);
  const [plans, setPlans] = useState<DcaPlan[]>([]);
  const [plansErr, setPlansErr] = useState<string | null>(null);
  const [pending, setPending] = useState<DcaPending[]>([]);

  /** คืนข้อมูลพอร์ต หรือ 'login' (401) หรือ 'error' */
  const loadPortfolio = useCallback(async (): Promise<Portfolio | 'login' | 'error'> => {
    const r = await api<Portfolio>('/api/portfolio', { lang });
    if (r.status === 401) { setNeedLogin(true); return 'login'; }
    if (!r.ok || !r.data) { setError(r.error?.message ?? tc('common.error')); return 'error'; }
    setPf(r.data);
    return r.data;
  }, [lang, tc]);

  const loadTxs = useCallback(async () => {
    const r = await api<{ items: Tx[] }>('/api/transactions', { lang });
    if (r.ok && r.data) { setTxs(r.data.items ?? []); setTxErr(null); } else setTxErr(r.error?.message ?? tc('common.error'));
  }, [lang, tc]);

  const loadPending = useCallback(async (fallback?: DcaPending[]) => {
    const r = await api<{ items: DcaPending[] }>('/api/dca/pending', { lang });
    const items = r.ok && r.data ? r.data.items ?? [] : fallback ?? [];
    setPending(items.filter((p) => !p.status || p.status === 'pending'));
  }, [lang]);

  const loadPlans = useCallback(async () => {
    const r = await api<{ items?: DcaPlan[]; plans?: DcaPlan[] }>('/api/dca/plans', { lang });
    if (r.ok && r.data) { setPlans(r.data.items ?? r.data.plans ?? []); setPlansErr(null); } else setPlansErr(r.error?.message ?? tc('common.error'));
  }, [lang, tc]);

  const loadFees = useCallback(async () => {
    const r = await api<Fees>('/api/me/fees', { lang });
    if (r.ok && r.data) setFees(r.data);
  }, [lang]);

  const loadAll = useCallback(async () => {
    setState('loading'); setError(null);
    const p = await loadPortfolio();
    if (p === 'login') { setState('ready'); return; }
    if (p === 'error') { setState('error'); return; }
    await Promise.all([loadTxs(), loadPending(p.pending), loadPlans(), loadFees()]);
    setState('ready');
  }, [loadPortfolio, loadTxs, loadPending, loadPlans, loadFees]);

  /** หลังจด/แก้/ลบ/ยืนยัน: โหลดพอร์ต รายการ และรายการรอยืนยันใหม่ */
  const refresh = useCallback(async () => {
    const p = await loadPortfolio();
    if (p === 'login') return;
    await Promise.all([loadTxs(), loadPending(p === 'error' ? undefined : p.pending)]);
  }, [loadPortfolio, loadTxs, loadPending]);

  useEffect(() => {
    if (!loggedIn) return;
    void loadAll();
  }, [loggedIn, loadAll]);

  if (needLogin) {
    return (
      <section data-testid="portfolio-page" data-state="ready" className="stack fade-in">
        <h1>{t('title')}</h1>
        <div className="card card-gold stack" data-testid="portfolio-login-required" style={{ alignItems: 'flex-start' }}>
          <p style={{ margin: 0 }}>{t('loginRequired')}</p>
          <Link href={`/${lang}/login?next=${encodeURIComponent(`/${lang}/portfolio`)}`} className="btn btn-primary" data-testid="portfolio-login-link">{t('loginLink')}</Link>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="portfolio-page" data-state={state} className="stack fade-in">
      <div className={s.hero}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
      </div>

      {state === 'loading' && !pf && (
        <div className="stack" data-testid="portfolio-loading" aria-busy="true">
          <span className="muted">{tc('common.loading')}</span>
          <div className={s.skeleton} />
          <div className={s.skeleton} />
        </div>
      )}

      {state === 'error' && (
        <div className="card stack" style={{ alignItems: 'flex-start' }}>
          <p className="error-text" role="alert" data-testid="portfolio-error" style={{ margin: 0 }}>{error ?? tc('common.error')}</p>
          <button type="button" className="btn" onClick={() => void loadAll()} data-testid="portfolio-retry">{t('retry')}</button>
        </div>
      )}

      {pf && (
        <>
          <Summary pf={pf} lang={lang} t={t} f={f} />
          <Holdings pf={pf} lang={lang} t={t} tc={tc} f={f} />
          <PendingSection items={pending} lang={lang} t={t} f={f} onDone={refresh} />
          <TxSection
            lang={lang} t={t} tc={tc} f={f} txs={txs} listError={txErr} fees={fees}
            symbols={pf.holdings.map((h) => h.symbol)} defaultDate={pf.asOf} onChanged={refresh}
            aside={<FeeSettings lang={lang} t={t} tc={tc} fees={fees} onSaved={setFees} />}
          />
          <DcaSection lang={lang} t={t} tc={tc} f={f} plans={plans} listError={plansErr} onChanged={loadPlans} />
        </>
      )}
    </section>
  );
}
