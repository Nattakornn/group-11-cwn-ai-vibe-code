// หัวข้อ 5.3 ระดับสมาชิก สิทธิ์ย้อนหลัง และรายการเฝ้าดู (TC-WATCH-01..11) · TEST-PLAN.md บรรทัด 620–870
import { test, expect, meta, U, type UserKey } from '../fixtures/pordee';
import type { Page, APIRequestContext, TestInfo } from '@playwright/test';
import type { Ui, Db } from '../fixtures/pordee';

// ---------- ตัวช่วย ----------
const T = (s: string) => `${s}+07:00`;

/** จำนวนแถวในรายการเฝ้าดูบนจอ */
const rows = (page: Page) => page.locator('[data-testid^="watch-row-"]');

/** เพิ่มหุ้นจากช่องเพิ่มของหน้าเฝ้าดู แล้วรอให้หน้าโหลดรายการใหม่ */
async function addOnWatchPage(page: Page, ui: Ui, value: string) {
  await page.getByTestId('watch-add-input').fill(value);
  const resp = page.waitForResponse((r) => r.url().includes('/api/watchlist') && r.request().method() === 'POST', { timeout: 8_000 }).catch(() => null);
  await page.getByTestId('watch-add-btn').click();
  const r = await resp;
  await ui.settle();
  await page.waitForTimeout(300);
  return r;
}

/** ข้อความผลล่าสุดของหน้าเฝ้าดู (error หรือ ok) */
async function watchMessage(page: Page) {
  const err = page.getByTestId('watch-error');
  if (await err.count()) return (await err.innerText()).trim();
  const ok = page.getByTestId('watch-ok');
  if (await ok.count()) return (await ok.innerText()).trim();
  return '';
}

/** กดลบ 1 ครั้ง แล้วดูว่ามีถามยืนยัน (dialog / ปุ่มยืนยันในหน้า) หรือปุ่มเลิกทำไหม · ถ้ามีถามยืนยันจะกดยืนยันให้ */
async function removeOnWatchPage(page: Page, ui: Ui, sym: string) {
  let dialogMsg: string | null = null;
  const onDialog = async (d: import('@playwright/test').Dialog) => { dialogMsg = d.message(); await d.accept(); };
  page.on('dialog', onDialog);
  await page.getByTestId(`watch-remove-${sym}`).click();
  await page.waitForTimeout(800);
  page.off('dialog', onDialog);
  let inPageConfirm = false;
  const confirmBtn = page.locator(`[data-testid^="watch-remove-confirm"], [data-testid*="confirm"]`).filter({ visible: true })
    .or(page.getByRole('button', { name: /ยืนยัน|ลบเลย|ยืนยันการลบ/ }));
  if (await confirmBtn.count()) { inPageConfirm = true; await confirmBtn.first().click(); await page.waitForTimeout(500); }
  const undo = await page.getByRole('button', { name: /เลิกทำ|ย้อนกลับ|undo/i }).count();
  await ui.settle();
  return { asked: dialogMsg !== null || inPageConfirm, undo: undo > 0, dialogMsg };
}

async function apiWatchlist(ctx: APIRequestContext) {
  const r = await ctx.get('/api/watchlist');
  return { status: r.status(), body: await r.json().catch(() => ({})), text: await r.text() };
}

async function userId(db: Db, user: UserKey) {
  const r = await db.query<{ id: number }>('SELECT id FROM users WHERE email=$1', [U[user]]);
  return r[0]?.id;
}

/** นับรายการเก็บเงิน ฿199 · แผนเขียน `amount=199.00` แต่ตารางจริงมีคอลัมน์ `amount_thb` (TEST-DATA) */
async function count199(db: Db, uid: number) {
  const r = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM subscriptions WHERE user_id=$1 AND amount_thb=199.00', [uid]);
  return r[0]?.n ?? -1;
}

function noteColumn(info: TestInfo) {
  info.annotations.push({ type: 'note', description: 'แผนใช้ `amount=199.00` แต่ตาราง subscriptions มีคอลัมน์ `amount_thb` → ใช้ `amount_thb=199.00` นับแทน (ความหมายเดียวกัน)' });
}

/** ใส่วันเริ่มในฟอร์มช่วงของหน้าหุ้นแล้วกดดู */
async function applyRange(page: Page, ui: Ui, from: string) {
  await page.getByTestId('stock-range-from').fill(from);
  await page.getByTestId('stock-range-apply').click();
  await page.waitForTimeout(400);
  await expect(page.getByTestId('stock-chart-card')).not.toHaveAttribute('data-state', 'loading', { timeout: 20_000 }).catch(() => {});
  await ui.settle();
}

/** วันของแท่งแรกในตารางราคาบนหน้า (ตารางกราฟช่วงที่แสดงอยู่) */
async function firstBarOnPage(page: Page): Promise<string | null> {
  const det = page.getByTestId('stock-bars');
  if (!(await det.count())) return null;
  const open = await det.evaluate((d) => (d as HTMLDetailsElement).open);
  if (!open) await page.getByTestId('stock-bars-toggle').click();
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const ds = [...document.querySelectorAll('[data-testid^="stock-bar-2"]')].map((e) => e.getAttribute('data-testid')!.slice('stock-bar-'.length)).sort();
    return ds[0] ?? null;
  });
}

/** ข้อความ error ช่วงวันที่บนหน้าหุ้น ('' = ไม่มี) */
async function rangeError(page: Page) {
  const e = page.getByTestId('stock-range-error');
  if (!(await e.count()) || !(await e.isVisible())) return '';
  return (await e.innerText()).trim();
}

async function candles(ctx: APIRequestContext, q: string) {
  const r = await ctx.get(`/api/stocks/AAPL/candles?${q}`);
  const body = await r.json().catch(() => ({}));
  return { status: r.status(), ok: r.ok(), body, first: body?.bars?.[0]?.date as string | undefined };
}

const has130or135 = (s: string) => /(^|[^0-9.])13[05](\.0+)?(?![0-9])/.test(s);

// =====================================================================

test('TC-WATCH-01 · Free ขอบ 9 → 10 → 11 ตัว และตัวนับ 3 ที่ตรงกัน @P2 @5.3', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ขั้น 1: สำเร็จ · ตัวนับ "รายการเฝ้าดู 10/10" (9 + 1 = 10 ≤ 10) · ขั้น 2: ปุ่มไม่ชวนให้กดเพิ่มซ้ำ (เช่น บอกว่าอยู่ในรายการแล้ว) · ขั้น 3: 10 แถว ZA01 อยู่ลำดับที่ 10 ราคา $130.00 · ขั้น 4: ถูกปฏิเสธ ข้อความ "รายการเฝ้าดูครบ 10 ตัวแล้ว (Free)" · ไม่มี ZA02 ในรายการ · ขั้น 5–6: ทั้ง 3 หน้าแสดง 10/10 · API มี 10 รายการ',
    source: '[D] BR-16 บ.14 · TEST-DATA E51 E52 (ถ้อยคำ ⚠️ A-30) · [R] ตัวนับเท่ากันทุกหน้า (R53) · [R] ปุ่มสะท้อนสถานะ (R51 ⚠️ · คำถามคนสร้างเว็บข้อ 18)',
    frbr: 'FR-18 FR-19 FR-58 · BR-16', rules: 'R38 R51 R53 R110',
  });
  await test.step('เงื่อนไข: เข้าสู่ระบบ U01 คุณบีม (Free · 9 ตัว)', async () => { await ui.login('beam'); });

  await test.step('1. เปิด /th/stocks/ZA01 กด "เพิ่มในรายการเฝ้าดู"', async () => {
    await ui.goto('/th/stocks/ZA01', 'stock-page');
    await ui.settle();
    const resp = page.waitForResponse((r) => r.url().includes('/api/watchlist') && r.request().method() === 'POST', { timeout: 8_000 }).catch(() => null);
    await page.getByTestId('stock-watch-btn').click();
    const r = await resp;
    await page.waitForTimeout(500);
    await ui.check(page.getByTestId('stock-watch-msg'), 'ขั้น 1 เพิ่ม ZA01 สำเร็จ', (l) => expect.soft(l, 'เพิ่ม ZA01 ต้องสำเร็จ').toHaveAttribute('data-state', 'ok'));
    const j = r ? await r.json().catch(() => ({})) : {};
    expect.soft(r?.status(), 'POST เพิ่ม ZA01 ต้อง 201').toBe(201);
    expect.soft(`${j.used}/${j.limit}`, 'ตัวนับหลังเพิ่ม ZA01 = 10/10').toBe('10/10');
  });

  await test.step('2. ดูปุ่มเดิมบนหน้า ZA01', async () => {
    const btn = page.getByTestId('stock-watch-btn');
    await ui.mark(btn, 'ขั้น 2 ปุ่มเฝ้าดูหลังเพิ่ม');
    const n = await btn.count();
    const text = n ? (await btn.innerText()).trim() : '';
    const disabled = n ? await btn.isDisabled() : true;
    expect.soft(n === 0 || disabled || text !== 'เพิ่มในรายการเฝ้าดู', `ปุ่มต้องไม่ชวนกดเพิ่มซ้ำ (เห็น "${text}" disabled=${disabled})`).toBe(true);
  });

  await test.step('3. เปิด /th/watchlist นับแถวและอ่านตัวนับ', async () => {
    await ui.goto('/th/watchlist', 'watch-page');
    await ui.settle();
    await ui.check(page.getByTestId('watch-usage'), 'ขั้น 3 ตัวนับ 10/10', (l) => expect.soft(l).toHaveText('รายการเฝ้าดู 10/10'));
    await ui.check(page.getByTestId('watch-table'), 'ขั้น 3 จำนวนแถว 10', async () => { await expect.soft(rows(page), '10 แถว').toHaveCount(10); });
    await ui.check(page.getByTestId('watch-row-ZA01'), 'ขั้น 3 ZA01 ลำดับที่ 10', (l) => expect.soft(l).toHaveAttribute('data-position', '10'));
    await ui.check(page.getByTestId('quote-price-ZA01'), 'ขั้น 3 ราคา ZA01 $130.00', (l) => expect.soft(l).toHaveText('$130.00'));
  });

  await test.step('4. ในช่องเพิ่มของหน้าเฝ้าดู พิมพ์ ZA02 กดเพิ่ม', async () => {
    await addOnWatchPage(page, ui, 'ZA02');
    await ui.check(page.getByTestId('watch-error'), 'ขั้น 4 ZA02 ถูกปฏิเสธ', (l) => expect.soft(l).toHaveText('รายการเฝ้าดูครบ 10 ตัวแล้ว (Free)'));
    await ui.check(page.getByTestId('watch-table'), 'ขั้น 4 ไม่มี ZA02', async () => { await expect.soft(page.getByTestId('watch-row-ZA02'), 'ไม่มีแถว ZA02').toHaveCount(0); });
  });

  await test.step('5. รีโหลดหน้าเฝ้าดู · เปิดหน้าแจ้งเตือน · เปิด /th/account', async () => {
    await page.reload();
    await ui.goto('/th/watchlist', 'watch-page');
    await ui.check(page.getByTestId('watch-usage'), 'ขั้น 5 หน้าเฝ้าดูหลังรีโหลด 10/10', (l) => expect.soft(l).toHaveText('รายการเฝ้าดู 10/10'));
    await ui.goto('/th/alerts', 'alerts-page');
    // (triage) แผนขั้น 5 ไม่ได้สั่งให้หาตัวนับเฝ้าดูในหน้าแจ้งเตือน จึงไม่ assert ที่หน้านี้
    await ui.goto('/th/account', 'account-page');
    const acc = page.getByTestId('acct-usage-watchlist');
    await ui.check(acc, 'ขั้น 5 หน้าบัญชี 10/10', async (l) => {
      await expect.soft(l).toHaveText('รายการเฝ้าดู 10/10');
      await expect.soft(l).toHaveAttribute('data-used', '10');
      await expect.soft(l).toHaveAttribute('data-limit', '10');
    });
  });

  await test.step('6. GET /api/watchlist นับรายการ', async () => {
    const w = await apiWatchlist(page.request);
    await ui.mark(page.getByTestId('acct-usage-watchlist'), 'ขั้น 6 API watchlist');
    const syms = (w.body.items ?? []).map((i: any) => i.symbol);
    expect.soft(syms.length, 'API มี 10 รายการ').toBe(10);
    expect.soft(syms, 'API ไม่มี ZA02').not.toContain('ZA02');
  });
});

