'use client';
// F6 · โหลดราคาย้อนหลังเป็น CSV (FR-43) · GET /api/export · Free/ไม่เข้าสู่ระบบ แสดง error จาก API
import { useState } from 'react';
import { makeT, type Dict } from '@/lib/i18n';
import s from './study.module.css';

export function ExportCsv({ lang, dict, symbols, from, to, tier }: {
  lang: 'th' | 'en'; dict: Dict; symbols: string[]; from: string; to: string; tier: 'free' | 'pro';
}) {
  const t = makeT(dict);
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const symbol = symbols.length === 0 ? picked.trim() : symbols.includes(picked) ? picked : symbols[0];

  const download = async () => {
    setBusy(true); setError(null); setOk(null);
    try {
      const qs = new URLSearchParams({ symbol, from, to, lang });
      const res = await fetch(`/api/export?${qs}`, { cache: 'no-store' });
      if (!res.ok) {
        let msg = t('common.error');
        try { msg = (await res.json())?.error?.message ?? msg; } catch { /* ไม่ใช่ JSON */ }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      const file = `${symbol || 'prices'}_${from}_${to}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setOk(t('exp.ok', { file }));
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" data-testid="study-export">
      <div className="row" style={{ gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>{t('exp.title')}</h3>
        <span className="badge badge-pro" data-testid="study-export-pro">{t('common.proBadge')}</span>
      </div>
      <p className="muted">{t('exp.desc')}</p>
      <div className={s.form}>
        <div className="field">
          <label htmlFor="study-export-symbol">{t('exp.symbol')}</label>
          {symbols.length === 0 ? (
            <input id="study-export-symbol" className="input num" value={picked} autoComplete="off" placeholder={t('cmp.symbolPlaceholder')}
              onChange={(e) => setPicked(e.target.value.toUpperCase())} data-testid="study-export-symbol" />
          ) : (
            <select id="study-export-symbol" className="select" value={symbol} onChange={(e) => setPicked(e.target.value)} data-testid="study-export-symbol">
              {symbols.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          )}
        </div>
        <div className={s.actions}>
          <button type="button" className={`btn ${tier === 'pro' ? 'btn-gold' : ''}`} onClick={download} disabled={busy} data-testid="study-export-btn">
            {t('exp.btn')}
          </button>
        </div>
      </div>
      {error && <p className="error-text" role="alert" data-testid="study-export-error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</p>}
      {ok && <p className="ok-text" data-testid="study-export-ok" style={{ marginTop: 12, marginBottom: 0 }}>{ok}</p>}
    </div>
  );
}
