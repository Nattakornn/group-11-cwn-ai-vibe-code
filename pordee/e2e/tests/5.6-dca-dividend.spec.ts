// หัวข้อ 5.6 DCA และปันผล (TEST-PLAN.md · TC-DCA-01–05 · TC-DIV-01–05)
import { test, expect, meta, type Api, type Ui } from '../fixtures/pordee';
import type { APIRequestContext, Page, TestInfo } from '@playwright/test';

// ---------- ตัวช่วย ----------
/** แถวรายการรอยืนยัน (dca-pending-<id> ตัวเลขเท่านั้น ไม่นับลูก date/fee/...) */
const pendingRows = (page: Page) => page.getByTestId(/^dca-pending-\d+$/);
/** การ์ดปฏิทินปันผล div-cal-<SYM>-<xdDate> */
const calCards = (page: Page) => page.getByTestId(/^div-cal-[A-Z.]+-\d{4}-\d{2}-\d{2}$/);
/** แถวปันผลที่ได้รับ div-rcv-<SYM>-<payDate> */
const rcvRows = (page: Page) => page.getByTestId(/^div-rcv-[A-Z.]+-\d{4}-\d{2}-\d{2}$/);

async function clockTick(api: Api, now: string) {
  await api.clock(now);
  return api.tick();
}

async function openPortfolio(ui: Ui) {
  await ui.goto('/th/portfolio', 'portfolio-page');
  await ui.settle();
}

async function openDividends(ui: Ui, path: string) {
  await ui.goto(path, 'dividends-page');
  await ui.settle();
}

async function pendingItems(ctx: APIRequestContext, all = false): Promise<any[]> {
  const r = await ctx.get(all ? '/api/dca/pending?status=all' : '/api/dca/pending');
  return (await r.json()).items ?? [];
}

/** ออกจากระบบ (API) แล้วล้างคุกกี้ในเบราว์เซอร์ */
async function logout(page: Page) {
  await page.request.post('/api/auth/logout', { data: {}, timeout: 10_000 }).catch(() => {});
  await page.context().clearCookies();
}

const bodyFontPx = (page: Page) =>
  page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));

// ===================================================================
// กลุ่ม DCA
// ===================================================================

test('TC-DCA-01 · DCA ครบรอบ 25 พ.ย. (ขอบเวลาปิดรอบ + สูตรจำนวนหุ้น) @P1 @5.6', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 2: รายการรอยืนยัน 0 รายการ · ข้อ 4: 1 รายการ VOO วันที่ 25 พ.ย. 2569 · เงิน $142.86 · ค่าธรรมเนียม $1.00 · ลงทุน $141.86 · จำนวน 0.2837 หุ้น · อัตรา 35.0000 · VOO ในพอร์ตยัง 2.0000 · ข้อ 5: ยัง 1 รายการ',
    source: '[D] §6 (BR-44, BR-45 · E122 E125) · [R] เวลาปิดรอบ (D-04)',
    frbr: 'FR-34 · BR-44 · BR-45',
    rules: 'R81 · R82',
  });

  await test.step('1. clock 2026-11-26 03:59:59 → tick', async () => {
    await clockTick(api, '2026-11-26T03:59:59+07:00');
  });
  await test.step('2. เข้าสู่ระบบ U01 เปิด /th/portfolio', async () => {
    await ui.login('beam');
    await openPortfolio(ui);
  });
  await ui.check(page.getByTestId('dca-pending-section'), 'ข้อ 2 รายการรอยืนยัน 0 รายการ (03:59:59)', async () => {
    await expect.soft(pendingRows(page), 'ก่อนรอบปิดต้องยังไม่มีรายการรอยืนยัน').toHaveCount(0);
  });

  await test.step('3. clock 2026-11-26 04:00:00 → tick', async () => {
    await clockTick(api, '2026-11-26T04:00:00+07:00');
  });
  await test.step('4. รีโหลดหน้าพอร์ต', async () => { await openPortfolio(ui); });

  await ui.check(page.getByTestId('dca-pending-section'), 'ข้อ 4 รายการรอยืนยัน 1 รายการ', async () => {
    await expect.soft(pendingRows(page), 'หลังรอบปิด 04:00 ต้องมี 1 รายการ').toHaveCount(1);
  });
  const row = pendingRows(page).first();
  const id = ((await row.getAttribute('data-testid').catch(() => null)) ?? 'dca-pending-0').replace('dca-pending-', '');
  await ui.check(page.getByTestId(`dca-pending-symbol-${id}`), 'ข้อ 4 หุ้น VOO', l => expect.soft(l).toHaveText('VOO'));
  await ui.check(page.getByTestId(`dca-pending-date-${id}`), 'ข้อ 4 วันที่ 25 พ.ย. 2569', l => expect.soft(l).toContainText('25 พ.ย. 2569'));
  await ui.check(page.getByTestId(`dca-pending-usd-${id}`), 'ข้อ 4 เงิน $142.86', l => expect.soft(l).toHaveText('$142.86'));
  await ui.check(page.getByTestId(`dca-pending-fee-${id}`), 'ข้อ 4 ค่าธรรมเนียม $1.00', l => expect.soft(l).toHaveText('$1.00'));
  await ui.check(page.getByTestId(`dca-pending-invest-${id}`), 'ข้อ 4 ลงทุน $141.86', l => expect.soft(l).toHaveText('$141.86'));
  await ui.check(page.getByTestId(`dca-pending-shares-${id}`), 'ข้อ 4 จำนวน 0.2837 หุ้น', l => expect.soft(l).toHaveText('0.2837'));
  await ui.check(page.getByTestId(`dca-pending-fx-${id}`), 'ข้อ 4 อัตรา 35.0000', l => expect.soft(l).toContainText('35.0000'));
  await ui.check(page.getByTestId('pf-shares-VOO'), 'ข้อ 4 VOO ในพอร์ตยัง 2.0000', l => expect.soft(l).toHaveText('2.0000'));

  await test.step('5. tick อีก 1 ครั้ง แล้วรีโหลด', async () => {
    await api.tick();
    await openPortfolio(ui);
  });
  await ui.check(page.getByTestId('dca-pending-section'), 'ข้อ 5 tick ซ้ำยัง 1 รายการ', async () => {
    await expect.soft(pendingRows(page), 'tick ซ้ำต้องไม่สร้างซ้ำ').toHaveCount(1);
  });
});