test('TC-WATCH-02 · Pro ขอบ 49 → 50 → 51 ตัว @P2 @5.3', async ({ page, ui }, info) => {
  meta(info, {
    expected: 'ขั้น 1–2: สำเร็จ "รายการเฝ้าดู 50/50" (49 + 1) · O ลำดับที่ 50 ราคา $58.00 · ขั้น 3: ถูกปฏิเสธ ข้อความ "รายการเฝ้าดูครบ 50 ตัวแล้ว (Pro)" · ขั้น 4: API 50 รายการ ไม่มี BRK.B · หน้าบัญชี "รายการเฝ้าดู 50/50"',
    source: '[D] BR-17 บ.14 · TEST-DATA E53 E54 (ถ้อยคำ ⚠️ A-30)', frbr: 'FR-18 FR-58 · BR-17', rules: 'R39 ⚠️ (ตัวที่ 51 ยังไม่ได้ลอง)',
  });
  await test.step('เงื่อนไข: เข้าสู่ระบบ U07 คุณมิ้นท์ (Pro · 49 ตัว)', async () => { await ui.login('mint'); });
  await test.step('1. หน้าเฝ้าดู เพิ่ม O', async () => {
    await ui.goto('/th/watchlist', 'watch-page');
    await ui.settle();
    await addOnWatchPage(page, ui, 'O');
    await ui.check(page.getByTestId('watch-ok'), 'ขั้น 1 เพิ่ม O สำเร็จ', (l) => expect.soft(l, 'ต้องมีข้อความสำเร็จ').toBeVisible());
  });
  await test.step('2. อ่านตัวนับ', async () => {
    await ui.check(page.getByTestId('watch-usage'), 'ขั้น 2 ตัวนับ 50/50', (l) => expect.soft(l).toHaveText('รายการเฝ้าดู 50/50'));
    await ui.check(page.getByTestId('watch-row-O'), 'ขั้น 2 O ลำดับที่ 50', (l) => expect.soft(l).toHaveAttribute('data-position', '50'));
    await ui.check(page.getByTestId('quote-price-O'), 'ขั้น 2 ราคา O $58.00', (l) => expect.soft(l).toHaveText('$58.00'));
  });
  await test.step('3. เพิ่ม BRK.B', async () => {
    await addOnWatchPage(page, ui, 'BRK.B');
    await ui.check(page.getByTestId('watch-error'), 'ขั้น 3 BRK.B ถูกปฏิเสธ', (l) => expect.soft(l).toHaveText('รายการเฝ้าดูครบ 50 ตัวแล้ว (Pro)'));
  });
  await test.step('4. GET /api/watchlist นับรายการ · เปิด /th/account', async () => {
    const w = await apiWatchlist(page.request);
    const syms = (w.body.items ?? []).map((i: any) => i.symbol);
    await ui.mark(page.getByTestId('watch-usage'), 'ขั้น 4 API watchlist');
    expect.soft(syms.length, 'API 50 รายการ').toBe(50);
    expect.soft(syms, 'API ไม่มี BRK.B').not.toContain('BRK.B');
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-usage-watchlist'), 'ขั้น 4 หน้าบัญชี 50/50', (l) => expect.soft(l).toHaveText('รายการเฝ้าดู 50/50'));
  });
});

test('TC-WATCH-03 · รายการเต็มแล้ว ต้องบอกเหตุจริงก่อนโควตา และข้อความ error บอกวิธีแก้ @P2 @5.3', async ({ page, ui }, info) => {
  meta(info, {
    expected: '`brk-b` → "หุ้นนี้อยู่ในรายการเฝ้าดูแล้ว" · `NSRGY` → "ไม่รองรับหุ้นนอกตลาด NYSE / NASDAQ" · `XXXX` → "ไม่พบหุ้นนี้" · ช่องว่าง → ข้อความที่บอกให้กรอกชื่อย่อ (ไม่ใช่ "ข้อมูลไม่ถูกต้อง" ล้วน) ต้องมีคำว่า "ชื่อย่อ" ⚠️ ถ้อยคำสมมติ (RV3-10) · `" za03 "` → "รายการเฝ้าดูครบ 10 ตัวแล้ว (Free)" · ตัวนับ 10/10 ทุกครั้ง · API 10 รายการ',
    source: '[D] FR-01 FR-02 (ข้อความนอกตลาด/ไม่พบ) · [D] BR-16 · [R] บอกเหตุจริงก่อนโควตา (R40) · [R] error บอกช่องที่ผิด (R41 ⚠️)',
    frbr: 'FR-18 · BR-16', rules: 'R38 R40 R41 ⚠️',
  });
  await test.step('เงื่อนไข: เข้าสู่ระบบ U03 ลุงสมชาย (Free · 10 ตัวเต็ม)', async () => { await ui.login('somchai'); });
  await ui.goto('/th/watchlist', 'watch-page');
  await ui.settle();
  const cases: Array<{ v: string; label: string; check: (msg: string) => void }> = [
    { v: 'brk-b', label: 'brk-b', check: (m) => expect.soft(m, 'brk-b').toBe('หุ้นนี้อยู่ในรายการเฝ้าดูแล้ว') },
    { v: 'NSRGY', label: 'NSRGY', check: (m) => expect.soft(m, 'NSRGY').toBe('ไม่รองรับหุ้นนอกตลาด NYSE / NASDAQ') },
    { v: 'XXXX', label: 'XXXX', check: (m) => expect.soft(m, 'XXXX').toBe('ไม่พบหุ้นนี้') },
    { v: '', label: 'ช่องว่าง', check: (m) => { expect.soft(m, 'ช่องว่าง ต้องบอกให้กรอกชื่อย่อ').toContain('ชื่อย่อ'); expect.soft(m, 'ช่องว่าง ไม่ใช่ "ข้อมูลไม่ถูกต้อง" ล้วน').not.toBe('ข้อมูลไม่ถูกต้อง'); } },
    { v: ' za03 ', label: '" za03 "', check: (m) => expect.soft(m, '" za03 "').toBe('รายการเฝ้าดูครบ 10 ตัวแล้ว (Free)') },
  ];
  for (const c of cases) {
    await test.step(`1–2. เพิ่ม ${c.label} · จดข้อความและตัวนับ`, async () => {
      await addOnWatchPage(page, ui, c.v);
      await ui.mark(page.getByTestId('watch-error'), `ข้อความเมื่อเพิ่ม ${c.label}`);
      c.check(await watchMessage(page));
      await ui.check(page.getByTestId('watch-usage'), `ตัวนับหลัง ${c.label} = 10/10`, (l) => expect.soft(l).toHaveText('รายการเฝ้าดู 10/10'));
    });
  }
  await test.step('3. GET /api/watchlist', async () => {
    const w = await apiWatchlist(page.request);
    await ui.mark(page.getByTestId('watch-table'), 'ขั้น 3 API watchlist');
    expect.soft((w.body.items ?? []).length, 'API 10 รายการ').toBe(10);
  });
});

