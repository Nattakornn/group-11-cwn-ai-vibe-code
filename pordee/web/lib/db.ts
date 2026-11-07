// การเชื่อมฐานข้อมูลกลาง · NUMERIC คืนเป็น string เสมอ (ห้ามแปลงเป็น number) · DATE คืนเป็น 'YYYY-MM-DD'
import { Pool, type PoolClient, types } from 'pg';

types.setTypeParser(1082, (v: string) => v); // DATE
types.setTypeParser(1083, (v: string) => v); // TIME
types.setTypeParser(20, (v: string) => Number(v)); // BIGINT (count, id) -> number

const g = globalThis as unknown as { __pordeePool?: Pool };
export const pool: Pool =
  g.__pordeePool ?? (g.__pordeePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }));

export type Db = Pick<PoolClient, 'query'>;

/** คืนทุกแถว */
export async function q<T = Record<string, any>>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  const r = await db.query(sql, params as any[]);
  return r.rows as T[];
}

/** คืนแถวแรก หรือ null */
export async function q1<T = Record<string, any>>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T | null> {
  const rows = await q<T>(sql, params, db);
  return rows[0] ?? null;
}

/** ทำทุกอย่างใน transaction เดียว ผิดพลาดแล้ว ROLLBACK ให้เอง */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** รหัส error ของ PostgreSQL ที่ใช้บ่อย */
export const PG = { CHECK: '23514', UNIQUE: '23505', FK: '23503' } as const;
export const pgCode = (e: unknown): string | undefined => (e as { code?: string })?.code;
