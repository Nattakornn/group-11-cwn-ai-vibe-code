// หัวข้อ 5.8 บัญชี สิทธิ์ ความปลอดภัย ภาษา และมือถือ (TC-ACCT-01 ถึง TC-ACCT-10) · TEST-PLAN.md
import { test, expect, meta, U, PASSWORD } from '../fixtures/pordee';
import type { APIRequestContext, Page } from '@playwright/test';

const THAI = /[฀-๿]/g;
const DISCLAIMER = {
  th: 'ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน',
  en: 'For educational purposes only. Not investment advice.',
} as const;
/** ชุดหน้าเดียวกับ TC-ACCT-08 (ใช้ใน 01 · 09) */
const GUEST_PAGES = ['', '/learn', '/search?q=KO', '/stocks/KO', '/login', '/signup', '/study/screener', '/study/compare', '/study/backtest', '/study/history'];
const AUTH_PAGES = ['/watchlist', '/alerts', '/inbox', '/portfolio', '/dividends', '/account', '/stocks/KO'];
const LANGS = ['th', 'en'] as const;

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '');

/** เปิดหน้าแล้วคืน HTTP status ของเอกสาร */
async function open(page: Page, path: string) {
  const r = await page.goto(path);
  await page.locator('html[data-ready="true"]').waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
  return r?.status() ?? 0;
}