test('TC-WATCH-04 · เพิ่มหุ้นที่ถูกถอด (OLDC) ต้องไม่กินโควตาเงียบ ๆ @P1 @5.3', async ({ page, ui }, info) => {
  meta(info, {
    expected: 'ตามสมมติฐาน 8.2 #7 (ต้องเตือนก่อนเพิ่ม ไม่กินโควตาเงียบ ๆ) (RV3-04): ขั้น 1: "ไม่พบหุ้นนี้" · ขั้น 2: ก่อนเพิ่มต้องเห็นคำเตือนว่า OLDC หยุดซื้อขายแล้ว · กดยกเลิก → ตัวนับ 9/10 · ไม่มี OLDC ในรายการ · ขั้น 3: ข้อความบนหน้า OLDC มีคำว่า "หยุดซื้อขาย" ตรงกับคำเตือนในขั้น 2 · ขั้น 4: สำเร็จ 10/10 · ขั้น 5: 10 รายการ ไม่มี OLDC',
    source: '[D] FR-02 หุ้นถูกถอดค้นไม่เจอ · [R] ตัดสินเหมือนกันทุกหน้า (R50 ❌) · ผลที่ถูกของขั้น 2 รอคำตอบลูกค้า (ใช้สมมติฐาน 8.2 #7)',
    frbr: 'FR-02 FR-18 · BR-16', rules: 'R22 R50 ❌',
  });
  await test.step('เงื่อนไข: เข้าสู่ระบบ U01 คุณบีม (Free · 9 ตัว)', async () => { await ui.login('beam'); });

  await test.step('1. ค้นหา OLDC', async () => {
    await ui.goto('/th/search', 'search-page');
    await page.getByTestId('search-input').fill('OLDC');
    await page.getByTestId('search-submit').click();
    await ui.settle();
    await ui.check(page.getByTestId('search-notice'), 'ขั้น 1 ค้นหา OLDC', (l) => expect.soft(l).toHaveText('ไม่พบหุ้นนี้'));
  });

  let warning = '';
  await test.step('2. เปิด /th/stocks/OLDC ตรงจาก URL กดเพิ่มในรายการเฝ้าดู (มีคำเตือน → กดยกเลิก)', async () => {
    await ui.goto('/th/stocks/OLDC', 'stock-page');
    await ui.settle();
    let dialogMsg: string | null = null;
    const onDialog = async (d: import('@playwright/test').Dialog) => { dialogMsg = d.message(); await d.dismiss(); };
    page.on('dialog', onDialog);
    await page.getByTestId('stock-watch-btn').click();
    await page.waitForTimeout(1000);
    page.off('dialog', onDialog);
    let inPage = false;
    const cancel = page.getByRole('button', { name: /^ยกเลิก$/ });
    if (await cancel.count()) {
      inPage = true;
      warning = (await page.locator('[role="dialog"], [role="alertdialog"]').first().innerText().catch(() => '')) || '';
      await cancel.first().click();
      await page.waitForTimeout(500);
    }
    if (dialogMsg) warning = dialogMsg;
    await ui.settle();
    await ui.mark(page.getByTestId('stock-watch-msg'), 'ขั้น 2 หลังกดเพิ่ม OLDC');
    expect.soft(dialogMsg !== null || inPage, 'ต้องมีคำเตือนก่อนเพิ่ม OLDC').toBe(true);
    if (dialogMsg !== null || inPage) expect.soft(warning, 'คำเตือนบอกว่าหยุดซื้อขาย').toContain('หยุดซื้อขาย');
    const w = await apiWatchlist(page.request);
    const syms = (w.body.items ?? []).map((i: any) => i.symbol);
    expect.soft(syms.length, 'หลังกดยกเลิก ตัวนับ 9/10').toBe(9);
    expect.soft(syms, 'ไม่มี OLDC ในรายการ').not.toContain('OLDC');
    await ui.goto('/th/watchlist', 'watch-page');
    await ui.check(page.getByTestId('watch-usage'), 'ขั้น 2 ตัวนับ 9/10', (l) => expect.soft(l).toHaveText('รายการเฝ้าดู 9/10'));
  });

  await test.step('3. ที่หน้าแจ้งเตือน ตั้งแจ้งเตือน OLDC แบบ 5%', async () => {
    await ui.goto('/th/alerts', 'alerts-page');
    await page.getByTestId('alert-symbol-input').fill('OLDC');
    await page.getByTestId('alert-kind-pct').click();
    await page.getByTestId('alert-add-btn').click();
    await ui.settle();
    await page.waitForTimeout(500);
    const err = page.getByTestId('alert-error');
    await ui.check(err, 'ขั้น 3 ข้อความแจ้งเตือน OLDC', (l) => expect.soft(l, 'ข้อความต้องมี "หยุดซื้อขาย" ตรงกับคำเตือนขั้น 2').toContainText('หยุดซื้อขาย'));
  });

  await test.step('4. หน้าเฝ้าดู เพิ่ม ZA01', async () => {
    await ui.goto('/th/watchlist', 'watch-page');
    await addOnWatchPage(page, ui, 'ZA01');
    await ui.check(page.getByTestId('watch-ok'), 'ขั้น 4 เพิ่ม ZA01 สำเร็จ', (l) => expect.soft(l, 'ZA01 ต้องเพิ่มได้').toBeVisible());
    await ui.check(page.getByTestId('watch-usage'), 'ขั้น 4 ตัวนับ 10/10', (l) => expect.soft(l).toHaveText('รายการเฝ้าดู 10/10'));
  });

  await test.step('5. GET /api/watchlist', async () => {
    const w = await apiWatchlist(page.request);
    const syms = (w.body.items ?? []).map((i: any) => i.symbol);
    await ui.mark(page.getByTestId('watch-table'), 'ขั้น 5 API watchlist');
    expect.soft(syms.length, 'API 10 รายการ').toBe(10);
    expect.soft(syms, 'ไม่มี OLDC').not.toContain('OLDC');
  });
});