test('TC-DCA-02 · กดยืนยันซ้ำ + ยืนยันของคนอื่น + ที่มาของรายการ @P1 @5.6', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: ถูกปฏิเสธ (404/403) · VOO ของบีมยัง 2.0000 · ข้อ 2: คำขอแรก 200 · คำขอที่ 2 409 · ข้อ 3: VOO 2.2837 · ต้นทุน $1,114.86 · เฉลี่ย $488.18 · มูลค่า $1,141.85 · กำไร $26.99 · ต้นทุน ฿38,539.10 · รายการรอยืนยันเหลือ 0 · ข้อ 4: ถูกปฏิเสธ (409) VOO ยัง 2.2837 · ข้อ 5: VOO 3 รายการ · 2 ก.พ. และ 2 มี.ค. ที่มา = จดเอง (manual) · 25 พ.ย. ที่มา = DCA',
    source: '[D] §6 (E128 · DESIGN 5.3) · [R] ข้อมูลของคนอื่นห้ามแก้ (NFR-09 A-21) · [R] รายการก่อนวันสร้างแผน (30 ต.ค.) มาจาก DCA ไม่ได้',
    frbr: 'FR-34 · BR-44 · BR-47 (ต้นทุนบาท)',
    rules: 'R83 · R104 · R80 ⚠️',
  });

  let beam!: APIRequestContext;
  let id = 0;
  await test.step('0. เตรียม: clock 2026-11-26 04:00 → tick (ต่อจาก TC-DCA-01 ข้อ 4) · U01 GET /api/dca/pending เอา id', async () => {
    await clockTick(api, '2026-11-26T04:00:00+07:00');
    beam = await api.as('beam');
    const items = await pendingItems(beam);
    expect.soft(items.length, 'ต้องมีรายการรอยืนยัน 1 รายการก่อนเริ่ม').toBe(1);
    id = items[0]?.id ?? 0;
    await ui.login('beam');
    await openPortfolio(ui);
    await ui.mark(page.getByTestId('dca-pending-section'), 'เริ่มต้น มีรายการรอยืนยัน VOO 0.2837');
  });

  await test.step('1. U09 ส่ง POST /api/dca/pending/:id/confirm ของบีม', async () => {
    const fon = await api.as('fon');
    const r = await fon.post(`/api/dca/pending/${id}/confirm`, { data: {} });
    expect.soft([403, 404], `U09 ยืนยันของบีม ต้อง 403/404 (ได้ ${r.status()})`).toContain(r.status());
    const pf = await (await beam.get('/api/portfolio')).json();
    const voo = pf.holdings?.find((h: any) => h.symbol === 'VOO');
    expect.soft(voo?.shares, 'ข้อ 1 VOO ของบีมยัง 2.0000').toBe('2.0000');
    await openPortfolio(ui);
  });
  await ui.check(page.getByTestId('pf-shares-VOO'), 'ข้อ 1 VOO ของบีมยัง 2.0000', l => expect.soft(l).toHaveText('2.0000'));

  await test.step('2. U01 ส่งคำขอยืนยันรายการเดียวกัน 2 ครั้งห่าง 50 ms', async () => {
    const p1 = beam.post(`/api/dca/pending/${id}/confirm`, { data: {} });
    await page.waitForTimeout(50);
    const p2 = beam.post(`/api/dca/pending/${id}/confirm`, { data: {} });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect.soft(r1.status(), 'คำขอแรกสำเร็จ 200').toBe(200);
    expect.soft(r2.status(), 'คำขอที่ 2 ถูกปฏิเสธ 409').toBe(409);
  });

  await test.step('3. รีโหลด /th/portfolio', async () => { await openPortfolio(ui); });
  await ui.check(page.getByTestId('pf-shares-VOO'), 'ข้อ 3 VOO 2.2837', l => expect.soft(l).toHaveText('2.2837'));
  await ui.check(page.getByTestId('pf-avg-VOO'), 'ข้อ 3 เฉลี่ย $488.18', l => expect.soft(l).toHaveText('$488.18'));
  await ui.check(page.getByTestId('pf-value-usd-VOO'), 'ข้อ 3 มูลค่า $1,141.85', l => expect.soft(l).toHaveText('$1,141.85'));
  await ui.check(page.getByTestId('pf-pl-usd-VOO'), 'ข้อ 3 กำไร $26.99', l => expect.soft(l).toContainText('$26.99'));
  await ui.check(page.getByTestId('pf-cost-thb-VOO'), 'ข้อ 3 ต้นทุน ฿38,539.10', l => expect.soft(l).toHaveText('฿38,539.10'));
  await ui.check(page.getByTestId('pf-row-VOO'), 'ข้อ 3 ต้นทุน $1,114.86 (ผ่าน API)', async () => {
    const pf = await (await beam.get('/api/portfolio')).json();
    const voo = pf.holdings?.find((h: any) => h.symbol === 'VOO');
    expect.soft(voo?.costUsd, 'ข้อ 3 ต้นทุน VOO $').toBe('1114.86');
    expect.soft(voo?.shares, 'ข้อ 3 จำนวน VOO (API)').toBe('2.2837');
  });
  await ui.check(page.getByTestId('dca-pending-section'), 'ข้อ 3 รายการรอยืนยันเหลือ 0', async () => {
    await expect.soft(pendingRows(page), 'รายการรอยืนยันเหลือ 0').toHaveCount(0);
  });

  await test.step('4. กด "ข้าม" รายการที่ยืนยันแล้ว (POST /api/dca/pending/:id/skip)', async () => {
    const r = await beam.post(`/api/dca/pending/${id}/skip`, { data: {} });
    expect.soft(r.status(), 'ข้ามของที่ยืนยันแล้ว → 409').toBe(409);
    const body = await r.json().catch(() => ({}));
    expect.soft(body?.error?.code, 'รหัส ALREADY_DONE').toBe('ALREADY_DONE');
    await openPortfolio(ui);
  });
  await ui.check(page.getByTestId('pf-shares-VOO'), 'ข้อ 4 VOO ยัง 2.2837', l => expect.soft(l).toHaveText('2.2837'));

  await test.step('5. GET /api/transactions ดูรายการ VOO ทั้งหมดของบีม', async () => {
    const tx = ((await (await beam.get('/api/transactions')).json()).items ?? []).filter((x: any) => x.symbol === 'VOO');
    info.annotations.push({ type: 'observed', description: `VOO transactions: ${JSON.stringify(tx.map((x: any) => ({ d: x.tradeDate, s: x.source })))}` });
    expect.soft(tx.length, 'VOO 3 รายการ').toBe(3);
    const by = (d: string) => tx.find((x: any) => x.tradeDate === d)?.source;
    expect.soft(by('2026-02-02'), 'รายการ 2 ก.พ. ที่มา = manual').toBe('manual');
    expect.soft(by('2026-03-02'), 'รายการ 2 มี.ค. ที่มา = manual').toBe('manual');
    expect.soft(by('2026-11-25'), 'รายการ 25 พ.ย. ที่มา = dca').toBe('dca');
  });
  await ui.mark(page.getByTestId('tx-list'), 'ข้อ 5 รายการซื้อขาย VOO');
});