/** นับแถวทุกตารางที่มีคอลัมน์ user_id + แถวใน users ของผู้ใช้ id นั้น */
async function countRows(db: { query: <T = any>(s: string, p?: unknown[]) => Promise<T[]> }, userId: number) {
  const tables = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='user_id' ORDER BY table_name`);
  const out: Record<string, number> = {};
  out.users = Number((await db.query(`SELECT count(*)::int AS n FROM users WHERE id=$1`, [userId]))[0].n);
  for (const t of tables) {
    out[t.table_name] = Number((await db.query(`SELECT count(*)::int AS n FROM "${t.table_name}" WHERE user_id=$1`, [userId]))[0].n);
  }
  return out;
}

async function userId(db: any, email: string): Promise<number | null> {
  const r = await db.query(`SELECT id FROM users WHERE lower(email)=lower($1)`, [email]);
  return r[0]?.id ?? null;
}

// =====================================================================================
test('TC-ACCT-01 · สมัคร เข้า ออกจากระบบ ครบวงจร + session ตายจริง + ช่องรหัสผ่าน @P1 @5.8', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: '1. สมัครสำเร็จ เข้าสู่ระบบอัตโนมัติหรือพาไปหน้าเข้าสู่ระบบ · บัญชีใหม่ระดับ Free · 2. เข้าได้ · หัวเว็บแสดงชื่อ "ทดสอบ01" · 3. HTTP 200 · email = acct01@pordee.test (ตัวเล็ก) · 4. ไปหน้าเข้าสู่ระบบ · หัวเว็บไม่มีชื่อผู้ใช้ · 5. HTTP 401 · 6. ทั้ง 2 กรณี 401 ข้อความเหมือนกันทุกตัวอักษร · 7. ช่องรหัสผ่านเฉพาะ /signup และ /login หน้าอื่น 0 · ข้อเสริม: คอลัมน์รหัสผ่านเป็นแฮช ($2b$/$2a$/$argon2) ไม่มีแถวเก็บ Pordee#2569 ตรง ๆ',
    source: '[D] §2 (FR-52) · [D] บ.57 (NFR-08) · [R] session ตาย / ข้อความเดียวกันกันเดาอีเมล / อีเมลไม่สนตัวพิมพ์ · [O-ยังไม่ยืนยัน] หน้าเปลี่ยนรหัสผ่าน (ส่วน F ข้อ 21)',
    frbr: 'FR-52 · NFR-08', rules: 'R101 · R114 ⚠️',
  });
  const EMAIL = 'acct01@pordee.test', PW = 'Abcd#1234', NAME = 'ทดสอบ01';
  let cookieA = '';

  await test.step('1. เปิด /th/signup กรอกข้อมูลแล้วกดสมัคร', async () => {
    await ui.goto('/th/signup');
    await page.getByTestId('signup-name').fill(NAME);
    await page.getByTestId('signup-email').fill(EMAIL);
    await page.getByTestId('signup-password').fill(PW);
    const resP = page.waitForResponse(r => r.url().includes('/api/auth/signup'), { timeout: 15_000 }).catch(() => null);
    await page.getByTestId('signup-submit').click();
    const res = await resP;
    expect.soft(res?.status(), 'สมัคร acct01 → 201').toBe(201);
    await page.waitForURL(u => !u.pathname.endsWith('/signup'), { timeout: 15_000 }).catch(() => {});
    await ui.settle();
    await ui.check(page.locator('body'), 'หลังสมัคร: ไปหน้าพอร์ต (เข้าระบบอัตโนมัติ) หรือหน้าเข้าสู่ระบบ', async () => {
      expect.soft(new URL(page.url()).pathname, 'หลังสมัครอยู่ที่ /th/portfolio หรือ /th/login').toMatch(/^\/th\/(portfolio|login)$/);
    });
    const row = (await db.query(`SELECT pro_period_end, is_staff FROM users WHERE lower(email)=$1`, [EMAIL]))[0];
    expect.soft(row, 'มีแถว acct01 ในฐานข้อมูล').toBeTruthy();
    expect.soft(row?.pro_period_end ?? null, 'บัญชีใหม่ระดับ Free (ไม่มีรอบ Pro)').toBeNull();
  });

  await test.step('2. ออกจากระบบ แล้วเข้าสู่ระบบที่ /th/login ด้วย ACCT01@PORDEE.TEST', async () => {
    await page.request.post('/api/auth/logout').catch(() => {});
    await page.context().clearCookies();
    await ui.goto('/th/login');
    await page.getByTestId('login-email').fill('ACCT01@PORDEE.TEST');
    await page.getByTestId('login-password').fill(PW);
    const resP = page.waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 15_000 }).catch(() => null);
    await page.getByTestId('login-submit').click();
    const res = await resP;
    expect.soft(res?.status(), 'เข้าสู่ระบบด้วยอีเมลตัวใหญ่ → 200').toBe(200);
    await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 15_000 }).catch(() => {});
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' }).catch(() => {});
    // แก้แผนหลัง LAB 12 (PLAN-FIX-1): FR-52 ไม่ได้กำหนดให้หัวเว็บแสดงชื่อ → ตรวจว่าเข้าสู่ระบบแล้วหัวเว็บมีเมนูบัญชี และหน้า /account แสดงชื่อ
    await ui.check(page.getByTestId('core-nav-account'), 'หัวเว็บมีเมนูบัญชี (เข้าสู่ระบบแล้ว)', l => expect.soft(l).toBeVisible());
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-name'), 'หน้าบัญชีแสดงชื่อ "ทดสอบ01"', l => expect.soft(l).toContainText(NAME));
  });

  await test.step('3. GET /api/me เก็บ cookie ไว้ (cookie-A)', async () => {
    const r = await page.request.get('/api/me');
    expect.soft(r.status(), '/api/me หลังเข้าสู่ระบบ → 200').toBe(200);
    const j = await r.json().catch(() => ({}));
    expect.soft(j?.user?.email, 'email เก็บเป็นตัวเล็ก').toBe(EMAIL);
    expect.soft(j?.user?.tier, 'บัญชีใหม่ระดับ free').toBe('free');
    cookieA = (await page.context().cookies()).map(c => `${c.name}=${c.value}`).join('; ');
    expect.soft(cookieA, 'มี cookie session').not.toBe('');
  });

  await test.step('4. กดออกจากระบบจากหน้าบัญชี', async () => {
    await ui.goto('/th/account', 'account-page');
    await page.getByTestId('acct-logout').click();
    await page.waitForURL(/\/login/, { timeout: 15_000 }).catch(() => {});
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' }).catch(() => {});
    expect.soft(new URL(page.url()).pathname, 'ออกจากระบบแล้วไปหน้าเข้าสู่ระบบ').toBe('/th/login');
    await ui.check(page.getByTestId('core-header'), 'หัวเว็บไม่มีชื่อผู้ใช้', l => expect.soft(l).not.toContainText(NAME));
    await page.reload();
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' }).catch(() => {});
    expect.soft((await page.request.get('/api/me')).status(), 'รีโหลดแล้วยังไม่เข้าระบบ (/api/me 401)').toBe(401);
    await ui.check(page.getByTestId('core-header'), 'หลังรีโหลด หัวเว็บไม่มีชื่อผู้ใช้', l => expect.soft(l).not.toContainText(NAME));
  });

  await test.step('5. GET /api/me ด้วย cookie-A ที่เก็บไว้', async () => {
    const r = await api.guest.get('/api/me', { headers: { cookie: cookieA } });
    expect.soft(r.status(), 'cookie-A หลังออกจากระบบ → 401 (session ตายที่ server)').toBe(401);
  });

  await test.step('6. เข้าสู่ระบบด้วยรหัสผิด และอีเมลที่ไม่มี เทียบผล', async () => {
    const a = await api.guest.post('/api/auth/login', { data: { email: EMAIL, password: 'Abcd#1235' } });
    const b = await api.guest.post('/api/auth/login', { data: { email: 'nobody@pordee.test', password: 'Abcd#1235' } });
    const ta = await a.text(), tb = await b.text();
    expect.soft(a.status(), 'รหัสผิด → 401').toBe(401);
    expect.soft(b.status(), 'อีเมลไม่มี → 401').toBe(401);
    expect.soft(ta, 'ข้อความรหัสผิด = ข้อความอีเมลไม่มี ทุกตัวอักษร').toBe(tb);
    // หน้าจอ: ข้อความที่ผู้ใช้เห็นต้องเหมือนกัน
    await ui.goto('/th/login');
    await page.getByTestId('login-email').fill(EMAIL);
    await page.getByTestId('login-password').fill('Abcd#1235');
    await page.getByTestId('login-submit').click();
    const e1 = await page.getByTestId('login-error').textContent({ timeout: 10_000 }).catch(() => null);
    await ui.mark(page.getByTestId('login-error'), 'ข้อความรหัสผิด');
    await page.getByTestId('login-email').fill('nobody@pordee.test');
    await page.getByTestId('login-submit').click();
    await page.waitForTimeout(800);
    const e2 = await page.getByTestId('login-error').textContent({ timeout: 10_000 }).catch(() => null);
    await ui.check(page.getByTestId('login-error'), 'ข้อความอีเมลไม่มี เท่ากับข้อความรหัสผิด', async () => {
      expect.soft(e2, 'ข้อความบนจอ 2 กรณีเหมือนกัน').toBe(e1);
    });
  });

  await test.step('7. สแกนทุกหน้า (ไม่เข้าระบบ 10 + เข้าระบบ 7 · TH/EN) นับ input[type=password]', async () => {
    await page.context().clearCookies();
    const found: string[] = [];
    for (const lang of LANGS) for (const p of GUEST_PAGES) {
      const path = `/${lang}${p}`;
      await open(page, path);
      const n = await page.locator('input[type=password]').count();
      const want = p === '/login' || p === '/signup' ? 1 : 0;
      if (n) found.push(`${path}=${n}`);
      expect.soft(n, `ช่องรหัสผ่านที่ ${path} (ไม่เข้าระบบ)`).toBe(want);
    }
    await ui.login(EMAIL, PW);
    for (const lang of LANGS) for (const p of AUTH_PAGES) {
      const path = `/${lang}${p}`;
      await open(page, path);
      const n = await page.locator('input[type=password]').count();
      if (n) found.push(`${path}(login)=${n}`);
      expect.soft(n, `ช่องรหัสผ่านที่ ${path} (เข้าระบบ acct01)`).toBe(0);
    }
    await ui.mark(page.locator('body'), `หน้าบัญชี (EN) ไม่มีช่องรหัสผ่าน · พบที่: ${found.join(', ')}`);
    info.annotations.push({ type: 'pending', description: `ไม่พบหน้าเปลี่ยนรหัสผ่านในเว็บ (หน้าบัญชีไม่มีช่องรหัสผ่าน) = ข้อสังเกต ส่วน F ข้อ 21 · ช่องรหัสผ่านที่พบ: ${found.join(', ')}` });
  });

  await test.step('ข้อเสริม: อ่านคอลัมน์ password_hash ในฐานข้อมูล', async () => {
    const r = await db.query(`SELECT password_hash FROM users WHERE lower(email)=$1`, [EMAIL]);
    const h = String(r[0]?.password_hash ?? '');
    expect.soft(h, 'password_hash ไม่ใช่รหัสผ่านตรง ๆ').not.toBe(PW);
    expect.soft(h, 'password_hash ดูเป็นแฮช ($2b$/$2a$/$argon2)').toMatch(/^\$(2[aby]\$|argon2)/);
    const plain = await db.query(`SELECT count(*)::int AS n FROM users WHERE password_hash=$1 OR password_hash=$2`, [PASSWORD, PW]);
    expect.soft(plain[0].n, 'ไม่มีแถวใดเก็บ Pordee#2569 / Abcd#1234 ตรง ๆ').toBe(0);
  });
});

// =====================================================================================
test('TC-ACCT-02 · ค่าขอบตอนสมัคร: รหัสผ่าน ชื่อ อีเมลซ้ำ @P1 @5.8', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: '1. 7 ตัว → 400 มีข้อความใต้ช่องรหัสผ่าน · 8 ตัว → 201 · ช่องว่าง 8 ตัว → 400 · 2. ชื่อ 100 → 201 · 101 → 400 · ช่องว่างล้วน → 400 · 3. beam 3 แบบ → 409 · count(lower(email)=beam) = 1 · beam + Pordee#2569 ยังเข้าได้ · 4. อีเมลใหม่ที่ถูกปฏิเสธ → เข้าสู่ระบบ 401 · beam + Abc#1234 → 401',
    source: '[D] §2 · [R] รหัส ≥ 8 ไม่รับช่องว่างล้วน · ชื่อ 1–100 · อีเมลซ้ำไม่สนตัวพิมพ์/ช่องว่าง · [O-ยังไม่ยืนยัน] เหตุที่รับช่องว่างล้วน (ส่วน F ถามคนสร้างเว็บข้อ 7)',
    frbr: 'FR-52', rules: 'R102 ⚠️ · R103',
  });

  /** สมัครผ่านหน้า /th/signup แล้วอ่าน status จากคำขอจริง · ถ้าเบราว์เซอร์ไม่ส่งคำขอ ส่ง API เดียวกันแทน */
  async function signup(label: string, name: string, email: string, password: string) {
    await page.context().clearCookies();
    await ui.goto('/th/signup');
    await page.getByTestId('signup-name').fill(name);
    await page.getByTestId('signup-email').fill(email);
    await page.getByTestId('signup-password').fill(password);
    const resP = page.waitForResponse(r => r.url().includes('/api/auth/signup') && r.request().method() === 'POST', { timeout: 6_000 }).catch(() => null);
    await page.getByTestId('signup-submit').click();
    const res = await resP;
    let status: number;
    if (res) status = res.status();
    else {
      // ฟอร์มไม่ส่งคำขอ (ตรวจฝั่งเบราว์เซอร์) → ตรวจ API ด้วยคำขอเดียวกัน
      const r = await api.guest.post('/api/auth/signup', { data: { email, password, displayName: name } });
      status = r.status();
      info.annotations.push({ type: 'note', description: `${label}: ฟอร์มไม่ส่งคำขอ ใช้ API ตรงแทน → ${status}` });
    }
    await page.waitForTimeout(500);
    await ui.mark(page.getByTestId('signup-form'), `${label} → HTTP ${status}`);
    return status;
  }
  async function loginStatus(email: string, password: string) {
    return (await api.guest.post('/api/auth/login', { data: { email, password } })).status();
  }
  const rejected: Array<[string, string]> = [];

  await test.step('1. สมัครด้วยรหัส 7 / 8 / ช่องว่าง 8 ตัว', async () => {
    let s = await signup('รหัส 7 ตัว Abc#123', 'ทดสอบ', 'acct02-1@pordee.test', 'Abc#123');
    expect.soft(s, 'รหัส 7 ตัว → 400').toBe(400);
    await ui.check(page.getByTestId('signup-error'), 'มีข้อความแจ้งเรื่องรหัสผ่าน', l => expect.soft(l).toBeVisible());
    rejected.push(['acct02-1@pordee.test', 'Abc#123']);
    s = await signup('รหัส 8 ตัว Abc#1234', 'ทดสอบ', 'acct02-2@pordee.test', 'Abc#1234');
    expect.soft(s, 'รหัส 8 ตัว → 201').toBe(201);
    s = await signup('รหัสช่องว่าง 8 ตัว', 'ทดสอบ', 'acct02-3@pordee.test', '        ');
    expect.soft(s, 'รหัสช่องว่าง 8 ตัว → 400').toBe(400);
    rejected.push(['acct02-3@pordee.test', '        ']);
  });

  await test.step('2. สมัครด้วยชื่อ 100 / 101 / ช่องว่างล้วน', async () => {
    let s = await signup('ชื่อ ก×100', 'ก'.repeat(100), 'acct02-4@pordee.test', 'Abc#1234');
    expect.soft(s, 'ชื่อ 100 ตัว → 201').toBe(201);
    // ชื่อ 101 ตัว: ช่อง signup-name มี maxlength ตัดชื่อก่อนส่ง จึงยิง API ตรงด้วยชื่อเต็ม 101 ตัว (ตามที่แผนให้ตรวจ API ซ้ำ)
    {
      await page.context().clearCookies();
      const r = await api.guest.post('/api/auth/signup', { data: { email: 'acct02-5@pordee.test', password: 'Abc#1234', displayName: 'ก'.repeat(101) } });
      s = r.status();
      info.annotations.push({ type: 'note', description: `ชื่อ ก×101: ยิง API ตรง (ฟอร์มตัดด้วย maxlength) → ${s}` });
    }
    expect.soft(s, 'ชื่อ 101 ตัว (API ตรง) → 400').toBe(400);
    rejected.push(['acct02-5@pordee.test', 'Abc#1234']);
    s = await signup('ชื่อช่องว่างล้วน', '   ', 'acct02-6@pordee.test', 'Abc#1234');
    expect.soft(s, 'ชื่อช่องว่างล้วน → 400').toBe(400);
    rejected.push(['acct02-6@pordee.test', 'Abc#1234']);
  });

  await test.step('3. สมัครด้วยอีเมล beam 3 แบบ', async () => {
    for (const e of ['beam@pordee.test', 'BEAM@PORDEE.TEST', ' beam@pordee.test ']) {
      const s = await signup(`อีเมลซ้ำ "${e}"`, 'ทดสอบ', e, 'Abc#1234');
      expect.soft(s, `อีเมลซ้ำ "${e}" → 409`).toBe(409);
      // ตรวจ API ซ้ำด้วยคำขอเดียวกัน (ฟอร์มอาจตัดช่องว่างก่อนส่ง)
      const r = await api.guest.post('/api/auth/signup', { data: { email: e, password: 'Abc#1234', displayName: 'ทดสอบ' } });
      expect.soft(r.status(), `API อีเมลซ้ำ "${e}" → 409`).toBe(409);
    }
    const c = await db.query(`SELECT count(*)::int AS n FROM users WHERE lower(email)='beam@pordee.test'`);
    expect.soft(c[0].n, 'users ที่ lower(email)=beam มี 1 แถว').toBe(1);
    const c2 = await db.query(`SELECT count(*)::int AS n FROM users WHERE lower(trim(email))='beam@pordee.test'`);
    expect.soft(c2[0].n, 'users ที่ lower(trim(email))=beam มี 1 แถว').toBe(1);
    expect.soft(await loginStatus(U.beam, PASSWORD), 'beam + Pordee#2569 ยังเข้าได้ (200)').toBe(200);
  });

  await test.step('4. เข้าสู่ระบบด้วยอีเมล/รหัสที่ถูกปฏิเสธ', async () => {
    for (const [e, p] of rejected) {
      expect.soft(await loginStatus(e, p), `${e} (สมัครถูกปฏิเสธ) เข้าสู่ระบบ → 401`).toBe(401);
    }
    expect.soft(await loginStatus(U.beam, 'Abc#1234'), 'beam + Abc#1234 → 401 (รหัสเดิมไม่ถูกเขียนทับ)').toBe(401);
    await ui.goto('/th/login');
    await page.getByTestId('login-email').fill(U.beam);
    await page.getByTestId('login-password').fill('Abc#1234');
    await page.getByTestId('login-submit').click();
    await ui.check(page.getByTestId('login-error'), 'beam + Abc#1234 ถูกปฏิเสธบนจอ', l => expect.soft(l).toBeVisible());
  });
});

// =====================================================================================
test('TC-ACCT-03 · ไม่เข้าสู่ระบบ: เรียก API ที่ต้องเข้าสู่ระบบ + หน้าสาธารณะ + กันพาออกนอกเว็บ @P1 @5.8', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: '2. ทุกเส้น HTTP 401 · body ไม่มี VOO ZA01 beam · 3. ทุกหน้าแสดงกล่องให้เข้าสู่ระบบ + ลิงก์ไป /th/login?next=<หน้านั้น> · ไม่มีตารางข้อมูล · ไม่ใช่ 500 · 4. 200 · เห็นราคา KO และตารางคัดกรองเรียง A–Z (59 ตัว) · 5. next=/th/watchlist → /th/watchlist · กรณีอันตรายจบที่ /th/portfolio · ไม่รัน javascript: · next=/api/me ไม่พาไปหน้า JSON · 6. บีมยังมีเฝ้าดู 9 แจ้งเตือน 2 · จำนวนแถว watchlist / alerts เท่าก่อนข้อ 2',
    source: '[D] §10 (บีม 9/2) · [R] API ที่ต้องเข้าสู่ระบบตอบ 401 · กันพาออกนอกเว็บ · FR-59 จาก A-13 (⚠️) · /api/outbox 401 = สมมติฐาน 8.2 #34',
    frbr: 'FR-59 · NFR-09', rules: 'R105',
  });
  const seen = new Set<string>();
  const PUBLIC = /^\/api\/(stocks|market|health|test)(\/|$)/;

  await test.step('1. เข้าเป็นบีม เปิด 4 หน้า จด method+path ทุกเส้น แล้วออกจากระบบ', async () => {
    const onReq = (r: any) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith('/api/')) seen.add(`${r.method()} ${u.pathname}`);
    };
    page.on('request', onReq);
    await ui.login('beam');
    for (const p of ['/th/watchlist', '/th/alerts', '/th/inbox', '/th/portfolio']) { await ui.goto(p); await ui.settle(); }
    page.off('request', onReq);
    await ui.mark(page.locator('body'), `เส้น API ที่จดได้: ${[...seen].join(', ')}`);
    await page.request.post('/api/auth/logout').catch(() => {});
    await page.context().clearCookies();
    info.annotations.push({ type: 'note', description: `เส้นที่จดจาก Network: ${[...seen].join(' · ')}` });
  });

  const before = { w: 0, a: 0 };
  await test.step('2. เรียกทุกเส้นโดยไม่มี cookie (GET + POST เพิ่ม AAPL / ตั้งแจ้งเตือน KO 5%)', async () => {
    before.w = (await db.query(`SELECT count(*)::int AS n FROM watchlist_items`))[0].n;
    before.a = (await db.query(`SELECT count(*)::int AS n FROM alerts`))[0].n;
    const gets = new Set<string>(['/api/me', '/api/transactions', '/api/outbox', '/api/watchlist', '/api/alerts', '/api/inbox', '/api/dca/plans', '/api/dca/pending', '/api/portfolio']);
    const skipped: string[] = [];
    for (const s of seen) {
      const [m, p] = s.split(' ');
      if (PUBLIC.test(p)) { skipped.push(s); continue; }
      if (m === 'GET') gets.add(p);
    }
    if (skipped.length) info.annotations.push({ type: 'note', description: `เส้นสาธารณะที่ไม่ต้องเข้าสู่ระบบ ไม่นับในข้อ 2: ${skipped.join(' · ')}` });
    for (const p of gets) {
      const r = await api.guest.get(p);
      const body = await r.text();
      expect.soft(r.status(), `GET ${p} ไม่มี cookie → 401`).toBe(401);
      expect.soft(body, `GET ${p} body ไม่มีข้อมูลของใคร`).not.toMatch(/VOO|ZA01|beam/);
    }
    const posts: Array<[string, any]> = [
      ['/api/watchlist', { symbol: 'AAPL', userId: 1, user_id: 1 }],
      ['/api/alerts', { symbol: 'KO', kind: 'pct', userId: 1, user_id: 1 }],
    ];
    for (const [p, d] of posts) {
      const r = await api.guest.post(p, { data: d });
      const body = await r.text();
      expect.soft(r.status(), `POST ${p} ไม่มี cookie → 401`).toBe(401);
      expect.soft(body, `POST ${p} body ไม่มีข้อมูลของใคร`).not.toMatch(/VOO|ZA01|beam/);
    }
    const w = (await db.query(`SELECT count(*)::int AS n FROM watchlist_items`))[0].n;
    const a = (await db.query(`SELECT count(*)::int AS n FROM alerts`))[0].n;
    expect.soft(w, 'จำนวนแถว watchlist_items ไม่เปลี่ยน').toBe(before.w);
    expect.soft(a, 'จำนวนแถว alerts ไม่เปลี่ยน').toBe(before.a);
  });

  await test.step('3. เปิดหน้าที่ต้องเข้าสู่ระบบแบบไม่เข้าระบบ', async () => {
    for (const name of ['portfolio', 'watchlist', 'alerts', 'inbox', 'account']) {
      const path = `/th/${name}`;
      const st = await open(page, path);
      await ui.settle();
      expect.soft(st, `${path} ไม่ใช่หน้า error 500`).toBeLessThan(500);
      const box = page.locator('[data-testid$="-login-required"]').first();
      await ui.check(box, `${path} แสดงกล่องให้เข้าสู่ระบบ`, l => expect.soft(l).toBeVisible());
      const link = page.locator('[data-testid$="-login-link"]').first();
      const href = await link.getAttribute('href', { timeout: 5_000 }).catch(() => null);
      await ui.check(link, `${path} ลิงก์ไป /th/login?next=${path}`, async () => {
        expect.soft(href ? decodeURIComponent(href) : href, `${path} ลิงก์เข้าสู่ระบบพา next กลับหน้าเดิม`).toBe(`/th/login?next=${path}`);
      });
      expect.soft(await page.locator('main table').count(), `${path} ไม่มีตารางข้อมูล`).toBe(0);
      expect.soft(await page.getByTestId('error-page').count(), `${path} ไม่ใช่หน้า error`).toBe(0);
    }
  });

  await test.step('4. เปิด /th/stocks/KO และ /th/study/screener แบบไม่เข้าระบบ', async () => {
    let st = await open(page, '/th/stocks/KO');
    await ui.settle();
    expect.soft(st, '/th/stocks/KO → 200').toBe(200);
    await ui.check(page.getByTestId('quote-price-KO'), 'เห็นราคา KO', l => expect.soft(l).toHaveText(/\$\d/));
    st = await open(page, '/th/study/screener');
    await ui.settle();
    expect.soft(st, '/th/study/screener → 200').toBe(200);
    const rows = page.locator('[data-testid^="scr-row-"]');
    await rows.first().waitFor({ timeout: 15_000 }).catch(() => {});
    const syms = (await rows.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.testid!.slice('scr-row-'.length))));
    await ui.check(page.getByTestId('scr-table'), 'ตารางคัดกรอง 59 ตัว เรียง A–Z', async () => {
      expect.soft(syms.length, 'จำนวนแถวคัดกรอง').toBe(59);
      expect.soft(syms, 'เรียง A–Z').toEqual([...syms].sort((x, y) => x.localeCompare(y)));
    });
  });

  await test.step('5. เปิด /th/login?next=<ค่าแต่ละตัว> แล้วเข้าสู่ระบบเป็นฝน', async () => {
    const cases: Array<[string, string]> = [
      ['/th/watchlist', '/th/watchlist'],
      ['//evil.com', '/th/portfolio'],
      ['/\\evil.com', '/th/portfolio'],
      ['/%2F%2Fevil.com', '/th/portfolio'],
      ['javascript:alert(1)', '/th/portfolio'],
      ['/api/me', '/th/portfolio'],
    ];
    for (const [next, want] of cases) {
      await page.context().clearCookies();
      let dialog = false;
      const onDialog = (d: any) => { dialog = true; d.dismiss().catch(() => {}); };
      page.on('dialog', onDialog);
      await open(page, `/th/login?next=${next}`);
      await page.getByTestId('login-email').fill(U.fon);
      await page.getByTestId('login-password').fill(PASSWORD);
      await page.getByTestId('login-submit').click();
      await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 15_000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(500);
      page.off('dialog', onDialog);
      const u = new URL(page.url());
      await ui.check(page.locator('body'), `next=${next} → ${u.host}${u.pathname}`, async () => {
        expect.soft(u.host, `next=${next} อยู่ในเว็บเดียวกัน`).toBe(new URL(info.project.use.baseURL ?? page.url()).host);
        expect.soft(u.pathname, `next=${next} จบที่ ${want}`).toBe(want);
        expect.soft(dialog, `next=${next} ไม่รัน javascript:`).toBe(false);
        expect.soft(u.pathname.startsWith('/api/'), `next=${next} ไม่พาไปหน้า JSON`).toBe(false);
      });
    }
  });

  await test.step('6. เข้าเป็นบีม ดูรายการเฝ้าดูและแจ้งเตือน', async () => {
    await page.context().clearCookies();
    await ui.login('beam');
    const w = await (await page.request.get('/api/watchlist')).json().catch(() => ({}));
    const a = await (await page.request.get('/api/alerts')).json().catch(() => ({}));
    expect.soft(w?.items?.length, 'บีมเฝ้าดู 9 ตัว').toBe(9);
    expect.soft(a?.items?.length, 'บีมแจ้งเตือน 2 รายการ').toBe(2);
    await ui.goto('/th/watchlist');
    await ui.settle();
    await ui.check(page.locator('[data-testid^="watch-row-"]'), 'หน้าเฝ้าดูบีม 9 แถว', l => expect.soft(l).toHaveCount(9));
    await ui.goto('/th/alerts');
    await ui.settle();
    await ui.check(page.locator('[data-testid^="alert-row-"]'), 'หน้าแจ้งเตือนบีม 2 แถว', l => expect.soft(l).toHaveCount(2));
    const wc = (await db.query(`SELECT count(*)::int AS n FROM watchlist_items`))[0].n;
    const ac = (await db.query(`SELECT count(*)::int AS n FROM alerts`))[0].n;
    expect.soft(wc, 'แถว watchlist_items ทั้งตารางเท่าก่อนข้อ 2').toBe(before.w);
    expect.soft(ac, 'แถว alerts ทั้งตารางเท่าก่อนข้อ 2').toBe(before.a);
  });
});

// =====================================================================================
test('TC-ACCT-04 · บีมเปิด แก้ ลบข้อมูลของคนอื่น + ยกระดับตัวเอง @P1 @5.8', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: '2. ได้เฉพาะรายการของบีม 4 แถว (ZA01 ×2, VOO ×2) · ไม่มี KO · 3–4. ทุกคำขอ 403 หรือ 404 · body ไม่มี 6009 / 60.00 / 250.00 · 5. บัญชีใหม่ระดับ Free · /th/staff 403 · /api/staff/feed-status 403 ไม่เห็นตัวเลขโควตา · 6. ลุงสมชายยังมี KO 100 หุ้น ต้นทุน $6,009.00 / ฿204,306.00 พอร์ต 5 ตัว · พลอยยังมี AAPL เป้า $250.00 และแจ้งเตือน 20/20 · ข้อสุดท้าย: PATCH/DELETE ของบีมเอง 2xx',
    source: '[D] §10 (ข้อมูล seed) · [D+R] TEST-DATA ต้นทุน KO · [R] ห้ามเห็น/แก้ข้อมูลคนอื่น · ห้ามยกระดับตัวเอง (NFR-09 จาก A-21 ⚠️)',
    frbr: 'NFR-09 · FR-59 · FR-60', rules: 'R104',
  });
  let koId = 0, koTx: any = null, ployAlertId = 0;

  await test.step('เตรียม: จด id รายการซื้อ KO ของลุงสมชาย และแจ้งเตือน AAPL $250.00 ของพลอย', async () => {
    const s = await api.as('somchai');
    const tx = await (await s.get('/api/transactions')).json();
    koTx = tx.items.find((x: any) => x.symbol === 'KO' && x.side === 'buy');
    koId = koTx?.id;
    const p = await api.as('ploy');
    const al = await (await p.get('/api/alerts')).json();
    ployAlertId = al.items.find((x: any) => x.symbol === 'AAPL' && x.kind === 'target' && Number(x.targetPrice) === 250)?.id;
    expect(koId, 'พบรายการซื้อ KO ของลุงสมชาย').toBeTruthy();
    expect(ployAlertId, 'พบแจ้งเตือน AAPL $250 ของพลอย').toBeTruthy();
    info.annotations.push({ type: 'note', description: `id KO ลุงสมชาย = ${koId} · id แจ้งเตือน AAPL พลอย = ${ployAlertId}` });
  });

  let beam!: APIRequestContext;
  await test.step('1. เข้าสู่ระบบเป็นบีม', async () => {
    beam = await api.as('beam');
    await ui.login('beam');
    await ui.goto('/th/portfolio', 'portfolio-page');
  });

  await test.step('2. GET /api/transactions?userId=3', async () => {
    const r = await beam.get('/api/transactions?userId=3');
    const j = await r.json().catch(() => ({}));
    const syms = (j.items ?? []).map((x: any) => x.symbol).sort();
    expect.soft(syms, 'ได้เฉพาะรายการของบีม 4 แถว (VOO ×2, ZA01 ×2)').toEqual(['VOO', 'VOO', 'ZA01', 'ZA01']);
    expect.soft(syms, 'ไม่มี KO').not.toContain('KO');
    await ui.check(page.locator('[data-testid^="tx-row-"]'), 'หน้าพอร์ตบีมมี 4 รายการ', l => expect.soft(l).toHaveCount(4));
  });

  const noLeak = (label: string, body: string) => expect.soft(body, `${label} body ไม่มีค่า 6009 / 60.00 / 250.00`).not.toMatch(/6009|60\.00|250\.00/);
  const denied = (label: string, s: number) => expect.soft([403, 404], `${label} → 403/404 (ได้ ${s})`).toContain(s);

  await test.step('3. GET / PATCH (จำนวน 1) / DELETE รายการ KO ของลุงสมชาย', async () => {
    let r = await beam.get(`/api/transactions/${koId}`);
    expect.soft(r.status() >= 200 && r.status() < 300, `GET /api/transactions/${koId} ไม่ใช่ 2xx (ได้ ${r.status()})`).toBe(false);
    noLeak('GET', await r.text());
    r = await beam.patch(`/api/transactions/${koId}`, { data: { shares: '1' } });
    denied(`PATCH /api/transactions/${koId}`, r.status());
    noLeak('PATCH', await r.text());
    r = await beam.delete(`/api/transactions/${koId}`);
    denied(`DELETE /api/transactions/${koId}`, r.status());
    noLeak('DELETE', await r.text());
  });

  await test.step('4. PATCH (เป้า $1.00) / DELETE แจ้งเตือน AAPL ของพลอย', async () => {
    let r = await beam.patch(`/api/alerts/${ployAlertId}`, { data: { targetPrice: '1.00' } });
    denied(`PATCH /api/alerts/${ployAlertId} เป้า 1.00`, r.status());
    noLeak('PATCH alert', await r.text());
    r = await beam.patch(`/api/alerts/${ployAlertId}`, { data: { active: false } });
    denied(`PATCH /api/alerts/${ployAlertId} active:false`, r.status());
    noLeak('PATCH alert active', await r.text());
    r = await beam.delete(`/api/alerts/${ployAlertId}`);
    denied(`DELETE /api/alerts/${ployAlertId}`, r.status());
    noLeak('DELETE alert', await r.text());
  });

  await test.step('5. สมัคร acct04 พร้อม isStaff:true, tier:"pro" แล้วเปิด /th/staff และ /th/account', async () => {
    await page.context().clearCookies();
    const r = await page.request.post('/api/auth/signup', { data: { email: 'acct04@pordee.test', password: 'Abcd#1234', displayName: 'ทดสอบ04', isStaff: true, tier: 'pro' } });
    expect.soft(r.status(), 'สมัคร acct04 → 201').toBe(201);
    if (!(await page.request.get('/api/me')).ok()) await ui.login('acct04@pordee.test', 'Abcd#1234');
    const me = await (await page.request.get('/api/me')).json().catch(() => ({}));
    expect.soft(me?.user?.tier, 'acct04 ระดับ free').toBe('free');
    expect.soft(me?.user?.isStaff, 'acct04 ไม่ใช่ทีมงาน').toBe(false);
    const fs = await page.request.get('/api/staff/feed-status');
    expect.soft(fs.status(), '/api/staff/feed-status → 403').toBe(403);
    expect.soft(await fs.text(), 'API ไม่มีตัวเลขโควตา').not.toMatch(/dayUsed|minuteUsed/);
    const st = await open(page, '/th/staff');
    await ui.settle();
    expect.soft(st === 403 || (await page.getByTestId('staff-forbidden').count()) > 0, '/th/staff ถูกปฏิเสธ (403)').toBe(true);
    await ui.check(page.getByTestId('staff-forbidden'), '/th/staff แสดงไม่มีสิทธิ์', l => expect.soft(l).toBeVisible());
    expect.soft(await page.getByTestId('staff-quota-day').count(), '/th/staff ไม่เห็นตัวเลขโควตาวัน').toBe(0);
    expect.soft(await page.getByTestId('staff-quota-minute').count(), '/th/staff ไม่เห็นตัวเลขโควตา 60 วินาที').toBe(0);
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-tier'), 'หน้าบัญชี acct04 ระดับ Free', l => expect.soft(l).toHaveText('Free'));
  });

  await test.step('6. ลุงสมชายเปิด /th/portfolio · พลอยเปิด /th/alerts', async () => {
    await page.context().clearCookies();
    await ui.login('somchai');
    const pf = await (await page.request.get('/api/portfolio')).json().catch(() => ({}));
    const hs: any[] = pf.holdings ?? pf.items ?? [];
    const ko = hs.find((h: any) => h.symbol === 'KO');
    expect.soft(Number(ko?.shares), 'API: KO 100 หุ้น').toBe(100);
    expect.soft(ko?.costUsd, 'API: ต้นทุน KO $6,009.00').toBe('6009.00');
    expect.soft(ko?.costThb, 'API: ต้นทุน KO ฿204,306.00').toBe('204306.00');
    await ui.goto('/th/portfolio', 'portfolio-page');
    await ui.settle();
    await ui.check(page.getByTestId('pf-shares-KO'), 'KO 100 หุ้น', l => expect.soft(l).toHaveText(/^100(\.0+)?$/));
    await ui.check(page.getByTestId('pf-cost-thb-KO'), 'ต้นทุน KO ฿204,306.00', l => expect.soft(l).toHaveText('฿204,306.00'));
    const tx = page.locator(`[data-testid="tx-row-${koId}"]`);
    await ui.check(tx, 'รายการซื้อ KO 100 หุ้น $60.00 ยังอยู่', async l => {
      await expect.soft(page.getByTestId(`tx-shares-${koId}`)).toHaveText(/^100(\.0+)?$/);
      await expect.soft(l).toContainText('$60.00');
    });
    await ui.check(page.locator('[data-testid^="pf-row-"]'), 'พอร์ตลุงสมชาย 5 ตัว', l => expect.soft(l).toHaveCount(5));
    await page.context().clearCookies();
    await ui.login('ploy');
    await ui.goto('/th/alerts');
    await ui.settle();
    await ui.check(page.getByTestId(`alert-row-${ployAlertId}`), 'พลอยยังมี AAPL เป้า $250.00', l => expect.soft(l).toContainText('$250.00'));
    await ui.check(page.getByTestId('alert-usage'), 'แจ้งเตือนพลอย 20/20', l => expect.soft(l).toContainText(/20\s*\/\s*20/));
  });

  await test.step('ข้อสุดท้าย (ค่าควบคุม): บีม PATCH/DELETE รายการ ZA01 และแจ้งเตือนของตัวเอง', async () => {
    const tx = await (await beam.get('/api/transactions')).json();
    const za = tx.items.find((x: any) => x.symbol === 'ZA01');
    let r = await beam.patch(`/api/transactions/${za.id}`, { data: { shares: '1' } });
    expect.soft(r.status() >= 200 && r.status() < 300, `PATCH รายการ ZA01 ของบีมเอง 2xx (ได้ ${r.status()})`).toBe(true);
    r = await beam.delete(`/api/transactions/${za.id}`);
    expect.soft(r.status() >= 200 && r.status() < 300, `DELETE รายการ ZA01 ของบีมเอง 2xx (ได้ ${r.status()})`).toBe(true);
    const al = await (await beam.get('/api/alerts')).json();
    const voo = al.items.find((x: any) => x.symbol === 'VOO');
    const tgt = al.items.find((x: any) => x.kind === 'target');
    // แจ้งเตือน VOO ของบีมเป็นแบบ % จึงแก้ราคาเป้าไม่ได้ · ใช้แจ้งเตือนราคาเป้าของบีม (AAPL) ตรวจ body เดียวกับข้อ 4
    r = await beam.patch(`/api/alerts/${tgt.id}`, { data: { targetPrice: '1.00' } });
    expect.soft(r.status() >= 200 && r.status() < 300, `PATCH เป้า 1.00 แจ้งเตือน ${tgt.symbol} ของบีมเอง 2xx (ได้ ${r.status()})`).toBe(true);
    r = await beam.patch(`/api/alerts/${voo.id}`, { data: { active: false } });
    expect.soft(r.status() >= 200 && r.status() < 300, `PATCH active:false แจ้งเตือน VOO ของบีมเอง 2xx (ได้ ${r.status()})`).toBe(true);
    r = await beam.delete(`/api/alerts/${voo.id}`);
    expect.soft(r.status() >= 200 && r.status() < 300, `DELETE แจ้งเตือน VOO ของบีมเอง 2xx (ได้ ${r.status()})`).toBe(true);
    info.annotations.push({ type: 'note', description: 'ค่าควบคุม PATCH ราคาเป้าใช้แจ้งเตือน AAPL ของบีม (VOO เป็นแบบ % ไม่มีราคาเป้า) · PATCH active และ DELETE ใช้ VOO ตามแผน' });
    await page.context().clearCookies();
    await ui.login('beam');
    await ui.goto('/th/alerts');
    await ui.settle();
    await ui.mark(page.locator('[data-testid="alert-list"]'), 'หลังค่าควบคุม: แจ้งเตือนของบีมเปลี่ยนตามคำขอ');
  });
});

// =====================================================================================
test('TC-ACCT-05 · หน้าทีมงานโดยไม่มีสิทธิ์ @P2 @5.8', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: '1. API 401 · หน้าให้เข้าสู่ระบบ ไม่เห็นตัวเลขโควตา · 2. API 403 · หน้าไม่เห็นตัวเลขโควตาหรือสถานะแหล่งข้อมูล · 3. HTTP 200 · โควตาวันนี้ 0/500 · 60 วินาที 0/5 · 4. โควตาวันนี้ N+2 = 2/500 · 60 วินาที M+2 = 2/5 · 5. /th/staff/xxx 404',
    source: '[D] §10 (FR-60 กานต์เป็นทีมงาน) · [D] บ.13 §3 (5/นาที 500/วัน) · [R] 401 = ไม่รู้ตัวตน / 403 = ไม่มีสิทธิ์ · ตัวนับตรงจำนวนขอจริง (NFR-15)',
    frbr: 'FR-60 · FR-09 · BR-11 · BR-12', rules: 'R18 · R13',
  });
  const noQuota = async (label: string) => {
    expect.soft(await page.getByTestId('staff-quota-day').count(), `${label}: ไม่เห็นโควตาวัน`).toBe(0);
    expect.soft(await page.getByTestId('staff-quota-minute').count(), `${label}: ไม่เห็นโควตา 60 วินาที`).toBe(0);
    expect.soft(await page.getByTestId('staff-feed-state').count(), `${label}: ไม่เห็นสถานะแหล่งข้อมูล`).toBe(0);
  };

  await test.step('1. ไม่เข้าระบบ: เปิด /th/staff และเรียก /api/staff/feed-status', async () => {
    const r = await api.guest.get('/api/staff/feed-status');
    expect.soft(r.status(), 'ไม่เข้าระบบ API → 401').toBe(401);
    await open(page, '/th/staff');
    await ui.settle();
    await ui.check(page.getByTestId('staff-login-required'), 'ไม่เข้าระบบ: หน้าให้เข้าสู่ระบบ', l => expect.soft(l).toBeVisible());
    await noQuota('ไม่เข้าระบบ');
  });

  await test.step('2. เข้าเป็นน้ำ แล้วบีม: /th/staff /en/staff + API', async () => {
    for (const who of ['nam', 'beam'] as const) {
      await page.context().clearCookies();
      await ui.login(who);
      const r = await page.request.get('/api/staff/feed-status');
      expect.soft(r.status(), `${who} API → 403`).toBe(403);
      expect.soft(await r.text(), `${who} API ไม่มีตัวเลขโควตา`).not.toMatch(/dayUsed|minuteUsed/);
      for (const lang of LANGS) {
        await open(page, `/${lang}/staff`);
        await ui.settle();
        await ui.check(page.getByTestId('staff-forbidden'), `${who} /${lang}/staff ไม่มีสิทธิ์`, l => expect.soft(l).toBeVisible());
        await noQuota(`${who} /${lang}/staff`);
      }
    }
  });

  let N = 0, M = 0;
  await test.step('3. reset อีกครั้ง → กานต์เข้าผ่าน API → เปิด /th/staff จด N / M', async () => {
    await api.reset();
    await page.context().clearCookies();
    await ui.login('kan');
    const st = await open(page, '/th/staff');
    await expect(page.getByTestId('staff-page')).toHaveAttribute('data-state', 'ready', { timeout: 15_000 }).catch(() => {});
    expect.soft(st, '/th/staff กานต์ → 200').toBe(200);
    const day = page.getByTestId('staff-quota-day'), min = page.getByTestId('staff-quota-minute');
    N = Number(await day.getAttribute('data-used').catch(() => NaN));
    M = Number(await min.getAttribute('data-used').catch(() => NaN));
    await ui.check(day, 'โควตาวันนี้ 0/500', async l => expect.soft(norm(await l.textContent())).toContain('0/500'));
    await ui.check(min, 'โควตา 60 วินาที 0/5', async l => expect.soft(norm(await l.textContent())).toContain('0/5'));
    expect.soft(N, 'N = 0').toBe(0);
    expect.soft(M, 'M = 0').toBe(0);
  });

  await test.step('4. เปิด /th/stocks/MSFT และ /th/stocks/KO คนละ 1 ครั้ง แล้วรีโหลด /th/staff', async () => {
    await ui.goto('/th/stocks/MSFT', 'stock-page'); await ui.settle();
    await ui.goto('/th/stocks/KO', 'stock-page'); await ui.settle();
    await open(page, '/th/staff');
    await page.reload();
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' }).catch(() => {});
    await expect(page.getByTestId('staff-page')).toHaveAttribute('data-state', 'ready', { timeout: 15_000 }).catch(() => {});
    const day = page.getByTestId('staff-quota-day'), min = page.getByTestId('staff-quota-minute');
    await ui.check(day, 'โควตาวันนี้ N+2 = 2/500', async l => expect.soft(norm(await l.textContent())).toBe('2/500'));
    await ui.check(min, 'โควตา 60 วินาที M+2 = 2/5', async l => expect.soft(norm(await l.textContent())).toBe('2/5'));
  });

  await test.step('5. เปิด /th/staff/xxx', async () => {
    const st = await open(page, '/th/staff/xxx');
    expect.soft(st, '/th/staff/xxx → 404').toBe(404);
    await ui.check(page.getByTestId('notfound-page'), '/th/staff/xxx หน้าไม่พบ', l => expect.soft(l).toBeVisible());
    expect.soft(await page.getByTestId('staff-quota-day').count(), '/th/staff/xxx ไม่ใช่แดชบอร์ด').toBe(0);
  });
});

// =====================================================================================
test('TC-ACCT-06 · ขอลบบัญชี: ยืนยัน ออกทุกเครื่องทันที เข้าไม่ได้อีก @P2 @5.8', async ({ page, api, ui, browser }, info) => {
  meta(info, {
    expected: '1. ไม่ลบ · ยังอยู่หน้าบัญชีและเข้าระบบอยู่ (/api/me 200) · ก่อนข้อ 2: ไม่ส่ง confirm / confirm:"true" → 400 · 2. ถูกพาออกไปหน้าเข้าสู่ระบบทันที · 3. เครื่อง A ไม่เข้าระบบ · เครื่อง B /api/me 401 หน้าพอร์ตขึ้นกล่องให้เข้าสู่ระบบ · 4. รหัสถูก → 4xx พร้อมข้อความว่าบัญชีอยู่ระหว่างการลบ · รหัสผิด → 401 แบบเดียวกับรหัสผิดปกติ · 5. ไม่มีทางยกเลิกคำขอ · 6. del1 ถูกปฏิเสธเหมือนข้อ 4 · 7. สมัคร fon ใหม่ถูกปฏิเสธ (ข้อความผูกคำไม่ได้)',
    source: '[D] §9 (FR-53) · [D] §9 E155 (del1) · [R] ออกทุกเครื่อง · ไม่รั่วสถานะบัญชี · [O-ยังไม่ยืนยัน] ระหว่างรอลบสมัครอีเมลเดิมได้ไหม / ข้อความ (ส่วน F ข้อ 19)',
    frbr: 'FR-53 · BR-57 · FR-52', rules: 'R111 · R112 ⚠️',
  });
  const baseURL = String(info.project.use.baseURL ?? process.env.BASE_URL ?? 'http://localhost:3300');
  const ctxB = await browser.newContext({ baseURL });
  const pageB = await ctxB.newPage();
  let step4Status = 0;

  try {
    await test.step('เตรียม: เครื่อง A และ B เข้าสู่ระบบเป็นฝน', async () => {
      await ui.login('fon');
      const r = await pageB.request.post('/api/auth/login', { data: { email: U.fon, password: PASSWORD } });
      expect(r.ok(), 'เครื่อง B เข้าสู่ระบบฝน').toBe(true);
    });

    await test.step('1. เครื่อง A เปิด /th/account กดขอลบโดยไม่ติ๊กยืนยัน', async () => {
      await ui.goto('/th/account', 'account-page');
      await page.getByTestId('acct-delete').click();
      const submit = page.getByTestId('acct-delete-submit');
      await ui.check(submit, 'ปุ่มยืนยันลบกดไม่ได้เมื่อยังไม่ติ๊ก', l => expect.soft(l).toBeDisabled());
      await submit.click({ force: true, timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(800);
      expect.soft(new URL(page.url()).pathname, 'ยังอยู่หน้าบัญชี').toBe('/th/account');
      expect.soft((await page.request.get('/api/me')).status(), '/api/me ยัง 200').toBe(200);
    });

    await test.step('ก่อนข้อ 2: เรียก API ขอลบโดยไม่ส่ง confirm และส่ง confirm:"true"', async () => {
      let r = await page.request.post('/api/account/delete', { data: {} });
      expect.soft(r.status(), 'ไม่ส่ง confirm → 400').toBe(400);
      r = await page.request.post('/api/account/delete', { data: { confirm: 'true' } });
      expect.soft(r.status(), 'confirm:"true" (string) → 400').toBe(400);
      expect.soft((await page.request.get('/api/me')).status(), '/api/me ยัง 200').toBe(200);
    });

    await test.step('2. ติ๊กยืนยัน แล้วกดขอลบ', async () => {
      await page.getByTestId('acct-delete-confirm').check();
      await page.getByTestId('acct-delete-submit').click();
      await page.waitForURL(/\/login/, { timeout: 15_000 }).catch(() => {});
      await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' }).catch(() => {});
      await ui.check(page.getByTestId('login-page'), 'ถูกพาออกไปหน้าเข้าสู่ระบบทันที', async () => {
        expect.soft(new URL(page.url()).pathname, 'อยู่หน้าเข้าสู่ระบบ').toBe('/th/login');
      });
    });

    await test.step('3. เครื่อง A รีโหลด · เครื่อง B เรียก /api/me และเปิด /th/portfolio', async () => {
      await page.reload();
      await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' }).catch(() => {});
      expect.soft((await page.request.get('/api/me')).status(), 'เครื่อง A /api/me → 401').toBe(401);
      expect.soft((await pageB.request.get('/api/me')).status(), 'เครื่อง B /api/me → 401').toBe(401);
      await pageB.goto('/th/portfolio');
      await pageB.locator('html[data-ready="true"]').waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
      await expect.soft(pageB.getByTestId('portfolio-login-required'), 'เครื่อง B หน้าพอร์ตขึ้นกล่องให้เข้าสู่ระบบ').toBeVisible();
      const shot = await pageB.screenshot().catch(() => null);
      if (shot) await info.attach('เครื่อง B /th/portfolio หลังขอลบ', { body: shot, contentType: 'image/png' });
      await ui.goto('/th/portfolio');
      await ui.check(page.getByTestId('portfolio-login-required'), 'เครื่อง A หน้าพอร์ตไม่เข้าระบบ', l => expect.soft(l).toBeVisible());
    });

    await test.step('4. เข้าสู่ระบบเป็นฝนด้วยรหัสถูก แล้วรหัสผิด', async () => {
      const ok = await api.guest.post('/api/auth/login', { data: { email: U.fon, password: PASSWORD } });
      step4Status = ok.status();
      const okBody = await ok.json().catch(() => ({}));
      expect.soft(step4Status >= 400 && step4Status < 500, `รหัสถูก → 4xx (ได้ ${step4Status})`).toBe(true);
      expect.soft(String(okBody?.error?.message ?? ''), 'ข้อความบอกว่าบัญชีอยู่ระหว่างการลบ').toMatch(/ลบ/);
      const bad = await api.guest.post('/api/auth/login', { data: { email: U.fon, password: 'Wrong#2569' } });
      const ref = await api.guest.post('/api/auth/login', { data: { email: U.beam, password: 'Wrong#2569' } });
      expect.soft(bad.status(), 'รหัสผิด → 401').toBe(401);
      expect.soft(await bad.text(), 'รหัสผิดของบัญชีรอลบ = ข้อความรหัสผิดปกติ').toBe(await ref.text());
      await ui.loginByForm('fon');
      await ui.check(page.getByTestId('login-error'), 'หน้าเข้าสู่ระบบแจ้งว่าบัญชีอยู่ระหว่างการลบ', l => expect.soft(l).toContainText('ลบ'));
    });

    await test.step('5. หาปุ่ม/ทางยกเลิกคำขอลบในหน้าเข้าสู่ระบบและหน้าบัญชี', async () => {
      const undo = /ยกเลิกคำขอ|กู้คืน|ยกเลิกการลบ|restore|undo|cancel (the )?delet/i;
      for (const p of ['/th/login', '/th/account', '/en/login', '/en/account']) {
        await open(page, p);
        const n = await page.getByRole('button', { name: undo }).count() + await page.getByRole('link', { name: undo }).count();
        await ui.check(page.locator('main'), `${p} ไม่มีทางยกเลิกคำขอลบ`, async () => expect.soft(n, `${p} ปุ่ม/ลิงก์ยกเลิกคำขอลบ`).toBe(0));
      }
    });

    await test.step('6. เข้าสู่ระบบเป็น del1 รหัส Pordee#2569', async () => {
      const r = await api.guest.post('/api/auth/login', { data: { email: U.del1, password: PASSWORD } });
      expect.soft(r.status(), 'del1 ถูกปฏิเสธเหมือนข้อ 4').toBe(step4Status);
      expect.soft(String((await r.json().catch(() => ({})))?.error?.message ?? ''), 'del1 ข้อความบอกว่าบัญชีอยู่ระหว่างการลบ').toMatch(/ลบ/);
      await ui.loginByForm('del1');
      await ui.check(page.getByTestId('login-error'), 'del1 ถูกปฏิเสธบนจอ', l => expect.soft(l).toContainText('ลบ'));
    });

    await test.step('7. สมัครใหม่ด้วย fon@pordee.test', async () => {
      await page.context().clearCookies();
      await ui.goto('/th/signup');
      await page.getByTestId('signup-name').fill('ฝนใหม่');
      await page.getByTestId('signup-email').fill(U.fon);
      await page.getByTestId('signup-password').fill('Abcd#1234');
      const resP = page.waitForResponse(r => r.url().includes('/api/auth/signup'), { timeout: 10_000 }).catch(() => null);
      await page.getByTestId('signup-submit').click();
      const res = await resP;
      const s = res?.status() ?? 0;
      const body = res ? await res.text().catch(() => '') : '';
      expect.soft(s >= 400 && s < 500, `สมัคร fon ระหว่างรอลบ → ถูกปฏิเสธ (ได้ ${s})`).toBe(true);
      await page.waitForTimeout(500);
      await ui.mark(page.getByTestId('signup-error'), 'ข้อความเมื่อสมัครอีเมลที่รอลบ');
      const msg = await page.getByTestId('signup-error').textContent({ timeout: 3_000 }).catch(() => null);
      info.annotations.push({ type: 'pending', description: `ข้อความสมัครอีเมลที่รอลบ (ผูกคำไม่ได้ ส่วน F ข้อ 19): HTTP ${s} · body=${body} · บนจอ="${msg}"` });
    });
  } finally {
    await ctxB.close();
  }
});

// =====================================================================================
test('TC-ACCT-07 · ข้อมูลของบัญชีที่ขอลบหายภายใน 30 วัน และไม่กลับมาเมื่อสมัครใหม่ @P2 @5.8', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: '1. del2 เหลือ 0 แถวทุกตาราง · del1 ยังมีเฝ้าดู 2 แถว · สมัคร del2 ใหม่ได้ (201) · 3. (วันที่ 29 ไม่ใช่จุดตรวจของบีม) บัญชีควบคุมจำนวนแถวเท่าเดิมทุกตาราง (ลุงสมชายเฝ้าดู 10 รายการซื้อ 5) · 4. แถวของบีม 0 ทุกตาราง · บัญชีควบคุมเท่าเดิม · 5. สมัครได้ (201) · Free · เฝ้าดู 0/10 · แจ้งเตือน 0/3 · พอร์ตไม่มีรายการ ไม่มีแผน DCA · กล่องแจ้งเตือนว่าง · 6. รหัสเก่า 401',
    source: '[D] บ.58 §9 (BR-57 · FR-54) · [D] E156 (del2) · การนับวัน ⚠️ A-22 · [O-ยังไม่ยืนยัน] วันที่ 29 ลบเลยได้ไหม (ส่วน F ข้อ 19 · 8.2 #14 แผนใช้ BR-57)',
    frbr: 'BR-57 · FR-54 · FR-53', rules: 'R113 ⚠️ · R112 ⚠️',
  });
  // ตารางที่งานตามเวลา (ต่ออายุ ปันผล DCA แจ้งเตือน) เพิ่มแถวได้ตามปกติ → บัญชีควบคุมตรวจว่า "ไม่ลดลง"
  const GROWABLE = new Set(['subscriptions', 'dividend_receipts', 'dca_pending', 'alert_events', 'email_outbox', 'sessions', 'holdings']);
  const ids = { beam: 0, ploy: 0, somchai: 0, del1: 0, del2: 0 };
  const base: Record<string, Record<string, number>> = {};
  const checkControls = async (label: string) => {
    for (const k of ['ploy', 'somchai'] as const) {
      const now = await countRows(db, ids[k]);
      for (const [t, n] of Object.entries(base[k])) {
        if (GROWABLE.has(t)) expect.soft(now[t], `${label}: ${k} ${t} ไม่ลดลง (เดิม ${n})`).toBeGreaterThanOrEqual(n);
        else expect.soft(now[t], `${label}: ${k} ${t} เท่าเดิม`).toBe(n);
      }
    }
  };

  await test.step('1. tick หลัง reset · นับแถว del2 / del1 / บัญชีควบคุม · สมัคร del2 ใหม่', async () => {
    for (const k of Object.keys(ids) as Array<keyof typeof ids>) ids[k] = (await userId(db, U[k]))!;
    await api.tick();
    const d2 = await countRows(db, ids.del2);
    for (const [t, n] of Object.entries(d2)) expect.soft(n, `del2 ${t} = 0`).toBe(0);
    const d1 = await countRows(db, ids.del1);
    expect.soft(d1.watchlist_items, 'del1 (วันที่ 1) ยังมีเฝ้าดู 2 แถว').toBe(2);
    expect.soft(d1.users, 'del1 ยังมีแถวใน users').toBe(1);
    base.ploy = await countRows(db, ids.ploy);
    base.somchai = await countRows(db, ids.somchai);
    expect.soft(base.somchai.watchlist_items, 'ลุงสมชายเฝ้าดู 10').toBe(10);
    expect.soft(base.somchai.transactions, 'ลุงสมชายรายการซื้อ 5').toBe(5);
    info.annotations.push({ type: 'note', description: `ฐานบัญชีควบคุม: ploy=${JSON.stringify(base.ploy)} · somchai=${JSON.stringify(base.somchai)}` });
    const r = await api.guest.post('/api/auth/signup', { data: { email: U.del2, password: 'Abcd#1234', displayName: 'del2 ใหม่' } });
    expect.soft(r.status(), 'สมัคร del2 ใหม่ → 201').toBe(201);
    await ui.goto('/th/login');
    await ui.mark(page.getByTestId('login-page'), `หลัง tick: del2 ${JSON.stringify(d2)} · del1 เฝ้าดู ${d1.watchlist_items}`);
  });

  await test.step('2. เข้าเป็นบีม ติ๊กยืนยันแล้วขอลบบัญชี (6 พ.ย. 22:00)', async () => {
    const pre = await countRows(db, ids.beam);
    info.annotations.push({ type: 'note', description: `แถวบีมก่อนขอลบ: ${JSON.stringify(pre)}` });
    await ui.login('beam');
    await ui.goto('/th/account', 'account-page');
    await page.getByTestId('acct-delete').click();
    await page.getByTestId('acct-delete-confirm').check();
    await page.getByTestId('acct-delete-submit').click();
    await page.waitForURL(/\/login/, { timeout: 15_000 }).catch(() => {});
    await ui.check(page.getByTestId('login-page'), 'บีมขอลบแล้วถูกพาออกจากระบบ', l => expect.soft(l).toBeVisible());
    const row = (await db.query(`SELECT delete_requested_at FROM users WHERE id=$1`, [ids.beam]))[0];
    expect.soft(row?.delete_requested_at, 'บันทึกเวลาขอลบ').toBeTruthy();
  });

  await test.step('3. clock → 2026-12-05T23:59:59+07:00 (วันที่ 29) → tick → นับแถวบัญชีควบคุม', async () => {
    await api.clock('2026-12-05T23:59:59+07:00');
    await api.tick();
    await checkControls('วันที่ 29');
    const b = await countRows(db, ids.beam);
    info.annotations.push({ type: 'pending', description: `วันที่ 29 (5 ธ.ค. 23:59:59) แถวของบีม = ${JSON.stringify(b)} (ไม่ใช่จุดตรวจ 8.2 #14)` });
    await ui.goto('/th/login');
    await ui.mark(page.getByTestId('login-page'), `วันที่ 29: แถวบีม ${JSON.stringify(b)}`);
  });

  await test.step('4. clock → 2026-12-06T00:00:00+07:00 (วันที่ 30) → tick → นับแถวของบีม + บัญชีควบคุม', async () => {
    await api.clock('2026-12-06T00:00:00+07:00');
    await api.tick();
    const b = await countRows(db, ids.beam);
    for (const [t, n] of Object.entries(b)) expect.soft(n, `วันที่ 30: บีม ${t} = 0`).toBe(0);
    const byEmail = await db.query(`SELECT count(*)::int AS n FROM users WHERE lower(email)='beam@pordee.test'`);
    expect.soft(byEmail[0].n, 'วันที่ 30: ไม่มีแถว users ของ beam@pordee.test').toBe(0);
    await checkControls('วันที่ 30');
    await ui.goto('/th/login');
    await ui.mark(page.getByTestId('login-page'), `วันที่ 30: แถวบีม ${JSON.stringify(b)}`);
  });

  await test.step('5. สมัคร beam@pordee.test ใหม่ รหัส Abcd#1234 แล้วเปิดหน้าต่าง ๆ', async () => {
    await page.context().clearCookies();
    await ui.goto('/th/signup');
    await page.getByTestId('signup-name').fill('บีมใหม่');
    await page.getByTestId('signup-email').fill(U.beam);
    await page.getByTestId('signup-password').fill('Abcd#1234');
    const resP = page.waitForResponse(r => r.url().includes('/api/auth/signup'), { timeout: 10_000 }).catch(() => null);
    await page.getByTestId('signup-submit').click();
    const res = await resP;
    expect.soft(res?.status(), 'สมัคร beam ใหม่ → 201').toBe(201);
    await page.waitForURL(u => !u.pathname.endsWith('/signup'), { timeout: 10_000 }).catch(() => {});
    if (!(await page.request.get('/api/me')).ok()) await ui.login(U.beam, 'Abcd#1234').catch(() => {});
    const me = await (await page.request.get('/api/me')).json().catch(() => ({}));
    expect.soft(me?.user?.tier, 'บัญชีใหม่ Free').toBe('free');
    expect.soft(me?.user?.usage?.watchlist?.used, 'เฝ้าดู 0').toBe(0);
    expect.soft(me?.user?.usage?.alerts?.used, 'แจ้งเตือน 0').toBe(0);

    await ui.goto('/th/watchlist'); await ui.settle();
    await ui.check(page.getByTestId('watch-usage'), 'เฝ้าดู 0/10', async l => expect.soft(norm(await l.textContent())).toContain('0/10'));
    expect.soft(await page.locator('[data-testid^="watch-row-"]').count(), 'ไม่มีแถวเฝ้าดู').toBe(0);
    await ui.goto('/th/alerts'); await ui.settle();
    await ui.check(page.getByTestId('alert-usage'), 'แจ้งเตือน 0/3', async l => expect.soft(norm(await l.textContent())).toContain('0/3'));
    expect.soft(await page.locator('[data-testid^="alert-row-"]').count(), 'ไม่มีแถวแจ้งเตือน').toBe(0);
    await ui.goto('/th/portfolio', 'portfolio-page'); await ui.settle();
    await ui.check(page.getByTestId('pf-empty'), 'พอร์ตไม่มีรายการ', l => expect.soft(l).toBeVisible());
    expect.soft(await page.locator('[data-testid^="tx-row-"]').count(), 'ไม่มีรายการซื้อขาย').toBe(0);
    await ui.check(page.getByTestId('dca-plans-empty'), 'ไม่มีแผน DCA', l => expect.soft(l).toBeVisible());
    await ui.goto('/th/inbox'); await ui.settle();
    await ui.check(page.getByTestId('inbox-empty'), 'กล่องแจ้งเตือนว่าง', l => expect.soft(l).toBeVisible());
    await ui.goto('/th/account', 'account-page'); await ui.settle();
    await ui.check(page.getByTestId('acct-tier'), 'หน้าบัญชีระดับ Free', l => expect.soft(l).toHaveText('Free'));
    await ui.check(page.getByTestId('acct-usage'), 'หน้าบัญชี 0/10 · 0/3', async l => {
      const t = norm(await l.textContent());
      expect.soft(t, 'การใช้งานเฝ้าดู 0/10').toContain('0/10');
      expect.soft(t, 'การใช้งานแจ้งเตือน 0/3').toContain('0/3');
    });
  });

  await test.step('6. เข้าสู่ระบบด้วย beam@pordee.test + Pordee#2569 (รหัสเก่า)', async () => {
    const r = await api.guest.post('/api/auth/login', { data: { email: U.beam, password: PASSWORD } });
    expect.soft(r.status(), 'รหัสเก่า → 401').toBe(401);
  });

  await test.step('จบ: reset อีกครั้ง (นาฬิกาเลื่อนแล้ว)', async () => { await api.reset(); });
});

