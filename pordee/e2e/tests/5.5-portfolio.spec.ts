// หัวข้อ 5.5 พอร์ต รายการซื้อขาย ค่าธรรมเนียม และกำไร $ / ฿ (TC-PF-01 ถึง TC-PF-10)
// ค่าคาดหวังทั้งหมดคัดจาก TEST-PLAN.md หัวข้อ 5.5 · ห้ามแก้ตามจอ
import type { Locator, Page } from '@playwright/test';
import { test, expect, meta, type Ui } from '../fixtures/pordee';

// ---------- ตัวช่วย ----------
type Tx = { side: 'buy' | 'sell'; symbol: string; date: string; shares: string; price: string; fee?: string };
type Res = { status: number | null; body: any };

/** กดปุ่มแล้วจับคำตอบ API ที่ตรง path/method (ไม่มีคำขอ = status null เช่น หน้าเว็บปฏิเสธเอง) */
async function clickAndCapture(page: Page, ui: Ui, btn: Locator, re: RegExp, methods: string[]): Promise<Res> {
  const respP = page
    .waitForResponse((r) => re.test(new URL(r.url()).pathname) && methods.includes(r.request().method()), { timeout: 8_000 })
    .catch(() => null);
  await btn.click();
  const r = await respP;
  await ui.settle();
  return { status: r ? r.status() : null, body: r ? await r.json().catch(() => null) : null };
}

/** กรอกฟอร์มจดรายการ (tx-form) แล้วกดบันทึก */
async function submitTx(page: Page, ui: Ui, t: Tx): Promise<Res> {
  await page.getByTestId(t.side === 'buy' ? 'tx-side-buy' : 'tx-side-sell').click();
  await page.getByTestId('tx-symbol').fill(t.symbol);
  await page.getByTestId('tx-date').fill(t.date);
  await page.getByTestId('tx-shares').fill(t.shares);
  await page.getByTestId('tx-price').fill(t.price);
  await page.getByTestId('tx-fee').fill(t.fee ?? '');
  return clickAndCapture(page, ui, page.getByTestId('tx-submit'), /\/api\/transactions(\/\d+)?$/, ['POST', 'PATCH']);
}

/** ตั้งค่าธรรมเนียมของฉัน (fee-form) */
async function saveFees(page: Page, ui: Ui, rate: string, min: string): Promise<Res> {
  await page.getByTestId('fee-rate').fill(rate);
  await page.getByTestId('fee-min').fill(min);
  return clickAndCapture(page, ui, page.getByTestId('fee-save'), /\/api\/me\/fees$/, ['PATCH']);
}

async function getJson(page: Page, path: string) {
  const r = await page.request.get(path);
  return { status: r.status(), body: await r.json().catch(() => null) };
}
const pfApi = async (page: Page) => (await getJson(page, '/api/portfolio')).body;
const txApi = async (page: Page): Promise<any[]> => (await getJson(page, '/api/transactions')).body?.items ?? [];
const hold = (pf: any, sym: string) => pf?.holdings?.find((h: any) => h.symbol === sym);
const money = (v: unknown) => (v == null ? 'null' : Number(v).toFixed(2));
const qty4 = (v: unknown) => (v == null ? '0.0000' : Number(v).toFixed(4));

async function openPortfolio(ui: Ui) {
  await ui.goto('/th/portfolio', 'portfolio-page');
  await ui.settle();
}

/** ตรวจจำนวนหุ้นบนจอ · 0 หุ้นยอมรับทั้ง "แถวหาย" และ "0.0000" */
async function checkShares(page: Page, ui: Ui, sym: string, want: string, label: string) {
  if (want === '0.0000' && (await page.getByTestId(`pf-row-${sym}`).count()) === 0) {
    await ui.check(page.getByTestId('pf-holdings'), `${label} (แถว ${sym} หาย = 0 หุ้น)`, (l) =>
      expect.soft(l.getByTestId(`pf-row-${sym}`), label).toHaveCount(0));
    return;
  }
  await ui.check(page.getByTestId(`pf-shares-${sym}`), label, (l) => expect.soft(l, label).toHaveText(want));
}

// =====================================================================
test('TC-PF-01 · ค่าธรรมเนียมขั้นต่ำ $1 และปัดครึ่งขึ้นที่ขอบครึ่งเซนต์ @P1 @5.5', async ({ page, ui }, info) => {
  meta(info, {
    expected: '(a) $1.00 (b) $1.00 (c) $1.00 (d) $1.01 (e) $1.05 (f) $1.50 (g) $1.31 (h) $1.04 · ค่าบนจอ = ค่าใน API ทุกแถว',
    source: '[D] BR-38, BR-39 (ตัวอย่าง $670 → $1.01) · [R] NFR-11',
    frbr: 'FR-27 · BR-38 · BR-39 · NFR-11',
    rules: 'R62 ✅ · R63 ✅',
  });
  const cases = [
    { k: 'a', shares: '1', price: '500.00', fee: '1.00' },
    { k: 'b', shares: '1', price: '666.67', fee: '1.00' },
    { k: 'c', shares: '1', price: '669.00', fee: '1.00' },
    { k: 'd', shares: '1', price: '670.00', fee: '1.01' },
    { k: 'e', shares: '1', price: '700.00', fee: '1.05' },
    { k: 'f', shares: '10', price: '100.00', fee: '1.50' },
    { k: 'g', shares: '1', price: '870.00', fee: '1.31' },
    { k: 'h', shares: '1', price: '690.00', fee: '1.04' },
  ];
  await test.step('เข้าสู่ระบบ U09 คุณฝน แล้วเปิด /th/portfolio', async () => {
    await ui.login('fon');
    await openPortfolio(ui);
  });
  const ids: Record<string, number> = {};
  for (const c of cases) {
    await test.step(`จดซื้อ (${c.k}) ZA02 ${c.shares} @ $${c.price} วันที่ 2026-11-05 เว้นค่าธรรมเนียม`, async () => {
      const r = await submitTx(page, ui, { side: 'buy', symbol: 'ZA02', date: '2026-11-05', shares: c.shares, price: c.price });
      expect.soft(r.status, `(${c.k}) บันทึกสำเร็จ`).toBe(201);
      if (r.body?.transaction?.id) ids[c.k] = r.body.transaction.id;
      expect.soft(money(r.body?.transaction?.feeUsd), `(${c.k}) ค่าธรรมเนียมที่ API คิดตอนบันทึก`).toBe(c.fee);
      await ui.check(page.getByTestId('tx-ok'), `(${c.k}) ข้อความบันทึกบอกค่าธรรมเนียม $${c.fee}`, (l) =>
        expect.soft(l, `(${c.k}) tx-ok`).toContainText(`$${c.fee}`));
    });
  }
  await test.step('ดูค่าธรรมเนียมแต่ละแถวในตารางรายการ (ทันที)', async () => {
    for (const c of cases) {
      if (!ids[c.k]) continue;
      await ui.check(page.getByTestId(`tx-fee-${ids[c.k]}`), `(${c.k}) แถวรายการ $${c.price} ค่าธรรมเนียม`, (l) =>
        expect.soft(l, `(${c.k}) ค่าธรรมเนียมบนจอ`).toHaveText(`$${c.fee}`));
    }
  });
  await test.step('รีโหลดหน้า แล้วดูค่าธรรมเนียมทุกแถว + GET /api/transactions', async () => {
    await page.reload();
    await openPortfolio(ui);
    const items = await txApi(page);
    for (const c of cases) {
      const row = items.find((x) => x.symbol === 'ZA02' && Number(x.price) === Number(c.price));
      expect.soft(money(row?.feeUsd), `(${c.k}) ค่าธรรมเนียมใน API`).toBe(c.fee);
      const id = row?.id ?? ids[c.k];
      if (!id) continue;
      await ui.check(page.getByTestId(`tx-fee-${id}`), `หลังรีโหลด (${c.k}) ค่าธรรมเนียม`, (l) =>
        expect.soft(l, `(${c.k}) ค่าธรรมเนียมบนจอหลังรีโหลด`).toHaveText(`$${c.fee}`));
    }
  });
});