test('TC-DCA-03 · วันที่ 25 ตรงวันหยุด + รอบที่พลาด + กดข้าม @P1 @5.6', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 0: รายการ 25 พ.ย. หายจากรายการรอยืนยัน · VOO ยัง 2.0000 · ข้อ 1: 0 รายการ · ข้อ 2: 1 รายการ วันที่ 2026-12-28 · $142.86 / ค่าธรรมเนียม $1.00 / 0.2837 หุ้น · ข้อ 4: VOO 2.2837 · รายการรอยืนยันเหลือ 0',
    source: '[D] §6 (BR-45 · E126) · [D] A-08 (ข้ามได้ ไม่หมดอายุ)',
    frbr: 'FR-34 · BR-45 · BR-44',
    rules: 'R81',
  });

  await test.step('0. clock 2026-11-26 04:00 → tick → กด "ข้าม" รายการ 25 พ.ย.', async () => {
    await clockTick(api, '2026-11-26T04:00:00+07:00');
    await ui.login('beam');
    await openPortfolio(ui);
    const row = pendingRows(page).first();
    const id = ((await row.getAttribute('data-testid')) ?? '').replace('dca-pending-', '');
    await ui.mark(row, 'ข้อ 0 รายการ 25 พ.ย. ก่อนกดข้าม');
    await page.getByTestId(`dca-skip-${id}`).click();
    await ui.settle();
    await openPortfolio(ui);
  });
  await ui.check(page.getByTestId('dca-pending-section'), 'ข้อ 0 รายการ 25 พ.ย. หายจากรายการรอยืนยัน', async () => {
    await expect.soft(pendingRows(page), 'กดข้ามแล้วต้องไม่เหลือรายการ').toHaveCount(0);
  });
  await ui.check(page.getByTestId('pf-shares-VOO'), 'ข้อ 0 VOO ยัง 2.0000', l => expect.soft(l).toHaveText('2.0000'));

  await test.step('1. clock 2026-12-29 03:59:59 → tick → ดูรายการรอยืนยัน', async () => {
    await clockTick(api, '2026-12-29T03:59:59+07:00');
    await ui.login('beam'); // session 30 วันหมดอายุตามนาฬิกาที่เลื่อน ต้องเข้าสู่ระบบใหม่
    await openPortfolio(ui);
  });
  await ui.check(page.getByTestId('dca-pending-section'), 'ข้อ 1 0 รายการ (29 ธ.ค. 03:59:59)', async () => {
    await expect.soft(pendingRows(page), 'ก่อนรอบ 28 ธ.ค. ปิด ต้องไม่มีรายการ').toHaveCount(0);
  });

  await test.step('2. clock 2026-12-29 04:00:00 → tick → รีโหลด', async () => {
    await clockTick(api, '2026-12-29T04:00:00+07:00');
    await ui.login('beam');
    await openPortfolio(ui);
  });
  await ui.check(page.getByTestId('dca-pending-section'), 'ข้อ 2 1 รายการ', async () => {
    await expect.soft(pendingRows(page), 'ต้องมี 1 รายการ (รอบ 28 ธ.ค.)').toHaveCount(1);
  });
  const id = ((await pendingRows(page).first().getAttribute('data-testid').catch(() => null)) ?? 'dca-pending-0').replace('dca-pending-', '');
  await ui.check(page.getByTestId(`dca-pending-date-${id}`), 'ข้อ 2 วันที่ 2026-12-28', l => expect.soft(l).toHaveAttribute('data-value', '2026-12-28'));
  await ui.check(page.getByTestId(`dca-pending-usd-${id}`), 'ข้อ 2 เงิน $142.86', l => expect.soft(l).toHaveText('$142.86'));
  await ui.check(page.getByTestId(`dca-pending-fee-${id}`), 'ข้อ 2 ค่าธรรมเนียม $1.00', l => expect.soft(l).toHaveText('$1.00'));
  await ui.check(page.getByTestId(`dca-pending-shares-${id}`), 'ข้อ 2 0.2837 หุ้น', l => expect.soft(l).toHaveText('0.2837'));

  await test.step('3. กด "ยืนยัน" รายการ 28 ธ.ค.', async () => {
    const btn = page.getByTestId(`dca-confirm-${id}`);
    if (await btn.count()) { await btn.click(); await ui.settle(); }
    else expect.soft(false, 'ไม่มีปุ่มยืนยันรายการ 28 ธ.ค. ให้กด').toBe(true);
  });
  await test.step('4. รีโหลด ดู VOO ในพอร์ต', async () => { await openPortfolio(ui); });
  await ui.check(page.getByTestId('pf-shares-VOO'), 'ข้อ 4 VOO 2.2837', l => expect.soft(l).toHaveText('2.2837'));
  await ui.check(page.getByTestId('dca-pending-section'), 'ข้อ 4 รายการรอยืนยันเหลือ 0', async () => {
    await expect.soft(pendingRows(page), 'รายการรอยืนยันเหลือ 0').toHaveCount(0);
  });
});

test('TC-DCA-04 · แก้เงินในแผนแล้วจำนวนหุ้นต้องปัดลง (ไม่ใช่ปัดครึ่งขึ้น) @P1 @5.6', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: ทุกค่าถูกปฏิเสธ มีข้อความ error · แผนยังเป็น ฿5,000 วันที่ 25 · ข้อ 2: แผนแสดง ฿5,003 วันที่ 25 · ข้อ 4: เงิน $142.94 · ค่าธรรมเนียม $1.00 · ลงทุน $141.94 · จำนวน 0.2838 หุ้น',
    source: '[D] บ.27 §6 (BR-44 "ปัดลง") · [D] A-07 (แก้ได้ มีผลรอบถัดไป) · [R] ค่าเงิน/วันที่ต้องอยู่ในช่วง',
    frbr: 'FR-33 · BR-44',
    rules: 'R82',
  });

  await test.step('0. clock 2026-11-20 12:00 · เข้าสู่ระบบ U01 เปิดหน้าพอร์ต', async () => {
    await api.clock('2026-11-20T12:00:00+07:00');
    await ui.login('beam');
    await openPortfolio(ui);
  });

  const bad: { label: string; amount: string; day: string }[] = [
    { label: 'เงิน ฿0', amount: '0', day: '25' },
    { label: 'เงิน ฿-100', amount: '-100', day: '25' },
    { label: 'เงินว่าง', amount: '', day: '25' },
    { label: 'วันที่ 0', amount: '5000', day: '0' },
    { label: 'วันที่ 32', amount: '5000', day: '32' },
  ];
  for (const b of bad) {
    await test.step(`1. แก้แผน VOO เป็น ${b.label} กดบันทึก`, async () => {
      if ((await page.getByTestId('dca-form').getAttribute('data-mode')) !== 'edit') {
        await page.getByTestId('dca-edit-VOO').click();
      }
      await page.getByTestId('dca-amount').fill(b.amount);
      await page.getByTestId('dca-day').fill(b.day);
      await page.getByTestId('dca-save').click();
      await ui.settle();
    });
    await ui.check(page.getByTestId('dca-error'), `ข้อ 1 ${b.label} ถูกปฏิเสธ มีข้อความ error`, l => expect.soft(l).toBeVisible());
    await ui.check(page.getByTestId('dca-plan-line-VOO'), `ข้อ 1 ${b.label} แผนยังเป็น ฿5,000 วันที่ 25`, async (l) => {
      await expect.soft(l).toContainText('5,000');
      await expect.soft(l).toContainText('25');
    });
  }
  await test.step('1. ตรวจแผนผ่าน API หลังส่งค่าผิดทั้งหมด', async () => {
    const plans = (await (await page.request.get('/api/dca/plans')).json()).items ?? [];
    const voo = plans.find((p: any) => p.symbol === 'VOO');
    expect.soft(voo?.amountThb, 'แผนยัง ฿5,000').toBe('5000.00');
    expect.soft(voo?.dayOfMonth, 'แผนยังวันที่ 25').toBe(25);
  });

  await test.step('2. แก้เป็น ฿5,003 วันที่ 25 กดบันทึก · รีโหลด', async () => {
    await openPortfolio(ui);
    await page.getByTestId('dca-edit-VOO').click();
    await page.getByTestId('dca-amount').fill('5003');
    await page.getByTestId('dca-day').fill('25');
    await page.getByTestId('dca-save').click();
    await ui.settle();
    await openPortfolio(ui);
  });
  await ui.check(page.getByTestId('dca-plan-line-VOO'), 'ข้อ 2 แผนแสดง ฿5,003 วันที่ 25', async (l) => {
    await expect.soft(l).toContainText('5,003');
    await expect.soft(l).toContainText('25');
  });

  await test.step('3. clock 2026-11-26 04:00 → tick', async () => {
    await clockTick(api, '2026-11-26T04:00:00+07:00');
  });
  await test.step('4. ดูรายการรอยืนยัน', async () => { await openPortfolio(ui); });
  await ui.check(page.getByTestId('dca-pending-section'), 'ข้อ 4 มีรายการรอยืนยัน 1 รายการ', async () => {
    await expect.soft(pendingRows(page)).toHaveCount(1);
  });
  const id = ((await pendingRows(page).first().getAttribute('data-testid').catch(() => null)) ?? 'dca-pending-0').replace('dca-pending-', '');
  await ui.check(page.getByTestId(`dca-pending-usd-${id}`), 'ข้อ 4 เงิน $142.94', l => expect.soft(l).toHaveText('$142.94'));
  await ui.check(page.getByTestId(`dca-pending-fee-${id}`), 'ข้อ 4 ค่าธรรมเนียม $1.00', l => expect.soft(l).toHaveText('$1.00'));
  await ui.check(page.getByTestId(`dca-pending-invest-${id}`), 'ข้อ 4 ลงทุน $141.94', l => expect.soft(l).toHaveText('$141.94'));
  await ui.check(page.getByTestId(`dca-pending-shares-${id}`), 'ข้อ 4 จำนวน 0.2838 หุ้น (ปัดลง)', l => expect.soft(l).toHaveText('0.2838'));
});

