'use client';
// F7 · หน้าสมัครสมาชิก (FR-52) · ไม่ต้องใช้บัญชีโบรกเกอร์ ไม่มีช่องรหัสผ่านโบรกเกอร์ (NFR-08)
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { makeT, type Dict, type Lang } from '@/lib/i18n';
import { AuthArt, InfoIcon, safeNext } from './shared';
import s from './account.module.css';

type State = 'ready' | 'loading' | 'error';

export function SignupForm({ lang, dict, next }: { lang: Lang; dict: Dict; next?: string }) {
  const t = makeT(dict);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>('ready');
  const [error, setError] = useState<string | null>(null);
  const target = safeNext(next, lang);
  const loginHref = `/${lang}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (state === 'loading') return;
    if (!name.trim() || !email.trim() || !password) { setError(t('signup.required')); setState('error'); return; }
    setState('loading'); setError(null);
    const r = await api('/api/auth/signup', { body: { email: email.trim(), password, displayName: name.trim() }, lang });
    if (r.ok) { window.location.href = target; return; }
    setError(r.error?.message ?? t('common.error'));
    setState('error');
  }

  return (
    <section data-testid="signup-page" data-state={state} className="fade-in">
      <div className={s.authWrap}>
        <AuthArt dict={dict} />
        <div className={s.formSide}>
          <div>
            <h1>{t('signup.title')}</h1>
            <p className="muted">{t('signup.subtitle')}</p>
          </div>
          <p className={s.note} data-testid="signup-no-broker"><InfoIcon />{t('signup.noBroker')}</p>
          <form className={s.form} onSubmit={onSubmit} noValidate data-testid="signup-form">
            <div className="field">
              <label htmlFor="signup-name">{t('signup.name')}</label>
              <input id="signup-name" className="input" type="text" autoComplete="nickname" maxLength={60} placeholder={t('signup.namePh')}
                value={name} onChange={(e) => setName(e.target.value)} data-testid="signup-name" />
            </div>
            <div className="field">
              <label htmlFor="signup-email">{t('signup.email')}</label>
              <input id="signup-email" className="input" type="email" autoComplete="email" inputMode="email" value={email}
                onChange={(e) => setEmail(e.target.value)} data-testid="signup-email" />
            </div>
            <div className="field">
              <label htmlFor="signup-password">{t('signup.password')}</label>
              <input id="signup-password" className="input" type="password" autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)} aria-describedby="signup-password-hint" data-testid="signup-password" />
              <span id="signup-password-hint" className={s.hint}>{t('signup.passwordHint')}</span>
            </div>
            {error && <p className="error-text" role="alert" data-testid="signup-error">{error}</p>}
            <button type="submit" className={`btn btn-gold ${s.full}`} disabled={state === 'loading'} data-testid="signup-submit">
              {state === 'loading' ? t('signup.submitting') : t('signup.submit')}
            </button>
          </form>
          <p className={s.switchLine}>
            {t('signup.haveAccount')} <Link href={loginHref} data-testid="signup-to-login">{t('signup.toLogin')}</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
