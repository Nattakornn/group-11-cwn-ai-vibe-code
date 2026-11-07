// สร้างข้อมูล Me จากแถวผู้ใช้ (API-CONTRACT ส่วนที่ 4)
import { q1, type Db, pool } from '../db';
import { now as clockNow } from '../clock';
import { tierOf, historyStart, LIMITS, type Tier } from '../tier';
import type { UserRow } from '../session';

export type Me = {
  id: number; email: string; displayName: string; isStaff: boolean; tier: Tier;
  proPeriodEnd: string | null; proAutoRenew: boolean; bigFont: boolean; lang: 'th' | 'en';
  feeRatePct: string; feeMinUsd: string; quietStart: string | null; quietEnd: string | null;
  usage: { watchlist: { used: number; limit: number }; alerts: { used: number; limit: number } };
  historyStart: string;
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export async function buildMe(u: UserRow, at?: Date, db: Db = pool): Promise<Me> {
  const now = at ?? (await clockNow(db));
  const tier = tierOf(u, now);
  const c = await q1<{ w: number; a: number }>(
    `SELECT (SELECT count(*) FROM watchlist_items WHERE user_id = $1) AS w,
            (SELECT count(*) FROM alerts WHERE user_id = $1 AND active) AS a`, [u.id], db);
  return {
    id: u.id, email: u.email, displayName: u.display_name, isStaff: u.is_staff, tier,
    proPeriodEnd: u.pro_period_end, proAutoRenew: u.pro_auto_renew, bigFont: u.big_font, lang: u.lang,
    feeRatePct: String(u.fee_rate_pct), feeMinUsd: String(u.fee_min_usd),
    quietStart: hhmm(u.quiet_start), quietEnd: hhmm(u.quiet_end),
    usage: {
      watchlist: { used: Number(c?.w ?? 0), limit: LIMITS.watchlist[tier] },
      alerts: { used: Number(c?.a ?? 0), limit: LIMITS.alerts[tier] },
    },
    historyStart: historyStart(tier, now),
  };
}