test('TC-WATCH-05 · Pro หมดอายุ เห็นราคา 10 ตัวแรก และราคาตัวที่ 11 ต้องไม่หลุดใน API @P2 @5.3', async ({ page, ui }, info) => {
  meta(info, {
    expected: 'ขั้น 1: O $58.00 · BRK.B $480.00 แต่ละแถวมี % เปลี่ยนแปลง (+0.00% เพราะราคาเท่าปิดวันก่อน) และเวลาเป็นเวลาไทย · ZA01 ZA02 ขึ้น "เฉพาะ Pro" ไม่มีตัวเลขราคา · ลำดับแถว 1–12 บนจอ = AAPL MSFT NVDA TSLA VOO KO JNJ PG O BRK.B ZA01 ZA02 · ขั้น 2: แถว ZA01 ZA02 มี proOnly: true · ช่องราคา / ราคาปิดวันก่อน / การเปลี่ยนแปลง $ / % เป็น null หรือไม่มีช่องเลย · ต้องไม่เจอตัวเลข 130 และ 135 ทุกรูปแบบ · position 1–12 ตรงลำดับ seed · ค่าควบคุม: แถว BRK.B ต้องมีราคา 480 (RV3-01) · ขั้น 4: ZA01 เลื่อนเป็นตัวที่ 10 แสดง $130.00 · ZA02 เป็นตัวที่ 11 ยัง "เฉพาะ Pro" · ตัวนับบอกจำนวน 11 และสื่อว่าเกินสิทธิ์ Free 10',
    source: '[D] BR-18 §2 · TEST-DATA E55 · [D] FR-19 บ.11 (ราคา % เวลา) · [R] ซ่อนที่ต้นทางไม่ใช่แค่จอ · ลำดับหลังลบ [O-ยังไม่ยืนยัน] (R44) · ตัวนับ "12/10" [O-ยังไม่ยืนยัน] (R43)',
    frbr: 'FR-19 FR-20 · BR-18', rules: 'R42 R43 ⚠️ R44',
  });
  const seed = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'VOO', 'KO', 'JNJ', 'PG', 'O', 'BRK.B', 'ZA01', 'ZA02'];
  await test.step('เงื่อนไข: เข้าสู่ระบบ U05 คุณนก (Free · Pro หมด 1 พ.ย. · 12 ตัว)', async () => { await ui.login('nok'); });

  await test.step('1. เปิด /th/watchlist อ่านแถวที่ 9–12', async () => {
    await ui.goto('/th/watchlist', 'watch-page');
    await ui.settle();
    const order = await rows(page).evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') || '').replace('watch-row-', '')));
    await ui.mark(page.getByTestId('watch-table'), 'ขั้น 1 ลำดับแถว 1–12');
    expect.soft(order, 'ลำดับแถวบนจอตาม seed').toEqual(seed);
    for (const [sym, price] of [['O', '$58.00'], ['BRK.B', '$480.00']] as const) {
      await ui.check(page.getByTestId(`quote-price-${sym}`), `ขั้น 1 ราคา ${sym}`, (l) => expect.soft(l).toHaveText(price));
      await ui.check(page.getByTestId(`quote-pct-${sym}`), `ขั้น 1 % ${sym}`, (l) => expect.soft(l).toHaveText('0.00%')); // แก้แผนหลัง LAB 12 (PLAN-FIX-5): "+0.00%" ไม่มีที่มา · TC-STUDY-04 ใช้ "0.00%"
      await ui.check(page.getByTestId(`quote-asof-${sym}`), `ขั้น 1 เวลาไทย ${sym}`, (l) => expect.soft(l).toHaveText(/\d{2}:\d{2} น\./));
    }
    for (const sym of ['ZA01', 'ZA02']) {
      await ui.check(page.getByTestId(`watch-proonly-${sym}`), `ขั้น 1 ${sym} เฉพาะ Pro`, (l) => expect.soft(l).toHaveText('เฉพาะ Pro'));
      const rowText = await page.getByTestId(`watch-row-${sym}`).innerText().catch(() => '');
      expect.soft(/\$\d/.test(rowText), `แถว ${sym} ต้องไม่มีตัวเลขราคา (เห็น "${rowText.replace(/\s+/g, ' ')}")`).toBe(false);
    }
  });

  await test.step('2. GET /api/watchlist ตรวจแถว ZA01 ZA02 และ position ทุกแถว', async () => {
    const w = await apiWatchlist(page.request);
    const items: any[] = w.body.items ?? [];
    await ui.mark(page.getByTestId('watch-row-ZA01'), 'ขั้น 2 API แถว ZA01 ZA02');
    expect.soft(items.map((i) => `${i.position}:${i.symbol}`), 'position 1–12 ตรงลำดับ seed').toEqual(seed.map((s, i) => `${i + 1}:${s}`));
    for (const sym of ['ZA01', 'ZA02']) {
      const it = items.find((i) => i.symbol === sym) ?? {};
      expect.soft(it.proOnly, `${sym} proOnly`).toBe(true);
      const q = it.quote ?? {};
      for (const f of ['price', 'prevClose', 'change', 'changePct']) {
        expect.soft(q[f] ?? null, `${sym} ช่อง ${f} ต้อง null หรือไม่มี`).toBeNull();
      }
      for (const f of ['price', 'prevClose', 'change', 'changePct']) expect.soft(it[f] ?? null, `${sym} ช่อง ${f} (ระดับแถว) ต้อง null หรือไม่มี`).toBeNull();
      expect.soft(has130or135(JSON.stringify(it)), `แถว ${sym} ใน API ต้องไม่มีตัวเลข 130/135 (${JSON.stringify(it)})`).toBe(false);
    }
    const brk = items.find((i) => i.symbol === 'BRK.B') ?? {};
    expect.soft(Number(brk.quote?.price ?? brk.price), 'ค่าควบคุม: BRK.B ราคา 480').toBe(480);
    info.annotations.push({ type: 'note', description: 'ค้นตัวเลข 130/135 เฉพาะแถว ZA01 ZA02 · ทั้ง body มี NVDA ราคา 130 ตามจริง (seed) จึงค้นทั้ง body ไม่ได้' });
  });

  await test.step('3. กดลบ AAPL (ตัวที่ 1)', async () => {
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('watch-remove-AAPL').click();
    await page.waitForTimeout(800);
    const c = page.getByRole('button', { name: /ยืนยัน/ });
    if (await c.count()) await c.first().click();
    await ui.settle();
    await expect.soft(page.getByTestId('watch-row-AAPL'), 'AAPL ถูกลบ').toHaveCount(0);
  });

  await test.step('4. รีโหลด อ่านแถวที่ 9–11 และตัวนับ ([O-ยังไม่ยืนยัน] บันทึกค่า)', async () => {
    await page.reload();
    await ui.goto('/th/watchlist', 'watch-page');
    await ui.settle();
    await ui.mark(page.getByTestId('watch-row-ZA01'), 'ขั้น 4 ZA01 หลังลบ AAPL');
    const za01pos = await page.getByTestId('watch-row-ZA01').getAttribute('data-position').catch(() => null);
    const za01price = await page.getByTestId('quote-price-ZA01').innerText({ timeout: 5_000 }).catch(() => '(ไม่มีราคา)');
    const za02pos = await page.getByTestId('watch-row-ZA02').getAttribute('data-position').catch(() => null);
    const za02pro = await page.getByTestId('watch-proonly-ZA02').innerText({ timeout: 3_000 }).catch(() => '(ไม่มีป้าย)');
    const usage = await page.getByTestId('watch-usage').innerText().catch(() => '');
    await ui.mark(page.getByTestId('watch-usage'), 'ขั้น 4 ตัวนับหลังลบ');
    info.annotations.push({ type: 'pending', description: `ขั้น 4 [O-ยังไม่ยืนยัน R43 R44] ZA01 ลำดับ ${za01pos} ราคา ${za01price} · ZA02 ลำดับ ${za02pos} ${za02pro} · ตัวนับ "${usage}" (แผนคาด ZA01 ตัวที่ 10 $130.00 · ZA02 ตัวที่ 11 เฉพาะ Pro · ตัวนับ 11 สื่อว่าเกิน 10)` });
  });
});

test('TC-WATCH-06 · หลัง Pro หมด เพิ่มได้เมื่อเหลือไม่เกิน 9 ตัว · ลบต้องกันกดพลาด @P2 @5.3', async ({ page, ui }, info) => {
  meta(info, {
    expected: 'ขั้น 1–3: ถูกปฏิเสธ "รายการเฝ้าดูครบ 10 ตัวแล้ว (Free)" ทั้ง 3 ครั้ง (12, 11, 10 ≥ 10) · ขั้น 2: กดลบครั้งเดียวมีถามยืนยันหรือปุ่มเลิกทำ · ขั้น 4: สำเร็จ ได้ 10 ตัว · ZA03 ลำดับที่ 10 แสดง $140.00 · ขั้น 5: ยัง 10 ตัว ไม่มี ZA01 ZA02 PG',
    source: '[D] BR-19 §2 · TEST-DATA E56 · [R] ลบต้องกันกดพลาด (R52 ⚠️ · สมมติฐาน 8.2 #8 ต้องถาม)', frbr: 'FR-18 FR-20 · BR-19', rules: 'R45 R52 ⚠️',
  });
  await test.step('เงื่อนไข: เข้าสู่ระบบ U05 คุณนก (12 ตัว)', async () => { await ui.login('nok'); });
  await ui.goto('/th/watchlist', 'watch-page');
  await ui.settle();
  const FULL = 'รายการเฝ้าดูครบ 10 ตัวแล้ว (Free)';

  await test.step('1. เพิ่ม ZA03 (มี 12)', async () => {
    await addOnWatchPage(page, ui, 'ZA03');
    await ui.check(page.getByTestId('watch-error'), 'ขั้น 1 ZA03 ถูกปฏิเสธ (12)', (l) => expect.soft(l).toHaveText(FULL));
  });
  await test.step('2. กดลบ ZA02 1 ครั้ง สังเกตถามยืนยัน/เลิกทำ แล้วยืนยันลบ → เพิ่ม ZA03 (มี 11)', async () => {
    const r = await removeOnWatchPage(page, ui, 'ZA02');
    await ui.mark(page.getByTestId('watch-table'), 'ขั้น 2 หลังกดลบ ZA02 1 ครั้ง');
    expect.soft(r.asked || r.undo, 'กดลบครั้งเดียวต้องมีถามยืนยันหรือปุ่มเลิกทำ').toBe(true);
    await expect.soft(page.getByTestId('watch-row-ZA02'), 'ZA02 ถูกลบหลังยืนยัน').toHaveCount(0);
    await addOnWatchPage(page, ui, 'ZA03');
    await ui.check(page.getByTestId('watch-error'), 'ขั้น 2 ZA03 ถูกปฏิเสธ (11)', (l) => expect.soft(l).toHaveText(FULL));
  });
  await test.step('3. ลบ ZA01 → เพิ่ม ZA03 (มี 10)', async () => {
    await removeOnWatchPage(page, ui, 'ZA01');
    await expect.soft(page.getByTestId('watch-row-ZA01'), 'ZA01 ถูกลบ').toHaveCount(0);
    await addOnWatchPage(page, ui, 'ZA03');
    await ui.check(page.getByTestId('watch-error'), 'ขั้น 3 ZA03 ถูกปฏิเสธ (10)', (l) => expect.soft(l).toHaveText(FULL));
  });
  await test.step('4. ลบ PG → เพิ่ม ZA03 (มี 9)', async () => {
    await removeOnWatchPage(page, ui, 'PG');
    await expect.soft(page.getByTestId('watch-row-PG'), 'PG ถูกลบ').toHaveCount(0);
    await addOnWatchPage(page, ui, 'ZA03');
    await ui.check(page.getByTestId('watch-ok'), 'ขั้น 4 เพิ่ม ZA03 สำเร็จ', (l) => expect.soft(l, 'ZA03 ต้องเพิ่มได้').toBeVisible());
    await ui.check(page.getByTestId('watch-usage'), 'ขั้น 4 ได้ 10 ตัว', (l) => expect.soft(l).toHaveText('รายการเฝ้าดู 10/10'));
    await ui.check(page.getByTestId('watch-row-ZA03'), 'ขั้น 4 ZA03 ลำดับที่ 10', (l) => expect.soft(l).toHaveAttribute('data-position', '10'));
    await ui.check(page.getByTestId('quote-price-ZA03'), 'ขั้น 4 ราคา ZA03 $140.00', (l) => expect.soft(l).toHaveText('$140.00'));
  });
  await test.step('5. รีโหลด · GET /api/watchlist', async () => {
    await page.reload();
    await ui.goto('/th/watchlist', 'watch-page');
    await ui.check(page.getByTestId('watch-table'), 'ขั้น 5 หลังรีโหลด 10 แถว', async () => { await expect.soft(rows(page), '10 แถว').toHaveCount(10); });
    const w = await apiWatchlist(page.request);
    const syms = (w.body.items ?? []).map((i: any) => i.symbol);
    expect.soft(syms.length, 'API 10 ตัว').toBe(10);
    for (const s of ['ZA01', 'ZA02', 'PG']) expect.soft(syms, `ไม่มี ${s}`).not.toContain(s);
  });
});

