// หัวข้อ 5.4 · แจ้งเตือน ช่วงเงียบ กล่องแจ้งเตือน และอีเมล (TEST-PLAN บรรทัด 871–1124)
import { test, expect, meta, LOCK, type Api, type Db } from '../fixtures/pordee';
import type { APIRequestContext, Page, TestInfo } from '@playwright/test';

const PLOY = 'ploy@pordee.test';
const BEAM = 'beam@pordee.test';

// ---------- ตัวช่วย ----------

/** นาฬิกาเว็บ: จำเวลาปัจจุบันไว้เพื่อเลื่อน +2 นาทีระหว่างรอบตรวจ (RV4-01) */
function mkClock(api: Api, start = LOCK) {
  let t = Date.parse(start);
  return {
    set: async (iso: string) => { t = Date.parse(iso); await api.clock(iso); },
    plus2: async () => { t += 120_000; await api.clock(new Date(t).toISOString()); },
    reset: async (iso?: string) => { t = Date.parse(iso ?? LOCK); await api.reset(iso); },
  };
}

/** รอบตรวจ: feed (clearCache) → GET ให้ราคาเข้าที่พัก → tick · ตรวจว่ารอบนี้ "ใช้ได้" ตามข้อ 5 ของวิธีทำให้เกิดแจ้งเตือน */
async function round(api: Api, info: TestInfo, sym: string, price: string, label: string) {
  await api.feed({ symbol: sym, mode: 'price', price, clearCache: true });
  const r = await api.guest.get(`/api/stocks/${sym}`);
  const j = await r.json().catch(() => ({}));
  const got = j?.quote?.price;
  const t = await api.tick();
  const res = t?.jobs?.find((x: any) => x.name === 'alerts')?.result ?? {};
  const inSymbols = Array.isArray(res.symbols) ? res.symbols.includes(sym) : typeof res.symbols === 'number' && res.symbols > 0;
  const stale = Array.isArray(res.staleSymbols) && res.staleSymbols.includes(sym);
  const ok = got !== undefined && Number(got) === Number(price) && inSymbols && !stale;
  info.annotations.push({ type: 'round', description: `${label}: ${sym} feed ${price} · GET ${got} · tick ${JSON.stringify({ symbols: res.symbols, stale, fired: res.fired, emailed: res.emailed, quiet: res.quiet, skipped: res.skipped })}` });
  expect.soft(ok, `${label}: รอบตรวจต้องใช้ได้ (GET ${sym} = ${price} และไม่อยู่ใน staleSymbols) · ได้ GET=${got} stale=${stale} skipped=${res.skipped ?? '-'}`).toBe(true);
  return res;
}

async function inbox(ctx: APIRequestContext, sym?: string) {
  const j = await (await ctx.get('/api/inbox')).json().catch(() => ({}));
  const items: any[] = j.items ?? [];
  return { items: sym ? items.filter((i) => i.symbol === sym) : items, unread: j.unread };
}
async function outboxTo(ctx: APIRequestContext, email: string) {
  const j = await (await ctx.get('/api/outbox')).json().catch(() => ({}));
  return ((j.items ?? []) as any[]).filter((i) => i.toEmail === email);
}
async function alertsOf(ctx: APIRequestContext) {
  return (await (await ctx.get('/api/alerts')).json().catch(() => ({}))) as { items: any[]; used: number; limit: number };
}
async function emptyAfterReset(db: Db, label = 'หลัง reset') {
  const [a] = await db.query<{ n: string }>('select count(*)::text n from alert_events');
  const [e] = await db.query<{ n: string }>('select count(*)::text n from email_outbox');
  expect.soft(a.n, `${label}: alert_events ว่าง`).toBe('0');
  expect.soft(e.n, `${label}: email_outbox ว่าง`).toBe('0');
}
async function allEmails(db: Db) {
  return db.query<{ to_email: string; subject: string }>('select to_email, subject from email_outbox order by id');
}
const norm = (s: string | null | undefined) => (s ?? '').replace(/−/g, '-');

/** ตั้งแจ้งเตือนผ่านฟอร์มหน้า /alerts · คืน status ของ POST /api/alerts */
async function addAlertUi(page: Page, sym: string, kind: 'pct' | 'target', target?: string) {
  await page.getByTestId('alert-symbol-input').fill(sym);
  await page.getByTestId(kind === 'pct' ? 'alert-kind-pct' : 'alert-kind-target').click();
  if (target !== undefined) await page.getByTestId('alert-target-input').fill(target);
  const resp = page.waitForResponse((r) => r.url().includes('/api/alerts') && r.request().method() === 'POST', { timeout: 10_000 }).catch(() => null);
  await page.getByTestId('alert-add-btn').click();
  const r = await resp;
  await page.waitForTimeout(500);
  return r?.status() ?? 0;
}

const inboxItems = (page: Page) => page.locator('[data-testid^="inbox-item-"]');
const outboxItems = (page: Page) => page.locator('[data-testid^="outbox-item-"]');

// ---------- TC-ALERT-01 ----------
test('TC-ALERT-01 · ขาขึ้น 5% ขอบ 4.99 / 4.995 / 5.00 @P1 @5.4', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: 'ข้อ 1: 0 รายการ (9.98 ÷ 200 = +4.99%) · ข้อ 2: 0 รายการ (9.99 ÷ 200 = +4.995% < 5 ตอนยังไม่ปัด) · ข้อ 3: กล่อง U02 มี 1 รายการ ZALR "+5.00%" (10.00 ÷ 200) · อีเมลที่ส่ง 1 รายการ ถึง ploy@pordee.test',
    source: '[D] BR-33 บ.18 §5 · TEST-DATA E91 E92 E94 · ⚠️ D-01 (เทียบค่าจริง)',
    frbr: 'FR-21 · BR-33', rules: 'R55',
  });
  const clk = mkClock(api);
  const ploy = await api.as('ploy');
  await test.step('0. reset แล้วตรวจว่า alert_events / email_outbox ว่าง', async () => { await emptyAfterReset(db); });
  await test.step('1. รอบตรวจ ZALR 209.98 → นับกล่อง U02', async () => {
    await round(api, info, 'ZALR', '209.98', 'ข้อ 1');
    expect.soft((await inbox(ploy, 'ZALR')).items.length, 'ข้อ 1 กล่อง U02 ZALR (+4.99%)').toBe(0);
  });
  await test.step('2. +2 นาที รอบตรวจ ZALR 209.99 → นับ', async () => {
    await clk.plus2();
    await round(api, info, 'ZALR', '209.99', 'ข้อ 2');
    expect.soft((await inbox(ploy, 'ZALR')).items.length, 'ข้อ 2 กล่อง U02 ZALR (+4.995% ไม่ปัด)').toBe(0);
  });
  await test.step('3. +2 นาที รอบตรวจ ZALR 210.00 → นับ', async () => {
    await clk.plus2();
    await round(api, info, 'ZALR', '210.00', 'ข้อ 3');
    expect.soft((await inbox(ploy, 'ZALR')).items.length, 'ข้อ 3 กล่อง U02 ZALR').toBe(1);
    const emails = await allEmails(db);
    expect.soft(emails.length, 'ข้อ 3 อีเมลที่ส่งทั้งหมด').toBe(1);
    expect.soft(emails.map((e) => e.to_email), 'ข้อ 3 ผู้รับอีเมล').toEqual([PLOY]);
    expect.soft((await outboxTo(ploy, PLOY)).length, 'ข้อ 3 อีเมลถึง ploy@ ใน /api/outbox').toBe(1);
  });
  await test.step('3b. เปิด /inbox ของ U02 และ /outbox', async () => {
    await ui.login('ploy');
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.check(inboxItems(page), 'กล่อง U02 มี 1 รายการ', (l) => expect.soft(l).toHaveCount(1));
    await ui.check(page.locator('[data-testid^="inbox-pct-"]').first(), 'ZALR +5.00%', (l) => expect.soft(l).toHaveText('+5.00%'));
    await ui.check(page.locator('[data-testid^="inbox-symbol-"]').first(), 'สัญลักษณ์ ZALR', (l) => expect.soft(l).toHaveText('ZALR'));
    await ui.goto('/th/outbox', 'outbox-page');
    await ui.check(outboxItems(page), 'อีเมลที่ส่ง 1 รายการ', (l) => expect.soft(l).toHaveCount(1));
    await ui.check(page.locator('[data-testid^="outbox-to-"]').first(), 'ผู้รับ ploy@pordee.test', (l) => expect.soft(l).toHaveText(PLOY));
  });
});