test('TC-DCA-05 · หยุดแผนแล้วเปิดใหม่ (ไม่สร้างย้อนหลัง ไม่ทับประวัติ) @P1 @5.6', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 2: 0 รายการ · ข้อ 3: 0 รายการ (ไม่สร้างรอบ 25 พ.ย. ย้อนหลัง) · ข้อ 4: 1 รายการ วันที่ 2026-12-28 · 0.2837 หุ้น · วันสร้างแผนยังเป็น 2026-10-30',
    source: '[D] A-07 (หยุดได้ มีผลรอบถัดไป) · [R] ข้อมูลประวัติไม่ควรถูกเขียนทับ · [O-ยังไม่ยืนยัน] createdAt ถูกทับ (F ถามคนสร้างเว็บ ข้อ 13 · ข้อ 12 SPEC §5 ขัด A2)',
    frbr: 'FR-33 · FR-34 · BR-45',
    rules: 'R84 ⚠️',
  });

  await test.step('1. clock 2026-11-20 12:00 → หยุดแผน', async () => {
    await api.clock('2026-11-20T12:00:00+07:00');
    await ui.login('beam');
    await openPortfolio(ui);
    await page.getByTestId('dca-toggle-VOO').click();
    await ui.settle();
  });
  await ui.check(page.getByTestId('dca-plan-status-VOO'), 'ข้อ 1 แผนหยุดแล้ว', l => expect.soft(l).toHaveText('หยุดไว้'));

  await test.step('2. clock 2026-11-26 04:00 → tick → ดูรายการรอยืนยัน', async () => {
    await clockTick(api, '2026-11-26T04:00:00+07:00');
    await openPortfolio(ui);
  });
  await ui.check(page.getByTestId('dca-pending-section'), 'ข้อ 2 0 รายการ (แผนหยุด)', async () => {
    await expect.soft(pendingRows(page), 'แผนที่หยุดต้องไม่สร้างรายการ').toHaveCount(0);
  });

  await test.step('3. clock 2026-12-01 12:00 → เปิดแผนใหม่ → tick', async () => {
    await api.clock('2026-12-01T12:00:00+07:00');
    await ui.login('beam');
    await openPortfolio(ui);
    await page.getByTestId('dca-toggle-VOO').click();
    await ui.settle();
    await api.tick();
    await openPortfolio(ui);
  });
  await ui.check(page.getByTestId('dca-pending-section'), 'ข้อ 3 0 รายการ (ไม่สร้างรอบ 25 พ.ย. ย้อนหลัง)', async () => {
    await expect.soft(pendingRows(page), 'เปิดแผนใหม่ต้องไม่ตามทำรอบ 25 พ.ย.').toHaveCount(0);
  });

  await test.step('4. clock 2026-12-29 04:00 → tick → ดูรายการรอยืนยัน และรายละเอียดแผนใน API', async () => {
    await clockTick(api, '2026-12-29T04:00:00+07:00');
    await ui.login('beam'); // session 30 วันหมดอายุตามนาฬิกาที่เลื่อน
    await openPortfolio(ui);
  });
  await ui.check(page.getByTestId('dca-pending-section'), 'ข้อ 4 1 รายการ', async () => {
    await expect.soft(pendingRows(page), 'ต้องมีแค่รอบ 28 ธ.ค.').toHaveCount(1);
  });
  const items = await pendingItems(page.request);
  info.annotations.push({ type: 'observed', description: `pending: ${JSON.stringify(items.map((x: any) => ({ d: x.tradeDate, s: x.shares })))}` });
  expect.soft(items.map((x: any) => x.tradeDate), 'ข้อ 4 รายการเดียว วันที่ 2026-12-28').toEqual(['2026-12-28']);
  expect.soft(items.find((x: any) => x.tradeDate === '2026-12-28')?.shares, 'ข้อ 4 0.2837 หุ้น').toBe('0.2837');
  await ui.check(page.getByTestId('dca-plan-VOO'), 'ข้อ 4 วันสร้างแผนยังเป็น 2026-10-30 (API)', async () => {
    const plans = (await (await page.request.get('/api/dca/plans')).json()).items ?? [];
    const voo = plans.find((p: any) => p.symbol === 'VOO');
    info.annotations.push({ type: 'observed', description: `plan createdAt = ${voo?.createdAt}` });
    const created = voo?.createdAt
      ? new Date(voo.createdAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' })
      : null;
    expect.soft(created, 'วันสร้างแผน (เวลาไทย) ต้องยังเป็น 2026-10-30').toBe('2026-10-30');
  });
});

// ===================================================================
// กลุ่มปันผล
// ===================================================================