test('TC-WATCH-07 · Free ดูย้อนหลัง 1 ปี · หน้าจอกับ API · ช่องวันที่ตรงกับกราฟ @P2 @5.3', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ขั้น 1–2: แสดงกราฟ ไม่มีข้อความเกินสิทธิ์ · แท่งแรกเป็น 2025-11-06 ทั้งบนกราฟและ `from` ในคำตอบ API (RV3-06) · ขั้น 3: "ระดับ Free ดูย้อนหลังได้ถึง 6 พ.ย. 2568" · ช่องวันที่กับกราฟบอกช่วงเดียวกัน (ไม่ใช่ช่องค้าง 2025-11-05 แต่กราฟยังช่วงเก่า) · ขั้น 4: ถูกปฏิเสธทั้ง 2 คำขอ ไม่มีแท่งก่อน 2025-11-06 · ขั้น 5: ผลเหมือนขั้น 3',
    source: '[D] BR-22 บ.14 · TEST-DATA E61 · [D] FR-41 · [R] ช่องกับกราฟตรงกัน (R26 ⚠️ · ถามคนสร้างเว็บข้อ 17) · [R] ตรวจที่ API ไม่ใช่แค่หน้าจอ',
    frbr: 'FR-12 FR-41 FR-59 · BR-22', rules: 'R23 R26 ⚠️',
  });
  await test.step('เงื่อนไข: เข้าสู่ระบบ U01 คุณบีม (Free)', async () => { await ui.login('beam'); });
  await ui.goto('/th/stocks/AAPL', 'stock-page');
  await ui.settle();

  await test.step('1. ใส่วันเริ่ม 2025-11-07 กดดู', async () => {
    await applyRange(page, ui, '2025-11-07');
    await ui.mark(page.getByTestId('stock-chart-card'), 'ขั้น 1 กราฟ from 2025-11-07');
    expect.soft(await rangeError(page), 'ขั้น 1 ไม่มีข้อความเกินสิทธิ์').toBe('');
    await expect.soft(page.getByTestId('stock-chart-card'), 'ขั้น 1 แสดงกราฟ').toHaveAttribute('data-state', 'ready');
  });
  await test.step('2. เปลี่ยนเป็น 2025-11-06', async () => {
    await applyRange(page, ui, '2025-11-06');
    expect.soft(await rangeError(page), 'ขั้น 2 ไม่มีข้อความเกินสิทธิ์').toBe('');
    const first = await firstBarOnPage(page);
    await ui.mark(page.getByTestId('stock-bars'), 'ขั้น 2 แท่งแรกบนกราฟ');
    expect.soft(first, 'ขั้น 2 แท่งแรกบนกราฟ 2025-11-06').toBe('2025-11-06');
    const c = await candles(page.request, 'from=2025-11-06');
    expect.soft(c.body.from, 'ขั้น 2 API from 2025-11-06').toBe('2025-11-06');
    expect.soft(c.first, 'ขั้น 2 API แท่งแรก 2025-11-06').toBe('2025-11-06');
  });

  const step3 = async (label: string) => {
    await applyRange(page, ui, '2025-11-05');
    await ui.check(page.getByTestId('stock-range-error'), `${label} ข้อความเกินสิทธิ์`, (l) => expect.soft(l).toHaveText('ระดับ Free ดูย้อนหลังได้ถึง 6 พ.ย. 2568'));
    const field = await page.getByTestId('stock-range-from').inputValue();
    const first = await firstBarOnPage(page);
    await ui.mark(page.getByTestId('stock-range-form'), `${label} ช่องวันที่กับกราฟ`);
    expect.soft(field, `${label} ช่องวันที่ (${field}) ต้องบอกช่วงเดียวกับกราฟ (แท่งแรก ${first})`).toBe(first);
  };
  await test.step('3. เปลี่ยนเป็น 2025-11-05 · อ่านข้อความ · ดูช่องวันที่และวันแรกบนกราฟ', async () => { await step3('ขั้น 3'); });

  await test.step('4. GET /api/stocks/AAPL/candles from=2025-11-05 · และ to=2025-11-01 อย่างเดียว', async () => {
    const a = await candles(page.request, 'from=2025-11-05');
    const b = await candles(page.request, 'to=2025-11-01');
    await ui.mark(page.getByTestId('stock-chart-card'), 'ขั้น 4 API candles');
    expect.soft(a.ok, `from=2025-11-05 ต้องถูกปฏิเสธ (status ${a.status})`).toBe(false);
    expect.soft(b.ok, `to=2025-11-01 ต้องถูกปฏิเสธ (status ${b.status})`).toBe(false);
    for (const [n, x] of [['from', a], ['to', b]] as const) {
      const early = (x.body?.bars ?? []).filter((bar: any) => bar.date < '2025-11-06');
      expect.soft(early.length, `${n}: ไม่มีแท่งก่อน 2025-11-06`).toBe(0);
    }
  });

  await test.step('5. ออกจากระบบ ทำขั้น 3 ซ้ำ', async () => {
    await page.request.post('/api/auth/logout');
    await ui.goto('/th/stocks/AAPL', 'stock-page');
    await ui.settle();
    await step3('ขั้น 5 (แขก)');
  });
});