// ---------- TC-ALERT-02 ----------
test('TC-ALERT-02 · ขาลง 5% ขอบ −4.99 / −4.995 / −5.00 และเครื่องหมายลบ @P1 @5.4', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: 'ข้อ 1: 0 (−9.98 ÷ 200 = −4.99%) · ข้อ 2: 0 (−9.99 ÷ 200 = −4.995%) · ข้อ 3: 1 รายการ ZALR ค่า −5.00 (−10.00 ÷ 200) · อีเมล 1 รายการ · ตัวเลข 5.00 ต้องมีเครื่องหมายลบนำหน้า · เครื่องหมายลบผูกตาม SPEC A4 ข้อ 10: "-5.00%" (ขีดธรรมดา) · ตาม 8.2 #25 normalize "−" เป็น "-" ก่อน assert (RV4-12)',
    source: '[D] BR-34 บ.18 §5 · TEST-DATA E95–E97 · เครื่องหมาย [O-ยังไม่ยืนยัน] (F ถามคนสร้างเว็บ ข้อ 15)',
    frbr: 'FR-21 · BR-34', rules: 'R56',
  });
  const clk = mkClock(api);
  const ploy = await api.as('ploy');
  await test.step('0. reset แล้วตรวจว่า alert_events / email_outbox ว่าง', async () => { await emptyAfterReset(db); });
  await test.step('1. รอบตรวจ ZALR 190.02 → นับ', async () => {
    await round(api, info, 'ZALR', '190.02', 'ข้อ 1');
    expect.soft((await inbox(ploy, 'ZALR')).items.length, 'ข้อ 1 กล่อง U02 ZALR (−4.99%)').toBe(0);
  });
  await test.step('2. +2 นาที รอบตรวจ 190.01 → นับ', async () => {
    await clk.plus2();
    await round(api, info, 'ZALR', '190.01', 'ข้อ 2');
    expect.soft((await inbox(ploy, 'ZALR')).items.length, 'ข้อ 2 กล่อง U02 ZALR (−4.995% ไม่ปัด)').toBe(0);
  });
  await test.step('3. +2 นาที รอบตรวจ 190.00 → นับ แล้วดูข้อความในกล่องและหัวเรื่องอีเมล', async () => {
    await clk.plus2();
    await round(api, info, 'ZALR', '190.00', 'ข้อ 3');
    const ib = await inbox(ploy, 'ZALR');
    expect.soft(ib.items.length, 'ข้อ 3 กล่อง U02 ZALR').toBe(1);
    if (ib.items[0]) expect.soft(Number(ib.items[0].changePct), 'ข้อ 3 changePct = −5.00').toBe(-5);
    const emails = await allEmails(db);
    expect.soft(emails.length, 'ข้อ 3 อีเมลที่ส่ง').toBe(1);
    if (emails[0]) expect.soft(norm(emails[0].subject), 'ข้อ 3 หัวเรื่องอีเมลมี "-5.00%"').toContain('ZALR -5.00%');
  });
  await test.step('3b. เปิด /inbox และ /outbox ดูเครื่องหมายลบ', async () => {
    await ui.login('ploy');
    await ui.goto('/th/inbox', 'inbox-page');
    const pct = page.locator('[data-testid^="inbox-pct-"]').first();
    await ui.mark(pct, 'กล่อง: % ขาลง');
    expect.soft(norm(await pct.textContent({ timeout: 5_000 }).catch(() => null)), 'กล่อง: "-5.00%" (normalize − → -)').toBe('-5.00%');
    await ui.check(inboxItems(page), 'กล่อง 1 รายการ', (l) => expect.soft(l).toHaveCount(1));
    await ui.goto('/th/outbox', 'outbox-page');
    const subj = page.locator('[data-testid^="outbox-subject-"]').first();
    await ui.mark(subj, 'หัวเรื่องอีเมล ขาลง');
    expect.soft(norm(await subj.textContent({ timeout: 5_000 }).catch(() => null)), 'หัวเรื่องอีเมล').toContain('-5.00%');
    await ui.check(outboxItems(page), 'อีเมล 1 รายการ', (l) => expect.soft(l).toHaveCount(1));
  });
});

// ---------- TC-ALERT-03 ----------
test('TC-ALERT-03 · 1 ครั้งต่อหุ้นต่อรอบตลาด (ข้ามเที่ยงคืนไทย) @P1 @5.4', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: 'กล่อง U02 (ZALR) = 1 / 1 / 1 / 2 · อีเมล = 1 / 1 / 1 / 2 (01:00 อยู่นอกช่วงเงียบ ถ้าผิดจะเห็นอีเมลด้วย) · ข้อ 2 แม้ +8.00% (16 ÷ 200) ก็ไม่แจ้ง',
    source: '[D] BR-35 §5 · TEST-DATA E98 E99',
    frbr: 'FR-21 · BR-35', rules: 'R57',
  });
  const clk = mkClock(api);
  const ploy = await api.as('ploy');
  const count = async (label: string, n: number) => {
    expect.soft((await inbox(ploy, 'ZALR')).items.length, `${label} กล่อง U02 ZALR`).toBe(n);
    expect.soft((await outboxTo(ploy, PLOY)).length, `${label} อีเมลถึง ploy@`).toBe(n);
  };
  await test.step('0. reset แล้วตรวจว่า alert_events / email_outbox ว่าง', async () => { await emptyAfterReset(db); });
  await test.step('1. รอบตรวจ 22:00 ZALR 210.00 → นับกล่อง/อีเมล', async () => {
    await round(api, info, 'ZALR', '210.00', 'ข้อ 1');
    await count('ข้อ 1 (22:00)', 1);
  });
  await test.step('2. clock 23:30 · รอบตรวจ 216.00 → นับ', async () => {
    await clk.set('2026-11-06T23:30:00+07:00');
    await round(api, info, 'ZALR', '216.00', 'ข้อ 2');
    await count('ข้อ 2 (23:30 +8.00%)', 1);
  });
  await test.step('3. clock 2026-11-07T01:00 · รอบตรวจ 216.00 → นับ', async () => {
    await clk.set('2026-11-07T01:00:00+07:00');
    await round(api, info, 'ZALR', '216.00', 'ข้อ 3');
    await count('ข้อ 3 (7 พ.ย. 01:00)', 1);
  });
  await test.step('4. clock 2026-11-09T22:00 · ยืนยันราคาปิดวันก่อน · รอบตรวจ 210.00 → นับ', async () => {
    await clk.set('2026-11-09T22:00:00+07:00');
    const j = await (await api.guest.get('/api/stocks/ZALR')).json().catch(() => ({}));
    const prev = j?.quote?.prevClose;
    info.annotations.push({ type: 'note', description: `9 พ.ย. 22:00 ZALR prevClose = ${prev}` });
    if (prev === undefined || Number(prev) !== 200) {
      info.annotations.push({ type: 'separate-bug', description: `ราคาปิดวันก่อน ZALR 9 พ.ย. ไม่ใช่ 200.00 (ได้ ${prev}) · บันทึกเป็นบั๊กราคาปิดแยก ไม่ใช่ BR-35` });
    }
    await clk.plus2();
    await round(api, info, 'ZALR', '210.00', 'ข้อ 4');
    await count('ข้อ 4 (9 พ.ย. รอบใหม่)', 2);
  });
  await test.step('5. เปิด /inbox ของ U02', async () => {
    await ui.login('ploy');
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.check(inboxItems(page), 'กล่อง U02 รวม 2 รายการ', (l) => expect.soft(l).toHaveCount(2));
  });
});