// =====================================================================
test('TC-PF-02 · จำนวนหุ้นทศนิยม ≤ 4 ตำแหน่ง และขายเกินที่มีไม่ได้ (รวมกดพร้อมกัน) @P1 @5.5', async ({ page, ui, api }, info) => {
  meta(info, {
    expected: 'A: 0.123 ✓ · 0.1234 ✓ · 0.12345 ✗ · 0 ✗ · −1 ✗ → ZA02 = 0.2464 หุ้น · B: 20.0001 ✗ "มีหุ้นไม่พอ" ZA01 ยัง 20.0000 · 19.9999 ✓ เหลือ 0.0001 · 0.0002 ✗ "มีหุ้นไม่พอ" · 0.0001 ✓ เหลือ 0.0000 · C: คำขอหนึ่ง 201 อีกคำขอ 409 · ZA01 เหลือ 0.0000 · มีรายการขาย ZA01 ใหม่ 1 รายการ',
    source: '[D] BR-40, BR-41 (E111–E117) · [R] ขายพร้อมกันต้องไม่ติดลบ',
    frbr: 'FR-27 · BR-40 · BR-41',
    rules: 'R64 ✅ · R69 ✅',
  });
  await test.step('A: เข้าสู่ระบบ U09 เปิดหน้าพอร์ต', async () => {
    await ui.login('fon');
    await openPortfolio(ui);
  });
  const A = [
    { q: '0.123', ok: true },
    { q: '0.1234', ok: true },
    { q: '0.12345', ok: false },
    { q: '0', ok: false },
    { q: '-1', ok: false },
  ];
  for (const a of A) {
    await test.step(`A: จดซื้อ ZA02 ${a.q} หุ้น @ $100.00`, async () => {
      const r = await submitTx(page, ui, { side: 'buy', symbol: 'ZA02', date: '2026-11-06', shares: a.q, price: '100.00' });
      if (a.ok) {
        expect.soft(r.status, `A ${a.q} ต้องรับ`).toBe(201);
        await ui.check(page.getByTestId('tx-ok'), `A ${a.q} รับ`, (l) => expect.soft(l, `A ${a.q} tx-ok`).toBeVisible());
      } else {
        expect.soft(r.status === 201, `A ${a.q} ต้องถูกปฏิเสธ (status ${r.status})`).toBe(false);
        await ui.check(page.getByTestId('tx-error'), `A ${a.q} ถูกปฏิเสธ`, (l) => expect.soft(l, `A ${a.q} tx-error`).toBeVisible());
      }
    });
  }
  await test.step('A: ดูจำนวน ZA02 ในพอร์ต (บนจอ + API)', async () => {
    await page.reload();
    await openPortfolio(ui);
    await checkShares(page, ui, 'ZA02', '0.2464', 'ZA02 = 0.2464 หุ้น');
    expect.soft(qty4(hold(await pfApi(page), 'ZA02')?.shares), 'API ZA02 shares').toBe('0.2464');
  });

  await test.step('B: เข้าสู่ระบบ U01 คุณบีม เปิดหน้าพอร์ต', async () => {
    await ui.login('beam');
    await openPortfolio(ui);
  });
  const B = [
    { q: '20.0001', ok: false, left: '20.0000' },
    { q: '19.9999', ok: true, left: '0.0001' },
    { q: '0.0002', ok: false, left: '0.0001' },
    { q: '0.0001', ok: true, left: '0.0000' },
  ];
  for (const b of B) {
    await test.step(`B: จดขาย ZA01 ${b.q} หุ้น @ $130.00`, async () => {
      const r = await submitTx(page, ui, { side: 'sell', symbol: 'ZA01', date: '2026-11-06', shares: b.q, price: '130.00' });
      if (b.ok) {
        expect.soft(r.status, `B ${b.q} ต้องรับ`).toBe(201);
        await ui.check(page.getByTestId('tx-ok'), `B ${b.q} รับ`, (l) => expect.soft(l, `B ${b.q} tx-ok`).toBeVisible());
      } else {
        expect.soft(r.status === 201, `B ${b.q} ต้องถูกปฏิเสธ (status ${r.status})`).toBe(false);
        await ui.check(page.getByTestId('tx-error'), `B ${b.q} "มีหุ้นไม่พอ"`, (l) =>
          expect.soft(l, `B ${b.q} ข้อความ`).toContainText('มีหุ้นไม่พอ'));
      }
      await checkShares(page, ui, 'ZA01', b.left, `B หลังขาย ${b.q} ZA01 เหลือ ${b.left}`);
      expect.soft(qty4(hold(await pfApi(page), 'ZA01')?.shares), `B หลังขาย ${b.q} API ZA01`).toBe(b.left);
    });
  }

  await test.step('C: reset แล้วเข้าสู่ระบบ U01 ใหม่', async () => {
    await api.reset();
    await ui.login('beam');
    await openPortfolio(ui);
  });
  const before = (await txApi(page)).filter((x) => x.symbol === 'ZA01' && x.side === 'sell').length;
  await test.step('C: ยิง POST /api/transactions ขาย ZA01 20 @ $130.00 พร้อมกัน 2 คำขอ (cookie เดียวกัน)', async () => {
    // แผน RV5-10 เขียน body เป็น {type, qty, date} แต่ API ใช้ชื่อฟิลด์ side/shares/tradeDate (SPEC D A2 ข้อ 5) จึงใช้ชื่อฟิลด์ของ API
    info.annotations.push({ type: 'note', description: 'body ตามแผน {type:"sell",qty:20,date} ได้ 400 INVALID_INPUT ตอนสำรวจ · ใช้ {side,shares,tradeDate} ตามชื่อฟิลด์ API แทน (ค่าเดิมทุกค่า)' });
    const body = { side: 'sell', symbol: 'ZA01', shares: 20, price: 130, tradeDate: '2026-11-06' };
    const rs = await Promise.all([page.request.post('/api/transactions', { data: body }), page.request.post('/api/transactions', { data: body })]);
    const st = rs.map((r) => r.status()).sort();
    info.annotations.push({ type: 'status', description: `คำขอพร้อมกัน 2 ครั้ง status = ${st.join(', ')}` });
    expect.soft(st, 'คำขอหนึ่ง 201 อีกคำขอ 409').toEqual([201, 409]);
  });
  await test.step('C: รีโหลด /th/portfolio และ GET /api/transactions นับรายการขาย ZA01', async () => {
    await page.reload();
    await openPortfolio(ui);
    await checkShares(page, ui, 'ZA01', '0.0000', 'C ZA01 เหลือ 0.0000');
    expect.soft(qty4(hold(await pfApi(page), 'ZA01')?.shares), 'C API ZA01 shares').toBe('0.0000');
    const after = (await txApi(page)).filter((x) => x.symbol === 'ZA01' && x.side === 'sell').length;
    await ui.mark(page.getByTestId('tx-list'), 'C รายการขาย ZA01 ใหม่ต้องมี 1 รายการ');
    expect.soft(after - before, 'C รายการขาย ZA01 ใหม่').toBe(1);
  });
});

// =====================================================================
test('TC-PF-03 · ขายบางส่วน: ต้นทุนเฉลี่ยไม่เปลี่ยน กำไรที่รับรู้แล้วแยกจากกำไรที่ยังถือ ($) @P1 @5.5', async ({ page, ui }, info) => {
  meta(info, {
    expected: 'ก่อนขาย: 20 หุ้น · เฉลี่ย $120.18 · กำไร $196.40 · ค่าธรรมเนียมขาย $1.00 · หลังขาย: 15 หุ้น · เฉลี่ย $120.18 · ต้นทุน $1,802.70 · มูลค่า $1,950.00 · กำไรที่ยังถือ $147.30 · กำไรที่รับรู้แล้ว $48.10 แสดงแยก ไม่รวมในกำไรที่ยังถือ',
    source: '[D] BR-38, BR-42, BR-43 (E118, E120, E121)',
    frbr: 'FR-29 · FR-30 · BR-38 · BR-42 · BR-43',
    rules: 'R71 ✅ · R72 ✅',
  });
  await test.step('1. เข้าสู่ระบบ U01 เปิด /th/portfolio จดค่าก่อนขาย', async () => {
    await ui.login('beam');
    await openPortfolio(ui);
    await ui.check(page.getByTestId('pf-shares-ZA01'), 'ก่อนขาย ZA01 20 หุ้น', (l) => expect.soft(l).toHaveText('20.0000'));
    await ui.check(page.getByTestId('pf-avg-ZA01'), 'ก่อนขาย เฉลี่ย $120.18', (l) => expect.soft(l).toHaveText('$120.18'));
    await ui.check(page.getByTestId('pf-pl-usd-ZA01'), 'ก่อนขาย กำไร $196.40', (l) => expect.soft(l).toContainText('$196.40'));
  });
  await test.step('2. จดขาย ZA01 5 @ $130.00 วันที่ 2026-11-06 เว้นค่าธรรมเนียม', async () => {
    const r = await submitTx(page, ui, { side: 'sell', symbol: 'ZA01', date: '2026-11-06', shares: '5', price: '130.00' });
    expect.soft(r.status, 'ขายสำเร็จ').toBe(201);
    expect.soft(money(r.body?.transaction?.feeUsd), 'ค่าธรรมเนียมขาย').toBe('1.00');
    await ui.check(page.getByTestId('tx-ok'), 'ค่าธรรมเนียมขาย $1.00', (l) => expect.soft(l).toContainText('$1.00'));
  });
  const checkAfter = async (when: string) => {
    await ui.check(page.getByTestId('pf-shares-ZA01'), `${when} ZA01 15 หุ้น`, (l) => expect.soft(l).toHaveText('15.0000'));
    await ui.check(page.getByTestId('pf-avg-ZA01'), `${when} เฉลี่ย $120.18 ไม่เปลี่ยน`, (l) => expect.soft(l).toHaveText('$120.18'));
    await ui.check(page.getByTestId('pf-value-usd-ZA01'), `${when} มูลค่า $1,950.00`, (l) => expect.soft(l).toContainText('$1,950.00'));
    await ui.check(page.getByTestId('pf-pl-usd-ZA01'), `${when} กำไรที่ยังถือ $147.30`, (l) => expect.soft(l).toContainText('$147.30'));
    await ui.check(page.getByTestId('pf-total-realized'), `${when} กำไรที่รับรู้แล้ว $48.10`, (l) => expect.soft(l).toContainText('$48.10'));
  };
  await test.step('3. ดูแถว ZA01 และกล่อง "กำไรที่รับรู้แล้ว" (ทันที)', async () => { await checkAfter('หลังขาย'); });
  await test.step('4. รีโหลดหน้า และเปิด GET /api/portfolio', async () => {
    await page.reload();
    await openPortfolio(ui);
    await checkAfter('หลังรีโหลด');
    const pf = await pfApi(page);
    const h = hold(pf, 'ZA01');
    expect.soft(qty4(h?.shares), 'API ZA01 shares').toBe('15.0000');
    expect.soft(money(h?.avgCostUsd), 'API ZA01 avgCost').toBe('120.18');
    expect.soft(money(h?.costUsd), 'API ZA01 ต้นทุน $').toBe('1802.70');
    expect.soft(money(h?.valueUsd), 'API ZA01 มูลค่า $').toBe('1950.00');
    expect.soft(money(h?.plUsd), 'API ZA01 กำไรที่ยังถือ').toBe('147.30');
    expect.soft(money(h?.realizedUsd), 'API ZA01 กำไรที่รับรู้แล้ว').toBe('48.10');
    expect.soft(money(pf?.totals?.realizedUsd), 'API totals.realizedUsd').toBe('48.10');
  });
});