test('TC-DIV-01 · สิทธิ์ปันผล ก่อน / วัน / หลังวัน XD + ปัดเซนต์หลังภาษี @P1 @5.6', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 2: ปันผลที่ได้รับ 0 รายการ · ข้อ 3: 2 รายการ · KO 10 หุ้น ก่อนภาษี $5.10 หลังภาษี $4.34 ฿151.90 · O 1 หุ้น ก่อนภาษี $0.27 หลังภาษี $0.23 ฿8.05 · สรุป ธ.ค. หลังภาษี $4.57 / ฿159.95 · ข้อ 4: ยัง 2 รายการ ยอดเท่าเดิม',
    source: '[R] BR-49 (A-33 ⚠️ · E140–E142) · [D] บ.21 §7 BR-48 (E139) · [D] A-09 บันทึกในวันจ่าย',
    frbr: 'FR-37 · FR-38 · BR-48 · BR-49',
    rules: 'R86 · R85',
  });

  await test.step('0. clock 2026-12-03 12:00 · เข้าสู่ระบบ U09 เปิดหน้าพอร์ต', async () => {
    await api.clock('2026-12-03T12:00:00+07:00');
    await ui.login('fon');
    await openPortfolio(ui);
  });
  const txs = [
    { symbol: 'KO', date: '2026-11-30', shares: '10', price: '68.00' },
    { symbol: 'KO', date: '2026-12-01', shares: '10', price: '68.00' },
    { symbol: 'KO', date: '2026-12-02', shares: '10', price: '68.00' },
    { symbol: 'O', date: '2026-11-27', shares: '1', price: '58.00' },
  ];
  for (const t of txs) {
    await test.step(`1. จด ${t.symbol} ${t.shares} หุ้น @ $${t.price} วันที่ ${t.date}`, async () => {
      await page.getByTestId('tx-side-buy').click();
      await page.getByTestId('tx-symbol').fill(t.symbol);
      await page.getByTestId('tx-date').fill(t.date);
      await page.getByTestId('tx-shares').fill(t.shares);
      await page.getByTestId('tx-price').fill(t.price);
      const resp = page.waitForResponse(r => r.url().includes('/api/transactions') && r.request().method() === 'POST');
      await page.getByTestId('tx-submit').click();
      const r = await resp;
      expect.soft(r.status(), `บันทึก ${t.symbol} ${t.date}`).toBe(201);
      await ui.settle();
    });
  }
  await ui.mark(page.getByTestId('tx-list'), 'ข้อ 1 จดครบ 4 รายการ');

  await test.step('2. clock 2026-12-14 22:00 → tick → เปิด /th/dividends?month=2026-12', async () => {
    await clockTick(api, '2026-12-14T22:00:00+07:00');
    await openDividends(ui, '/th/dividends?month=2026-12');
  });
  await ui.check(page.getByTestId('div-received'), 'ข้อ 2 ปันผลที่ได้รับ 0 รายการ', async () => {
    await expect.soft(rcvRows(page), 'ก่อนวันจ่ายต้องไม่มีรายการ').toHaveCount(0);
  });

  const checkStep3 = async (tag: string) => {
    await ui.check(page.getByTestId('div-received'), `${tag} 2 รายการ`, async () => {
      await expect.soft(rcvRows(page), 'ปันผลที่ได้รับ 2 รายการ').toHaveCount(2);
    });
    await ui.check(page.getByTestId('div-rcv-shares-KO-2026-12-15'), `${tag} KO 10 หุ้น`, l => expect.soft(l).toHaveText(/^10(\.0+)?$/));
    await ui.check(page.getByTestId('div-rcv-gross-KO-2026-12-15'), `${tag} KO ก่อนภาษี $5.10`, l => expect.soft(l).toHaveText('$5.10'));
    await ui.check(page.getByTestId('div-rcv-net-usd-KO-2026-12-15'), `${tag} KO หลังภาษี $4.34`, l => expect.soft(l).toHaveText('$4.34'));
    await ui.check(page.getByTestId('div-rcv-net-thb-KO-2026-12-15'), `${tag} KO ฿151.90`, l => expect.soft(l).toHaveText('฿151.90'));
    await ui.check(page.getByTestId('div-rcv-shares-O-2026-12-15'), `${tag} O 1 หุ้น`, l => expect.soft(l).toHaveText(/^1(\.0+)?$/));
    await ui.check(page.getByTestId('div-rcv-gross-O-2026-12-15'), `${tag} O ก่อนภาษี $0.27`, l => expect.soft(l).toHaveText('$0.27'));
    await ui.check(page.getByTestId('div-rcv-net-usd-O-2026-12-15'), `${tag} O หลังภาษี $0.23`, l => expect.soft(l).toHaveText('$0.23'));
    await ui.check(page.getByTestId('div-rcv-net-thb-O-2026-12-15'), `${tag} O ฿8.05`, l => expect.soft(l).toHaveText('฿8.05'));
    await ui.check(page.getByTestId('div-monthly-2026-12-usd'), `${tag} สรุป ธ.ค. $4.57`, l => expect.soft(l).toHaveText('$4.57'));
    await ui.check(page.getByTestId('div-monthly-2026-12-thb'), `${tag} สรุป ธ.ค. ฿159.95`, l => expect.soft(l).toHaveText('฿159.95'));
  };

  await test.step('3. clock 2026-12-15 22:00 → tick → รีโหลด', async () => {
    await clockTick(api, '2026-12-15T22:00:00+07:00');
    await openDividends(ui, '/th/dividends?month=2026-12');
  });
  await checkStep3('ข้อ 3');

  await test.step('4. tick อีกครั้ง → รีโหลด', async () => {
    await api.tick();
    await openDividends(ui, '/th/dividends?month=2026-12');
  });
  await checkStep3('ข้อ 4 (tick ซ้ำ)');
});

test('TC-DIV-02 · ปันผลของลุงสมชาย 3 ตัว + สรุปรายเดือน @P1 @5.6', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: 0 รายการ · ข้อ 2: JNJ 50 หุ้น ก่อนภาษี $65.00 หลังภาษี $55.25 ฿1,933.75 · ข้อ 3: เพิ่ม O 200 หุ้น $54.00 → $45.90 → ฿1,606.50 · KO 100 หุ้น $51.00 → $43.35 → ฿1,517.25 · สรุป ธ.ค. หลังภาษี $144.50 / ฿5,057.50 · ข้อ 4: ยัง 3 รายการ $144.50 · สรุป พ.ย. ฿0.00 (ไม่มีรายการ) · ไม่มี PG VOO',
    source: '[D] บ.21 บ.42 §7 (E135–E138) · [D] A-09',
    frbr: 'FR-37 · FR-38 · BR-48 · BR-49',
    rules: 'R85',
  });

  await test.step('1. clock 2026-12-07 22:00 → tick → เปิด /th/dividends?month=2026-12', async () => {
    await clockTick(api, '2026-12-07T22:00:00+07:00');
    await ui.login('somchai');
    await openDividends(ui, '/th/dividends?month=2026-12');
  });
  await ui.check(page.getByTestId('div-received'), 'ข้อ 1 0 รายการ', async () => {
    await expect.soft(rcvRows(page), 'ก่อนวันจ่าย JNJ ต้องไม่มีรายการ').toHaveCount(0);
  });

  await test.step('2. clock 2026-12-08 22:00 → tick → รีโหลด', async () => {
    await clockTick(api, '2026-12-08T22:00:00+07:00');
    await openDividends(ui, '/th/dividends?month=2026-12');
  });
  await ui.check(page.getByTestId('div-received'), 'ข้อ 2 มี JNJ 1 รายการ', async () => {
    await expect.soft(rcvRows(page)).toHaveCount(1);
  });
  await ui.check(page.getByTestId('div-rcv-shares-JNJ-2026-12-08'), 'ข้อ 2 JNJ 50 หุ้น', l => expect.soft(l).toHaveText(/^50(\.0+)?$/));
  await ui.check(page.getByTestId('div-rcv-gross-JNJ-2026-12-08'), 'ข้อ 2 JNJ ก่อนภาษี $65.00', l => expect.soft(l).toHaveText('$65.00'));
  await ui.check(page.getByTestId('div-rcv-net-usd-JNJ-2026-12-08'), 'ข้อ 2 JNJ หลังภาษี $55.25', l => expect.soft(l).toHaveText('$55.25'));
  await ui.check(page.getByTestId('div-rcv-net-thb-JNJ-2026-12-08'), 'ข้อ 2 JNJ ฿1,933.75', l => expect.soft(l).toHaveText('฿1,933.75'));

  const checkDec = async (tag: string) => {
    await ui.check(page.getByTestId('div-received'), `${tag} 3 รายการ`, async () => {
      await expect.soft(rcvRows(page), '3 รายการ').toHaveCount(3);
    });
    await ui.check(page.getByTestId('div-rcv-shares-O-2026-12-15'), `${tag} O 200 หุ้น`, l => expect.soft(l).toHaveText(/^200(\.0+)?$/));
    await ui.check(page.getByTestId('div-rcv-gross-O-2026-12-15'), `${tag} O $54.00`, l => expect.soft(l).toHaveText('$54.00'));
    await ui.check(page.getByTestId('div-rcv-net-usd-O-2026-12-15'), `${tag} O $45.90`, l => expect.soft(l).toHaveText('$45.90'));
    await ui.check(page.getByTestId('div-rcv-net-thb-O-2026-12-15'), `${tag} O ฿1,606.50`, l => expect.soft(l).toHaveText('฿1,606.50'));
    await ui.check(page.getByTestId('div-rcv-shares-KO-2026-12-15'), `${tag} KO 100 หุ้น`, l => expect.soft(l).toHaveText(/^100(\.0+)?$/));
    await ui.check(page.getByTestId('div-rcv-gross-KO-2026-12-15'), `${tag} KO $51.00`, l => expect.soft(l).toHaveText('$51.00'));
    await ui.check(page.getByTestId('div-rcv-net-usd-KO-2026-12-15'), `${tag} KO $43.35`, l => expect.soft(l).toHaveText('$43.35'));
    await ui.check(page.getByTestId('div-rcv-net-thb-KO-2026-12-15'), `${tag} KO ฿1,517.25`, l => expect.soft(l).toHaveText('฿1,517.25'));
    await ui.check(page.getByTestId('div-monthly-2026-12-usd'), `${tag} สรุป ธ.ค. $144.50`, l => expect.soft(l).toHaveText('$144.50'));
    await ui.check(page.getByTestId('div-monthly-2026-12-thb'), `${tag} สรุป ธ.ค. ฿5,057.50`, l => expect.soft(l).toHaveText('฿5,057.50'));
  };

  await test.step('3. clock 2026-12-15 22:00 → tick → รีโหลด', async () => {
    await clockTick(api, '2026-12-15T22:00:00+07:00');
    await openDividends(ui, '/th/dividends?month=2026-12');
  });
  await checkDec('ข้อ 3');

  await test.step('4. tick ซ้ำ → รีโหลด', async () => {
    await api.tick();
    await openDividends(ui, '/th/dividends?month=2026-12');
  });
  await checkDec('ข้อ 4 (tick ซ้ำ)');
  await ui.check(page.getByTestId('div-total-net'), 'ข้อ 4 รวมหลังภาษี $144.50', l => expect.soft(l).toHaveText('$144.50'));
  await ui.check(page.getByTestId('div-received'), 'ข้อ 4 ไม่มี PG VOO', async () => {
    await expect.soft(page.getByTestId(/^div-rcv-(PG|VOO)-\d/), 'ไม่มีปันผล PG VOO').toHaveCount(0);
  });

  await test.step('4. เปิด ?month=2026-11 ดูสรุป พ.ย.', async () => {
    await openDividends(ui, '/th/dividends?month=2026-11');
  });
  await ui.check(page.getByTestId('div-received'), 'ข้อ 4 สรุป พ.ย. ฿0.00 (ไม่มีรายการ)', async () => {
    await expect.soft(page.getByTestId(/^div-rcv-[A-Z.]+-2026-11-\d{2}$/), 'ไม่มีรายการจ่ายใน พ.ย.').toHaveCount(0);
    const nov = page.getByTestId('div-monthly-2026-11-thb');
    if (await nov.count()) await expect.soft(nov, 'สรุป พ.ย.').toHaveText('฿0.00');
    else info.annotations.push({ type: 'observed', description: 'หน้า ?month=2026-11 ไม่มีแถวสรุป พ.ย. (ไม่แสดง ฿0.00) · ตรวจผ่าน API แทน' });
    const rcv = await (await page.request.get('/api/dividends/received')).json();
    const m = (rcv.monthly ?? []).find((x: any) => x.month === '2026-11');
    expect.soft(m ? m.netThb : '0.00', 'สรุป พ.ย. (API) ฿0.00').toBe('0.00');
  });
});