// ---------- TC-ALERT-04 ----------
test('TC-ALERT-04 · ราคาเป้าหมาย ถึงหรือผ่านแล้วปิดตัวเอง @P1 @5.4', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: 'U02 AAPL = 0 / 1 / 1 / 1 · หลังข้อ 2 แจ้งเตือน AAPL ของ U02 อยู่สถานะปิด (inactive) ทั้งหน้าเว็บและหลังรีโหลด · U01 = 0 ทุกข้อ (251.00 < 260.00) · ข้อท้าย (ค่าควบคุม · RV4-09): รอบตรวจ AAPL 260.00 → U01 = 1 · U02 ยัง 1',
    source: '[D] BR-36 §5 · TEST-DATA E100–E102 · ⚠️ A-32 (ทิศทางจากราคาตอนตั้ง)',
    frbr: 'FR-22 · BR-36', rules: 'R58',
  });
  const clk = mkClock(api);
  const ploy = await api.as('ploy');
  const beam = await api.as('beam');
  const count = async (label: string, u02: number, u01: number) => {
    expect.soft((await inbox(ploy, 'AAPL')).items.length, `${label} U02 AAPL`).toBe(u02);
    expect.soft((await inbox(beam, 'AAPL')).items.length, `${label} U01 AAPL`).toBe(u01);
  };
  const aaplRow = page.locator('[data-testid^="alert-row-"][data-symbol="AAPL"][data-kind="target"]');
  await test.step('0. reset แล้วตรวจว่า alert_events / email_outbox ว่าง', async () => { await emptyAfterReset(db); });
  await test.step('1. รอบตรวจ AAPL 249.99 → นับกล่อง U02 และ U01', async () => {
    await round(api, info, 'AAPL', '249.99', 'ข้อ 1');
    await count('ข้อ 1', 0, 0);
  });
  await test.step('2. +2 นาที รอบตรวจ 250.00 → นับ · เปิด /alerts ของ U02', async () => {
    await clk.plus2();
    await round(api, info, 'AAPL', '250.00', 'ข้อ 2');
    await count('ข้อ 2', 1, 0);
    const a = (await alertsOf(ploy)).items?.find((x) => x.symbol === 'AAPL' && x.kind === 'target');
    expect.soft(a?.active, 'ข้อ 2 API: แจ้งเตือน AAPL ของ U02 ปิดตัวเอง').toBe(false);
    await ui.login('ploy');
    await ui.goto('/th/alerts', 'alerts-page');
    await ui.check(aaplRow, 'แจ้งเตือน AAPL ของ U02 สถานะปิด', (l) => expect.soft(l).toHaveAttribute('data-active', 'false'));
  });
  await test.step('3. +2 นาที รอบตรวจ 251.00 → นับ', async () => {
    await clk.plus2();
    await round(api, info, 'AAPL', '251.00', 'ข้อ 3');
    await count('ข้อ 3', 1, 0);
  });
  await test.step('4. clock 2026-11-09T22:00 · รอบตรวจ 251.00 → นับ · รีโหลด /alerts', async () => {
    await clk.set('2026-11-09T22:00:00+07:00');
    await round(api, info, 'AAPL', '251.00', 'ข้อ 4');
    await count('ข้อ 4 (รอบใหม่)', 1, 0);
    await page.reload();
    await ui.goto('/th/alerts', 'alerts-page');
    await ui.check(aaplRow, 'หลังรีโหลด AAPL ของ U02 ยังปิด', (l) => expect.soft(l).toHaveAttribute('data-active', 'false'));
  });
  await test.step('5. ข้อท้าย (ค่าควบคุม): +2 นาที รอบตรวจ AAPL 260.00', async () => {
    await clk.plus2();
    await round(api, info, 'AAPL', '260.00', 'ข้อท้าย');
    await count('ข้อท้าย 260.00', 1, 1);
    await ui.login('beam');
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.check(inboxItems(page), 'กล่อง U01 มี AAPL 1 รายการ (ค่าควบคุม)', (l) => expect.soft(l).toHaveCount(1));
  });
});

// ---------- TC-ALERT-05 ----------
test('TC-ALERT-05 · งานแจ้งเตือนต้องไม่พลาดเพราะโควตาราคาเต็ม @P1 @5.4', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: 'ตามสมมติฐาน 8.2 #22 (งานแจ้งเตือนต้องได้ราคาแม้หน้าเว็บใช้โควตาหมด): ภายใน tick ที่ 3 กล่อง U02 มี AAPL 1 รายการ และ ZALR 1 รายการ · แจ้งเตือนทั้ง 2 ปิดตัวเอง · ไม่มีรายการซ้ำ',
    source: '[R] ราคาถึงเป้าต้องแจ้ง · [D] FR-21 FR-22 · [O-ยังไม่ยืนยัน] R19 (F ถามคนสร้างเว็บ ข้อ 1)',
    frbr: 'FR-21 FR-22 FR-05 · BR-36 BR-11', rules: 'R19',
  });
  const clk = mkClock(api);
  const ploy = await api.as('ploy');
  const pages = ['MSFT', 'NVDA', 'TSLA', 'KO', 'VOO'];
  let zalrTargetId: number | undefined;
  await test.step('0. reset แล้วตรวจว่า alert_events / email_outbox ว่าง', async () => { await emptyAfterReset(db); });
  await test.step('1. feed AAPL 250.00 clearCache (ข้าม GET) · ตั้ง U02 ราคาเป้าหมาย ZALR ≥ $210.00', async () => {
    await api.feed({ symbol: 'AAPL', mode: 'price', price: '250.00', clearCache: true });
    const r = await ploy.post('/api/alerts', { data: { symbol: 'ZALR', kind: 'target', targetPrice: '210.00' } });
    const body = await r.json().catch(() => ({}));
    zalrTargetId = body?.alert?.id;
    info.annotations.push({ type: 'note', description: `ตั้ง ZALR เป้า $210.00 ของ U02 → ${r.status()} ${JSON.stringify(body).slice(0, 200)}` });
    if (!r.ok()) {
      info.annotations.push({ type: 'plan-issue', description: `เงื่อนไขก่อนเริ่มทำไม่ได้: U02 มีแจ้งเตือน 20/20 จึงตั้ง ZALR เป้า $210.00 ไม่ได้ (${r.status()}) · ZALR ยังนับจากแจ้งเตือน 5% ที่มีใน seed` });
    }
  });
  const openFive = async () => {
    for (const s of pages) { await ui.goto(`/th/stocks/${s}`, 'stock-page'); await ui.settle(); }
  };
  const counts: string[] = [];
  const countNow = async (label: string) => {
    const a = (await inbox(ploy, 'AAPL')).items.length;
    const z = (await inbox(ploy, 'ZALR')).items.length;
    counts.push(`${label}: AAPL=${a} ZALR=${z}`);
    return { a, z };
  };
  const tickOnce = async (label: string) => {
    const t = await api.tick();
    const res = t?.jobs?.find((x: any) => x.name === 'alerts')?.result ?? {};
    info.annotations.push({ type: 'round', description: `${label}: staleSymbols มี AAPL=${(res.staleSymbols ?? []).includes('AAPL')} ZALR=${(res.staleSymbols ?? []).includes('ZALR')} · fired=${res.fired}` });
  };
  await test.step('2. feed ZALR 210.00 clearCache · เปิด 5 หน้าหุ้น (ใช้โควตา 5/5)', async () => {
    await api.feed({ symbol: 'ZALR', mode: 'price', price: '210.00', clearCache: true });
    await openFive();
  });
  await test.step('3. tick → นับกล่อง U02', async () => { await tickOnce('tick 1'); await countNow('tick 1'); });
  for (const n of [2, 3]) {
    await test.step(`4.${n - 1} clock +2 นาที → เปิด 5 หน้าเดิมให้โควตาเต็ม → tick ${n} → นับ`, async () => {
      await clk.plus2();
      await openFive();
      await tickOnce(`tick ${n}`);
      await countNow(`tick ${n}`);
    });
  }
  await test.step('5. ตรวจผลภายใน tick ที่ 3', async () => {
    info.annotations.push({ type: 'note', description: counts.join(' · ') });
    const { a, z } = await countNow('สรุป');
    expect.soft(a, 'ภายใน tick 3: กล่อง U02 AAPL 1 รายการ (ไม่ซ้ำ)').toBe(1);
    expect.soft(z, 'ภายใน tick 3: กล่อง U02 ZALR 1 รายการ (ไม่ซ้ำ)').toBe(1);
    const items = (await alertsOf(ploy)).items ?? [];
    expect.soft(items.find((x) => x.symbol === 'AAPL' && x.kind === 'target')?.active, 'แจ้งเตือน AAPL ปิดตัวเอง').toBe(false);
    if (zalrTargetId !== undefined) expect.soft(items.find((x) => x.id === zalrTargetId)?.active, 'แจ้งเตือน ZALR เป้า $210 ปิดตัวเอง').toBe(false);
    await ui.login('ploy');
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.check(page.locator('[data-testid^="inbox-item-"][data-symbol="AAPL"]'), 'กล่อง U02 มี AAPL 1 รายการ', (l) => expect.soft(l).toHaveCount(1));
    await ui.check(page.locator('[data-testid^="inbox-item-"][data-symbol="ZALR"]'), 'กล่อง U02 มี ZALR 1 รายการ', (l) => expect.soft(l).toHaveCount(1));
  });
});