// =====================================================================
test('TC-PF-04 · ต้นทุนบาทของล็อตที่ขายไปบางส่วน (ปัดครึ่งขึ้น / ทศนิยมแม่นยำ) @P1 @5.5', async ({ page, ui, api }, info) => {
  meta(info, {
    expected: 'ค่าธรรมเนียมขาย $1.00 · กำไรที่รับรู้แล้ว $28.46 · ต้นทุน $ $2,043.06 · ต้นทุน ฿ ฿70,655.83 · มูลค่า ฿ ฿74,256.00 · กำไร ฿ ฿3,600.17 · ทั้ง 2 รอบได้ค่าเท่ากัน · จอ = API',
    source: '[D] BR-39, BR-47 · [R] NFR-11 · วิธีแบ่งตามสัดส่วนเป็น [R] ยังรอลูกค้ายืนยัน (สมมติฐาน 8.2 #1)',
    frbr: 'FR-29 · BR-39 · BR-47 · NFR-11',
    rules: 'R75 ❌ · R74',
  });
  const rounds: Record<string, string>[] = [];
  for (const round of [1, 2]) {
    await test.step(`รอบ ${round}: ${round === 2 ? 'reset แล้ว' : ''}เข้าสู่ระบบ U01 จดขาย ZA01 3 @ $130.00 วันที่ 2026-11-05`, async () => {
      if (round === 2) await api.reset();
      await ui.login('beam');
      await openPortfolio(ui);
      const r = await submitTx(page, ui, { side: 'sell', symbol: 'ZA01', date: '2026-11-05', shares: '3', price: '130.00' });
      expect.soft(r.status, `รอบ ${round} ขายสำเร็จ`).toBe(201);
      expect.soft(money(r.body?.transaction?.feeUsd), `รอบ ${round} ค่าธรรมเนียมขาย`).toBe('1.00');
    });
    await test.step(`รอบ ${round}: ดูแถว ZA01 บนจอ`, async () => {
      await ui.check(page.getByTestId('pf-shares-ZA01'), `รอบ ${round} เหลือ 17 หุ้น`, (l) => expect.soft(l).toHaveText('17.0000'));
      await ui.check(page.getByTestId('pf-cost-thb-ZA01'), `รอบ ${round} ต้นทุน ฿70,655.83`, (l) => expect.soft(l).toContainText('฿70,655.83'));
      await ui.check(page.getByTestId('pf-value-thb-ZA01'), `รอบ ${round} มูลค่า ฿74,256.00`, (l) => expect.soft(l).toContainText('฿74,256.00'));
      await ui.check(page.getByTestId('pf-pl-thb-ZA01'), `รอบ ${round} กำไร ฿3,600.17`, (l) => expect.soft(l).toContainText('฿3,600.17'));
      await ui.check(page.getByTestId('pf-total-realized'), `รอบ ${round} กำไรที่รับรู้แล้ว $28.46`, (l) => expect.soft(l).toContainText('$28.46'));
    });
    await test.step(`รอบ ${round}: GET /api/portfolio`, async () => {
      const h = hold(await pfApi(page), 'ZA01');
      const v = { costUsd: money(h?.costUsd), costThb: money(h?.costThb), valueThb: money(h?.valueThb), plThb: money(h?.plThb), realizedUsd: money(h?.realizedUsd) };
      expect.soft(v.realizedUsd, `รอบ ${round} API กำไรที่รับรู้แล้ว`).toBe('28.46');
      expect.soft(v.costUsd, `รอบ ${round} API ต้นทุน $`).toBe('2043.06');
      expect.soft(v.costThb, `รอบ ${round} API ต้นทุน ฿`).toBe('70655.83');
      expect.soft(v.valueThb, `รอบ ${round} API มูลค่า ฿`).toBe('74256.00');
      expect.soft(v.plThb, `รอบ ${round} API กำไร ฿`).toBe('3600.17');
      rounds.push(v);
    });
  }
  expect.soft(rounds[1], 'รอบ 2 ได้ค่าเท่ากับรอบ 1').toEqual(rounds[0]);
});