// =====================================================================================
test('TC-ACCT-08 · จอ 375px ไม่ล้น + ข้อความเตือน + ตัวหนังสือใหญ่ ≥ 20px (Pixel 7) @P2 @5.8 @mobile', async ({ page, ui }, info) => {
  meta(info, {
    expected: '1–2. scrollWidth − clientWidth = 0px ทุกหน้า (17 หน้า × 2 ภาษา) · ตัวสลับภาษา right ≤ 375px · 3. TH "ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน" · EN "For educational purposes only. Not investment advice." ตรงตัวอักษรทุกหน้า มองเห็นได้ไม่ถูกตัด · 4. (ก) ข้อความเนื้อหาพอร์ตต่ำสุด ≥ 20px (ข) ปุ่ม ☾ / ช่องติ๊ก บันทึกแยก · 5. ข้อ 3 ซ้ำที่ 1280px',
    source: '[D] บ.55 §9 (FR-50/NFR-07) · [D] §9 (NFR-03 ≥ 20px) · NFR-01 375px ⚠️ A-18 · [O-ยังไม่ยืนยัน] NFR-03 นับปุ่ม/ไอคอน/ช่องติ๊กไหม (ส่วน F ข้อ 15 · 8.2 #16) · ตัวสลับภาษาย่อไหม (ถามคนสร้างเว็บข้อ 10)',
    frbr: 'NFR-01 · NFR-03 · NFR-07 · FR-50', rules: 'R115 · R116 ❌ · R118 · R121 ❌',
  });
  // บังคับขนาดจอตามแผน (project mobile-chrome ตั้งไว้แล้ว · ใส่ซ้ำกันรันใน project อื่น)
  await page.setViewportSize({ width: 375, height: 812 });

  const measure = async (path: string, lang: 'th' | 'en', label: string, checkLayout: boolean) => {
    await open(page, path);
    await ui.settle();
    if (checkLayout) {
      const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect.soft(diff, `${label} ${path} ส่วนต่าง scrollWidth − clientWidth`).toBe(0);
      const right = await page.getByTestId('core-lang-switch').evaluate(e => e.getBoundingClientRect().right).catch(() => NaN);
      expect.soft(right, `${label} ${path} ตัวสลับภาษา right ≤ 375px`).toBeLessThanOrEqual(375);
    }
    const disc = page.getByTestId('core-disclaimer');
    await ui.check(disc, `${label} ${path} ข้อความเตือน`, async l => {
      await expect.soft(l, `${path} ข้อความเตือนตรงตัวอักษร`).toHaveText(DISCLAIMER[lang]);
      await expect.soft(l, `${path} ข้อความเตือนมองเห็นได้`).toBeVisible();
      const clipped = await l.evaluate(e => {
        const r = e.getBoundingClientRect();
        return e.scrollWidth > e.clientWidth + 1 || r.left < 0 || r.right > document.documentElement.clientWidth + 1;
      }).catch(() => true);
      expect.soft(clipped, `${path} ข้อความเตือนไม่ถูกตัด`).toBe(false);
    });
  };

  await test.step('1. เปิดทุกหน้า (ไม่เข้าระบบ) 2 ภาษา วัดส่วนต่างความกว้าง + ข้อความเตือน', async () => {
    for (const lang of LANGS) for (const p of GUEST_PAGES) await measure(`/${lang}${p}`, lang, '375 ไม่เข้าระบบ', true);
  });

  await test.step('2–3. เข้าสู่ระบบเป็นลุงสมชาย ทำซ้ำกับหน้าชุดเข้าระบบ + ตัวสลับภาษา + ข้อความเตือน', async () => {
    await ui.login('somchai');
    for (const lang of LANGS) for (const p of AUTH_PAGES) await measure(`/${lang}${p}`, lang, '375 ลุงสมชาย', true);
  });

  await test.step('4. ที่ /th/portfolio อ่าน font-size ของทุก element ที่มีข้อความ', async () => {
    await ui.goto('/th/portfolio', 'portfolio-page');
    await ui.settle();
    const res = await page.evaluate(() => {
      const content: Array<{ px: number; tag: string; tid: string; text: string }> = [];
      const control: Array<{ px: number; tag: string; tid: string; text: string }> = [];
      const all = Array.from(document.body.querySelectorAll('*')) as HTMLElement[];
      for (const el of all) {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const isCheckbox = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
        const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent ?? '').join('').trim();
        const isField = el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
        if (!own && !isCheckbox && !(isField && !isCheckbox)) continue;
        const ctl = isCheckbox || !!el.closest('[data-testid="core-theme-toggle"]') || el.getAttribute('role') === 'switch';
        const item = { px: parseFloat(cs.fontSize), tag: el.tagName.toLowerCase(), tid: (el.closest('[data-testid]') as HTMLElement | null)?.dataset.testid ?? '', text: (own || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '').slice(0, 30) };
        (ctl ? control : content).push(item);
      }
      content.sort((a, b) => a.px - b.px);
      control.sort((a, b) => a.px - b.px);
      return { content: content.slice(0, 10), control: control.slice(0, 10), nContent: content.length };
    });
    const min = res.content[0]?.px ?? NaN;
    await ui.check(page.getByTestId('pf-holdings'), `ตัวหนังสือใหญ่: ค่าต่ำสุดเนื้อหา ${min}px`, async () => {
      expect.soft(min, `(ก) ตัวหนังสือในเนื้อหาพอร์ตต่ำสุด ≥ 20px · เล็กสุด: ${JSON.stringify(res.content.slice(0, 5))}`).toBeGreaterThanOrEqual(20);
    });
    info.annotations.push({ type: 'note', description: `(ก) เนื้อหา ${res.nContent} element · เล็กสุด 10 ตัว: ${JSON.stringify(res.content)}` });
    info.annotations.push({ type: 'pending', description: `(ข) ปุ่ม ☾ / ช่องติ๊ก / switch ไม่อยู่ในเกณฑ์ (8.2 #16): ${JSON.stringify(res.control)}` });
  });

  await test.step('5. ทำข้อ 3 (ข้อความเตือน) ซ้ำที่จอเดสก์ท็อป 1280px', async () => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.context().clearCookies();
    for (const lang of LANGS) for (const p of GUEST_PAGES) await measure(`/${lang}${p}`, lang, '1280 ไม่เข้าระบบ', false);
    await ui.login('somchai');
    for (const lang of LANGS) for (const p of AUTH_PAGES) await measure(`/${lang}${p}`, lang, '1280 ลุงสมชาย', false);
  });
});