// ---------- TC-ALERT-06 ----------
test('TC-ALERT-06 · ช่วงเงียบของคุณพลอย ขอบ 01:59 / 02:00 และนับเป็นครั้งของรอบ @P2 @5.4', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: 'ข้อ 1: กล่อง 1 · อีเมล 1 · ข้อ 2: กล่อง 1 · อีเมล 0 · ข้อ 3: กล่อง 1 · อีเมล 0 (รอบนี้ใช้ครั้งไปแล้วตอน 02:00 แม้ +10.00% = 20 ÷ 200) · ขอบ 06:59:59 / 07:00:00 ทดสอบที่ unit test',
    source: '[D] BR-37 บ.36 §5 · TEST-DATA E103–E105',
    frbr: 'FR-24 FR-25 FR-26 · BR-37 BR-35', rules: 'R59',
  });
  info.annotations.push({ type: 'not-automated', description: 'ขอบ 06:59:59 / 07:00:00 (E105) ตลาดปิด 04:00 จึงเกิดผ่านเว็บไม่ได้ · แผนให้ทดสอบที่ unit test' });
  const clk = mkClock(api);
  const count = async (label: string, box: number, mail: number) => {
    const ploy = await api.as('ploy');
    expect.soft((await inbox(ploy, 'ZALR')).items.length, `${label} กล่อง U02 ZALR`).toBe(box);
    expect.soft((await outboxTo(ploy, PLOY)).length, `${label} อีเมลถึง ploy@`).toBe(mail);
  };
  await test.step('1. (ก) reset 2026-11-07 01:59:00 · รอบตรวจ ZALR 210.00 → นับกล่อง/อีเมล U02', async () => {
    await clk.reset('2026-11-07T01:59:00+07:00');
    await emptyAfterReset(db, 'ก หลัง reset');
    await round(api, info, 'ZALR', '210.00', 'ข้อ 1 (01:59)');
    await count('ข้อ 1 (01:59)', 1, 1);
  });
  await test.step('2. (ข) reset 2026-11-07 02:00:00 · รอบตรวจ ZALR 210.00 → นับ', async () => {
    await clk.reset('2026-11-07T02:00:00+07:00');
    await emptyAfterReset(db, 'ข หลัง reset');
    await round(api, info, 'ZALR', '210.00', 'ข้อ 2 (02:00)');
    await count('ข้อ 2 (02:00)', 1, 0);
  });
  await test.step('3. clock 2026-11-07T03:00 · รอบตรวจ 220.00 → นับ', async () => {
    await clk.set('2026-11-07T03:00:00+07:00');
    await round(api, info, 'ZALR', '220.00', 'ข้อ 3 (03:00)');
    await count('ข้อ 3 (03:00)', 1, 0);
  });
  await test.step('4. เปิด /inbox และ /outbox ของ U02', async () => {
    await ui.login('ploy');
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.check(inboxItems(page), 'กล่อง U02 1 รายการ (เกิดในช่วงเงียบ)', (l) => expect.soft(l).toHaveCount(1));
    await ui.mark(page.locator('[data-testid^="inbox-quiet-"]'), 'ป้ายเกิดในช่วงเงียบ');
    await ui.goto('/th/outbox', 'outbox-page');
    await ui.check(outboxItems(page), 'อีเมล 0 รายการ', (l) => expect.soft(l).toHaveCount(0));
  });
});