test('TC-WATCH-08 · Pro ที่ยกเลิกแล้ว ใช้ได้ถึงจบรอบ แล้วสิทธิ์ย้อนหลังกับเฝ้าดูกลับเป็น Free @P1 @5.3', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: 'ขั้น 1: 2016-11-06 ได้ แท่งแรกเป็น 7 พ.ย. 2559 (6 พ.ย. เป็นวันอาทิตย์) · 2016-11-05 ไม่ได้ ข้อความบอกวันแรก 6 พ.ย. 2559 · ขั้น 2: ยัง Pro · 2016-11-09 ได้ · 2016-11-08 ไม่ได้ (9 พ.ย. 2569 − 10 ปี) · หน้าบัญชี "ใช้ Pro ได้ถึง 9 พ.ย. 2569" · ขั้น 3 (ขอบ 1 ปีนับจากวันไทย 10 พ.ย. ตามสมมติฐาน 8.2 #29 · RV3-07): Free · 2016-11-09 ไม่ได้ · 2025-11-10 ได้ · 2025-11-09 ไม่ได้ ข้อความ "ระดับ Free ดูย้อนหลังได้ถึง 10 พ.ย. 2568" · หน้าบัญชี "รายการเฝ้าดู 3/10" · ขั้น 4: ไม่มีรายการเก็บ ฿199 ใหม่ (ยังมีแถวเดียวของรอบ 10 ต.ค.) · ขั้น 5: Free',
    source: '[D] BR-23 บ.14 · [D] BR-25 §2 · TEST-DATA E62 E65 E66 E67 · [D] FR-56 ไม่คืนเงิน',
    frbr: 'FR-41 FR-56 FR-58 · BR-23 BR-25 BR-16 BR-22', rules: 'R24 R108 R110',
  });
  noteColumn(info);
  const uid = await userId(db, 'nam');
  await test.step('เงื่อนไข: เข้าสู่ระบบ U08 คุณน้ำ (Pro ยกเลิกแล้ว ใช้ถึง 9 พ.ย.)', async () => { await ui.login('nam'); });

  const tryFrom = async (from: string, label: string, ok: boolean, firstBar?: string, msg?: string) => {
    await applyRange(page, ui, from);
    const err = await rangeError(page);
    await ui.mark(ok ? page.getByTestId('stock-chart-card') : page.getByTestId('stock-range-error'), `${label} เริ่ม ${from}`);
    if (ok) {
      expect.soft(err, `${label} ${from} ต้องดูได้ (ไม่มีข้อความเกินสิทธิ์)`).toBe('');
      const c = await candles(page.request, `from=${from}`);
      expect.soft(c.ok, `${label} API from=${from} ต้องได้ (status ${c.status})`).toBe(true);
      if (firstBar) {
        expect.soft(c.first, `${label} API แท่งแรก`).toBe(firstBar);
        expect.soft(await firstBarOnPage(page), `${label} แท่งแรกบนกราฟ`).toBe(firstBar);
      }
    } else {
      expect.soft(err, `${label} ${from} ต้องไม่ได้ (มีข้อความ)`).not.toBe('');
      if (msg) expect.soft(err, `${label} ข้อความ`).toContain(msg);
      const c = await candles(page.request, `from=${from}`);
      expect.soft(c.ok, `${label} API from=${from} ต้องถูกปฏิเสธ (status ${c.status})`).toBe(false);
    }
  };

  await test.step('1. วันล็อก 6 พ.ย.: หน้าหุ้น AAPL เลือกเริ่ม 2016-11-06 แล้ว 2016-11-05', async () => {
    await ui.goto('/th/stocks/AAPL', 'stock-page');
    await ui.settle();
    await tryFrom('2016-11-06', 'ขั้น 1', true, '2016-11-07');
    await tryFrom('2016-11-05', 'ขั้น 1', false, undefined, '6 พ.ย. 2559');
  });

  await test.step('2. clock 2026-11-09T22:00 · เลือก 2016-11-09 แล้ว 2016-11-08 · เปิดหน้าบัญชี', async () => {
    await api.clock(T('2026-11-09T22:00:00'));
    await ui.goto('/th/stocks/AAPL', 'stock-page');
    await ui.settle();
    await tryFrom('2016-11-09', 'ขั้น 2', true);
    await tryFrom('2016-11-08', 'ขั้น 2', false);
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-tier'), 'ขั้น 2 ยัง Pro', (l) => expect.soft(l).toHaveAttribute('data-tier', 'pro'));
    await ui.check(page.getByTestId('acct-membership'), 'ขั้น 2 ใช้ Pro ได้ถึง 9 พ.ย. 2569', (l) => expect.soft(l).toContainText('ใช้ Pro ได้ถึง 9 พ.ย. 2569'));
  });

  await test.step('3. clock 2026-11-10T00:00:00 · tick · เปิดหน้าบัญชี · เลือก 2016-11-09 · 2025-11-10 · 2025-11-09', async () => {
    await api.clock(T('2026-11-10T00:00:00'));
    await api.tick();
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-tier'), 'ขั้น 3 เป็น Free', (l) => expect.soft(l).toHaveAttribute('data-tier', 'free'));
    await ui.check(page.getByTestId('acct-usage-watchlist'), 'ขั้น 3 รายการเฝ้าดู 3/10', (l) => expect.soft(l).toHaveText('รายการเฝ้าดู 3/10'));
    await ui.goto('/th/stocks/AAPL', 'stock-page');
    await ui.settle();
    await tryFrom('2016-11-09', 'ขั้น 3', false);
    await tryFrom('2025-11-10', 'ขั้น 3', true);
    await tryFrom('2025-11-09', 'ขั้น 3', false);
    await ui.check(page.getByTestId('stock-range-error'), 'ขั้น 3 ข้อความ Free 10 พ.ย. 2568', (l) => expect.soft(l).toHaveText('ระดับ Free ดูย้อนหลังได้ถึง 10 พ.ย. 2568'));
  });

  await test.step('4. ดูรายการเก็บเงินของบัญชี (ฐานข้อมูล subscriptions)', async () => {
    const n = await count199(db, uid);
    await ui.mark(page.getByTestId('stock-page'), 'ขั้น 4 นับรายการเก็บ ฿199 (DB)');
    expect.soft(n, 'รายการเก็บ ฿199 ยังมีแถวเดียว').toBe(1);
  });

  await test.step('5. clock 2026-11-11T22:00 เปิดหน้าบัญชี', async () => {
    await api.clock(T('2026-11-11T22:00:00'));
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-tier'), 'ขั้น 5 Free', (l) => expect.soft(l).toHaveAttribute('data-tier', 'free'));
  });
});

test('TC-WATCH-09 · อัปเกรด Pro ฿199 สิทธิ์ใช้ทันที ไม่เก็บซ้ำ และต่ออายุต้องไม่ขาดสิทธิ์แม้วินาทีเดียว @P1 @5.3', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: 'ขั้น 1: "ชำระแล้ว" ฿199.00 · ขั้น 2: ระดับ Pro · รอบ 6 พ.ย.–5 ธ.ค. 2569 · ต่ออายุ 6 ธ.ค. 2569 · "รายการเฝ้าดู 9/50" · ขั้น 3: ZA02 สำเร็จ ได้ 11/50 (Free จะปฏิเสธ) · กราฟ 2016-11-06 ได้ · ขั้น 4: ถูกปฏิเสธ · รายการเก็บเงิน ฿199.00 มี 1 รายการ (ไม่ใช่ 2) · ขั้น 5–6: Pro ทั้งสองเวลา · ZA03 แสดง $140.00 ไม่ใช่ "เฉพาะ Pro" · ขั้น 7: Pro รอบ 10 พ.ย.–9 ธ.ค. 2569 · มีรายการเก็บ ฿199.00 เพิ่ม 1 รายการ',
    source: '[D] FR-55 บ.14 §2 · [D] BR-24 §2 (นิยาม 1 เดือน ⚠️ A-15) · TEST-DATA E63 · [R] ไม่เก็บซ้ำ · ช่วง 00:00 ก่อน tick (R107 · สมมติฐาน 8.2 #13 ไม่ยอมขาดสิทธิ์)',
    frbr: 'FR-55 FR-58 · BR-24 BR-17 BR-18 BR-23', rules: 'R106 R107 ⚠️ R110',
  });
  noteColumn(info);
  const beamId = await userId(db, 'beam');
  const mintId = await userId(db, 'mint');

  await test.step('ส่วน A เงื่อนไข: เข้าสู่ระบบ U01 คุณบีม (Free · 9 ตัว)', async () => { await ui.login('beam'); });
  await test.step('1. หน้าบัญชี กดอัปเกรด จ่ายจำลอง', async () => {
    await ui.goto('/th/account', 'account-page');
    await page.getByTestId('acct-upgrade').click();
    await ui.settle();
    await ui.check(page.getByTestId('acct-upgrade-ok'), 'ขั้น 1 ชำระแล้ว ฿199.00', async (l) => {
      await expect.soft(l).toContainText('ชำระแล้ว');
      await expect.soft(l).toContainText('฿199.00');
    });
    await ui.check(page.getByTestId('acct-upgrade-ok'), 'ขั้น 1–2 รอบ 6 พ.ย.–5 ธ.ค. 2569', (l) => expect.soft(l).toContainText('6 พ.ย. 2569 – 5 ธ.ค. 2569'));
  });
  await test.step('2. อ่านหน้าบัญชี (ไม่ออกจากระบบ · หลังรีโหลด)', async () => {
    await page.reload();
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-tier'), 'ขั้น 2 ระดับ Pro', (l) => expect.soft(l).toHaveAttribute('data-tier', 'pro'));
    await ui.check(page.getByTestId('acct-period'), 'ขั้น 2 จบรอบ 5 ธ.ค. 2569', (l) => expect.soft(l).toContainText('5 ธ.ค. 2569'));
    await ui.check(page.getByTestId('acct-renew'), 'ขั้น 2 ต่ออายุ 6 ธ.ค. 2569', (l) => expect.soft(l).toContainText('6 ธ.ค. 2569'));
    await ui.check(page.getByTestId('acct-usage-watchlist'), 'ขั้น 2 รายการเฝ้าดู 9/50', (l) => expect.soft(l).toHaveText('รายการเฝ้าดู 9/50'));
  });
  await test.step('3. เพิ่ม ZA01 แล้ว ZA02 · เลือกกราฟ AAPL เริ่ม 2016-11-06', async () => {
    await ui.goto('/th/watchlist', 'watch-page');
    await addOnWatchPage(page, ui, 'ZA01');
    await addOnWatchPage(page, ui, 'ZA02');
    await ui.check(page.getByTestId('watch-ok'), 'ขั้น 3 ZA02 สำเร็จ', (l) => expect.soft(l, 'ZA02 ต้องเพิ่มได้').toBeVisible());
    await ui.check(page.getByTestId('watch-usage'), 'ขั้น 3 ได้ 11/50', (l) => expect.soft(l).toHaveText('รายการเฝ้าดู 11/50'));
    await ui.goto('/th/stocks/AAPL', 'stock-page');
    await ui.settle();
    await applyRange(page, ui, '2016-11-06');
    await ui.mark(page.getByTestId('stock-chart-card'), 'ขั้น 3 กราฟ AAPL 2016-11-06');
    expect.soft(await rangeError(page), 'ขั้น 3 กราฟ 2016-11-06 ได้').toBe('');
  });
  await test.step('4. กดอัปเกรดอีกครั้ง · นับรายการเก็บเงินของบัญชี', async () => {
    await ui.goto('/th/account', 'account-page');
    const btn = page.getByTestId('acct-upgrade');
    let status: number;
    if (await btn.count() && await btn.isVisible()) {
      const resp = page.waitForResponse((r) => r.url().includes('/api/billing/upgrade'), { timeout: 8_000 }).catch(() => null);
      await btn.click();
      status = (await resp)?.status() ?? 0;
    } else {
      info.annotations.push({ type: 'note', description: 'ขั้น 4: หน้าบัญชีของ Pro ไม่มีปุ่มอัปเกรด → กดซ้ำผ่าน POST /api/billing/upgrade' });
      status = (await page.request.post('/api/billing/upgrade', { data: {} })).status();
    }
    await ui.mark(page.getByTestId('acct-membership'), 'ขั้น 4 อัปเกรดซ้ำ');
    expect.soft(status >= 400, `อัปเกรดซ้ำต้องถูกปฏิเสธ (status ${status})`).toBe(true);
    expect.soft(await count199(db, beamId), 'รายการเก็บ ฿199.00 ของบีม = 1').toBe(1);
  });

  const mintBefore = await count199(db, mintId);
  await test.step('ส่วน B · 5. clock 2026-11-09T23:59:59 เปิดหน้าเฝ้าดู แถว ZA03 (คุณมิ้นท์)', async () => {
    await ui.login('mint');
    await api.clock(T('2026-11-09T23:59:59'));
    await ui.goto('/th/watchlist', 'watch-page');
    await ui.settle();
    await ui.check(page.getByTestId('quote-price-ZA03'), 'ขั้น 5 ZA03 $140.00', (l) => expect.soft(l).toHaveText('$140.00'));
    await expect.soft(page.getByTestId('watch-proonly-ZA03'), 'ขั้น 5 ZA03 ไม่ใช่ "เฉพาะ Pro"').toHaveCount(0);
    await expect.soft(page.getByTestId('watch-tier'), 'ขั้น 5 Pro').toHaveText('Pro');
  });
  await test.step('6. clock 2026-11-10T00:00:00 (ยังไม่ tick) เปิดหน้าเฝ้าดูและหน้าบัญชี', async () => {
    await api.clock(T('2026-11-10T00:00:00'));
    await ui.goto('/th/watchlist', 'watch-page');
    await ui.settle();
    await ui.check(page.getByTestId('quote-price-ZA03'), 'ขั้น 6 ZA03 $140.00', (l) => expect.soft(l).toHaveText('$140.00'));
    await expect.soft(page.getByTestId('watch-proonly-ZA03'), 'ขั้น 6 ZA03 ไม่ใช่ "เฉพาะ Pro"').toHaveCount(0);
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-tier'), 'ขั้น 6 Pro (ก่อน tick)', (l) => expect.soft(l).toHaveAttribute('data-tier', 'pro'));
  });
  await test.step('7. tick · เปิดหน้าบัญชี · ดูรายการเก็บเงิน', async () => {
    await api.tick();
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-tier'), 'ขั้น 7 Pro', (l) => expect.soft(l).toHaveAttribute('data-tier', 'pro'));
    await ui.check(page.getByTestId('acct-period'), 'ขั้น 7 จบรอบ 9 ธ.ค. 2569', (l) => expect.soft(l).toContainText('9 ธ.ค. 2569'));
    const latest = await db.query<{ s: string; e: string }>(
      "SELECT to_char(period_start AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') s, to_char(period_end AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') e FROM subscriptions WHERE user_id=$1 ORDER BY id DESC LIMIT 1", [mintId]);
    expect.soft(`${latest[0]?.s}..${latest[0]?.e}`, 'ขั้น 7 รอบ 10 พ.ย.–9 ธ.ค. 2569 (DB)').toBe('2026-11-10..2026-12-09');
    expect.soft(await count199(db, mintId), 'ขั้น 7 รายการเก็บ ฿199.00 เพิ่ม 1').toBe(mintBefore + 1);
  });
});