// =====================================================================================
test('TC-ACCT-09 · สลับภาษาแล้วอยู่หน้าเดิม ค่าเดิม + หน้า EN ไม่มีอักษรไทย @P2 @5.8', async ({ page, ui }, info) => {
  meta(info, {
    expected: '1. URL = /th/dividends?month=2026-12 · ยังเป็นเดือน ธ.ค. 2569 · การ์ด KO XD 1 ธ.ค. · $0.51 เท่ากับหน้า EN (รีโหลดแล้วยัง ธ.ค.) · 2. URL = /th/search?q=KO · ช่องค้นหายังมี KO และผลมี KO · 3. URL = /en/portfolio · ต้นทุน KO $6,009.00 และ 204,306.00 (สัญลักษณ์บาทต่างได้ ตัวเลขเท่ากัน) · 4. 0 ตัวอักษรไทยทุกหน้า EN (ยกเว้นชื่อ "ลุงสมชาย" นับแยก)',
    source: '[D] บ.23 (FR-57 · NFR-05) · [R] BR-49 KO XD 1 ธ.ค. · [D] §10 ต้นทุน KO · [O-ยังไม่ยืนยัน] ชื่อผู้ใช้ไทยในหน้า EN (ส่วน F ข้อ 14 · 8.2 #17)',
    frbr: 'FR-57 · NFR-05', rules: 'R122 ❌ · R117 ⚠️',
  });
  await ui.login('somchai');
  const meName: string = (await (await page.request.get('/api/me')).json().catch(() => ({})))?.user?.displayName ?? 'ลุงสมชาย';
  const switchTo = async (lang: 'th' | 'en') => {
    const before = page.url();
    await page.getByTestId(`core-lang-${lang}`).click();
    await page.waitForURL(u => u.toString() !== before, { timeout: 10_000 }).catch(() => {});
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' }).catch(() => {});
    await ui.settle();
  };
  const pathQ = () => { const u = new URL(page.url()); return u.pathname + u.search; };

  await test.step('1. เปิด /en/dividends?month=2026-12 จดเดือนและการ์ด KO แล้วกด TH', async () => {
    await ui.goto('/en/dividends?month=2026-12', 'dividends-page');
    await ui.settle();
    const enAmt = await page.getByTestId('div-cal-amount-KO-2026-12-01').textContent().catch(() => null);
    await ui.mark(page.getByTestId('div-cal-KO-2026-12-01'), `EN การ์ด KO ${enAmt}`);
    await switchTo('th');
    expect.soft(pathQ(), 'URL หลังกด TH').toBe('/th/dividends?month=2026-12');
    const check = async (suffix: string) => {
      await ui.check(page.getByTestId('div-month-label'), `เดือน ธ.ค. 2569${suffix}`, async l => {
        await expect.soft(l).toContainText(/ธ\.ค\.|ธันวาคม/);
        await expect.soft(l).toContainText('2569');
      });
      await ui.check(page.getByTestId('div-cal-xd-KO-2026-12-01'), `การ์ด KO XD 1 ธ.ค.${suffix}`, l => expect.soft(l).toContainText(/1\s*ธ\.ค\./));
      await ui.check(page.getByTestId('div-cal-amount-KO-2026-12-01'), `KO $0.51 เท่ากับหน้า EN${suffix}`, async l => {
        await expect.soft(l).toHaveText('$0.51');
        expect.soft(await l.textContent().catch(() => null), 'จำนวนเงินเท่าหน้า EN').toBe(enAmt);
      });
    };
    await check('');
    await page.reload();
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' }).catch(() => {});
    await ui.settle();
    await check(' (หลังรีโหลด)');
  });

  await test.step('2. เปิด /en/search?q=KO แล้วกด TH', async () => {
    await ui.goto('/en/search?q=KO', 'search-page');
    await ui.settle();
    await switchTo('th');
    expect.soft(pathQ(), 'URL หลังกด TH').toBe('/th/search?q=KO');
    await ui.check(page.getByTestId('search-input'), 'ช่องค้นหายังมี KO', l => expect.soft(l).toHaveValue('KO'));
    await ui.check(page.getByTestId('stock-result-KO'), 'ผลค้นหามี KO', l => expect.soft(l).toBeVisible());
  });

  await test.step('3. เปิด /th/portfolio จดต้นทุน KO แล้วกด EN', async () => {
    await ui.goto('/th/portfolio', 'portfolio-page');
    await ui.settle();
    const digits = (s: string | null) => (s ?? '').replace(/[^\d.,]/g, '');
    const thThb = await page.getByTestId('pf-cost-thb-KO').textContent().catch(() => null);
    const thAvg = await page.getByTestId('pf-avg-KO').textContent().catch(() => null);
    await ui.mark(page.getByTestId('pf-row-KO'), `TH ต้นทุน KO ${thThb}`);
    const pf = await (await page.request.get('/api/portfolio')).json().catch(() => ({}));
    const ko = (pf.holdings ?? pf.items ?? []).find((h: any) => h.symbol === 'KO');
    expect.soft(ko?.costUsd, 'ต้นทุน KO $6,009.00 (API)').toBe('6009.00');
    await switchTo('en');
    expect.soft(pathQ(), 'URL หลังกด EN').toBe('/en/portfolio');
    await ui.check(page.getByTestId('pf-cost-thb-KO'), 'EN ต้นทุนบาท KO 204,306.00', async l => {
      const en = await l.textContent().catch(() => null);
      expect.soft(digits(en), 'ตัวเลขต้นทุนบาทหน้า EN').toBe('204,306.00');
      expect.soft(digits(thThb), 'ตัวเลขต้นทุนบาทหน้า TH').toBe('204,306.00');
    });
    await ui.check(page.getByTestId('pf-avg-KO'), 'EN ต้นทุนเฉลี่ย $ เท่าหน้า TH', async l => {
      expect.soft(await l.textContent().catch(() => null), 'ต้นทุนเฉลี่ย $ เท่ากันทั้ง 2 ภาษา').toBe(thAvg);
    });
  });

  await test.step('4. เปิด 17 หน้าแบบ /en นับอักษรไทยใน body และ title', async () => {
    const scan = async (path: string) => {
      await open(page, path);
      await ui.settle();
      const { text, title } = await page.evaluate(() => ({ text: document.body.innerText, title: document.title }));
      const nameHits = text.split(meName).length - 1;
      const rest = text.split(meName).join('');
      // ตัวอักษรย่อจากชื่อผู้ใช้ (รูปโปรไฟล์) = ข้อมูลผู้ใช้ นับแยก
      const allThai = rest.match(/[฀-๿]+/g) ?? [];
      const initials = allThai.filter(t => t === meName[0]);
      const bodyThai = allThai.filter(t => t !== meName[0]);
      if (initials.length) info.annotations.push({ type: 'pending', description: `${path}: ตัวย่อชื่อผู้ใช้ "${meName[0]}" ปรากฏ ${initials.length} ครั้ง (นับแยก 8.2 #17)` });
      const titleThai = title.match(/[฀-๿]+/g) ?? [];
      await ui.check(page.locator('body'), `${path} อักษรไทย body=${bodyThai.length} title=${titleThai.length}`, async () => {
        expect.soft(bodyThai.join(' '), `${path} body ไม่มีอักษรไทย (ไม่นับชื่อผู้ใช้)`).toBe('');
        expect.soft(titleThai.join(' '), `${path} title ไม่มีอักษรไทย`).toBe('');
      });
      if (nameHits) info.annotations.push({ type: 'pending', description: `${path}: ชื่อผู้ใช้ "${meName}" ปรากฏ ${nameHits} ครั้ง (นับแยก 8.2 #17)` });
    };
    await page.context().clearCookies();
    for (const p of GUEST_PAGES) await scan(`/en${p}`);
    await ui.login('somchai');
    for (const p of AUTH_PAGES) await scan(`/en${p}`);
  });
});