// ---------- TC-ALERT-07 ----------
test('TC-ALERT-07 · ลูกค้าตั้งช่วงเงียบเอง (ข้ามเที่ยงคืน) และตรวจข้อมูลที่กรอก @P2 @5.4', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: 'ข้อ 1: ปฏิเสธพร้อมข้อความให้เลือกเวลา (สมมติฐาน 8.2 #30) · GET /api/me/quiet-hours ยังเป็น null/null (RV4-04) · ข้อ 2: ปฏิเสธ (เริ่ม = จบ) · GET /api/me/quiet-hours ยังเป็น null/null · ข้อ 3: หลังรีโหลดยังเห็น 22:00–02:00 · ข้อ 4: "แจ้งเตือน 3/3" · ข้อ 5: กล่องบีม 1 · กล่องพลอย 1 · อีเมลที่ส่ง 1 รายการ ผู้รับ ploy@pordee.test เท่านั้น · ข้อ 6: บีมกล่อง 1 · อีเมลบีม 0 (01:00 อยู่ในช่วงหลังเที่ยงคืน) · พลอยได้อีเมล 1 (ค่าควบคุม)',
    source: '[D] FR-26 BR-37 บ.36 §5 · [R] ข้อ 1 ข้อ 2 · [O-ยังไม่ยืนยัน] ข้อ 1 (F ถามคนสร้างเว็บ ข้อ 6)',
    frbr: 'FR-26 FR-25 · BR-37 BR-20', rules: 'R54 R59',
  });
  const clk = mkClock(api);
  const beam = await api.as('beam');
  const quietApi = async () => (await (await beam.get('/api/me/quiet-hours')).json().catch(() => ({}))) as { quietStart: any; quietEnd: any };
  const saveQuiet = async (s: string, e: string) => {
    await ui.settle();
    // รอหน้า hydrate ก่อน: กรอกซ้ำจนค่าในช่องตรง (กันค่าหายเมื่อกรอกก่อน React พร้อม)
    await expect(async () => {
      await page.getByTestId('quiet-start').fill(s);
      await page.getByTestId('quiet-end').fill(e);
      await page.waitForTimeout(300);
      await expect(page.getByTestId('quiet-start')).toHaveValue(s, { timeout: 500 });
      await expect(page.getByTestId('quiet-end')).toHaveValue(e, { timeout: 500 });
    }).toPass({ timeout: 10_000 }).catch(() => {});
    const resp = page.waitForResponse((r) => r.url().includes('/api/me/quiet-hours') && r.request().method() === 'PATCH', { timeout: 5_000 }).catch(() => null);
    await page.getByTestId('quiet-save').click();
    await resp;
    await page.waitForTimeout(500);
  };
  await test.step('0. reset แล้วตรวจว่า alert_events / email_outbox ว่าง · เข้าสู่ระบบ U01', async () => {
    await emptyAfterReset(db);
    await ui.login('beam');
    await ui.goto('/th/alerts', 'alerts-page');
  });
  await test.step('1. ส่งช่วงเงียบว่างทั้ง 2 ช่อง → ดูข้อความ', async () => {
    await saveQuiet('', '');
    await ui.check(page.getByTestId('quiet-error'), 'ว่างทั้งคู่ต้องมีข้อความให้เลือกเวลา', (l) => expect.soft(l).toBeVisible());
    await ui.check(page.getByTestId('quiet-ok'), 'ว่างทั้งคู่ต้องไม่ขึ้น "บันทึกช่วงเงียบแล้ว"', (l) => expect.soft(l).toBeHidden());
    const q = await quietApi();
    expect.soft([q.quietStart, q.quietEnd], 'ข้อ 1 quiet-hours ยัง null/null').toEqual([null, null]);
  });
  await test.step('2. ส่ง 22:00–22:00 → ดูข้อความ', async () => {
    await page.reload();
    await ui.goto('/th/alerts', 'alerts-page');
    await saveQuiet('22:00', '22:00');
    await ui.check(page.getByTestId('quiet-error'), 'เริ่ม = จบ ต้องปฏิเสธ', (l) => expect.soft(l).toBeVisible());
    await ui.check(page.getByTestId('quiet-ok'), 'เริ่ม = จบ ต้องไม่ขึ้นบันทึกแล้ว', (l) => expect.soft(l).toBeHidden());
    const q = await quietApi();
    expect.soft([q.quietStart, q.quietEnd], 'ข้อ 2 quiet-hours ยัง null/null').toEqual([null, null]);
  });
  await test.step('3. ส่ง 22:00–02:00 → รีโหลด', async () => {
    await saveQuiet('22:00', '02:00');
    await page.reload();
    await ui.goto('/th/alerts', 'alerts-page');
    const cur = page.getByTestId('quiet-current');
    await ui.check(cur, 'หลังรีโหลดเห็น 22:00–02:00', async (l) => {
      await expect.soft(l).toHaveAttribute('data-start', '22:00');
      await expect.soft(l).toHaveAttribute('data-end', '02:00');
    });
  });
  await test.step('4. ตั้งแจ้งเตือน ZALR 5%', async () => {
    await addAlertUi(page, 'ZALR', 'pct');
    await ui.check(page.getByTestId('alert-usage'), 'แจ้งเตือน 3/3', (l) => expect.soft(l).toHaveText('แจ้งเตือน 3/3'));
  });
  await test.step('5. รอบตรวจ ZALR 210.00 (22:00) → ดูกล่องและอีเมลของบีมและพลอย', async () => {
    await round(api, info, 'ZALR', '210.00', 'ข้อ 5');
    const ploy = await api.as('ploy');
    expect.soft((await inbox(beam, 'ZALR')).items.length, 'ข้อ 5 กล่องบีม').toBe(1);
    expect.soft((await inbox(ploy, 'ZALR')).items.length, 'ข้อ 5 กล่องพลอย').toBe(1);
    const emails = await allEmails(db);
    expect.soft(emails.map((e) => e.to_email), 'ข้อ 5 อีเมลที่ส่ง 1 รายการ ผู้รับ ploy@ เท่านั้น').toEqual([PLOY]);
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.check(inboxItems(page), 'กล่องบีม 1 รายการ', (l) => expect.soft(l).toHaveCount(1));
    await ui.goto('/th/outbox', 'outbox-page');
    await ui.check(outboxItems(page), 'อีเมลของบีม 0 (อยู่ในช่วงเงียบ 22:00–02:00)', (l) => expect.soft(l).toHaveCount(0));
  });
  await test.step('6. reset → clock 2026-11-07T01:00 → บีมตั้งช่วงเงียบ 22:00–02:00 + ZALR 5% → รอบตรวจ ZALR 210.00', async () => {
    await clk.reset();
    await clk.set('2026-11-07T01:00:00+07:00');
    const b = await api.as('beam');
    const q = await b.patch('/api/me/quiet-hours', { data: { quietStart: '22:00', quietEnd: '02:00' } });
    expect.soft(q.status(), 'ข้อ 6 บีมตั้งช่วงเงียบ 22:00–02:00 ได้').toBe(200);
    const a = await b.post('/api/alerts', { data: { symbol: 'ZALR', kind: 'pct' } });
    expect.soft(a.status(), 'ข้อ 6 บีมตั้ง ZALR 5% ได้').toBe(201);
    await round(api, info, 'ZALR', '210.00', 'ข้อ 6 (01:00)');
    const ploy = await api.as('ploy');
    expect.soft((await inbox(b, 'ZALR')).items.length, 'ข้อ 6 กล่องบีม').toBe(1);
    const emails = await allEmails(db);
    expect.soft(emails.filter((e) => e.to_email === BEAM).length, 'ข้อ 6 อีเมลบีม 0 (01:00 ในช่วงหลังเที่ยงคืน)').toBe(0);
    expect.soft(emails.filter((e) => e.to_email === PLOY).length, 'ข้อ 6 พลอยได้อีเมล 1 (ค่าควบคุม)').toBe(1);
    expect.soft((await outboxTo(ploy, PLOY)).length, 'ข้อ 6 /api/outbox ของพลอย 1').toBe(1);
    await ui.login('beam');
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.check(inboxItems(page), 'ข้อ 6 กล่องบีม 1 รายการ', (l) => expect.soft(l).toHaveCount(1));
    await ui.goto('/th/outbox', 'outbox-page');
    await ui.check(outboxItems(page), 'ข้อ 6 อีเมลบีม 0', (l) => expect.soft(l).toHaveCount(0));
  });
});