// =====================================================================
test('TC-PF-05 · อัตราแลกเปลี่ยนเปลี่ยนตอน 18:00 และมูลค่า/กำไรบาททั้งพอร์ต @P1 @5.5', async ({ page, ui, api }, info) => {
  meta(info, {
    expected: 'ต้นทุน ฿ รวม ฿116,663.50 ทุกจุด · กำไร $ รวม $224.40 ทุกจุด · (a) 33.50 (ประกาศ 5 พ.ย.) ฿120,600.00 กำไร ฿3,936.50 ZA01 ฿87,100.00 / +฿3,975.50 · (b) 33.60 ฿120,960.00 กำไร ฿4,296.50 ZA01 ฿87,360.00 / +฿4,235.50 VOO ฿33,600.00 / +฿61.00 · (c) 33.60 ฿120,960.00 · (d) 33.60 ฿120,960.00 · (e) 35.00 ฿126,000.00 กำไร ฿9,336.50 ZA01 ฿91,000.00 / +฿7,875.50 · ไม่มีช่องให้ใส่อัตราเอง มีคำอธิบายวิธีคิด · วันประกาศ (b)(c)(d) 6 พ.ย. 2569 (e) 9 พ.ย. 2569',
    source: '[D] BR-46, BR-47, FR-32 (E129–E134) · อัตรา 35.00 วันที่ 9 พ.ย. เป็น ⚠️ T-05',
    frbr: 'FR-29 · FR-32 · BR-46 · BR-47',
    rules: 'R76 ✅ · R77 ✅',
  });
  type P = { k: string; now: string; rate: string; pub?: string; value: string; pl?: string; za01?: [string, string]; voo?: [string, string] };
  const points: P[] = [
    { k: 'a', now: '2026-11-06T17:59:59+07:00', rate: '33.50', pub: '5 พ.ย. 2569', value: '120600.00', pl: '3936.50', za01: ['87100.00', '3975.50'] },
    { k: 'b', now: '2026-11-06T18:00:00+07:00', rate: '33.60', pub: '6 พ.ย. 2569', value: '120960.00', pl: '4296.50', za01: ['87360.00', '4235.50'], voo: ['33600.00', '61.00'] },
    { k: 'c', now: '2026-11-07T12:00:00+07:00', rate: '33.60', pub: '6 พ.ย. 2569', value: '120960.00' },
    { k: 'd', now: '2026-11-09T17:59:59+07:00', rate: '33.60', pub: '6 พ.ย. 2569', value: '120960.00' },
    { k: 'e', now: '2026-11-09T18:00:00+07:00', rate: '35.00', pub: '9 พ.ย. 2569', value: '126000.00', pl: '9336.50', za01: ['91000.00', '7875.50'] },
  ];
  const thb = (v: string) => '฿' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await test.step('เข้าสู่ระบบ U01 คุณบีม', async () => { await ui.login('beam'); });
  for (const p of points) {
    await test.step(`(${p.k}) ตั้งนาฬิกา ${p.now} แล้วเปิด/รีโหลด /th/portfolio`, async () => {
      await api.clock(p.now);
      await openPortfolio(ui);
    });
    await test.step(`(${p.k}) ตรวจอัตรา วันประกาศ และยอดรวมพอร์ต`, async () => {
      const fx = page.getByTestId('pf-fx');
      await ui.check(fx, `(${p.k}) อัตรา ${p.rate}`, (l) => expect.soft(l, `(${p.k}) อัตรา`).toContainText(new RegExp(p.rate.replace('.', '\\.') + '(00)?\\b')));
      if (p.pub) await ui.check(fx, `(${p.k}) วันประกาศ ${p.pub}`, (l) => expect.soft(l, `(${p.k}) วันประกาศ`).toContainText(`ประกาศ ${p.pub}`));
      await ui.check(page.getByTestId('pf-total-cost-thb'), `(${p.k}) ต้นทุน ฿ รวม ฿116,663.50`, (l) => expect.soft(l).toContainText('฿116,663.50'));
      await ui.check(page.getByTestId('pf-total-pl-usd'), `(${p.k}) กำไร $ รวม $224.40`, (l) => expect.soft(l).toContainText('$224.40'));
      await ui.check(page.getByTestId('pf-total-value-thb'), `(${p.k}) มูลค่า ${thb(p.value)}`, (l) => expect.soft(l).toContainText(thb(p.value)));
      if (p.pl) await ui.check(page.getByTestId('pf-total-pl-thb'), `(${p.k}) กำไร ฿ ${thb(p.pl)}`, (l) => expect.soft(l).toContainText(thb(p.pl!)));
      if (p.za01) {
        await ui.check(page.getByTestId('pf-value-thb-ZA01'), `(${p.k}) ZA01 มูลค่า ${thb(p.za01[0])}`, (l) => expect.soft(l).toContainText(thb(p.za01![0])));
        await ui.check(page.getByTestId('pf-pl-thb-ZA01'), `(${p.k}) ZA01 กำไร +${thb(p.za01[1])}`, (l) => expect.soft(l).toContainText(thb(p.za01![1])));
      }
      if (p.voo) {
        await ui.check(page.getByTestId('pf-value-thb-VOO'), `(${p.k}) VOO มูลค่า ${thb(p.voo[0])}`, (l) => expect.soft(l).toContainText(thb(p.voo![0])));
        await ui.check(page.getByTestId('pf-pl-thb-VOO'), `(${p.k}) VOO กำไร +${thb(p.voo[1])}`, (l) => expect.soft(l).toContainText(thb(p.voo![1])));
      }
      const pf = await pfApi(page);
      expect.soft(money(pf?.fx?.rate), `(${p.k}) API fx.rate`).toBe(p.rate);
      expect.soft(money(pf?.totals?.costThb), `(${p.k}) API ต้นทุน ฿ รวม`).toBe('116663.50');
      expect.soft(money(pf?.totals?.plUsd), `(${p.k}) API กำไร $ รวม`).toBe('224.40');
      expect.soft(money(pf?.totals?.valueThb), `(${p.k}) API มูลค่า ฿ รวม`).toBe(p.value);
      if (p.pl) expect.soft(money(pf?.totals?.plThb), `(${p.k}) API กำไร ฿ รวม`).toBe(p.pl);
      if (p.za01) {
        expect.soft(money(hold(pf, 'ZA01')?.valueThb), `(${p.k}) API ZA01 มูลค่า ฿`).toBe(p.za01[0]);
        expect.soft(money(hold(pf, 'ZA01')?.plThb), `(${p.k}) API ZA01 กำไร ฿`).toBe(p.za01[1]);
      }
      if (p.voo) {
        expect.soft(money(hold(pf, 'VOO')?.valueThb), `(${p.k}) API VOO มูลค่า ฿`).toBe(p.voo[0]);
        expect.soft(money(hold(pf, 'VOO')?.plThb), `(${p.k}) API VOO กำไร ฿`).toBe(p.voo[1]);
      }
    });
  }
  await test.step('3. หาช่องใส่อัตราแลกเปลี่ยนบนหน้าพอร์ต และคำอธิบายวิธีคิด', async () => {
    const root = page.getByTestId('portfolio-page');
    const fxInputs = root.locator('input[name*="fx" i], input[id*="fx" i], input[data-testid*="fx" i], input[name*="rate" i]:not([data-testid="fee-rate"]), input[aria-label*="อัตราแลกเปลี่ยน"]');
    await ui.check(page.getByTestId('pf-fx'), 'ไม่มีช่องให้ใส่อัตราเอง', async () => {
      expect.soft(await fxInputs.count(), 'จำนวนช่องใส่อัตราแลกเปลี่ยน').toBe(0);
      expect.soft(await page.getByTestId('pf-fx').locator('input, select, textarea').count(), 'ช่องกรอกในกล่องอัตรา').toBe(0);
    });
    await ui.check(page.getByTestId('pf-explain'), 'มีคำอธิบายวิธีคิด', (l) => expect.soft(l).toBeVisible());
  });
});

// =====================================================================
test('TC-PF-06 · ต้นทุนบาทของรายการใหม่ใช้อัตราวันซื้อ · วันเสาร์ · วันอนาคต · ราคาทศนิยมเกิน @P1 @5.5', async ({ page, ui, api }, info) => {
  meta(info, {
    expected: '(a) ค่าธรรมเนียม $1.50 · ต้นทุน $1,001.50 · อัตรา 33.50 · ต้นทุน ฿33,550.25 · (b) ค่าธรรมเนียม $1.00 · อัตรา 33.60 · ต้นทุน ฿3,393.60 · (c) ถูกปฏิเสธ ข้อความบอกว่าวันที่อยู่ในอนาคต · ZA04 = 0 (สมมติฐาน 8.2 #9) · (d) อัตรา 34.00 ไม่ใช่ 30 · ต้นทุน ฿3,434.00 · (e) ถูกปฏิเสธ ข้อความบอกเรื่องทศนิยม (ไม่ใช่เรื่องราคาต้อง > 0) · ไม่มีรายการ ZA06',
    source: '[D] BR-46, BR-47, FR-32 · [R] วันอนาคต / ข้อความทศนิยม · (c) [O-ยังไม่ยืนยัน]',
    frbr: 'FR-27 · FR-32 · BR-46 · BR-47',
    rules: 'R67 ❌ · R68 ⚠️ · R65 ⚠️ · R74 ✅',
  });
  await test.step('ตั้งนาฬิกา 2026-11-09T18:00:00+07:00 · เข้าสู่ระบบ U09 · เปิดหน้าพอร์ต', async () => {
    await api.clock('2026-11-09T18:00:00+07:00');
    await ui.login('fon');
    await openPortfolio(ui);
  });
  await test.step('(a) ซื้อ ZA02 10 @ $100.00 วันที่ 2026-11-05', async () => {
    const r = await submitTx(page, ui, { side: 'buy', symbol: 'ZA02', date: '2026-11-05', shares: '10', price: '100.00' });
    expect.soft(r.status, '(a) บันทึกสำเร็จ').toBe(201);
    expect.soft(money(r.body?.transaction?.feeUsd), '(a) ค่าธรรมเนียม').toBe('1.50');
    expect.soft(money(r.body?.transaction?.fxRate), '(a) อัตรา').toBe('33.50');
    expect.soft(money(r.body?.holding?.costUsd), '(a) ต้นทุน $').toBe('1001.50');
    await ui.check(page.getByTestId('pf-cost-thb-ZA02'), '(a) ต้นทุน ฿33,550.25', (l) => expect.soft(l).toContainText('฿33,550.25'));
  });
  await test.step('(b) ซื้อ ZA03 1 @ $100.00 วันที่ 2026-11-07 (เสาร์)', async () => {
    const r = await submitTx(page, ui, { side: 'buy', symbol: 'ZA03', date: '2026-11-07', shares: '1', price: '100.00' });
    expect.soft(r.status, '(b) บันทึกสำเร็จ').toBe(201);
    expect.soft(money(r.body?.transaction?.feeUsd), '(b) ค่าธรรมเนียม').toBe('1.00');
    expect.soft(money(r.body?.transaction?.fxRate), '(b) อัตรา (ศุกร์ 6 พ.ย.)').toBe('33.60');
    await ui.check(page.getByTestId('pf-cost-thb-ZA03'), '(b) ต้นทุน ฿3,393.60', (l) => expect.soft(l).toContainText('฿3,393.60'));
  });
  await test.step('(c) ซื้อ ZA04 1 @ $100.00 วันที่ 2026-12-31 (สมมติฐาน 8.2 #9: วันอนาคตต้องปฏิเสธ)', async () => {
    const r = await submitTx(page, ui, { side: 'buy', symbol: 'ZA04', date: '2026-12-31', shares: '1', price: '100.00' });
    expect.soft(r.status === 201, `(c) วันอนาคตต้องถูกปฏิเสธ (status ${r.status})`).toBe(false);
    await ui.check(page.getByTestId('tx-error'), '(c) ข้อความบอกว่าวันที่อยู่ในอนาคต', (l) => expect.soft(l, '(c) ข้อความพูดถึงวันที่ในอนาคต').toContainText('อนาคต'));
    const z = hold(await pfApi(page), 'ZA04');
    await ui.mark(page.getByTestId('pf-holdings'), '(c) ZA04 ในพอร์ตวันนี้');
    expect.soft(Number(z?.shares ?? 0), '(c) ZA04 ในพอร์ต = 0').toBe(0);
    const tx = (await txApi(page)).filter((x) => x.symbol === 'ZA04');
    expect.soft(tx.length, '(c) ไม่มีรายการ ZA04').toBe(0);
  });
  await test.step('(d) POST /api/transactions ซื้อ ZA05 1 @ $100.00 วันที่ 2026-02-02 แนบ fxRate: 30', async () => {
    const r = await page.request.post('/api/transactions', { data: { side: 'buy', symbol: 'ZA05', shares: 1, price: 100, tradeDate: '2026-02-02', fxRate: 30 } });
    const b = await r.json().catch(() => null);
    expect.soft(r.status(), '(d) บันทึกได้').toBe(201);
    expect.soft(money(b?.transaction?.fxRate), '(d) อัตรา 34.00 ไม่ใช่ 30').toBe('34.00');
    await page.reload();
    await openPortfolio(ui);
    await ui.check(page.getByTestId('pf-cost-thb-ZA05'), '(d) ต้นทุน ฿3,434.00', (l) => expect.soft(l).toContainText('฿3,434.00'));
  });
  await test.step('(e) ซื้อ ZA06 1 @ $10.12345', async () => {
    const r = await submitTx(page, ui, { side: 'buy', symbol: 'ZA06', date: '2026-11-06', shares: '1', price: '10.12345' });
    expect.soft(r.status === 201, `(e) ต้องถูกปฏิเสธ (status ${r.status})`).toBe(false);
    await ui.check(page.getByTestId('tx-error'), '(e) ข้อความบอกเรื่องทศนิยม', async (l) => {
      await expect.soft(l, '(e) ข้อความพูดถึงทศนิยม').toContainText('ทศนิยม');
      await expect.soft(l, '(e) ไม่ใช่ข้อความราคาต้อง > 0').not.toContainText('มากกว่า 0');
    });
  });
  await test.step('2. ดูต้นทุน ฿ ต่อแถว และอัตราแต่ละรายการใน GET /api/transactions', async () => {
    const items = await txApi(page);
    const by = (s: string) => items.find((x) => x.symbol === s);
    expect.soft(money(by('ZA02')?.fxRate), 'API ZA02 อัตรา').toBe('33.50');
    expect.soft(money(by('ZA03')?.fxRate), 'API ZA03 อัตรา').toBe('33.60');
    expect.soft(money(by('ZA05')?.fxRate), 'API ZA05 อัตรา').toBe('34.00');
    expect.soft(by('ZA06'), 'ไม่มีรายการ ZA06').toBeUndefined();
    const pf = await pfApi(page);
    expect.soft(money(hold(pf, 'ZA02')?.costThb), 'API ZA02 ต้นทุน ฿').toBe('33550.25');
    expect.soft(money(hold(pf, 'ZA03')?.costThb), 'API ZA03 ต้นทุน ฿').toBe('3393.60');
    expect.soft(money(hold(pf, 'ZA05')?.costThb), 'API ZA05 ต้นทุน ฿').toBe('3434.00');
    await ui.check(page.getByTestId('pf-holdings'), 'ไม่มี ZA06 ในพอร์ต', (l) => expect.soft(l.getByTestId('pf-row-ZA06')).toHaveCount(0));
  });
});