test('TC-DIV-03 · ผลตอบแทน 2 ค่า (กำไรจากราคา / รวมปันผล) @P1 @5.6', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: กำไรจากราคา $2,296.90 · รวมปันผล $2,296.90 · ข้อ 3–4: กำไรจากราคา $2,296.90 · รวมปันผล $2,441.40 ($2,296.90 + $144.50) · ตัวเลขเหมือนกันทุกหน้า/ภาษา',
    source: '[D] §7 (E143 E144) · ⚠️ T-03 ราคาอนาคตคงที่',
    frbr: 'FR-39 · BR-50',
    rules: 'R87',
  });

  const checkDiv = async (tag: string, price: string, total: string) => {
    await ui.check(page.getByTestId('div-return-price'), `${tag} กำไรจากราคา ${price}`, l => expect.soft(l).toContainText(price));
    await ui.check(page.getByTestId('div-return-total'), `${tag} รวมปันผล ${total}`, l => expect.soft(l).toContainText(total));
  };
  const checkPf = async (tag: string, price: string, total: string) => {
    await ui.check(page.getByTestId('pf-total-pl-usd'), `${tag} พอร์ต กำไรจากราคา ${price}`, l => expect.soft(l).toContainText(price));
    await ui.check(page.getByTestId('pf-total-return'), `${tag} พอร์ต รวมปันผล ${total}`, l => expect.soft(l).toContainText(total));
  };

  await test.step('1. วันล็อก เปิด /th/dividends', async () => {
    await ui.login('somchai');
    await openDividends(ui, '/th/dividends');
  });
  await checkDiv('ข้อ 1 /th/dividends', '$2,296.90', '$2,296.90');
  await test.step('1. วันล็อก เปิด /th/portfolio', async () => { await openPortfolio(ui); });
  await checkPf('ข้อ 1 /th/portfolio', '$2,296.90', '$2,296.90');

  await test.step('2. ทำ TC-DIV-02 ข้อ 2–3 (clock 8 ธ.ค. → tick · 15 ธ.ค. → tick)', async () => {
    await clockTick(api, '2026-12-08T22:00:00+07:00');
    await clockTick(api, '2026-12-15T22:00:00+07:00');
  });

  await test.step('3. clock 2026-12-16 22:00 เปิด /th/dividends', async () => {
    await api.clock('2026-12-16T22:00:00+07:00');
    await ui.login('somchai'); // session 30 วันหมดอายุตามนาฬิกาที่เลื่อน
    await openDividends(ui, '/th/dividends');
  });
  await checkDiv('ข้อ 3 /th/dividends', '$2,296.90', '$2,441.40');
  await test.step('3. เปิด /en/dividends', async () => { await openDividends(ui, '/en/dividends'); });
  await checkDiv('ข้อ 3 /en/dividends', '$2,296.90', '$2,441.40');
  await test.step('3. เปิด /th/portfolio', async () => { await openPortfolio(ui); });
  await checkPf('ข้อ 3 /th/portfolio', '$2,296.90', '$2,441.40');

  await test.step('4. รีโหลด', async () => { await page.reload(); await ui.settle(); });
  await checkPf('ข้อ 4 รีโหลด /th/portfolio', '$2,296.90', '$2,441.40');
  await test.step('4. รีโหลด /th/dividends', async () => { await openDividends(ui, '/th/dividends'); await page.reload(); await ui.settle(); });
  await checkDiv('ข้อ 4 รีโหลด /th/dividends', '$2,296.90', '$2,441.40');
});

