// แสดงราคา 1 ตัวพร้อมเวลา การเปลี่ยนแปลง และป้าย (ใช้ร่วมกันใน F2 F3 F4) · หัวหน้าเป็นเจ้าของ
import type { Quote } from '@/lib/feed';
import { makeT, type Dict, type Lang, fmtDate, fmtTimeTh, fmtDateTimeTh } from '@/lib/i18n';
import { D, fmtPct, fmtSignedUsd, fmtUsd } from '@/lib/money';

export function QuoteBadges({ q, dict, idSuffix }: { q: Quote; dict: Dict; idSuffix: string }) {
  const t = makeT(dict);
  return (
    <>
      {q.stale && <span className="badge badge-stale" data-testid={`quote-stale-${idSuffix}`}>{t('badge.stale')}</span>}
      {q.status === 'delisted' && <span className="badge badge-halted" data-testid={`quote-halted-${idSuffix}`}>{t('badge.halted')}</span>}
    </>
  );
}

/** ข้อความเวลาของราคา (R16): ราคาสดตอนตลาดเปิด = "ราคา ณ HH:mm (ล่าช้า 15 นาที)"
 *  ราคาเก่า (ป้ายข้อมูลไม่อัปเดต) หรือหุ้นถูกถอด = ต้องมีวันที่จริงของราคา และไม่เขียนว่าล่าช้า 15 นาที */
export function quoteAsOfText(q: Pick<Quote, 'asOf' | 'marketOpen' | 'stale' | 'status' | 'closeDate' | 'currentSession'>, lang: Lang, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (!q.asOf) return '';
  const datetime = fmtDateTimeTh(q.asOf, lang);
  if (q.status !== 'delisted' && q.marketOpen && q.stale && q.currentSession) {
    // ราคาเก่าแต่ยังอยู่ในรอบตลาดนี้: บอกเวลา ไม่เขียน "(ล่าช้า 15 นาที)" (มีป้ายข้อมูลไม่อัปเดตกำกับ)
    return t('quote.asOfStale', { datetime: fmtTimeTh(q.asOf, lang) });
  }
  if (q.status === 'delisted' || (q.marketOpen && q.stale)) {
    return q.closeDate ? t('quote.asOfSession', { date: fmtDate(q.closeDate, lang), datetime }) : t('quote.asOfStale', { datetime });
  }
  return q.marketOpen ? t('quote.asOf', { time: fmtTimeTh(q.asOf, lang) }) : t('quote.asOfClosed', { datetime });
}

/** ราคา + เปลี่ยนแปลง + เวลา · testid: quote-price-<id> quote-change-<id> quote-pct-<id> quote-asof-<id> */
export function QuoteLine({ q, lang, dict, id, size = 'md' }: { q: Quote; lang: Lang; dict: Dict; id: string; size?: 'md' | 'lg' }) {
  const t = makeT(dict);
  const dir = q.change === null ? 'flat' : D(q.change).gt(0) ? 'up' : D(q.change).lt(0) ? 'down' : 'flat';
  const asOf = quoteAsOfText(q, lang, t);
  return (
    <div className="stack" style={{ gap: 2 }}>
      <div className="row" style={{ gap: 10 }}>
        <span className="num" style={{ fontSize: size === 'lg' ? 'var(--fs-2xl)' : 'var(--fs-lg)', fontWeight: 600 }} data-testid={`quote-price-${id}`}>
          {q.price === null ? '—' : fmtUsd(q.price)}
        </span>
        {q.change !== null && (
          <span className={`num ${dir}`} data-testid={`quote-change-${id}`}>
            {fmtSignedUsd(q.change)} (<span data-testid={`quote-pct-${id}`}>{fmtPct(q.changePct!)}</span>)
          </span>
        )}
        <QuoteBadges q={q} dict={dict} idSuffix={id} />
      </div>
      {asOf && <span className="muted" data-testid={`quote-asof-${id}`}>{asOf}</span>}
    </div>
  );
}