// =====================================================================
test('TC-PF-07 · ตลาดปิดใช้ราคาปิดพร้อมข้อความ · ตลาดเปิดต้องใช้ราคาปัจจุบัน @P1 @5.5', async ({ page, ui, api }, info) => {
  meta(info, {
    expected: '(a) มีข้อความ "ตลาดปิด · ราคาปิด ณ" + 6 พ.ย. 2569 04:00 · ZA01 $130.00 · มูลค่า $2,600.00 · (b) ไม่มีข้อความ "ตลาดปิด" · ZA01 $135.00 เวลา 21:45 · มูลค่า $2,700.00 · กำไร $ $296.40 · มูลค่า ฿ ฿90,720.00 · กำไร ฿ ฿7,595.50 · (c) แสดงราคาล่าสุดที่ถูกพร้อมป้าย "ข้อมูลไม่อัปเดต" และเวลา/วันที่จริงของราคา · ไม่เขียน "(ล่าช้า 15 นาที)" กับราคาเก่า',
    source: '[D] FR-35 · [R] ราคาเก่าต้องบอกเวลาจริง + ป้าย · ป้าย "ข้อมูลไม่อัปเดต" ตอน feed ล่ม [O-ยังไม่ยืนยัน]',
    frbr: 'FR-29 · FR-35 · BR-47',
    rules: 'R16 ❌ · R17 ✅',
  });
  await test.step('(a) ตั้งนาฬิกา 2026-11-06T17:59:59+07:00 · U01 เปิด /th/portfolio', async () => {
    await api.clock('2026-11-06T17:59:59+07:00');
    await ui.login('beam');
    await openPortfolio(ui);
  });
  await test.step('(a) ดูหัวสรุปและแถว ZA01', async () => {
    const closed = page.getByTestId('pf-market-closed');
    await ui.check(closed, '(a) "ตลาดปิด · ราคาปิด ณ"', (l) => expect.soft(l).toContainText('ตลาดปิด · ราคาปิด ณ'));
    await ui.check(closed, '(a) วันที่ 6 พ.ย. 2569 04:00', (l) => expect.soft(l).toContainText('6 พ.ย. 2569 04:00'));
    await ui.check(page.getByTestId('pf-price-ZA01'), '(a) ZA01 $130.00', (l) => expect.soft(l).toHaveText('$130.00'));
    await ui.check(page.getByTestId('pf-value-usd-ZA01'), '(a) มูลค่า $2,600.00', (l) => expect.soft(l).toContainText('$2,600.00'));
    const pf = await pfApi(page);
    expect.soft(pf?.marketOpen, '(a) API ตลาดปิด').toBe(false);
    expect.soft(money(hold(pf, 'ZA01')?.priceUsd), '(a) API ZA01 ราคา').toBe('130.00');
    expect.soft(money(hold(pf, 'ZA01')?.valueUsd), '(a) API ZA01 มูลค่า').toBe('2600.00');
  });
  await test.step('(b) reset (22:00 ตลาดเปิด) · feed ZA01 = $135 clearCache · รีโหลดหน้าพอร์ต', async () => {
    await api.reset();
    await api.feed({ symbol: 'ZA01', mode: 'price', price: 135, clearCache: true });
    await ui.login('beam');
    await openPortfolio(ui);
  });
  await test.step('(b) ดูข้อความหัวสรุป ราคา ZA01 มูลค่า กำไร $ และ ฿', async () => {
    await ui.check(page.getByTestId('pf-summary'), '(b) ไม่มีข้อความ "ตลาดปิด"', async (l) => {
      await expect.soft(l.getByTestId('pf-market-closed'), '(b) pf-market-closed').toHaveCount(0);
      await expect.soft(l, '(b) หัวสรุป').not.toContainText('ตลาดปิด');
    });
    await ui.check(page.getByTestId('pf-price-ZA01'), '(b) ZA01 $135.00', (l) => expect.soft(l).toHaveText('$135.00'));
    await ui.check(page.getByTestId('pf-market-open'), '(b) เวลา 21:45', (l) => expect.soft(l).toContainText('21:45'));
    await ui.check(page.getByTestId('pf-value-usd-ZA01'), '(b) มูลค่า $2,700.00', (l) => expect.soft(l).toContainText('$2,700.00'));
    await ui.check(page.getByTestId('pf-pl-usd-ZA01'), '(b) กำไร $ $296.40', (l) => expect.soft(l).toContainText('$296.40'));
    await ui.check(page.getByTestId('pf-value-thb-ZA01'), '(b) มูลค่า ฿90,720.00', (l) => expect.soft(l).toContainText('฿90,720.00'));
    await ui.check(page.getByTestId('pf-pl-thb-ZA01'), '(b) กำไร ฿7,595.50', (l) => expect.soft(l).toContainText('฿7,595.50'));
    const pf = await pfApi(page);
    const h = hold(pf, 'ZA01');
    expect.soft(pf?.marketOpen, '(b) API ตลาดเปิด').toBe(true);
    expect.soft(money(h?.priceUsd), '(b) API ZA01 ราคา').toBe('135.00');
    expect.soft(money(h?.valueUsd), '(b) API มูลค่า $').toBe('2700.00');
    expect.soft(money(h?.plUsd), '(b) API กำไร $').toBe('296.40');
    expect.soft(money(h?.valueThb), '(b) API มูลค่า ฿').toBe('90720.00');
    expect.soft(money(h?.plThb), '(b) API กำไร ฿').toBe('7595.50');
    if (h?.quoteAsOf) {
      const t = new Date(h.quoteAsOf).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
      expect.soft(t, '(b) API เวลาราคา (ไทย)').toBe('21:45');
    }
  });
  await test.step('(c) feed ทุกตัว timeout clearCache · รีโหลดอีกครั้ง', async () => {
    await api.feed({ symbol: '*', mode: 'timeout', clearCache: true });
    await page.reload();
    await openPortfolio(ui);
  });
  await test.step('(c) ดูข้อความเวลาและป้ายของราคา', async () => {
    const summary = page.getByTestId('pf-summary');
    await ui.check(summary, '(c) ไม่เขียน "(ล่าช้า 15 นาที)" กับราคาเก่า', (l) => expect.soft(l).not.toContainText('ล่าช้า 15 นาที'));
    // บรรทัดเวลาราคาในหัวสรุป (pf-market-open / pf-market-closed)
    const timeLine = summary.locator('[data-testid="pf-market-open"], [data-testid="pf-market-closed"]').first();
    await ui.check(timeLine, '(c) บอกวันที่จริงของราคา', (l) =>
      expect.soft(l, '(c) บรรทัดเวลาราคาต้องมีวันที่ของราคา').toContainText(/\d{1,2} [ก-๙.]+ \d{4}/));
    await ui.check(page.getByTestId('pf-price-ZA01'), '(c) ยังแสดงราคาล่าสุดที่ถูก', (l) => expect.soft(l).toHaveText(/^\$\d/));
    const stale = page.getByTestId('pf-stale-ZA01');
    await ui.mark(stale, '(c) ป้าย "ข้อมูลไม่อัปเดต" [O-ยังไม่ยืนยัน]');
    const h = hold(await pfApi(page), 'ZA01');
    info.annotations.push({
      type: 'pending',
      description: `(c) ป้ายราคาเก่า: pf-stale-ZA01 ${(await stale.count()) ? `"${await stale.innerText()}"` : 'ไม่มี'} · API stale=${h?.stale} priceUsd=${h?.priceUsd} quoteAsOf=${h?.quoteAsOf} · หัวสรุป="${(await summary.innerText()).split('\n').slice(0, 2).join(' / ')}"`,
    });
  });
});