// =====================================================================================
test('TC-ACCT-10 · แหล่งข้อมูลล่ม: ทุกหน้ายังเปิดได้ เห็นป้าย และเวลาราคาบอกวันที่จริง @P1 @5.8', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: '1. ทุกหน้า 200 ไม่มีหน้า error · /en ไม่มีข้อความ error ภาษาไทย · 2. ราคา $240.00 · ป้าย "ข้อมูลไม่อัปเดต" เห็นบนจอทุกหน้าที่มีราคา · stale=true · เวลาของราคามีวันที่ ("6 พ.ย. 04:00 น." หรือ "ราคาปิด 5 พ.ย.") ไม่ใช่แค่ "04:00 น." · 3. footer มี "Pordee Mock Feed" และเวลาอัปเดตล่าสุด · 4. สถานะแหล่งข้อมูลไม่ใช่ "ทำงานปกติ" · 5. ป้ายหาย · stale=false · $241.00 ราคา ณ 21:45 น.',
    source: '[D] §3 (NFR-10 · BR-15) · [D] บ.59 §1 (FR-51) · [D+R] TEST-DATA AAPL 240.00 · [R] ราคาเก่าต้องบอกวันที่จริง',
    frbr: 'NFR-10 · FR-51 · BR-15 · FR-06', rules: 'R17 · R16 ❌',
  });
  const PAGES = ['', '/stocks/AAPL', '/watchlist', '/portfolio', '/dividends', '/alerts', '/inbox', '/account', '/study/screener'];
  const DATE = /\d{1,2}\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/;

  await test.step('เตรียม: feed ไม่ตอบทุกตัว (clearCache) · เข้าสู่ระบบเป็นบีม', async () => {
    await api.feed({ symbol: '*', mode: 'timeout', clearCache: true });
    await ui.login('beam');
  });

  try {
    await test.step('1. เปิดทุกหน้า /th และ /en จด HTTP status', async () => {
      for (const lang of LANGS) for (const p of PAGES) {
        const path = `/${lang}${p}`;
        const st = await open(page, path);
        await ui.settle();
        expect.soft(st, `${path} → 200`).toBe(200);
        const errPage = await page.locator('[data-testid="error-page"], [data-testid="global-error-page"]').count();
        expect.soft(errPage, `${path} ไม่ใช่หน้า error`).toBe(0);
        if (lang === 'en') {
          const errThai = await page.locator('[data-testid$="-error"], [role="alert"]').evaluateAll(els =>
            els.map(e => (e as HTMLElement).innerText).join(' ').match(/[฀-๿]+/g) ?? []);
          expect.soft(errThai.join(' '), `${path} ไม่มีข้อความ error ภาษาไทย`).toBe('');
        }
        await ui.mark(page.locator('main'), `${path} HTTP ${st}`);
      }
    });

    await test.step('2. ดูราคา ป้าย และเวลา ที่หน้าหุ้น AAPL / เฝ้าดู / พอร์ต + API stale', async () => {
      await ui.goto('/th/stocks/AAPL', 'stock-page'); await ui.settle();
      await ui.check(page.getByTestId('quote-price-AAPL'), 'หน้าหุ้น AAPL ราคา $240.00', l => expect.soft(l).toHaveText('$240.00'));
      await ui.check(page.getByTestId('quote-stale-AAPL'), 'หน้าหุ้น ป้าย "ข้อมูลไม่อัปเดต"', async l => {
        await expect.soft(l).toBeVisible();
        await expect.soft(l).toContainText('ข้อมูลไม่อัปเดต');
      });
      await ui.check(page.getByTestId('quote-asof-AAPL'), 'หน้าหุ้น เวลาของราคามีวันที่', l => expect.soft(l).toHaveText(DATE));
      const a = await (await page.request.get('/api/stocks/AAPL')).json().catch(() => ({}));
      const q = a.quote ?? a;
      expect.soft(q?.stale, 'API /api/stocks/AAPL stale=true').toBe(true);
      expect.soft(q?.price, 'API ราคา 240.0000').toMatch(/^240(\.0+)?$/);

      await ui.goto('/th/watchlist'); await ui.settle();
      await ui.check(page.getByTestId('quote-price-AAPL'), 'เฝ้าดู AAPL $240.00', l => expect.soft(l).toHaveText('$240.00'));
      await ui.check(page.getByTestId('watch-row-AAPL').locator('[data-testid^="quote-stale-"]'), 'เฝ้าดู AAPL ป้าย "ข้อมูลไม่อัปเดต"', async l => {
        await expect.soft(l.first()).toBeVisible();
        await expect.soft(l.first()).toContainText('ข้อมูลไม่อัปเดต');
      });
      await ui.check(page.getByTestId('quote-asof-AAPL'), 'เฝ้าดู เวลาของราคามีวันที่', l => expect.soft(l).toHaveText(DATE));

      await ui.goto('/th/portfolio', 'portfolio-page'); await ui.settle();
      const st = page.locator('[data-testid^="pf-stale-"]');
      await ui.check(st, 'พอร์ต ป้าย "ข้อมูลไม่อัปเดต"', async l => {
        await expect.soft(l.first()).toBeVisible();
        await expect.soft(l.first()).toContainText('ข้อมูลไม่อัปเดต');
      });
      await ui.goto('/th'); await ui.settle();
      const homePrices = await page.locator('[data-testid^="quote-price-"]').count();
      info.annotations.push({ type: 'note', description: `หน้าแรกมีราคาหุ้น ${homePrices} จุด (SPEC: หน้าแรกไม่มีราคาหุ้น)` });
      if (homePrices) await ui.check(page.locator('[data-testid^="quote-stale-"]').first(), 'หน้าแรก ป้าย "ข้อมูลไม่อัปเดต"', l => expect.soft(l).toBeVisible());
    });

    await test.step('3. ดู footer ทุกหน้าที่มีราคา', async () => {
      for (const p of ['/th/stocks/AAPL', '/th/watchlist', '/th/portfolio']) {
        await open(page, p); await ui.settle();
        await ui.check(page.getByTestId('core-source'), `${p} footer มี Pordee Mock Feed + เวลาอัปเดตล่าสุด`, async l => {
          await expect.soft(l, `${p} footer มี Pordee Mock Feed`).toContainText('Pordee Mock Feed');
          await expect.soft(l, `${p} footer มีเวลาอัปเดตล่าสุด`).toHaveText(/\d{1,2}[:.]\d{2}/);
        });
      }
    });

    await test.step('4. เข้าเป็นกานต์ เปิด /th/staff ดูสถานะแหล่งข้อมูล', async () => {
      await page.context().clearCookies();
      await ui.login('kan');
      await open(page, '/th/staff');
      await expect(page.getByTestId('staff-page')).toHaveAttribute('data-state', 'ready', { timeout: 15_000 }).catch(() => {});
      await ui.check(page.getByTestId('staff-feed-state'), 'สถานะแหล่งข้อมูลไม่ใช่ "ทำงานปกติ"', async l => {
        await expect.soft(l).toBeVisible();
        await expect.soft(l).not.toHaveText(/ทำงานปกติ/);
      });
    });

    await test.step('5. feed กลับปกติ (clearCache) แล้วรีโหลด /th/stocks/AAPL', async () => {
      // ข้อ 1–3 เปิดหลายหน้าจนโควตา 5 ครั้ง/60 วินาทีเต็ม → reset (ล้างโควตา) ก่อนตรวจค่าควบคุม
      await api.reset();
      info.annotations.push({ type: 'note', description: 'ก่อนข้อ 5 สั่ง reset เพื่อล้างโควตา 60 วินาทีที่ข้อ 1–3 ใช้จนเต็ม (ไม่งั้นราคาค่าควบคุมยังเป็นราคาเก่า)' });
      await api.feed({ symbol: '*', mode: 'normal', clearCache: true });
      await ui.goto('/th/stocks/AAPL', 'stock-page');
      await page.reload();
      await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' }).catch(() => {});
      await expect(page.getByTestId('stock-page')).not.toHaveAttribute('data-state', 'loading', { timeout: 20_000 }).catch(() => {});
      await ui.settle();
      await ui.check(page.getByTestId('quote-price-AAPL'), 'ค่าควบคุม $241.00', l => expect.soft(l).toHaveText('$241.00'));
      await ui.check(page.getByTestId('quote-asof-AAPL'), 'ราคา ณ 21:45 น.', l => expect.soft(l).toContainText('21:45'));
      expect.soft(await page.locator('[data-testid^="quote-stale-"]').count(), 'ป้าย "ข้อมูลไม่อัปเดต" หาย').toBe(0);
      const a = await (await page.request.get('/api/stocks/AAPL')).json().catch(() => ({}));
      expect.soft((a.quote ?? a)?.stale, 'API stale=false').toBe(false);
    });
  } finally {
    await test.step('จบ: reset อีกครั้ง (feed ถูกสั่ง)', async () => { await api.reset(); });
  }
});
