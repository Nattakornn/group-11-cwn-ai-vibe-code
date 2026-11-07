// fixture กลางของชุดทดสอบพอดีพอร์ต (หัวหน้าทีมทดสอบเป็นเจ้าของ · writer ห้ามแก้ไฟล์นี้)
// ทุก test: reset เว็บของชุดนั้นพร้อมวันล็อก 2026-11-06 22:00 (+07:00) ก่อนเริ่ม (TEST-PLAN 6.1 ข้อ 3, 6)
import { test as base, expect, request as pwRequest, type APIRequestContext, type Locator, type Page, type TestInfo } from '@playwright/test';
import { Pool } from 'pg';

export { expect };

/** วันล็อกจาก TEST-DATA.md */
export const LOCK = '2026-11-06T22:00:00+07:00';
export const PASSWORD = 'Pordee#2569';
/** บัญชี seed (SPEC ส่วน 3 · TEST-DATA) */
export const U = {
  beam: 'beam@pordee.test', ploy: 'ploy@pordee.test', somchai: 'somchai@pordee.test', jay: 'jay@pordee.test',
  nok: 'nok@pordee.test', kan: 'kan@pordee.test', mint: 'mint@pordee.test', nam: 'nam@pordee.test',
  fon: 'fon@pordee.test', del1: 'del1@pordee.test', del2: 'del2@pordee.test',
} as const;
export type UserKey = keyof typeof U;

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3300';
const DB_URL = process.env.DB_URL ?? 'postgres://pordee:pordee@localhost:5434/pordee';

// ---------- API ทดสอบ ----------
export type FeedMode = 'price' | 'zero' | 'timeout' | 'normal';
export interface Api {
  /** ล้างข้อมูลกลับเป็น seed + ล็อกนาฬิกา (ไม่ส่ง = วันล็อก) */
  reset(now?: string): Promise<void>;
  /** เลื่อน/ล็อกนาฬิกาทั้งเว็บ · null = เวลาจริง */
  clock(now: string | null): Promise<void>;
  /** สั่งแหล่งข้อมูลจำลอง · symbol '*' = ทุกตัว */
  feed(o: { symbol: string; mode: FeedMode; price?: string | number; clearCache?: boolean }): Promise<void>;
  /** รันงานตามเวลา 1 รอบ (renew purge alerts dca dividends) · คืนผลของงาน */
  tick(): Promise<any>;
  /** context ที่ไม่เข้าสู่ระบบ (แขก) */
  guest: APIRequestContext;
  /** context ที่เข้าสู่ระบบเป็นผู้ใช้ seed (สร้างใหม่ทุกครั้ง · ปิดให้อัตโนมัติตอนจบ test) */
  as(user: UserKey | string, password?: string): Promise<APIRequestContext>;
}

// ---------- DB (อ่านอย่างเดียว · แผน 6.1 ข้อ 5) ----------
export interface Db { query<T = any>(sql: string, params?: unknown[]): Promise<T[]> }
let pool: Pool | null = null;
const getPool = () => (pool ??= new Pool({ connectionString: DB_URL, max: 2, allowExitOnIdle: true }));

// ---------- หน้าเว็บ ----------
export interface Ui {
  /** เปิด path แล้วรอ <html data-ready="true"> (และรากหน้าไม่อยู่ในสถานะ loading ถ้าระบุ rootTestId) */
  goto(path: string, rootTestId?: string): Promise<void>;
  /** เข้าสู่ระบบในเบราว์เซอร์ (ผ่าน API ใช้ cookie ร่วมกับหน้าเว็บ) */
  login(user: UserKey | string, password?: string): Promise<void>;
  /** เข้าสู่ระบบโดยกรอกฟอร์มจริงที่ /{lang}/login */
  loginByForm(user: UserKey | string, password?: string, lang?: 'th' | 'en'): Promise<void>;
  /** ไฮไลต์ element ด้วยกรอบแดง + แนบภาพหน้าจอ (เรียกก่อนตรวจทุกจุด) */
  mark(target: Locator, label: string): Promise<void>;
  /** ไฮไลต์แล้วตรวจแบบ soft: ui.check(loc, 'ราคา AAPL', l => expect.soft(l).toHaveText('$129.35')) */
  check(target: Locator, label: string, assertion: (l: Locator) => Promise<unknown>): Promise<void>;
  /** รอให้คำขอเครือข่ายเงียบ (ราคาบนจอมาจาก API) */
  settle(): Promise<void>;
}