test('TC-DIV-04 · ปฏิทินปันผล: หุ้นในพอร์ต + เฝ้าดูเท่านั้น และข้อความเรื่องสิทธิ์ @P1 @5.6', async ({ page, ui, api }, info) => {
  meta(info, {
    expected: 'ข้อ 1 (บีม พ.ย.): มี JNJ XD 24 พ.ย. 2569 · จ่าย 8 ธ.ค. 2569 · $1.30/หุ้น · ไม่มี O · ไม่มี BRK.B AAPL VOO · ข้อ 2 (บีม ธ.ค.): มี KO (XD 1 ธ.ค. · จ่าย 15 ธ.ค. · $0.51) และ JNJ (จ่าย 8 ธ.ค.) · การ์ด JNJ ต้องไม่มีข้อความ "ต้องถือหุ้นก่อนวันนี้…" · ไม่มี O · ข้อ 3: ไม่มีหุ้น · ข้อ 4 (ลุงสมชาย พ.ย.): JNJ (XD 24) และ O (XD 30 · $0.27)',
    source: '[D] บ.42 §1 (FR-36) · ⚠️ A-31 · [R] BR-49 หลัง XD ซื้อแล้วไม่ได้ปันผล · [O-ยังไม่ยืนยัน] เดือนกรองด้วย XD หรือวันจ่าย (F ถามลูกค้า ข้อ 13) · ใช้สมมติฐาน 8.2 #12',
    frbr: 'FR-36 · BR-49',
    rules: 'R88 · R89 ⚠️',
  });

  await test.step('1. เข้าสู่ระบบ U01 เปิด /th/dividends?month=2026-11', async () => {
    await ui.login('beam');
    await openDividends(ui, '/th/dividends?month=2026-11');
  });
  await ui.check(page.getByTestId('div-cal-JNJ-2026-11-24'), 'ข้อ 1 บีม พ.ย. มี JNJ', l => expect.soft(l).toBeVisible());
  await ui.check(page.getByTestId('div-cal-xd-JNJ-2026-11-24'), 'ข้อ 1 JNJ XD 24 พ.ย. 2569', l => expect.soft(l).toContainText('24 พ.ย. 2569'));
  await ui.check(page.getByTestId('div-cal-pay-JNJ-2026-11-24'), 'ข้อ 1 JNJ จ่าย 8 ธ.ค. 2569', l => expect.soft(l).toContainText('8 ธ.ค. 2569'));
  await ui.check(page.getByTestId('div-cal-amount-JNJ-2026-11-24'), 'ข้อ 1 JNJ $1.30/หุ้น', l => expect.soft(l).toContainText('$1.30'));
  await ui.check(page.getByTestId('div-calendar'), 'ข้อ 1 ไม่มี O BRK.B AAPL VOO', async () => {
    await expect.soft(page.getByTestId(/^div-cal-O-\d/), 'บีมไม่มี O').toHaveCount(0);
    await expect.soft(page.getByTestId(/^div-cal-(BRK\.B|AAPL|VOO)-\d/), 'ไม่มี BRK.B AAPL VOO').toHaveCount(0);
  });

  await test.step('2. เปิด ?month=2026-12', async () => { await openDividends(ui, '/th/dividends?month=2026-12'); });
  await ui.check(page.getByTestId('div-cal-KO-2026-12-01'), 'ข้อ 2 บีม ธ.ค. มี KO', l => expect.soft(l).toBeVisible());
  await ui.check(page.getByTestId('div-cal-xd-KO-2026-12-01'), 'ข้อ 2 KO XD 1 ธ.ค.', l => expect.soft(l).toContainText('1 ธ.ค.'));
  await ui.check(page.getByTestId('div-cal-pay-KO-2026-12-01'), 'ข้อ 2 KO จ่าย 15 ธ.ค.', l => expect.soft(l).toContainText('15 ธ.ค.'));
  await ui.check(page.getByTestId('div-cal-amount-KO-2026-12-01'), 'ข้อ 2 KO $0.51', l => expect.soft(l).toContainText('$0.51'));
  await ui.check(page.getByTestId('div-cal-JNJ-2026-11-24'), 'ข้อ 2 บีม ธ.ค. มี JNJ (จ่าย 8 ธ.ค.)', l => expect.soft(l).toBeVisible());
  await ui.check(page.getByTestId('div-cal-pay-JNJ-2026-11-24'), 'ข้อ 2 JNJ จ่าย 8 ธ.ค.', l => expect.soft(l).toContainText('8 ธ.ค.'));
  // แก้แผนหลัง LAB 12 (PLAN-FIX-2): วันล็อก 6 พ.ย. ยังไม่ถึง XD 24 พ.ย. ข้อความ "ต้องถือก่อน" จึงถูกตาม BR-49 · ความเสี่ยงจริง (R89) คือหลัง XD แล้ว → เลื่อนนาฬิกาไป 25 พ.ย. แล้วตรวจ
  await ui.check(page.getByTestId('div-cal-JNJ-2026-11-24'), 'ข้อ 2 วันล็อก (ก่อน XD) การ์ด JNJ มี "ต้องถือหุ้นก่อนวันนี้…"', l => expect.soft(l).toContainText('ต้องถือหุ้นก่อนวันนี้'));
  await test.step('2b. เลื่อนนาฬิกาเป็น 25 พ.ย. 2569 10:00 (หลัง XD) แล้วเปิด ธ.ค. ใหม่', async () => {
    await api.clock('2026-11-25T10:00:00+07:00');
    await openDividends(ui, '/th/dividends?month=2026-12');
  });
  await ui.check(page.getByTestId('div-cal-JNJ-2026-11-24'), 'ข้อ 2b หลัง XD การ์ด JNJ ไม่มีข้อความ "ต้องถือหุ้นก่อนวันนี้…"', l => expect.soft(l).not.toContainText('ต้องถือหุ้นก่อนวันนี้'));
  await test.step('2c. คืนนาฬิกาเป็นวันล็อก', async () => { await api.clock('2026-11-06T22:00:00+07:00'); });
  await ui.check(page.getByTestId('div-calendar'), 'ข้อ 2 ไม่มี O', async () => {
    await expect.soft(page.getByTestId(/^div-cal-O-\d/), 'บีมไม่มี O').toHaveCount(0);
  });

  await test.step('3. เปิด ?month=2027-01', async () => { await openDividends(ui, '/th/dividends?month=2027-01'); });
  await ui.check(page.getByTestId('div-calendar'), 'ข้อ 3 ม.ค. 2570 ไม่มีหุ้น', async () => {
    await expect.soft(calCards(page), 'ไม่มีการ์ด').toHaveCount(0);
  });

  await test.step('4. ทำซ้ำข้อ 1 ด้วย U03 ลุงสมชาย', async () => {
    await logout(page);
    await ui.login('somchai');
    await openDividends(ui, '/th/dividends?month=2026-11');
  });
  await ui.check(page.getByTestId('div-cal-JNJ-2026-11-24'), 'ข้อ 4 ลุงสมชาย พ.ย. มี JNJ', l => expect.soft(l).toBeVisible());
  await ui.check(page.getByTestId('div-cal-xd-JNJ-2026-11-24'), 'ข้อ 4 JNJ XD 24', l => expect.soft(l).toContainText('24 พ.ย.'));
  await ui.check(page.getByTestId('div-cal-O-2026-11-30'), 'ข้อ 4 ลุงสมชาย พ.ย. มี O', l => expect.soft(l).toBeVisible());
  await ui.check(page.getByTestId('div-cal-xd-O-2026-11-30'), 'ข้อ 4 O XD 30', l => expect.soft(l).toContainText('30 พ.ย.'));
  await ui.check(page.getByTestId('div-cal-amount-O-2026-11-30'), 'ข้อ 4 O $0.27', l => expect.soft(l).toContainText('$0.27'));
});