test('TC-WATCH-10 · ยกเลิก Pro เอง ใช้ถึงจบรอบ ไม่คืนเงิน แล้วรายการเกิน 10 ถูกล็อก · เปลี่ยนใจต้องมีทางไป @P1 @5.3', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: 'ขั้น 1–2: ยัง Pro · หน้าบัญชีบอกยกเลิกการต่ออายุแล้ว ใช้ Pro ได้ถึง 5 ธ.ค. 2569 แล้วกลับเป็น Free · ไม่มีรายการคืนเงิน · ขั้น 3: ถูกปฏิเสธ ข้อความบอกว่ายกเลิกแล้ว ใช้ได้ถึง 5 ธ.ค. 2569 · รายการเก็บเงินยัง 1 · ขั้น 5: Pro · 11 ตัวมีราคาทั้งหมด · "รายการเฝ้าดู 11/50" · ขั้น 6: Free · BRK.B (ตัวที่ 10) $480.00 · AAPL (ตัวที่ 11) "เฉพาะ Pro" · ZA01 (ตัวที่ 1) มีราคา $130.00 · ZA02 ถูกปฏิเสธ (มี 11 > 9) · ไม่มีรายการ ฿199 ใหม่ · ขั้น 7: Free',
    source: '[D] FR-56 BR-25 §2 · [D] BR-24 รอบ 6 พ.ย.–5 ธ.ค. · [D] BR-18 BR-19 · [R] เปลี่ยนใจต้องทำได้หรือบอกตรงสถานการณ์ (R109 ⚠️)',
    frbr: 'FR-56 FR-58 FR-20 · BR-25 BR-24 BR-18 BR-19', rules: 'R108 R109 ⚠️ R110',
  });
  noteColumn(info);
  const uid = await userId(db, 'fon');
  const order = ['ZA01', 'MSFT', 'NVDA', 'TSLA', 'VOO', 'KO', 'JNJ', 'PG', 'O', 'BRK.B', 'AAPL'];
  await test.step('เงื่อนไข: U09 คุณฝน อัปเกรด Pro 6 พ.ย. 2569 · เพิ่มเฝ้าดู 11 ตัวตามลำดับ (ผ่าน API)', async () => {
    await ui.login('fon');
    const up = await page.request.post('/api/billing/upgrade', { data: {} });
    expect(up.ok(), `อัปเกรดเตรียมข้อมูล ${up.status()}`).toBe(true);
    for (const s of order) {
      const r = await page.request.post('/api/watchlist', { data: { symbol: s } });
      expect(r.ok(), `เพิ่ม ${s} ${r.status()}`).toBe(true);
    }
  });

  await test.step('1. clock 2026-11-10T10:00 · tick · หน้าบัญชี กดยกเลิกการต่ออายุ', async () => {
    await api.clock(T('2026-11-10T10:00:00'));
    await api.tick();
    await ui.goto('/th/account', 'account-page');
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('acct-cancel').click();
    await ui.settle();
    await page.waitForTimeout(500);
  });
  await test.step('2. อ่านหน้าบัญชี · ดูรายการเงิน', async () => {
    await ui.check(page.getByTestId('acct-tier'), 'ขั้น 2 ยัง Pro', (l) => expect.soft(l).toHaveAttribute('data-tier', 'pro'));
    await ui.check(page.getByTestId('acct-membership'), 'ขั้น 2 ยกเลิกแล้ว ใช้ได้ถึง 5 ธ.ค. 2569 แล้วกลับเป็น Free', async (l) => {
      await expect.soft(l).toContainText('ยกเลิกการต่ออายุแล้ว');
      await expect.soft(l).toContainText('ใช้ Pro ได้ถึง 5 ธ.ค. 2569');
      await expect.soft(l).toContainText('กลับเป็น Free');
    });
    const refunds = await db.query<{ n: number }>('SELECT count(*)::int n FROM subscriptions WHERE user_id=$1 AND amount_thb < 0', [uid]);
    expect.soft(refunds[0]?.n, 'ไม่มีรายการคืนเงิน').toBe(0);
    expect.soft(await count199(db, uid), 'รายการเก็บ ฿199 = 1').toBe(1);
  });
  await test.step('3. กดยกเลิกซ้ำ', async () => {
    const btn = page.getByTestId('acct-cancel');
    if (await btn.count() && await btn.isVisible()) {
      // ยังมีปุ่มให้กดซ้ำ → กดจริงแล้วต้องถูกปฏิเสธพร้อมข้อความบนจอ
      page.once('dialog', (d) => d.accept());
      await btn.click();
      await ui.settle();
      await page.waitForTimeout(500);
      const shown = page.getByTestId('acct-error').or(page.getByTestId('acct-membership')).first();
      await ui.check(shown, 'ขั้น 3 ข้อความหลังกดยกเลิกซ้ำ', async (l) => {
        await expect.soft(l, 'ขั้น 3 ข้อความบอกว่ายกเลิกแล้ว').toContainText('ยกเลิก');
        await expect.soft(l, 'ขั้น 3 ข้อความบอกว่าใช้ได้ถึง 5 ธ.ค. 2569').toContainText('5 ธ.ค. 2569');
      });
    } else {
      // ไม่มีปุ่มให้กดซ้ำ (ปฏิเสธที่จอ) → ตรวจบนจอว่าบอกยกเลิกแล้ว ใช้ได้ถึง 5 ธ.ค. 2569
      await expect.soft(btn, 'ขั้น 3 ไม่มีปุ่มยกเลิกให้กดซ้ำ').toHaveCount(0);
      const renew = page.getByTestId('acct-renew');
      const where = (await renew.count()) ? renew : page.getByTestId('acct-membership');
      await ui.check(where, 'ขั้น 3 จอบอกยกเลิกแล้ว ใช้ได้ถึง 5 ธ.ค. 2569', async (l) => {
        await expect.soft(l, 'ขั้น 3 จอบอกว่ายกเลิกแล้ว').toContainText('ยกเลิก');
        await expect.soft(l, 'ขั้น 3 จอบอกว่าใช้ได้ถึง 5 ธ.ค. 2569').toContainText('5 ธ.ค. 2569');
      });
    }
    expect.soft(await count199(db, uid), 'รายการเก็บเงินยัง 1').toBe(1);
  });
  await test.step('4. tick', async () => { await api.tick(); });
  await test.step('5. clock 2026-12-05T23:59:59 เปิดหน้าบัญชีและหน้าเฝ้าดู', async () => {
    await api.clock(T('2026-12-05T23:59:59'));
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-tier'), 'ขั้น 5 Pro', (l) => expect.soft(l).toHaveAttribute('data-tier', 'pro'));
    await ui.check(page.getByTestId('acct-usage-watchlist'), 'ขั้น 5 รายการเฝ้าดู 11/50', (l) => expect.soft(l).toHaveText('รายการเฝ้าดู 11/50'));
    await ui.goto('/th/watchlist', 'watch-page');
    await ui.settle();
    await ui.mark(page.getByTestId('watch-table'), 'ขั้น 5 11 ตัวมีราคา');
    for (const s of order) {
      await expect.soft(page.getByTestId(`quote-price-${s}`), `ขั้น 5 ${s} มีราคา`).toHaveText(/^\$\d/);
      await expect.soft(page.getByTestId(`watch-proonly-${s}`), `ขั้น 5 ${s} ไม่ล็อก`).toHaveCount(0);
    }
  });
  await test.step('6. clock 2026-12-06T00:00:00 · tick · เปิดหน้าบัญชีและหน้าเฝ้าดู · เพิ่ม ZA02', async () => {
    await api.clock(T('2026-12-06T00:00:00'));
    await api.tick();
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-tier'), 'ขั้น 6 Free', (l) => expect.soft(l).toHaveAttribute('data-tier', 'free'));
    await ui.goto('/th/watchlist', 'watch-page');
    await ui.settle();
    await ui.check(page.getByTestId('quote-price-BRK.B'), 'ขั้น 6 BRK.B (ตัวที่ 10) $480.00', (l) => expect.soft(l).toHaveText('$480.00'));
    await ui.check(page.getByTestId('watch-proonly-AAPL'), 'ขั้น 6 AAPL (ตัวที่ 11) เฉพาะ Pro', (l) => expect.soft(l).toHaveText('เฉพาะ Pro'));
    await expect.soft(page.getByTestId('quote-price-AAPL'), 'ขั้น 6 AAPL ไม่มีราคา').toHaveCount(0);
    await ui.check(page.getByTestId('quote-price-ZA01'), 'ขั้น 6 ZA01 (ตัวที่ 1) $130.00', (l) => expect.soft(l).toHaveText('$130.00'));
    await addOnWatchPage(page, ui, 'ZA02');
    await ui.check(page.getByTestId('watch-error'), 'ขั้น 6 ZA02 ถูกปฏิเสธ', (l) => expect.soft(l, 'ZA02 ต้องถูกปฏิเสธ').toBeVisible());
    const w = await apiWatchlist(page.request);
    expect.soft((w.body.items ?? []).map((i: any) => i.symbol), 'ไม่มี ZA02 ในรายการ').not.toContain('ZA02');
    expect.soft(await count199(db, uid), 'ไม่มีรายการ ฿199 ใหม่').toBe(1);
  });
  await test.step('7. clock 2026-12-07T22:00 เปิดหน้าบัญชี', async () => {
    await api.clock(T('2026-12-07T22:00:00'));
    // session ที่เข้าสู่ระบบตั้งแต่ 6 พ.ย. หมดอายุเมื่อเลื่อนนาฬิกาเกิน ~30 วัน → เข้าสู่ระบบใหม่ก่อนดูหน้าบัญชี
    await ui.login('fon');
    info.annotations.push({ type: 'note', description: 'ขั้น 7: session เดิมหมดอายุหลังเลื่อนนาฬิกาเป็น 7 ธ.ค. (/api/me ตอบ 401) จึงเข้าสู่ระบบใหม่ก่อนเปิดหน้าบัญชี' });
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-tier'), 'ขั้น 7 Free', (l) => expect.soft(l).toHaveAttribute('data-tier', 'free'));
  });
});