// ---------- TC-ALERT-08 ----------
test('TC-ALERT-08 · โควตาแจ้งเตือน Free 3 / Pro 20 นับรวม 2 แบบ และหุ้นที่ถูกถอด @P1 @5.4', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: ตัวนับยัง 2/3 และหน้า OLDC ไม่มีปุ่มที่พาไปฟอร์มที่ตอบ "ไม่พบหุ้นนี้" [R] · ข้อ 2: MSFT สำเร็จ 3/3 · KO ปฏิเสธ "ตั้งแจ้งเตือนครบ 3 รายการแล้ว (Free)" · ข้อ 3: ปฏิเสธข้อความเดียวกัน (3 + 1 = 4 > 3) · ข้อ 4: ZA20 สำเร็จ 20/20 · ZA21 ปฏิเสธ · ข้อ 5: ปฏิเสธ · ข้อ 6: ตัวนับ U01 3/3 · U05 3/3 · U07 20/20 · U02 20/20 ตรงกันทั้ง 2 หน้า · ข้อ 1 แยก 2 จุด (RV4-10): API ตั้ง OLDC → ปฏิเสธ 404 "ไม่พบหุ้นนี้" · ตัวนับยัง 2/3 · หน้า OLDC: ไม่มีปุ่มตั้งแจ้งเตือน หรือมีแต่บอกเหตุก่อนกด (R50 · สมมติฐาน 8.2 #7)',
    source: '[D] BR-20 BR-21 บ.14 §5 · TEST-DATA E57–E60 · ⚠️ A-30 (ข้อความ) · ข้อ 1 [R] + [O-ยังไม่ยืนยัน] R50',
    frbr: 'FR-23 FR-58 · BR-20 BR-21', rules: 'R46 R47 R50 R53',
  });
  const FREE_FULL = 'ตั้งแจ้งเตือนครบ 3 รายการแล้ว (Free)';
  await test.step('1. U01 ตั้ง OLDC 5% (API) และเปิดหน้า /stocks/OLDC ดูปุ่มตั้งแจ้งเตือน', async () => {
    const beam = await api.as('beam');
    const r = await beam.post('/api/alerts', { data: { symbol: 'OLDC', kind: 'pct' } });
    const body = await r.json().catch(() => ({}));
    expect.soft(r.status(), 'ข้อ 1 API ตั้ง OLDC → 404').toBe(404);
    expect.soft(body?.error?.message, 'ข้อ 1 ข้อความ "ไม่พบหุ้นนี้"').toBe('ไม่พบหุ้นนี้');
    const al = await alertsOf(beam);
    expect.soft(`${al.used}/${al.limit}`, 'ข้อ 1 ตัวนับ U01 ยัง 2/3').toBe('2/3');
    await ui.login('beam');
    await ui.goto('/th/stocks/OLDC', 'stock-page');
    await ui.settle();
    const link = page.getByTestId('stock-alert-link');
    await ui.mark(link.or(page.getByTestId('stock-page')), 'หน้า OLDC: ปุ่มตั้งแจ้งเตือน');
    const n = await link.count();
    if (n === 0) {
      expect.soft(n, 'หน้า OLDC ไม่มีปุ่มตั้งแจ้งเตือน').toBe(0);
    } else {
      const txt = (await link.first().innerText()) + ' ' + ((await link.first().getAttribute('title')) ?? '') + ' ' + ((await link.first().getAttribute('aria-disabled')) ?? '');
      info.annotations.push({ type: 'note', description: `หน้า OLDC มีปุ่ม "${txt.trim()}" href=${await link.first().getAttribute('href')}` });
      expect.soft(/ไม่ได้|ไม่สามารถ|true/.test(txt), 'หน้า OLDC: ถ้ามีปุ่มตั้งแจ้งเตือน ต้องบอกเหตุก่อนกด (ไม่พาไปฟอร์มที่ตอบ "ไม่พบหุ้นนี้")').toBe(true);
    }
  });
  await test.step('2. U01 ตั้ง MSFT 5% → ตั้ง KO 5%', async () => {
    await ui.goto('/th/alerts', 'alerts-page');
    const s1 = await addAlertUi(page, 'MSFT', 'pct');
    expect.soft(s1, 'ข้อ 2 MSFT สำเร็จ').toBe(201);
    await ui.check(page.getByTestId('alert-usage'), 'ข้อ 2 แจ้งเตือน 3/3', (l) => expect.soft(l).toHaveText('แจ้งเตือน 3/3'));
    await addAlertUi(page, 'KO', 'pct');
    await ui.check(page.getByTestId('alert-error'), `ข้อ 2 KO ปฏิเสธ "${FREE_FULL}"`, (l) => expect.soft(l).toHaveText(FREE_FULL));
  });
  await test.step('3. U05 ตั้ง TSLA เป้า $300.00', async () => {
    await ui.login('nok');
    await ui.goto('/th/alerts', 'alerts-page');
    await addAlertUi(page, 'TSLA', 'target', '300.00');
    await ui.check(page.getByTestId('alert-error'), `ข้อ 3 U05 ปฏิเสธ "${FREE_FULL}"`, (l) => expect.soft(l).toHaveText(FREE_FULL));
  });
  await test.step('4. U07 ตั้ง ZA20 เป้า $200.00 → ตั้ง ZA21 5%', async () => {
    await ui.login('mint');
    await ui.goto('/th/alerts', 'alerts-page');
    const s1 = await addAlertUi(page, 'ZA20', 'target', '200.00');
    expect.soft(s1, 'ข้อ 4 ZA20 สำเร็จ').toBe(201);
    await ui.check(page.getByTestId('alert-usage'), 'ข้อ 4 แจ้งเตือน 20/20', (l) => expect.soft(l).toHaveText('แจ้งเตือน 20/20'));
    const s2 = await addAlertUi(page, 'ZA21', 'pct');
    expect.soft(s2, 'ข้อ 4 ZA21 ต้องถูกปฏิเสธ (21 > 20)').not.toBe(201);
    await ui.check(page.getByTestId('alert-error'), 'ข้อ 4 ZA21 ปฏิเสธ', (l) => expect.soft(l).toBeVisible());
  });
  await test.step('5. U02 ตั้ง KO 5%', async () => {
    await ui.login('ploy');
    await ui.goto('/th/alerts', 'alerts-page');
    const s = await addAlertUi(page, 'KO', 'pct');
    expect.soft(s, 'ข้อ 5 U02 KO ต้องถูกปฏิเสธ').not.toBe(201);
    await ui.check(page.getByTestId('alert-error'), 'ข้อ 5 U02 KO ปฏิเสธ', (l) => expect.soft(l).toBeVisible());
  });
  await test.step('6. รีโหลด /alerts และ /account ของแต่ละคน', async () => {
    for (const [u, label, want] of [['beam', 'U01', '3/3'], ['nok', 'U05', '3/3'], ['mint', 'U07', '20/20'], ['ploy', 'U02', '20/20']] as const) {
      await ui.login(u);
      await ui.goto('/th/alerts', 'alerts-page');
      await ui.check(page.getByTestId('alert-usage'), `ข้อ 6 ${label} /alerts แจ้งเตือน ${want}`, (l) => expect.soft(l).toHaveText(`แจ้งเตือน ${want}`));
      await ui.goto('/th/account', 'account-page');
      await ui.check(page.getByTestId('acct-usage-alerts'), `ข้อ 6 ${label} /account แจ้งเตือน ${want}`, (l) => expect.soft(l).toHaveText(`แจ้งเตือน ${want}`));
    }
  });
});

