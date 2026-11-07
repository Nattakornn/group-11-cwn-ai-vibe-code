'use client';
// F7 · หน้าเข้าสู่ระบบ (FR-52) · ช่อง password มีเฉพาะหน้านี้และหน้าสมัคร (NFR-08)
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { makeT, type Dict, type Lang } from '@/lib/i18n';
import { tid } from '@/lib/testid';
import { AuthArt, safeNext } from './shared';
import s from './account.module.css';

type State = 'ready' | 'loading' | 'error';

export function LoginForm({ lang, dict, next, notice }: { lang: Lang; dict: Dict; next?: string; notice?: 'deleted' | 'loggedOut' }) {
  const t = makeT(dict);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>('ready');
  const [error, setError] = useState<string | null>(null);
  const target = safeNext(next, lang);
  const signupHref = `/${lang}/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (state === 'loading') return;
    if (!email.trim() || !password) { setError(t('login.required')); setState('error'); return; }
    setState('loading'); setError(null);
    const r = await api('/api/auth/login', { body: { email: email.trim(), password }, lang });
    if (r.ok) { window.location.href = target; return; }
    setError(r.error?.message ?? t('common.error'));
    setState('error');
  }

  return (
    <section data-testid="login-page" data-state={state} className="fade-in">
      <div className={s.authWrap}>
        <AuthArt dict={dict} />
        <div className={s.formSide}>
          <div>
            <h1>{t('login.title')}</h1>
            <p className="muted">{t('login.subtitle')}</p>
          </div>
          {notice && (
            <p className="ok-text" role="status" data-testid={tid('login', notice === 'deleted' ? 'deleted' : 'logged-out')}>
              {notice === 'deleted' ? t('login.deleted') : t('login.loggedOut')}
            </p>
          )}
          <form className={s.form} onSubmit={onSubmit} noValidate data-testid="login-form">
            <div className="field">
              <label htmlFor="login-email">{t('login.email')}</label>
              <input id="login-email" className="input" type="email" autoComplete="email" inputMode="email" value={email}
                onChange={(e) => setEmail(e.target.value)} data-testid="login-email" />
            </div>
            <div className="field">
              <label htmlFor="login-password">{t('login.password')}</label>
              <input id="login-password" className="input" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} data-testid="login-password" />
            </div>
            {error && <p className="error-text" role="alert" data-testid="login-error">{error}</p>}
            <button type="submit" className={`btn btn-primary ${s.full}`} disabled={state === 'loading'} data-testid="login-submit">
              {state === 'loading' ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
          <p className={s.switchLine}>
            {t('login.noAccount')} <Link href={signupHref} data-testid="login-to-signup">{t('login.toSignup')}</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