test('TC-DIV-05 · ตัวหนังสือใหญ่จำไว้กับบัญชี (ข้ามเครื่อง) @P2 @5.6', async ({ page, ui, browser }, info) => {
  meta(info, {
    expected: 'ข้อ 1: สวิตช์ยังเปิด · ข้อความ ≥ 20px · ข้อ 2: เปิดอยู่แล้วโดยไม่ต้องกด · ข้อความ ≥ 20px · ข้อ 4: กลับเป็นขนาดปกติ (< 20px) สวิตช์ปิด · ข้อ 5: U01 ขนาดปกติ (< 20px) · acct-bigfont data-state=off ไม่ติดค่าของ U09 · ข้อ 6: ค่าต่ำสุด ≥ 20px',
    source: '[D] บ.44 §9 (FR-40) · ⚠️ A-10 (จำกับบัญชี)',
    frbr: 'FR-40 (+ NFR-03 ขนาด 20px)',
    rules: 'R121 ❌ (ปุ่มธีม 18px · checkbox 13.33px บันทึกเพิ่มถ้าเห็น) · C8 "FR-40 จำค่า ยังไม่ได้ลอง"',
  });

  const use = info.project.use as any;
  const ctxB = await browser.newContext({
    baseURL: use.baseURL, locale: use.locale, timezoneId: use.timezoneId, viewport: use.viewport ?? { width: 1280, height: 720 },
  });
  const pageB = await ctxB.newPage();
  const gotoB = async (path: string) => {
    await pageB.goto(path);
    await pageB.locator('html[data-ready="true"]').waitFor({ state: 'attached', timeout: 30_000 });
    await pageB.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  };
  const shotB = async (label: string) => {
    const s = await pageB.screenshot().catch(() => null);
    if (s) await info.attach(`B ${label}`, { body: s, contentType: 'image/png' });
  };
  const toggle = async (p: Page) => {
    const sw = p.getByTestId('acct-bigfont');
    await Promise.all([
      p.waitForEvent('load', { timeout: 15_000 }).catch(() => {}),
      sw.click({ force: true }),
    ]);
    await p.locator('html[data-ready="true"]').waitFor({ state: 'attached', timeout: 30_000 });
    await p.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  };

  try {
    await test.step('1. A: เข้าสู่ระบบ U09 เปิดตัวหนังสือใหญ่ → รีโหลด', async () => {
      await ui.login('fon');
      await ui.goto('/th/account', 'account-page');
      await toggle(page);
      await page.reload();
      await ui.goto('/th/account', 'account-page');
    });
    await ui.check(page.getByTestId('acct-bigfont'), 'ข้อ 1 A สวิตช์ยังเปิด', l => expect.soft(l).toHaveAttribute('data-state', 'on'));
    await ui.check(page.locator('body'), 'ข้อ 1 A ข้อความ ≥ 20px', async () => {
      const fs = await bodyFontPx(page);
      info.annotations.push({ type: 'observed', description: `ข้อ 1 A body font-size = ${fs}px` });
      expect.soft(fs, 'ข้อ 1 ขนาดข้อความ').toBeGreaterThanOrEqual(20);
    });

    await test.step('2. B: เข้าสู่ระบบ U09 เปิด /th/dividends วัดขนาดตัวหนังสือ', async () => {
      const r = await pageB.request.post('/api/auth/login', { data: { email: 'fon@pordee.test', password: 'Pordee#2569' } });
      expect(r.ok(), 'B login U09').toBeTruthy();
      await gotoB('/th/dividends');
      await shotB('ข้อ 2 /th/dividends');
      const fs = await bodyFontPx(pageB);
      info.annotations.push({ type: 'observed', description: `ข้อ 2 B body font-size = ${fs}px` });
      expect.soft(fs, 'ข้อ 2 B ข้อความ ≥ 20px โดยไม่ต้องกด').toBeGreaterThanOrEqual(20);
      await gotoB('/th/account');
      await shotB('ข้อ 2 /th/account');
      await expect.soft(pageB.getByTestId('acct-bigfont'), 'ข้อ 2 B สวิตช์เปิดอยู่แล้ว').toHaveAttribute('data-state', 'on');
    });

    await test.step('3. B: ปิดตัวหนังสือใหญ่', async () => {
      await toggle(pageB);
      await shotB('ข้อ 3 หลังปิด');
    });

    await test.step('4. A: รีโหลด /th/dividends', async () => {
      await ui.goto('/th/dividends', 'dividends-page');
      await ui.settle();
    });
    await ui.check(page.locator('body'), 'ข้อ 4 A กลับเป็นขนาดปกติ (< 20px)', async () => {
      const fs = await bodyFontPx(page);
      info.annotations.push({ type: 'observed', description: `ข้อ 4 A body font-size = ${fs}px` });
      expect.soft(fs, 'ข้อ 4 ขนาดปกติ').toBeLessThan(20);
    });
    await test.step('4. A: ดูสวิตช์ที่ /th/account', async () => { await ui.goto('/th/account', 'account-page'); });
    await ui.check(page.getByTestId('acct-bigfont'), 'ข้อ 4 A สวิตช์ปิด', l => expect.soft(l).toHaveAttribute('data-state', 'off'));

    await test.step('5. A: ออกจากระบบ → เข้าสู่ระบบ U01 ดูหน้าเดียวกัน', async () => {
      await logout(page);
      await ui.login('beam');
      await ui.goto('/th/dividends', 'dividends-page');
      await ui.settle();
    });
    await ui.check(page.locator('body'), 'ข้อ 5 U01 ขนาดปกติ (< 20px)', async () => {
      const fs = await bodyFontPx(page);
      info.annotations.push({ type: 'observed', description: `ข้อ 5 U01 body font-size = ${fs}px` });
      expect.soft(fs, 'ข้อ 5 U01 ขนาดปกติ').toBeLessThan(20);
    });
    await test.step('5. A: U01 เปิด /th/account', async () => { await ui.goto('/th/account', 'account-page'); });
    await ui.check(page.getByTestId('acct-bigfont'), 'ข้อ 5 U01 acct-bigfont data-state=off', l => expect.soft(l).toHaveAttribute('data-state', 'off'));

    await test.step('6. เปิดตัวหนังสือใหญ่ (U03 ลุงสมชาย ค่า seed = เปิด) วัดค่าต่ำสุดใน /th/portfolio', async () => {
      await logout(page);
      await ui.login('somchai');
      await openPortfolio(ui);
    });
    await ui.check(page.getByTestId('portfolio-page'), 'ข้อ 6 ค่าต่ำสุด font-size ≥ 20px', async () => {
      const r = await page.evaluate(() => {
        let min = Infinity; let who = ''; const excluded: string[] = [];
        document.querySelectorAll('body *').forEach((e) => {
          const el = e as HTMLElement;
          const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent ?? '').join('').trim();
          if (!own) return;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || el.offsetParent === null && cs.position !== 'fixed') return;
          const fs = parseFloat(cs.fontSize);
          if (own === '☾' || own === '☀' || (el as HTMLInputElement).type === 'checkbox') { excluded.push(`${own}:${fs}px`); return; }
          if (fs < min) { min = fs; who = `${el.dataset.testid || el.tagName}:"${own.slice(0, 30)}"`; }
        });
        return { min, who, excluded };
      });
      info.annotations.push({ type: 'observed', description: `ข้อ 6 ค่าต่ำสุด ${r.min}px ที่ ${r.who} · ไม่นับ (R121): ${r.excluded.join(', ') || '-'}` });
      expect.soft(r.min, `ข้อ 6 ค่าต่ำสุด font-size (${r.who})`).toBeGreaterThanOrEqual(20);
    });
  } finally {
    await ctxB.close();
  }
});