// =====================================================================
test('TC-PF-08 · ค่าธรรมเนียมของฉัน (อัตราและขั้นต่ำเอง) และใส่ค่าธรรมเนียมเองในรายการ @P1 @5.5', async ({ page, ui }, info) => {
  meta(info, {
    expected: '(a) ZA02 ค่าธรรมเนียม $2.00 · ZA03 $3.00 · (b) เก็บ $0.50 ตามที่ใส่ · ต้นทุน $50.50 · (c) ค่าธรรมเนียม $0.00 · ต้นทุนเฉลี่ย $120.00 · (d) ทุกค่าถูกปฏิเสธ · ค่าที่ตั้งยัง 0.10% / $2.00 · [R] ข้อความบอกว่าช่องไหนผิด · (e) ตามสมมติฐาน 8.2 #10: บันทึกได้ทั้ง 2 ค่า และซื้อ ZA06 1 @ $100 ได้ค่าธรรมเนียม $100.00',
    source: '[D] FR-27, FR-31, BR-38 · [R] ข้อความบอกช่อง / เพดานอัตรา · (e) [O-ยังไม่ยืนยัน]',
    frbr: 'FR-27 · FR-31 · BR-38 · BR-42',
    rules: 'R70 ⚠️ · R41 ⚠️',
  });
  await test.step('เข้าสู่ระบบ U09 เปิด /th/portfolio', async () => {
    await ui.login('fon');
    await openPortfolio(ui);
  });
  await test.step('(a) ตั้ง 0.10% ขั้นต่ำ $2.00 แล้วซื้อ ZA02 10 @ $100 · ZA03 10 @ $300', async () => {
    const s = await saveFees(page, ui, '0.10', '2.00');
    expect.soft(s.status, '(a) บันทึกค่าธรรมเนียม').toBe(200);
    const r1 = await submitTx(page, ui, { side: 'buy', symbol: 'ZA02', date: '2026-11-05', shares: '10', price: '100.00' });
    expect.soft(money(r1.body?.transaction?.feeUsd), '(a) ZA02 ค่าธรรมเนียม').toBe('2.00');
    if (r1.body?.transaction?.id) await ui.check(page.getByTestId(`tx-fee-${r1.body.transaction.id}`), '(a) ZA02 $2.00', (l) => expect.soft(l).toHaveText('$2.00'));
    const r2 = await submitTx(page, ui, { side: 'buy', symbol: 'ZA03', date: '2026-11-05', shares: '10', price: '300.00' });
    expect.soft(money(r2.body?.transaction?.feeUsd), '(a) ZA03 ค่าธรรมเนียม').toBe('3.00');
    if (r2.body?.transaction?.id) await ui.check(page.getByTestId(`tx-fee-${r2.body.transaction.id}`), '(a) ZA03 $3.00', (l) => expect.soft(l).toHaveText('$3.00'));
  });
  await test.step('(b) ซื้อ ZA04 1 @ $50.00 ใส่ค่าธรรมเนียมเอง $0.50', async () => {
    const r = await submitTx(page, ui, { side: 'buy', symbol: 'ZA04', date: '2026-11-05', shares: '1', price: '50.00', fee: '0.50' });
    expect.soft(money(r.body?.transaction?.feeUsd), '(b) ค่าธรรมเนียมที่ใส่เอง').toBe('0.50');
    expect.soft(money(r.body?.holding?.costUsd), '(b) ต้นทุน $').toBe('50.50');
    if (r.body?.transaction?.id) await ui.check(page.getByTestId(`tx-fee-${r.body.transaction.id}`), '(b) ZA04 $0.50', (l) => expect.soft(l).toHaveText('$0.50'));
    await ui.check(page.getByTestId('pf-avg-ZA04'), '(b) ต้นทุนเฉลี่ย $50.50', (l) => expect.soft(l).toHaveText('$50.50'));
  });
  await test.step('(c) ตั้ง 0% ขั้นต่ำ $0 แล้วซื้อ ZA05 20 @ $120.00', async () => {
    const s = await saveFees(page, ui, '0', '0');
    expect.soft(s.status, '(c) บันทึกค่าธรรมเนียม 0').toBe(200);
    const r = await submitTx(page, ui, { side: 'buy', symbol: 'ZA05', date: '2026-11-05', shares: '20', price: '120.00' });
    expect.soft(money(r.body?.transaction?.feeUsd), '(c) ค่าธรรมเนียม').toBe('0.00');
    await ui.check(page.getByTestId('pf-avg-ZA05'), '(c) ต้นทุนเฉลี่ย $120.00', (l) => expect.soft(l).toHaveText('$120.00'));
    expect.soft(money(hold(await pfApi(page), 'ZA05')?.avgCostUsd), '(c) API ต้นทุนเฉลี่ย').toBe('120.00');
  });
  await test.step('4. ตั้ง (a) กลับ', async () => {
    const s = await saveFees(page, ui, '0.10', '2.00');
    expect.soft(s.status, 'ตั้ง 0.10% / $2.00 กลับ').toBe(200);
  });
  const bad = [
    { label: 'อัตรา −1%', rate: '-1', min: '2.00', field: 'อัตรา' },
    { label: 'อัตราว่าง', rate: '', min: '2.00', field: 'อัตรา' },
    { label: 'ขั้นต่ำ $1.005', rate: '0.10', min: '1.005', field: 'ขั้นต่ำ' },
    { label: 'อัตรา 0.12345% (เกิน 4 ตำแหน่ง)', rate: '0.12345', min: '2.00', field: 'อัตรา' },
  ];
  for (const b of bad) {
    await test.step(`(d) ลองตั้ง ${b.label}`, async () => {
      const s = await saveFees(page, ui, b.rate, b.min);
      expect.soft(s.status !== null && s.status < 300, `(d) ${b.label} ต้องถูกปฏิเสธ (status ${s.status})`).toBe(false);
      await ui.check(page.getByTestId('fee-error'), `(d) ${b.label} ข้อความบอกช่อง "${b.field}"`, (l) =>
        expect.soft(l, `(d) ${b.label} ข้อความบอกช่องที่ผิด`).toContainText(b.field));
      await page.reload();
      await openPortfolio(ui);
      const f = (await getJson(page, '/api/me/fees')).body;
      expect.soft(Number(f?.feeRatePct), `(d) หลัง ${b.label} อัตรายัง 0.10`).toBe(0.1);
      expect.soft(money(f?.feeMinUsd), `(d) หลัง ${b.label} ขั้นต่ำยัง 2.00`).toBe('2.00');
      await ui.check(page.getByTestId('fee-rate'), `(d) หลังรีโหลด อัตรายัง 0.10`, (l) => expect.soft(l).toHaveValue(/^0\.10*$/));
      await ui.check(page.getByTestId('fee-min'), `(d) หลังรีโหลด ขั้นต่ำยัง 2.00`, (l) => expect.soft(l).toHaveValue(/^2(\.00?)?$/));
    });
  }
  await test.step('(e) ตั้ง 100% และ 99.9999% แล้วซื้อ ZA06 1 @ $100 (สมมติฐาน 8.2 #10: ไม่มีเพดาน)', async () => {
    const s100 = await saveFees(page, ui, '100', '2.00');
    await ui.mark(page.getByTestId('fee-form'), '(e) ตั้ง 100%');
    expect.soft(s100.status, '(e) ตั้ง 100% ต้องบันทึกได้').toBe(200);
    const s999 = await saveFees(page, ui, '99.9999', '2.00');
    await ui.mark(page.getByTestId('fee-form'), '(e) ตั้ง 99.9999%');
    expect.soft(s999.status, '(e) ตั้ง 99.9999% ต้องบันทึกได้').toBe(200);
    const f = (await getJson(page, '/api/me/fees')).body;
    expect.soft(Number(f?.feeRatePct), '(e) API อัตราที่เก็บ = 99.9999').toBe(99.9999);
    const r = await submitTx(page, ui, { side: 'buy', symbol: 'ZA06', date: '2026-11-05', shares: '1', price: '100.00' });
    expect.soft(r.status, '(e) ซื้อ ZA06 สำเร็จ').toBe(201);
    expect.soft(money(r.body?.transaction?.feeUsd), '(e) ค่าธรรมเนียม ZA06 = $100.00 (99.9999 ปัดเซนต์)').toBe('100.00');
    if (r.body?.transaction?.id) await ui.check(page.getByTestId(`tx-fee-${r.body.transaction.id}`), '(e) ZA06 $100.00', (l) => expect.soft(l).toHaveText('$100.00'));
    else await ui.mark(page.getByTestId('tx-error'), '(e) ซื้อ ZA06 ไม่สำเร็จ');
  });
});

