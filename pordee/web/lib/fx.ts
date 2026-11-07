// อัตราแลกเปลี่ยน (อัตรากลาง) · BR-46: ใช้ตัวที่ประกาศล่าสุดไม่เกิน now (ประกาศวันทำการไทย 18:00)
import { q1, type Db, pool } from './db';

export type FxRate = { rate: string; rateDate: string; publishedAt: string };

/** อัตราที่ประกาศล่าสุด ณ เวลา at (ใช้กับมูลค่าปัจจุบัน) */
export async function rateAt(at: Date, db: Db = pool): Promise<FxRate> {
  const r = await q1<{ mid_rate: string; rate_date: string; published_at: Date }>(
    'SELECT mid_rate, rate_date, published_at FROM fx_rates WHERE published_at <= $1 ORDER BY published_at DESC LIMIT 1',
    [at], db,
  );
  if (!r) throw new Error('no fx rate');
  return { rate: r.mid_rate, rateDate: r.rate_date, publishedAt: new Date(r.published_at).toISOString() };
}

/** อัตราของวันที่ date (วันที่ไทย) ถ้าวันนั้นไม่มี ใช้วันทำการก่อนหน้า · ใช้กับวันซื้อ วันจ่ายปันผล วัน DCA (BR-47, D-05) */
export async function rateForDate(date: string, db: Db = pool): Promise<FxRate> {
  const r = await q1<{ mid_rate: string; rate_date: string; published_at: Date }>(
    'SELECT mid_rate, rate_date, published_at FROM fx_rates WHERE rate_date <= $1 ORDER BY rate_date DESC LIMIT 1',
    [date], db,
  );
  if (!r) throw new Error('no fx rate');
  return { rate: r.mid_rate, rateDate: r.rate_date, publishedAt: new Date(r.published_at).toISOString() };
}