// ---------- TC-ALERT-09 ----------
test('TC-ALERT-09 · จัดการแจ้งเตือน: แก้ ลบ และโควตาหลังแจ้งเตือนปิดตัวเอง @P1 @5.4', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: ปฏิเสธ "ราคาเป้าหมายต้องมากกว่า 0" · หลังรีโหลดยัง $260.00 · ข้อ 2: ข้อความบอกช่องที่ขาด (ไม่ใช่ "ข้อมูลไม่ถูกต้อง" อย่างเดียว) [R] · ข้อ 4: ถามยืนยันก่อนลบ [R] · ยืนยันแล้ว 19/20 · ข้อ 5: สำเร็จ 20/20 · รีโหลดเห็น JNJ และไม่เห็น ZA18',
    source: '[D] FR-23 §5 BR-21 · [R] ข้อ 2–4 · [R] R52 R41 (ลบต้องถามยืนยัน ตามสมมติฐาน 8.2 #8) (F ถามลูกค้า ข้อ 1 ข้อ 3 · ถามคนสร้างเว็บ ข้อ 6)',
    frbr: 'FR-23 FR-22 · BR-21 BR-36', rules: 'R41 R48 R49 R52',
  });
  info.annotations.push({ type: 'note', description: 'ข้อ 3 ย้ายไป TC-ALERT-11 ตามแผน (RV4-03)' });
  await test.step('1. U01 แก้เป้า AAPL เป็น 0 → ดูข้อความ → รีโหลด', async () => {
    const beam = await api.as('beam');
    const id = (await alertsOf(beam)).items.find((x) => x.symbol === 'AAPL' && x.kind === 'target')?.id;
    await ui.login('beam');
    await ui.goto('/th/alerts', 'alerts-page');
    await page.getByTestId(`alert-edit-${id}`).click();
    await page.getByTestId(`alert-edit-input-${id}`).fill('0');
    await page.getByTestId(`alert-edit-save-${id}`).click();
    await page.waitForTimeout(800);
    await ui.check(page.getByTestId('alert-error'), 'ข้อ 1 "ราคาเป้าหมายต้องมากกว่า 0"', (l) => expect.soft(l).toHaveText('ราคาเป้าหมายต้องมากกว่า 0'));
    await page.reload();
    await ui.goto('/th/alerts', 'alerts-page');
    await ui.check(page.getByTestId(`alert-desc-${id}`), 'ข้อ 1 หลังรีโหลดยัง $260.00', (l) => expect.soft(l).toContainText('$260.00'));
  });
  await test.step('2. U01 ส่งฟอร์มตั้งแจ้งเตือนเปล่า → ดูข้อความ', async () => {
    await page.getByTestId('alert-symbol-input').fill('');
    await page.getByTestId('alert-add-btn').click();
    await page.waitForTimeout(800);
    const err = page.getByTestId('alert-error');
    await ui.check(err, 'ข้อ 2 ข้อความบอกช่องที่ขาด', async (l) => {
      await expect.soft(l).toBeVisible();
      await expect.soft(l, 'ข้อ 2 ไม่ใช่ "ข้อมูลไม่ถูกต้อง" อย่างเดียว').not.toHaveText('ข้อมูลไม่ถูกต้อง');
      await expect.soft(l, 'ข้อ 2 ข้อความอ้างถึงช่องชื่อย่อหุ้น').toContainText(/ชื่อย่อ|หุ้น/);
    });
  });
  await test.step('4. U02 กดลบ ZA18 → ดูว่าถามยืนยันไหม → ยืนยัน → ตัวนับ', async () => {
    await ui.login('ploy');
    await ui.goto('/th/alerts', 'alerts-page');
    const row = page.locator('[data-testid^="alert-row-"][data-symbol="ZA18"]');
    const id = (await row.getAttribute('data-testid'))?.replace('alert-row-', '');
    let dialog = false;
    page.once('dialog', async (d) => { dialog = true; await d.accept(); });
    await ui.mark(page.getByTestId(`alert-delete-${id}`), 'ข้อ 4 ปุ่มลบ ZA18');
    await page.getByTestId(`alert-delete-${id}`).click();
    await page.waitForTimeout(800);
    let inlineConfirm = false;
    if (!dialog && (await row.count()) > 0) {
      const btn = row.getByRole('button', { name: /ยืนยัน|ลบเลย|ตกลง/ });
      if ((await btn.count()) > 0) { inlineConfirm = true; await ui.mark(btn, 'ข้อ 4 ปุ่มยืนยันการลบ'); await btn.first().click(); await page.waitForTimeout(800); }
    }
    info.annotations.push({ type: 'note', description: `ลบ ZA18: dialog=${dialog} ปุ่มยืนยันในแถว=${inlineConfirm}` });
    expect.soft(dialog || inlineConfirm, 'ข้อ 4 ต้องถามยืนยันก่อนลบ [R]').toBe(true);
    await ui.check(page.getByTestId('alert-usage'), 'ข้อ 4 ยืนยันแล้ว 19/20', (l) => expect.soft(l).toHaveText('แจ้งเตือน 19/20'));
  });
  await test.step('5. U02 ตั้ง JNJ 5% → รีโหลด', async () => {
    const s = await addAlertUi(page, 'JNJ', 'pct');
    expect.soft(s, 'ข้อ 5 JNJ สำเร็จ').toBe(201);
    await ui.check(page.getByTestId('alert-usage'), 'ข้อ 5 แจ้งเตือน 20/20', (l) => expect.soft(l).toHaveText('แจ้งเตือน 20/20'));
    await page.reload();
    await ui.goto('/th/alerts', 'alerts-page');
    await ui.check(page.locator('[data-testid^="alert-row-"][data-symbol="JNJ"]'), 'ข้อ 5 รีโหลดเห็น JNJ', (l) => expect.soft(l).toHaveCount(1));
    await ui.check(page.locator('[data-testid^="alert-row-"][data-symbol="ZA18"]'), 'ข้อ 5 รีโหลดไม่เห็น ZA18', (l) => expect.soft(l).toHaveCount(0));
  });
});