export interface Meta {
  /** ผลที่คาดหวังตามแผน (คัดจาก TEST-PLAN ห้ามแก้ตามจอ) */
  expected: string;
  /** ที่มา [D]/[R]/[A] ตามแผน */
  source: string;
  /** FR/BR */
  frbr: string;
  /** อ้างกฎใน EXPLORATION (ถ้ามี) */
  rules?: string;
}
/** ใส่ annotation ผลที่คาดหวัง ที่มา FR/BR ให้รายงานอ่าน */
export function meta(info: TestInfo, m: Meta) {
  info.annotations.push({ type: 'expected', description: m.expected });
  info.annotations.push({ type: 'source', description: m.source });
  info.annotations.push({ type: 'frbr', description: m.frbr });
  if (m.rules) info.annotations.push({ type: 'rules', description: m.rules });
}

const email = (u: string) => (u in U ? U[u as UserKey] : u);

async function post(ctx: APIRequestContext, path: string, data?: unknown) {
  const r = await ctx.post(path, { data: data ?? {} });
  if (!r.ok()) throw new Error(`${path} → ${r.status()} ${await r.text()}`);
  return r.json().catch(() => ({}));
}

export const test = base.extend<{ api: Api; db: Db; ui: Ui; _reset: void }>({
  api: async ({}, use) => {
    const guest = await pwRequest.newContext({ baseURL: BASE_URL });
    const opened: APIRequestContext[] = [guest];
    const api: Api = {
      guest,
      reset: async (now) => { await post(guest, '/api/test/reset', now ? { now } : {}); },
      clock: async (now) => { await post(guest, '/api/test/clock', { now }); },
      feed: async (o) => { await post(guest, '/api/test/feed', o); },
      tick: async () => post(guest, '/api/test/tick'),
      as: async (user, password = PASSWORD) => {
        const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
        opened.push(ctx);
        const r = await ctx.post('/api/auth/login', { data: { email: email(user), password } });
        if (!r.ok()) throw new Error(`login ${user} → ${r.status()} ${await r.text()}`);
        return ctx;
      },
    };
    await use(api);
    for (const c of opened) await c.dispose();
  },

  // reset ก่อนทุก test (auto)
  _reset: [async ({ api }, use) => { await api.reset(); await use(); }, { auto: true }],

  db: async ({}, use) => { await use({ query: async (sql, params) => (await getPool().query(sql, params as any[])).rows }); },

  ui: async ({ page }, use, info) => {
    let n = 0;
    const clearMarks = () => page.evaluate(() => {
      document.querySelectorAll('[data-e2e-mark]').forEach((el) => {
        (el as HTMLElement).style.outline = (el as HTMLElement).dataset.e2eMark || '';
        el.removeAttribute('data-e2e-mark');
      });
    }).catch(() => {});
    const ui: Ui = {
      goto: async (path, rootTestId) => {
        await page.goto(path);
        await page.locator('html[data-ready="true"]').waitFor({ state: 'attached', timeout: 30_000 });
        if (rootTestId) {
          await expect(page.getByTestId(rootTestId)).not.toHaveAttribute('data-state', 'loading', { timeout: 20_000 }).catch(() => {});
        }
      },
      login: async (user, password = PASSWORD) => {
        const r = await page.request.post('/api/auth/login', { data: { email: email(user), password } });
        if (!r.ok()) throw new Error(`login ${user} → ${r.status()} ${await r.text()}`);
      },
      loginByForm: async (user, password = PASSWORD, lang = 'th') => {
        await ui.goto(`/${lang}/login`);
        await page.getByTestId('login-email').fill(email(user));
        await page.getByTestId('login-password').fill(password);
        await page.getByTestId('login-submit').click();
      },
      mark: async (target, label) => {
        n += 1;
        await clearMarks();
        try {
          await target.first().scrollIntoViewIfNeeded({ timeout: 5_000 });
          await target.first().evaluate((el) => {
            const h = el as HTMLElement;
            h.dataset.e2eMark = h.style.outline || ' ';
            h.style.outline = '4px solid #e00000';
            h.style.outlineOffset = '2px';
          }, undefined, { timeout: 5_000 });
        } catch { /* ไม่เจอ element ก็ยังแนบภาพเพื่อเป็นหลักฐาน */ }
        await page.waitForTimeout(350);
        const shot = await page.screenshot({ fullPage: false }).catch(() => null);
        if (shot) await info.attach(`check-${String(n).padStart(2, '0')} ${label}`, { body: shot, contentType: 'image/png' });
      },
      check: async (target, label, assertion) => {
        await ui.mark(target, label);
        await test.step(`ตรวจ: ${label}`, async () => { await assertion(target); });
      },
      settle: async () => { await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {}); },
    };
    await use(ui);
    // ค้างภาพผลลัพธ์ท้ายวิดีโอ (GIF ค้างเพิ่มอีก 3 วินาทีตอนแปลง)
    await page.waitForTimeout(800).catch(() => {});
  },
});