// =====================================================================
test('TC-PF-09 · แก้/ลบรายการแล้วคิดใหม่ทั้งหมด และลบไม่ได้ถ้าทำให้หุ้นติดลบ @P1 @5.5', async ({ page, ui, api }, info) => {
  meta(info, {
    expected: '(a) ค่าธรรมเนียม L2 $2.25 · ต้นทุน L2 $1,502.25 · เฉลี่ย $125.19 · กำไร $ $96.25 · ต้นทุน ฿ ฿86,629.75 · กำไร ฿ ฿730.25 · (b) 10 หุ้น · เฉลี่ย $100.15 · มูลค่า $1,300.00 · กำไร $ $298.50 · ต้นทุน ฿ ฿34,051.00 · มูลค่า ฿ ฿43,680.00 · กำไร ฿ ฿9,629.00 · (c) [R] ลบไม่ได้ · ZA01 ยัง 5 หุ้น · L1 ยังอยู่ · (d) ก่อน: รับรู้ $48.10 · หลัง: รับรู้ $164.90 · ZA01 25 หุ้น · เฉลี่ย $96.82 · ต้นทุน $ $2,420.50 · มูลค่า $3,250.00 · กำไรที่ยังถือ $829.50 · ต้นทุน ฿ ฿83,882.92',
    source: '[D] BR-38, BR-41, BR-42, BR-47 · [R] ลบแล้วหุ้นติดลบไม่ได้ · FR-28 ⚠️ A-06 · (d) [O-ยังไม่ยืนยัน]',
    frbr: 'FR-28 · FR-29 · FR-30 · BR-38 · BR-41 · BR-42 · BR-43 · BR-47',
    rules: 'R73 ⚠️',
  });
  const findL = async () => {
    const items = await txApi(page);
    const z = items.filter((x) => x.symbol === 'ZA01' && x.side === 'buy');
    return { L1: z.find((x) => x.tradeDate === '2026-02-02')?.id as number, L2: z.find((x) => x.tradeDate === '2026-03-02')?.id as number };
  };
  await test.step('เข้าสู่ระบบ U01 · หา id L1/L2 จาก GET /api/transactions', async () => {
    await ui.login('beam');
    await openPortfolio(ui);
  });
  let { L1, L2 } = await findL();
  info.annotations.push({ type: 'note', description: `L1=${L1} L2=${L2}` });

  const checkA = async (when: string) => {
    await ui.check(page.getByTestId(`tx-fee-${L2}`), `${when} (a) ค่าธรรมเนียม L2 $2.25`, (l) => expect.soft(l).toHaveText('$2.25'));
    await ui.check(page.getByTestId('pf-avg-ZA01'), `${when} (a) เฉลี่ย $125.19`, (l) => expect.soft(l).toHaveText('$125.19'));
    await ui.check(page.getByTestId('pf-pl-usd-ZA01'), `${when} (a) กำไร $ $96.25`, (l) => expect.soft(l).toContainText('$96.25'));
    await ui.check(page.getByTestId('pf-cost-thb-ZA01'), `${when} (a) ต้นทุน ฿86,629.75`, (l) => expect.soft(l).toContainText('฿86,629.75'));
    await ui.check(page.getByTestId('pf-pl-thb-ZA01'), `${when} (a) กำไร ฿730.25`, (l) => expect.soft(l).toContainText('฿730.25'));
  };
  await test.step('(a) แก้ L2 ราคา $140.00 → $150.00 (ไม่ใส่ค่าธรรมเนียม)', async () => {
    await page.getByTestId(`tx-edit-${L2}`).click();
    await page.getByTestId('tx-price').fill('150.00');
    await page.getByTestId('tx-fee').fill('');
    const r = await clickAndCapture(page, ui, page.getByTestId('tx-submit'), /\/api\/transactions\/\d+$/, ['PATCH']);
    expect.soft(r.status, '(a) แก้สำเร็จ').toBe(200);
    expect.soft(money(r.body?.transaction?.feeUsd), '(a) API ค่าธรรมเนียม L2').toBe('2.25');
    expect.soft(money(r.body?.holding?.costUsd), '(a) API ต้นทุน ZA01 ($1,001.50 + $1,502.25)').toBe('2503.75');
    await checkA('ทันที');
  });
  await test.step('(a) รีโหลด', async () => {
    await page.reload();
    await openPortfolio(ui);
    await checkA('หลังรีโหลด');
    const h = hold(await pfApi(page), 'ZA01');
    expect.soft(money(h?.avgCostUsd), '(a) API เฉลี่ย').toBe('125.19');
    expect.soft(money(h?.costThb), '(a) API ต้นทุน ฿').toBe('86629.75');
    expect.soft(money(h?.plThb), '(a) API กำไร ฿').toBe('730.25');
  });

  const checkB = async (when: string) => {
    await ui.check(page.getByTestId('pf-shares-ZA01'), `${when} (b) 10 หุ้น`, (l) => expect.soft(l).toHaveText('10.0000'));
    await ui.check(page.getByTestId('pf-avg-ZA01'), `${when} (b) เฉลี่ย $100.15`, (l) => expect.soft(l).toHaveText('$100.15'));
    await ui.check(page.getByTestId('pf-value-usd-ZA01'), `${when} (b) มูลค่า $1,300.00`, (l) => expect.soft(l).toContainText('$1,300.00'));
    await ui.check(page.getByTestId('pf-pl-usd-ZA01'), `${when} (b) กำไร $298.50`, (l) => expect.soft(l).toContainText('$298.50'));
    await ui.check(page.getByTestId('pf-cost-thb-ZA01'), `${when} (b) ต้นทุน ฿34,051.00`, (l) => expect.soft(l).toContainText('฿34,051.00'));
    await ui.check(page.getByTestId('pf-value-thb-ZA01'), `${when} (b) มูลค่า ฿43,680.00`, (l) => expect.soft(l).toContainText('฿43,680.00'));
    await ui.check(page.getByTestId('pf-pl-thb-ZA01'), `${when} (b) กำไร ฿9,629.00`, (l) => expect.soft(l).toContainText('฿9,629.00'));
  };
  await test.step('(b) ลบ L2 (กดลบ → กดยืนยัน)', async () => {
    await page.getByTestId(`tx-delete-${L2}`).click();
    const r = await clickAndCapture(page, ui, page.getByTestId(`tx-delete-confirm-${L2}`), /\/api\/transactions\/\d+$/, ['DELETE']);
    expect.soft(r.status, '(b) ลบสำเร็จ').toBe(200);
    await checkB('ทันที');
  });
  await test.step('(b) รีโหลด', async () => {
    await page.reload();
    await openPortfolio(ui);
    await checkB('หลังรีโหลด');
    const h = hold(await pfApi(page), 'ZA01');
    expect.soft(qty4(h?.shares), '(b) API หุ้น').toBe('10.0000');
    expect.soft(money(h?.avgCostUsd), '(b) API เฉลี่ย').toBe('100.15');
    expect.soft(money(h?.plUsd), '(b) API กำไร $').toBe('298.50');
    expect.soft(money(h?.costThb), '(b) API ต้นทุน ฿').toBe('34051.00');
    expect.soft(money(h?.plThb), '(b) API กำไร ฿').toBe('9629.00');
  });

  await test.step('(c) reset · ขาย ZA01 15 @ $130.00 วันที่ 2026-11-05 · แล้วลบ L1', async () => {
    await api.reset();
    await ui.login('beam');
    await openPortfolio(ui);
    ({ L1, L2 } = await findL());
    const s = await submitTx(page, ui, { side: 'sell', symbol: 'ZA01', date: '2026-11-05', shares: '15', price: '130.00' });
    expect.soft(s.status, '(c) ขาย 15 สำเร็จ').toBe(201);
    await page.getByTestId(`tx-delete-${L1}`).click();
    const r = await clickAndCapture(page, ui, page.getByTestId(`tx-delete-confirm-${L1}`), /\/api\/transactions\/\d+$/, ['DELETE']);
    info.annotations.push({ type: 'status', description: `(c) DELETE L1 status = ${r.status}` });
    expect.soft(r.status !== null && r.status < 300, `(c) ลบ L1 ต้องไม่ได้ (status ${r.status})`).toBe(false);
    await ui.mark(page.getByTestId('tx-list'), '(c) ผลการลบ L1');
  });
  await test.step('(c) ดูจำนวน ZA01 และ L1 ยังอยู่', async () => {
    await page.reload();
    await openPortfolio(ui);
    await ui.check(page.getByTestId('pf-shares-ZA01'), '(c) ZA01 ยัง 5 หุ้น', (l) => expect.soft(l).toHaveText('5.0000'));
    await ui.check(page.getByTestId(`tx-row-${L1}`), '(c) L1 ยังอยู่', (l) => expect.soft(l).toBeVisible());
    expect.soft(qty4(hold(await pfApi(page), 'ZA01')?.shares), '(c) API ZA01').toBe('5.0000');
    expect.soft((await txApi(page)).some((x) => x.id === L1), '(c) API L1 ยังอยู่').toBe(true);
  });

  await test.step('(d) reset · ขาย ZA01 5 @ $130.00 วันที่ 2026-11-05 · จดกำไรที่รับรู้แล้วก่อน', async () => {
    await api.reset();
    await ui.login('beam');
    await openPortfolio(ui);
    const s = await submitTx(page, ui, { side: 'sell', symbol: 'ZA01', date: '2026-11-05', shares: '5', price: '130.00' });
    expect.soft(s.status, '(d) ขาย 5 สำเร็จ').toBe(201);
    await ui.check(page.getByTestId('pf-total-realized'), '(d) ก่อน: รับรู้ $48.10', (l) => expect.soft(l).toContainText('$48.10'));
    expect.soft(money(hold(await pfApi(page), 'ZA01')?.realizedUsd), '(d) ก่อน: API รับรู้').toBe('48.10');
  });
  await test.step('(d) จดซื้อ ZA01 10 @ $50.00 วันที่ 2026-03-03 (ย้อนหลัง · สมมติฐาน 8.2 #11: ตัดสินที่ตัวเลขใหม่)', async () => {
    const r = await submitTx(page, ui, { side: 'buy', symbol: 'ZA01', date: '2026-03-03', shares: '10', price: '50.00' });
    expect.soft(r.status, '(d) จดซื้อย้อนหลังสำเร็จ').toBe(201);
    await page.reload();
    await openPortfolio(ui);
    await ui.check(page.getByTestId('pf-total-realized'), '(d) หลัง: รับรู้ $164.90', (l) => expect.soft(l).toContainText('$164.90'));
    await ui.check(page.getByTestId('pf-shares-ZA01'), '(d) หลัง: 25 หุ้น', (l) => expect.soft(l).toHaveText('25.0000'));
    await ui.check(page.getByTestId('pf-avg-ZA01'), '(d) หลัง: เฉลี่ย $96.82', (l) => expect.soft(l).toHaveText('$96.82'));
    await ui.check(page.getByTestId('pf-value-usd-ZA01'), '(d) หลัง: มูลค่า $3,250.00', (l) => expect.soft(l).toContainText('$3,250.00'));
    await ui.check(page.getByTestId('pf-pl-usd-ZA01'), '(d) หลัง: กำไรที่ยังถือ $829.50', (l) => expect.soft(l).toContainText('$829.50'));
    await ui.check(page.getByTestId('pf-cost-thb-ZA01'), '(d) หลัง: ต้นทุน ฿83,882.92', (l) => expect.soft(l).toContainText('฿83,882.92'));
    const h = hold(await pfApi(page), 'ZA01');
    expect.soft(money(h?.realizedUsd), '(d) หลัง: API รับรู้').toBe('164.90');
    expect.soft(qty4(h?.shares), '(d) หลัง: API หุ้น').toBe('25.0000');
    expect.soft(money(h?.avgCostUsd), '(d) หลัง: API เฉลี่ย').toBe('96.82');
    expect.soft(money(h?.costUsd), '(d) หลัง: API ต้นทุน $').toBe('2420.50');
    expect.soft(money(h?.valueUsd), '(d) หลัง: API มูลค่า $').toBe('3250.00');
    expect.soft(money(h?.plUsd), '(d) หลัง: API กำไรที่ยังถือ').toBe('829.50');
    expect.soft(money(h?.costThb), '(d) หลัง: API ต้นทุน ฿').toBe('83882.92');
  });
});