// ---------- TC-ALERT-10 ----------
test('TC-ALERT-10 · กล่องแจ้งเตือน ตัวนับยังไม่อ่าน อีเมลจำลอง และความเป็นส่วนตัว @P1 @5.4', async ({ page, api, ui, db }, info) => {
  meta(info, {
    expected: 'ข้อ 2: หัวเว็บมีตัวเลขยังไม่อ่าน 1 (A-05) · ข้อ 3: "ยังไม่อ่าน 1 รายการ" · 1 รายการ ZALR +5.00% · ข้อ 4: อีเมลใหม่ 1 รายการ ผู้รับ ploy@pordee.test เวลา 6 พ.ย. 2569 22:00 (เวลาไทย) มีชื่อ ZALR และ +5.00% · ข้อ 5: ตัวนับ 0 ทั้งในกล่องและหัวเว็บ คงอยู่หลังรีโหลด · รายการยังอยู่ 1 · ข้อ 6: U01 กล่อง 0 · ไม่เห็นอีเมลของ ploy@ · POST /api/inbox/<id>/read ได้ 403 หรือ 404 และ unread ของ U02 ยังเป็น 1 (ตรวจก่อนข้อ 5) · /api/outbox ด้วย cookie U01 ไม่มีผู้รับ ploy@',
    source: '[D] FR-24 FR-25 NFR-17 §5 · ⚠️ A-05 (ตัวนับ) · [R] ข้อ 6 · [O-ยังไม่ยืนยัน] R60 (F ถามคนสร้างเว็บ ข้อ 11)',
    frbr: 'FR-24 FR-25 · NFR-17 · BR-33', rules: 'R60 R61',
  });
  const ploy = await api.as('ploy');
  let eventId: number | undefined;
  await test.step('0. reset (6 พ.ย. 22:00) · email_outbox 0 รายการ', async () => { await emptyAfterReset(db); });
  await test.step('1. รอบตรวจ ZALR 210.00', async () => {
    await round(api, info, 'ZALR', '210.00', 'ข้อ 1');
    eventId = (await inbox(ploy, 'ZALR')).items[0]?.id;
  });
  await test.step('2. เข้าสู่ระบบ U02 เปิดหน้าแรก ดูเมนูหัวเว็บ', async () => {
    await ui.login('ploy');
    await ui.goto('/th');
    await ui.check(page.getByTestId('core-nav-inbox'), 'ข้อ 2 หัวเว็บมีตัวเลขยังไม่อ่าน 1', (l) => expect.soft(l).toHaveText(/(^|\D)1(\D|$)/));
  });
  await test.step('3. เปิด /inbox ดูตัวนับและรายการ', async () => {
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.check(page.getByTestId('inbox-unread').locator('..'), 'ข้อ 3 "ยังไม่อ่าน 1 รายการ"', (l) => expect.soft(l).toHaveText(/ยังไม่อ่าน\s*1\s*รายการ/));
    await ui.check(inboxItems(page), 'ข้อ 3 1 รายการ', (l) => expect.soft(l).toHaveCount(1));
    await ui.check(page.locator('[data-testid^="inbox-symbol-"]').first(), 'ข้อ 3 ZALR', (l) => expect.soft(l).toHaveText('ZALR'));
    await ui.check(page.locator('[data-testid^="inbox-pct-"]').first(), 'ข้อ 3 +5.00%', (l) => expect.soft(l).toHaveText('+5.00%'));
  });
  await test.step('4. เปิด /outbox ดูรายการ', async () => {
    await ui.goto('/th/outbox', 'outbox-page');
    await ui.check(outboxItems(page), 'ข้อ 4 อีเมลใหม่ 1 รายการ', (l) => expect.soft(l).toHaveCount(1));
    await ui.check(page.locator('[data-testid^="outbox-to-"]').first(), 'ข้อ 4 ผู้รับ ploy@pordee.test', (l) => expect.soft(l).toHaveText(PLOY));
    await ui.check(page.locator('[data-testid^="outbox-time-"]').first(), 'ข้อ 4 เวลา 6 พ.ย. 2569 22:00', (l) => expect.soft(l).toContainText('6 พ.ย. 2569 22:00'));
    await ui.check(page.locator('[data-testid^="outbox-subject-"]').first(), 'ข้อ 4 หัวเรื่องมี ZALR และ +5.00%', async (l) => {
      await expect.soft(l).toContainText('ZALR');
      await expect.soft(l).toContainText('+5.00%');
    });
    const mails = await outboxTo(ploy, PLOY);
    expect.soft(mails.length, 'ข้อ 4 API อีเมลถึง ploy@ 1 รายการ (ไม่ซ้ำ)').toBe(1);
    if (mails[0]) expect.soft(new Date(mails[0].sentAt).toISOString(), 'ข้อ 4 sentAt ตรงนาฬิกาเว็บ 22:00 ไทย').toBe('2026-11-06T15:00:00.000Z');
  });
  await test.step('4b. (ข้อ 6 ส่วน API ก่อนข้อ 5) cookie U01 เรียก POST /api/inbox/<id>/read และ GET /api/outbox', async () => {
    const beam = await api.as('beam');
    const r = await beam.post(`/api/inbox/${eventId}/read`, { data: {} });
    expect.soft([403, 404], `ข้อ 6 U01 อ่านรายการของ U02 (id ${eventId}) ได้ ${r.status()}`).toContain(r.status());
    expect.soft((await inbox(ploy)).unread, 'ข้อ 6 unread ของ U02 ยังเป็น 1').toBe(1);
    const j = await (await beam.get('/api/outbox')).json().catch(() => ({}));
    expect.soft(((j.items ?? []) as any[]).some((x) => x.toEmail === PLOY), 'ข้อ 6 /api/outbox ด้วย cookie U01 ไม่มีผู้รับ ploy@').toBe(false);
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.check(page.getByTestId('inbox-unread'), 'ข้อ 6 unread ของ U02 ยัง 1', (l) => expect.soft(l).toHaveText('1'));
  });
  await test.step('5. กด "อ่านแล้วทั้งหมด" → รีโหลด → ดูหัวเว็บ', async () => {
    await page.getByTestId('inbox-read-all').click();
    await page.waitForTimeout(800);
    await ui.check(page.getByTestId('inbox-unread'), 'ข้อ 5 ตัวนับในกล่อง 0', (l) => expect.soft(l).toHaveText('0'));
    await page.reload();
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.check(page.getByTestId('inbox-unread'), 'ข้อ 5 หลังรีโหลดตัวนับยัง 0', (l) => expect.soft(l).toHaveText('0'));
    await ui.check(inboxItems(page), 'ข้อ 5 รายการยังอยู่ 1', (l) => expect.soft(l).toHaveCount(1));
    await ui.check(page.getByTestId('core-nav-inbox'), 'ข้อ 5 หัวเว็บไม่มีตัวเลขยังไม่อ่าน (0)', (l) => expect.soft(l).not.toHaveText(/[1-9]/));
  });
  await test.step('6. ออก เข้าสู่ระบบ U01 เปิด /inbox /outbox', async () => {
    await page.request.post('/api/auth/logout').catch(() => null);
    await ui.login('beam');
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.check(inboxItems(page), 'ข้อ 6 U01 กล่อง 0', (l) => expect.soft(l).toHaveCount(0));
    await ui.goto('/th/outbox', 'outbox-page');
    await ui.check(page.getByTestId('outbox-page'), 'ข้อ 6 U01 ไม่เห็นอีเมลของ ploy@', (l) => expect.soft(l).not.toContainText('ploy@'));
  });
});

// ---------- TC-ALERT-11 ----------
test('TC-ALERT-11 · แจ้งเตือนที่ปิดตัวเองแล้วไม่นับโควตา @P1 @5.4', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ตามสมมติฐาน 8.2 #2 (ไม่นับแจ้งเตือนที่ปิดแล้ว): ข้อ 1 19/20 · ข้อ 2 สำเร็จ 20/20 เห็น KO · ข้อ 3 ปฏิเสธ "ครบ 20 รายการแล้ว (Pro)"',
    source: '[R] สมมติฐาน 8.2 #2 (F ถามลูกค้าข้อ 1) · [D] BR-21 BR-36 · รีวิว RV4-03',
    frbr: 'FR-22 FR-23 · BR-21 BR-36', rules: 'R48',
  });
  const ploy = await api.as('ploy');
  await test.step('0. เงื่อนไขก่อนเริ่ม: รอบตรวจ AAPL 250.00 ให้แจ้งเตือน AAPL ปิดตัวเอง', async () => {
    await round(api, info, 'AAPL', '250.00', 'เตรียม');
    const a = (await alertsOf(ploy)).items?.find((x) => x.symbol === 'AAPL' && x.kind === 'target');
    expect.soft(a?.active, 'เตรียม: แจ้งเตือน AAPL ของ U02 ปิดตัวเองแล้ว').toBe(false);
  });
  await test.step('1. U02 เปิด /th/alerts อ่านตัวนับ', async () => {
    await ui.login('ploy');
    await ui.goto('/th/alerts', 'alerts-page');
    await ui.check(page.getByTestId('alert-usage'), 'ข้อ 1 แจ้งเตือน 19/20', (l) => expect.soft(l).toHaveText('แจ้งเตือน 19/20'));
  });
  await test.step('2. U02 ตั้ง KO 5% → รีโหลด', async () => {
    const s = await addAlertUi(page, 'KO', 'pct');
    expect.soft(s, 'ข้อ 2 KO สำเร็จ').toBe(201);
    await page.reload();
    await ui.goto('/th/alerts', 'alerts-page');
    await ui.check(page.getByTestId('alert-usage'), 'ข้อ 2 แจ้งเตือน 20/20', (l) => expect.soft(l).toHaveText('แจ้งเตือน 20/20'));
    await ui.check(page.locator('[data-testid^="alert-row-"][data-symbol="KO"]'), 'ข้อ 2 เห็น KO', (l) => expect.soft(l).toHaveCount(1));
  });
  await test.step('3. ตั้งอีก 1 รายการ (JNJ 5%)', async () => {
    await addAlertUi(page, 'JNJ', 'pct');
    await ui.check(page.getByTestId('alert-error'), 'ข้อ 3 ปฏิเสธ "ครบ 20 รายการแล้ว (Pro)"', (l) => expect.soft(l).toContainText('ครบ 20 รายการแล้ว (Pro)'));
  });
});