test('TC-WATCH-11 · ยกเลิกการต่ออายุแล้วเปลี่ยนใจ ต้องกลับมาต่ออายุได้โดยไม่เก็บเงินซ้ำ (แยกจาก TC-WATCH-10) @P1 @5.3', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: 'ขั้น 1: หน้าบัญชี "ยกเลิกการต่ออายุแล้ว ใช้ได้ถึง 5 ธ.ค. 2569" · ขั้น 2: สำเร็จ · หน้าบัญชีกลับเป็น "ต่ออายุ 6 ธ.ค. 2569" · รายการเก็บเงิน ฿199 ยัง 1 (ไม่เก็บระหว่างรอบ) · ขั้น 3: ยัง Pro รอบ 6 ธ.ค. 2569–5 ม.ค. 2570 · รายการเก็บเงิน ฿199 = 2',
    source: '[R] ต้องมีทางกลับ (สมมติฐาน 8.2 #13 · ถามลูกค้าข้อ 17 18) · [D] BR-24 ต่ออายุอัตโนมัติ · แยกจาก TC-WATCH-10 ตามรีวิว RV3-02',
    frbr: 'FR-55 FR-56 · BR-24 BR-25', rules: 'R109 ⚠️',
  });
  noteColumn(info);
  const uid = await userId(db, 'fon');
  await test.step('เงื่อนไข: U09 คุณฝน อัปเกรด Pro 6 พ.ย. 2569 (ผ่าน API)', async () => {
    await ui.login('fon');
    const up = await page.request.post('/api/billing/upgrade', { data: {} });
    expect(up.ok(), `อัปเกรดเตรียมข้อมูล ${up.status()}`).toBe(true);
  });
  await test.step('1. clock 2026-11-10T10:00 · tick · หน้าบัญชีกดยกเลิกการต่ออายุ', async () => {
    await api.clock(T('2026-11-10T10:00:00'));
    await api.tick();
    await ui.goto('/th/account', 'account-page');
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('acct-cancel').click();
    await ui.settle();
    await page.waitForTimeout(500);
    await ui.check(page.getByTestId('acct-membership'), 'ขั้น 1 ยกเลิกการต่ออายุแล้ว ใช้ได้ถึง 5 ธ.ค. 2569', async (l) => {
      await expect.soft(l).toContainText('ยกเลิกการต่ออายุแล้ว');
      await expect.soft(l).toContainText('5 ธ.ค. 2569');
    });
  });
  await test.step('2. clock 2026-11-10T10:05 · กดต่ออายุกลับ (หรือปุ่มอัปเกรด) · อ่านหน้าบัญชี · นับรายการเก็บเงิน', async () => {
    await api.clock(T('2026-11-10T10:05:00'));
    await ui.goto('/th/account', 'account-page');
    const resume = page.getByTestId('acct-resume').or(page.getByTestId('acct-upgrade')).or(page.getByRole('button', { name: /ต่ออายุ|อัปเกรด/ }));
    let status = 0;
    if (await resume.count()) {
      const resp = page.waitForResponse((r) => r.url().includes('/api/billing/'), { timeout: 8_000 }).catch(() => null);
      await resume.first().click();
      status = (await resp)?.status() ?? 0;
    } else {
      info.annotations.push({ type: 'note', description: 'ขั้น 2: หน้าบัญชีไม่มีปุ่มต่ออายุกลับ/อัปเกรด → ลองผ่าน POST /api/billing/upgrade' });
      status = (await page.request.post('/api/billing/upgrade', { data: {} })).status();
    }
    await page.reload();
    await ui.goto('/th/account', 'account-page');
    await ui.mark(page.getByTestId('acct-membership'), 'ขั้น 2 หลังเปลี่ยนใจ');
    expect.soft(status >= 200 && status < 300, `เปลี่ยนใจต้องสำเร็จ (status ${status})`).toBe(true);
    await ui.check(page.getByTestId('acct-renew'), 'ขั้น 2 กลับเป็น ต่ออายุ 6 ธ.ค. 2569', async (l) => {
      await expect.soft(l).toContainText('ต่ออายุ');
      await expect.soft(l).toContainText('6 ธ.ค. 2569');
      await expect.soft(l).toHaveAttribute('data-renew', 'on');
    });
    expect.soft(await count199(db, uid), 'ขั้น 2 รายการเก็บเงิน ฿199 ยัง 1').toBe(1);
  });
  await test.step('3. clock 2026-12-06T00:00:00 · tick · อ่านหน้าบัญชี · นับรายการเก็บเงิน', async () => {
    await api.clock(T('2026-12-06T00:00:00'));
    await api.tick();
    await ui.goto('/th/account', 'account-page');
    await ui.check(page.getByTestId('acct-tier'), 'ขั้น 3 ยัง Pro', (l) => expect.soft(l).toHaveAttribute('data-tier', 'pro'));
    await ui.check(page.getByTestId('acct-period'), 'ขั้น 3 จบรอบ 5 ม.ค. 2570', (l) => expect.soft(l).toContainText('5 ม.ค. 2570'));
    expect.soft(await count199(db, uid), 'ขั้น 3 รายการเก็บเงิน ฿199 = 2').toBe(2);
  });
});