// =====================================================================
test('TC-PF-10 · แก้/ลบ/ดูรายการของคนอื่นไม่ได้ และพอร์ตต้องเข้าสู่ระบบ @P1 @5.5', async ({ page, ui, api }, info) => {
  meta(info, {
    expected: 'PATCH/DELETE/GET /api/transactions/<L1> ได้ 403 หรือ 404 (ไม่ใช่ 500) · ทุก body ไม่มี ZA01 / 100.00 / 34051 · ?userId=<U01> ยังคืนพอร์ตว่างของ U09 · U09 เห็นพอร์ตว่าง 0 รายการ · ไม่เข้าสู่ระบบ: API ไม่คืนข้อมูลพอร์ต หน้าแสดงให้เข้าสู่ระบบ · U01 ZA01 ยัง 20 หุ้น เฉลี่ย $120.18 L1 ราคา $100.00',
    source: '[R] เจ้าของข้อมูลเท่านั้น · [D] FR-59 (พอร์ตต้องเข้าสู่ระบบ)',
    frbr: 'FR-28 · FR-29',
    rules: 'R79 ✅',
  });
  const beam = await api.as('beam');
  const beamId = (await (await beam.get('/api/me')).json().catch(() => null))?.user?.id ?? 1;
  const L1 = ((await (await beam.get('/api/transactions')).json())?.items ?? []).find((x: any) => x.symbol === 'ZA01' && x.tradeDate === '2026-02-02')?.id;
  info.annotations.push({ type: 'note', description: `U01 id=${beamId} · L1=${L1}` });
  const leak = (label: string, body: string) => {
    expect.soft(body, `${label} ไม่มี ZA01`).not.toContain('ZA01');
    expect.soft(body, `${label} ไม่มี 100.00`).not.toContain('100.00');
    expect.soft(body, `${label} ไม่มี 34051`).not.toContain('34051');
  };
  await test.step('1. ยิงคำขอทั้งหมดในฐานะ U09 คุณฝน', async () => {
    const fon = await api.as('fon');
    const reqs: [string, () => ReturnType<typeof fon.get>][] = [
      [`PATCH /api/transactions/${L1}`, () => fon.patch(`/api/transactions/${L1}`, { data: { price: 1 } })],
      [`DELETE /api/transactions/${L1}`, () => fon.delete(`/api/transactions/${L1}`)],
      // แก้แผนหลัง LAB 12 (PLAN-FIX-4): SPEC ไม่มี GET /api/transactions/:id (405 ไม่ทำให้ข้อมูลหลุด) → ตรวจเฉพาะ PATCH/DELETE
    ];
    for (const [label, fn] of reqs) {
      const r = await fn();
      const body = await r.text();
      info.annotations.push({ type: 'status', description: `${label} → ${r.status()}` });
      expect.soft([403, 404], `${label} ต้องได้ 403 หรือ 404 (ได้ ${r.status()})`).toContain(r.status());
      leak(label, body);
    }
    for (const path of ['/api/portfolio', `/api/portfolio?userId=${beamId}`]) {
      const r = await fon.get(path);
      const body = await r.text();
      leak(`GET ${path}`, body);
      const j = JSON.parse(body || '{}');
      expect.soft(j?.holdings?.length ?? -1, `GET ${path} คืนพอร์ตว่างของ U09`).toBe(0);
    }
    const t = await fon.get('/api/transactions');
    const tb = await t.text();
    leak('GET /api/transactions', tb);
    expect.soft(JSON.parse(tb || '{}')?.items?.length ?? -1, 'U09 มีรายการ 0 รายการ').toBe(0);
    await ui.login('fon');
    await openPortfolio(ui);
    await ui.check(page.getByTestId('pf-empty'), 'U09 เห็นพอร์ตว่าง', (l) => expect.soft(l).toBeVisible());
    await ui.check(page.getByTestId('tx-empty'), 'U09 รายการ 0 รายการ', (l) => expect.soft(l).toBeVisible());
  });
  await test.step('2. ออกจากระบบ แล้วยิง GET /api/portfolio และเปิด /th/portfolio', async () => {
    await page.request.post('/api/auth/logout');
    const g = await api.guest.get('/api/portfolio');
    const gb = await g.text();
    info.annotations.push({ type: 'status', description: `แขก GET /api/portfolio → ${g.status()}` });
    expect.soft(g.status() < 300, `แขก GET /api/portfolio ต้องไม่ได้ข้อมูล (status ${g.status()})`).toBe(false);
    expect.soft(gb, 'แขก body ไม่มี holdings').not.toContain('holdings');
    const p = await page.request.get('/api/portfolio');
    expect.soft(p.status() < 300, `หลังออกจากระบบ GET /api/portfolio (status ${p.status()})`).toBe(false);
    await openPortfolio(ui);
    await ui.check(page.getByTestId('portfolio-login-required'), 'หน้าแสดงให้เข้าสู่ระบบ', (l) => expect.soft(l).toBeVisible());
    await expect.soft(page.getByTestId('pf-holdings'), 'ไม่แสดงพอร์ต').toHaveCount(0);
  });
  await test.step('3. เข้าเป็น U01 ตรวจ ZA01', async () => {
    await ui.login('beam');
    await openPortfolio(ui);
    await ui.check(page.getByTestId('pf-shares-ZA01'), 'U01 ZA01 ยัง 20 หุ้น', (l) => expect.soft(l).toHaveText('20.0000'));
    await ui.check(page.getByTestId('pf-avg-ZA01'), 'U01 เฉลี่ย $120.18', (l) => expect.soft(l).toHaveText('$120.18'));
    if (L1) await ui.check(page.getByTestId(`tx-price-${L1}`), 'U01 L1 ราคา $100.00', (l) => expect.soft(l).toHaveText('$100.00'));
    const tx = (await txApi(page)).find((x) => x.id === L1);
    expect.soft(money(tx?.price), 'API L1 ราคา').toBe('100.00');
  });
});
