// หัวข้อ 5.2 หุ้น กราฟ และตัวชี้วัด (TC-CHART-01..10) · ตาม TEST-PLAN.md
// ค่าคาดหวังทุกตัวมาจากแผน ห้ามแก้ตามจอ
import { test, expect, meta } from '../fixtures/pordee';
import type { Page } from '@playwright/test';

const STOCK = 'stock-page';

/** เปิดหน้าหุ้นแล้วรอกราฟ + ตัวชี้วัดโหลดเสร็จ */
async function openStock(page: Page, ui: any, sym: string, lang = 'th') {
  await ui.goto(`/${lang}/stocks/${sym}`, STOCK);
  await page.getByTestId('stock-chart').and(page.locator('[data-ready="true"]')).waitFor({ timeout: 20_000 }).catch(() => {});
  await expect(page.getByTestId('stock-indicators')).not.toHaveAttribute('data-state', 'loading', { timeout: 20_000 }).catch(() => {});
  await ui.settle();
}

/** ชี้เมาส์บนกราฟให้ตรงแท่งวันที่ date (ค้นแบบแบ่งครึ่งจาก data-date ของ stock-ohlc-date) */
async function hoverBar(page: Page, date: string): Promise<string | null> {
  const chart = page.getByTestId('stock-chart');
  await chart.scrollIntoViewIfNeeded();
  const b = await chart.boundingBox();
  if (!b) return null;
  const y = b.y + b.height * 0.45;
  const dateAt = async (x: number) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(60);
    return page.getByTestId('stock-ohlc-date').getAttribute('data-date');
  };
  let lo = b.x + 2;
  let hi = b.x + b.width - 2;
  let got: string | null = null;
  for (let i = 0; i < 18 && hi - lo > 1; i++) {
    const mid = (lo + hi) / 2;
    got = await dateAt(mid);
    if (got === date) return got;
    if (got && got < date) lo = mid; else hi = mid;
  }
  // ไล่ละเอียดรอบ ๆ จุดสุดท้าย
  for (let dx = -12; dx <= 12; dx++) {
    got = await dateAt(lo + dx);
    if (got === date) return got;
  }
  return got;
}

const ohlc = (page: Page) => ({
  date: page.getByTestId('stock-ohlc-date'),
  open: page.getByTestId('stock-ohlc-open'),
  high: page.getByTestId('stock-ohlc-high'),
  low: page.getByTestId('stock-ohlc-low'),
  close: page.getByTestId('stock-ohlc-close'),
});

// ---------------------------------------------------------------------------
test('TC-CHART-01 · ค้นหาหุ้น: ตลาดที่รองรับ ชื่อย่อยืดหยุ่น หุ้นนอกตลาด และหุ้นถูกถอด @P2 @5.2', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: '`AAPL` → Apple Inc. · NASDAQ · `VOO` → พบ · ตลาดมีคำว่า "NYSE" (ยอมรับ "NYSE" หรือ "NYSE Arca" ตาม E02) · `brk-b` → **BRK.B** (ไม่ใช่ BRK.A หรือ 0 ผล) · `Apple` → AAPL เป็นผลแรก · `NSRGY` → "ไม่รองรับหุ้นนอกตลาด NYSE / NASDAQ" (0 ผล) · `OLDC` → "ไม่พบหุ้นนี้" · ค่าที่มี `\'` → 0 ผล + "ไม่พบหุ้นนี้" ไม่มี error 500',
    source: '[D] บ.10 บ.65 §1 §3 (TEST-DATA E01–E06) · [R] input ที่มีอักขระพิเศษ · (RV2-04) ตัด `Nestl` ออก',
    frbr: 'FR-01 · FR-02 · BR-01',
    rules: 'R20 R21 R22 · R50 ❌',
  });
  const results = page.locator('[data-testid^="stock-result-"]');
  const notice = page.getByTestId('search-notice');
  const search = async (q: string) => {
    await test.step(`พิมพ์ "${q}" ในช่องค้นหาหัวเว็บแล้วกด Enter`, async () => {
      await ui.goto('/th');
      const box = page.getByTestId('core-search-input');
      await box.fill(q);
      await box.press('Enter');
      await page.waitForURL(/\/search/, { timeout: 10_000 }).catch(() => {});
      await expect(page.getByTestId('search-page')).not.toHaveAttribute('data-state', 'loading', { timeout: 15_000 }).catch(() => {});
      await ui.settle();
    });
  };

  await search('AAPL');
  await ui.check(results.first(), 'AAPL ผลแรก Apple Inc. · NASDAQ', async (l) => {
    await expect.soft(l, 'AAPL ผลแรกเป็น AAPL').toHaveAttribute('data-testid', 'stock-result-AAPL');
    await expect.soft(l, 'AAPL ชื่อ Apple Inc.').toContainText('Apple Inc.');
    await expect.soft(l, 'AAPL ตลาด NASDAQ').toContainText('NASDAQ');
  });

  await search('VOO');
  await ui.check(page.getByTestId('stock-result-VOO'), 'VOO พบ + ตลาดมีคำว่า NYSE', async (l) => {
    await expect.soft(l, 'VOO ต้องพบ').toBeVisible();
    await expect.soft(l, 'VOO ตลาดมีคำว่า NYSE').toContainText('NYSE');
  });

  await search('brk-b');
  await ui.check(results.first(), 'brk-b → BRK.B', async (l) => {
    await expect.soft(results, 'brk-b ต้องไม่ใช่ 0 ผล').not.toHaveCount(0);
    await expect.soft(l, 'brk-b ผลแรกเป็น BRK.B').toHaveAttribute('data-testid', 'stock-result-BRK.B');
    await expect.soft(page.getByTestId('stock-result-BRK.A'), 'ไม่ใช่ BRK.A').toHaveCount(0);
  });

  await search('Apple');
  await ui.check(results.first(), 'Apple → AAPL เป็นผลแรก', (l) => expect.soft(l, 'Apple ผลแรก AAPL').toHaveAttribute('data-testid', 'stock-result-AAPL'));

  await search('NSRGY');
  await ui.check(notice, 'NSRGY → ข้อความไม่รองรับหุ้นนอกตลาด', async (l) => {
    await expect.soft(l, 'NSRGY ข้อความ OTC').toHaveText('ไม่รองรับหุ้นนอกตลาด NYSE / NASDAQ');
    await expect.soft(results, 'NSRGY 0 ผล').toHaveCount(0);
  });

  await search('OLDC');
  await ui.check(notice, 'OLDC → ไม่พบหุ้นนี้', async (l) => {
    await expect.soft(l, 'OLDC ข้อความ').toHaveText('ไม่พบหุ้นนี้');
    await expect.soft(results, 'OLDC ต้องไม่ขึ้นในผล').toHaveCount(0);
  });

  const inj = "AAPL' OR '1'='1";
  await search(inj);
  await ui.check(notice, 'ค่าที่มี \' → 0 ผล + ไม่พบหุ้นนี้', async (l) => {
    await expect.soft(l, 'ค่าที่มี \' ข้อความ').toHaveText('ไม่พบหุ้นนี้');
    await expect.soft(results, 'ค่าที่มี \' 0 ผล').toHaveCount(0);
    await expect.soft(page.getByTestId('error-page'), 'ไม่มีหน้า error').toHaveCount(0);
  });
  await test.step('ตรวจ API ค้นหาด้วยค่าที่มี \' ไม่ตอบ 500', async () => {
    const r = await api.guest.get(`/api/stocks?q=${encodeURIComponent(inj)}`);
    expect.soft(r.status(), 'API ค้นหาค่าที่มี \' ไม่ใช่ 500').toBeLessThan(500);
    const j = await r.json().catch(() => ({}));
    expect.soft(j.results?.length ?? -1, 'API ค้นหาค่าที่มี \' 0 ผล').toBe(0);
  });

  await test.step('3. ทำซ้ำที่ /en/search สำหรับ NSRGY', async () => {
    await ui.goto('/en/search');
    await page.getByTestId('search-input').fill('NSRGY');
    await page.getByTestId('search-submit').click();
    await ui.settle();
  });
  await ui.check(notice, '/en/search NSRGY → notice OTC (0 ผล)', async (l) => {
    await expect.soft(l, '/en NSRGY ต้องเป็น notice OTC ไม่ใช่ไม่พบ').toHaveAttribute('data-code', 'OTC_NOT_SUPPORTED');
    await expect.soft(results, '/en NSRGY 0 ผล').toHaveCount(0);
  });
  info.annotations.push({ type: 'note', description: `/en NSRGY ข้อความที่เห็น: ${await notice.innerText().catch(() => '(ไม่มี)')}` });
});

// ---------------------------------------------------------------------------
test('TC-CHART-02 · ข้อมูลพื้นฐาน P/E ปันผล มูลค่าตลาด + วันที่ + ค่าที่ไม่มี @P1 @5.2', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ZA01: P/E 26.00 · ปันผล 0.05% · มูลค่าตลาด 11,000 ล้านดอลลาร์ (รูปแบบใดก็ได้ที่อ่านได้ 11B) · วันที่ข้อมูล 5 พ.ย. 2569 · BRK.B: P/E 20.00 · ปันผล "ไม่มี" · KO: P/E 20.01 · ปันผล 3.00% · RIVN: P/E "ไม่มี" · ปันผล "ไม่มี"',
    source: '[D] บ.22 §1 (TEST-DATA 3.1, 3.2) · วันที่ข้อมูล ⚠️ A-02',
    frbr: 'FR-07',
    rules: 'F05',
  });
  const pe = page.getByTestId('stock-pe');
  const div = page.getByTestId('stock-div');
  const cap = page.getByTestId('stock-cap');
  const fdate = page.getByTestId('stock-fund-date');

  await test.step('1. เปิด /th/stocks/ZA01', async () => { await openStock(page, ui, 'ZA01'); });
  await ui.check(pe, 'ZA01 P/E 26.00', (l) => expect.soft(l, 'ZA01 P/E').toHaveText('26.00'));
  await ui.check(div, 'ZA01 ปันผล 0.05%', (l) => expect.soft(l, 'ZA01 ปันผล').toHaveText('0.05%'));
  await ui.check(cap, 'ZA01 มูลค่าตลาด 11B', (l) => expect.soft(l, 'ZA01 มูลค่าตลาดอ่านได้ 11B').toHaveText(/(^|\D)11(\.0+)?\s*B|11,000\s*ล้าน/));
  await ui.check(fdate, 'ZA01 วันที่ข้อมูล 5 พ.ย. 2569', (l) => expect.soft(l, 'ZA01 วันที่ข้อมูล').toContainText('5 พ.ย. 2569'));

  await test.step('2. เปิด BRK.B', async () => { await openStock(page, ui, 'BRK.B'); });
  await ui.check(pe, 'BRK.B P/E 20.00', (l) => expect.soft(l, 'BRK.B P/E').toHaveText('20.00'));
  await ui.check(div, 'BRK.B ปันผล ไม่มี', (l) => expect.soft(l, 'BRK.B ปันผล').toHaveText('ไม่มี'));

  await test.step('2. เปิด KO', async () => { await openStock(page, ui, 'KO'); });
  await ui.check(pe, 'KO P/E 20.01', (l) => expect.soft(l, 'KO P/E').toHaveText('20.01'));
  await ui.check(div, 'KO ปันผล 3.00%', (l) => expect.soft(l, 'KO ปันผล').toHaveText('3.00%'));

  await test.step('2. เปิด RIVN', async () => { await openStock(page, ui, 'RIVN'); });
  await ui.check(pe, 'RIVN P/E ไม่มี', (l) => expect.soft(l, 'RIVN P/E').toHaveText('ไม่มี'));
  await ui.check(div, 'RIVN ปันผล ไม่มี', (l) => expect.soft(l, 'RIVN ปันผล').toHaveText('ไม่มี'));

  await test.step('3. เทียบกับ API ข้อมูลหุ้น', async () => {
    const get = async (s: string) => (await (await api.guest.get(`/api/stocks/${s}`)).json()).stock ?? {};
    const za = await get('ZA01');
    expect.soft(za.pe, 'API ZA01 pe').toBe('26.00');
    expect.soft(za.divYieldPct, 'API ZA01 divYieldPct').toBe('0.05');
    expect.soft(Number(za.marketCapUsd), 'API ZA01 marketCapUsd').toBe(11_000_000_000);
    expect.soft(za.fundamentalsDate, 'API ZA01 fundamentalsDate').toBe('2026-11-05');
    const brk = await get('BRK.B');
    expect.soft(brk.pe, 'API BRK.B pe').toBe('20.00');
    expect.soft(brk.divYieldPct, 'API BRK.B ไม่จ่ายปันผล').toBeNull();
    const ko = await get('KO');
    expect.soft(ko.pe, 'API KO pe').toBe('20.01');
    expect.soft(ko.divYieldPct, 'API KO divYieldPct').toBe('3.00');
    const rv = await get('RIVN');
    expect.soft(rv.pe, 'API RIVN pe').toBeNull();
    expect.soft(rv.divYieldPct, 'API RIVN divYieldPct').toBeNull();
  });
  await ui.mark(page.getByTestId('stock-fundamentals'), 'กล่องข้อมูลพื้นฐาน RIVN (เทียบ API แล้ว)');
});

// ---------------------------------------------------------------------------
test('TC-CHART-03 · หุ้นถูกถอด OLDC: ราคาสุดท้ายค้าง ป้าย "หยุดซื้อขาย" และวันที่ @P1 @5.2', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: ราคา **$3.20** + "หยุดซื้อขาย" · ข้อ 2: ยังเป็น $3.20 · ข้อ 1–3: วันที่ของราคาและตัวชี้วัด = **2 ต.ค. 2569** ทั้งหน้าเว็บและ API · ข้อ 4: OLDC ราคา $3.20 + "หยุดซื้อขาย" · มูลค่า $32.00 (10 × 3.20) · ต้นทุน **$31.00** (10 × 3.00 + ค่าธรรมเนียมขั้นต่ำ $1.00) · กำไร **+$1.00** (RV2-03)',
    source: '[D] §3 (FR-08) · [R] ราคาเก่าต้องบอกวันที่ · ส่วน "ต้องมีวันที่" = [O-ยังไม่ยืนยัน] · การจดซื้อ OLDC ใช้สมมติฐาน 8.2 #27',
    frbr: 'FR-08 · FR-02 · FR-13 · FR-14',
    rules: 'R16 ❌ · R36 ⚠️ · R50 ❌',
  });
  await ui.login('fon');
  const price = page.getByTestId('quote-price-OLDC');
  const halted = page.getByTestId('quote-halted-OLDC');
  const asof = page.getByTestId('quote-asof-OLDC');
  const indAsof = page.getByTestId('stock-ind-asof');

  await test.step('1. เปิด /th/stocks/OLDC ด้วย URL ตรง', async () => { await openStock(page, ui, 'OLDC'); });
  await ui.check(price, 'ข้อ 1 ราคา $3.20', (l) => expect.soft(l, 'OLDC ราคาข้อ 1').toHaveText('$3.20'));
  await ui.check(halted, 'ข้อ 1 ป้าย หยุดซื้อขาย', (l) => expect.soft(l, 'OLDC ป้ายข้อ 1').toHaveText('หยุดซื้อขาย'));
  await ui.check(indAsof, 'ข้อ 1 วันที่ตัวชี้วัด 2 ต.ค. 2569', (l) => expect.soft(l, 'OLDC วันที่ตัวชี้วัด').toContainText('2 ต.ค. 2569'));
  await ui.check(asof, 'ข้อ 1 วันที่ของราคา 2 ต.ค. 2569 (8.1 #16 · 8.2 #7)', (l) => expect.soft(l, 'OLDC วันที่ของราคาข้อ 1 ต้องมี 2 ต.ค. 2569').toContainText('2 ต.ค. 2569'));

  await test.step('2. feed OLDC price 5.00 + clearCache แล้วรีโหลด', async () => {
    await api.feed({ symbol: 'OLDC', mode: 'price', price: 5.0, clearCache: true });
    await page.reload();
    await openStock(page, ui, 'OLDC');
  });
  await ui.check(price, 'ข้อ 2 ยังเป็น $3.20', (l) => expect.soft(l, 'OLDC ราคาหลัง feed 5.00').toHaveText('$3.20'));
  await ui.check(halted, 'ข้อ 2 ป้าย หยุดซื้อขาย', (l) => expect.soft(l, 'OLDC ป้ายข้อ 2').toHaveText('หยุดซื้อขาย'));
  await ui.check(indAsof, 'ข้อ 2 วันที่ตัวชี้วัด 2 ต.ค. 2569', (l) => expect.soft(l, 'OLDC วันที่ตัวชี้วัดข้อ 2').toContainText('2 ต.ค. 2569'));
  await ui.check(asof, 'ข้อ 2 วันที่ของราคา 2 ต.ค. 2569 (8.1 #16 · 8.2 #7)', (l) => expect.soft(l, 'OLDC วันที่ของราคาข้อ 2 ต้องมี 2 ต.ค. 2569').toContainText('2 ต.ค. 2569'));

  await test.step('3. API ตัวชี้วัด OLDC ไม่ส่ง to', async () => {
    const j = await (await api.guest.get('/api/stocks/OLDC/indicators')).json();
    // วันที่ของตัวชี้วัด = วันที่ของจุดสุดท้ายในซีรีส์ (ไม่ใช่ j.to ซึ่งเป็นช่วงที่ขอ)
    for (const k of ['sma50', 'sma200', 'rsi14']) {
      const arr = Array.isArray(j[k]) ? j[k] : [];
      expect.soft(arr.length, `API ตัวชี้วัด OLDC ${k} ต้องมีข้อมูล`).toBeGreaterThan(0);
      expect.soft(arr[arr.length - 1]?.date, `API ตัวชี้วัด OLDC ${k} จุดสุดท้าย = 2026-10-02`).toBe('2026-10-02');
    }
    const q = await (await api.guest.get('/api/stocks/OLDC')).json();
    expect.soft(q.quote?.price, 'API ราคา OLDC ค้าง 3.2000').toBe('3.2000');
    expect.soft(String(q.quote?.asOf ?? '').slice(0, 10), 'API วันที่ราคา OLDC 2026-10-02').toBe('2026-10-02');
  });
  await ui.mark(indAsof, 'ข้อ 3 เทียบวันที่ตัวชี้วัดกับ API');

  await test.step('4. ที่ /th/portfolio จดซื้อ OLDC 10 หุ้น $3.00 วันที่ 2026-09-01', async () => {
    await ui.goto('/th/portfolio', 'portfolio-page');
    await page.getByTestId('tx-side-buy').click();
    await page.getByTestId('tx-symbol').fill('OLDC');
    await page.getByTestId('tx-date').fill('2026-09-01');
    await page.getByTestId('tx-shares').fill('10');
    await page.getByTestId('tx-price').fill('3.00');
    await page.getByTestId('tx-submit').click();
    await page.getByTestId('pf-row-OLDC').waitFor({ timeout: 15_000 }).catch(() => {});
    await ui.settle();
  });
  await ui.check(page.getByTestId('pf-price-OLDC'), 'ข้อ 4 ราคา $3.20', (l) => expect.soft(l, 'พอร์ต OLDC ราคา').toHaveText('$3.20'));
  await ui.check(page.getByTestId('pf-halted-OLDC'), 'ข้อ 4 ป้าย หยุดซื้อขาย', (l) => expect.soft(l, 'พอร์ต OLDC ป้าย').toHaveText('หยุดซื้อขาย'));
  await ui.check(page.getByTestId('pf-value-usd-OLDC'), 'ข้อ 4 มูลค่า $32.00', (l) => expect.soft(l, 'พอร์ต OLDC มูลค่า').toHaveText('$32.00'));
  await ui.check(page.getByTestId('pf-total-cost-usd'), 'ข้อ 4 ต้นทุน $31.00', (l) => expect.soft(l, 'พอร์ต ต้นทุน (มีแค่ OLDC)').toHaveText('$31.00'));
  await ui.check(page.getByTestId('pf-pl-usd-OLDC'), 'ข้อ 4 กำไร +$1.00', (l) => expect.soft(l, 'พอร์ต OLDC กำไร').toHaveText('+$1.00'));
  await test.step('ตรวจ API พอร์ต', async () => {
    const j = await (await page.request.get('/api/portfolio')).json();
    const h = (j.holdings ?? []).find((x: any) => x.symbol === 'OLDC') ?? {};
    expect.soft(h.priceUsd, 'API พอร์ต OLDC ราคา').toBe('3.2000');
    expect.soft(h.valueUsd, 'API พอร์ต OLDC มูลค่า').toBe('32.00');
    expect.soft(h.costUsd, 'API พอร์ต OLDC ต้นทุน').toBe('31.00');
    expect.soft(h.plUsd, 'API พอร์ต OLDC กำไร').toBe('1.00');
  });
});

// ---------------------------------------------------------------------------
test('TC-CHART-04 · กราฟแท่งเทียนรายวัน/รายสัปดาห์ และค่าเมื่อชี้แท่ง @P2 @5.2', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'แท่ง 4 พ.ย. (i = −1): เปิด 237.5040 / 237.50 · ปิด 238.7520 / 238.75 · สูง 239.9458 / 239.95 · ต่ำ 236.3165 / 236.32 · วันที่ 4 พ.ย. 2569 · สัปดาห์ 26–30 ต.ค.: วันที่แท่ง 26 ต.ค. (จันทร์) · เปิด 238.3680 / 238.37 · ปิด 239.8080 / 239.81 · สูง 243.3226 / 243.32 · ต่ำ 237.1762 / 237.18 · ข้อ 5: ขาด 0 ตัว ซ้ำ 0 ตัว (ถ้าลิงก์ TradingView เป็นตัวเดียวที่ขาด บันทึกแยก)',
    source: '[D] บ.33 §4 (FR-10 · TEST-DATA E77) · ชี้แท่ง [R] ⚠️ A-03 · ข้อ 5 [D] NFR-16 ⚠️ A-28 · [O-ยังไม่ยืนยัน] ยกเว้นลิงก์ TradingView',
    frbr: 'FR-10 · FR-11 · NFR-16',
    rules: 'R35 ✅ · R120 ❌',
  });
  const o = ohlc(page);
  await test.step('1. เปิด /th/stocks/AAPL เลือกรายวัน', async () => {
    await openStock(page, ui, 'AAPL');
    await page.getByTestId('stock-interval-day').click();
    await ui.settle();
  });
  await ui.check(page.getByTestId('stock-adjusted-state'), 'โหมดราคาปรับแล้ว', (l) => expect.soft(l, 'เริ่มที่ราคาปรับแล้ว').toHaveAttribute('data-state', 'adjusted'));
  await test.step('1. ชี้แท่ง 4 พ.ย. 2569', async () => { await hoverBar(page, '2026-11-04'); });
  await ui.check(page.getByTestId('stock-ohlc'), 'แท่งรายวัน 4 พ.ย. 2569', async () => {
    await expect.soft(o.date, 'วันที่แท่ง').toHaveAttribute('data-date', '2026-11-04');
    await expect.soft(o.date, 'วันที่บนจอ').toHaveText('4 พ.ย. 2569');
    await expect.soft(o.open, 'เปิด 4 ตำแหน่ง').toHaveAttribute('data-value', '237.5040');
    await expect.soft(o.open, 'เปิดบนจอ').toHaveText('237.50');
    await expect.soft(o.close, 'ปิด 4 ตำแหน่ง').toHaveAttribute('data-value', '238.7520');
    await expect.soft(o.close, 'ปิดบนจอ').toHaveText('238.75');
    await expect.soft(o.high, 'สูง 4 ตำแหน่ง').toHaveAttribute('data-value', '239.9458');
    await expect.soft(o.high, 'สูงบนจอ').toHaveText('239.95');
    await expect.soft(o.low, 'ต่ำ 4 ตำแหน่ง').toHaveAttribute('data-value', '236.3165');
    await expect.soft(o.low, 'ต่ำบนจอ').toHaveText('236.32');
  });

  await test.step('2. สลับเป็นรายสัปดาห์ ชี้แท่งสัปดาห์ 26 ต.ค.', async () => {
    await page.getByTestId('stock-interval-week').click();
    await expect(page.getByTestId('stock-chart-card')).toHaveAttribute('data-interval', 'week', { timeout: 10_000 }).catch(() => {});
    await ui.settle();
    await hoverBar(page, '2026-10-26');
  });
  await ui.check(page.getByTestId('stock-ohlc'), 'แท่งรายสัปดาห์ 26 ต.ค. 2569', async () => {
    await expect.soft(o.date, 'วันที่แท่งสัปดาห์ (จันทร์)').toHaveAttribute('data-date', '2026-10-26');
    await expect.soft(o.date, 'วันที่บนจอ').toHaveText('26 ต.ค. 2569');
    await expect.soft(o.open, 'เปิดสัปดาห์ 4 ตำแหน่ง').toHaveAttribute('data-value', '238.3680');
    await expect.soft(o.open, 'เปิดสัปดาห์บนจอ').toHaveText('238.37');
    await expect.soft(o.close, 'ปิดสัปดาห์ 4 ตำแหน่ง').toHaveAttribute('data-value', '239.8080');
    await expect.soft(o.close, 'ปิดสัปดาห์บนจอ').toHaveText('239.81');
    await expect.soft(o.high, 'สูงสัปดาห์ 4 ตำแหน่ง').toHaveAttribute('data-value', '243.3226');
    await expect.soft(o.high, 'สูงสัปดาห์บนจอ').toHaveText('243.32');
    await expect.soft(o.low, 'ต่ำสัปดาห์ 4 ตำแหน่ง').toHaveAttribute('data-value', '237.1762');
    await expect.soft(o.low, 'ต่ำสัปดาห์บนจอ').toHaveText('237.18');
  });

  await test.step('3. รีโหลด จดโหมดที่เห็น (ไม่ตัดสิน)', async () => {
    await page.reload();
    await openStock(page, ui, 'AAPL');
    const mode = await page.getByTestId('stock-chart-card').getAttribute('data-interval');
    info.annotations.push({ type: 'pending', description: `หลังรีโหลดโหมดแท่ง = ${mode} (จดไว้ ไม่ตัดสิน)` });
  });
  await ui.mark(page.getByTestId('stock-interval-week'), 'ข้อ 3 โหมดหลังรีโหลด');

  await test.step('4. เทียบกับ API แท่งเทียนทั้ง 2 แบบ', async () => {
    const d = await (await api.guest.get('/api/stocks/AAPL/candles?from=2026-11-04&to=2026-11-04')).json();
    const b = (d.bars ?? []).find((x: any) => x.date === '2026-11-04') ?? {};
    expect.soft(b.open, 'API รายวัน 4 พ.ย. เปิด').toBe('237.5040');
    expect.soft(b.close, 'API รายวัน 4 พ.ย. ปิด').toBe('238.7520');
    expect.soft(b.high, 'API รายวัน 4 พ.ย. สูง').toBe('239.9458');
    expect.soft(b.low, 'API รายวัน 4 พ.ย. ต่ำ').toBe('236.3165');
    const w = await (await api.guest.get('/api/stocks/AAPL/candles?from=2026-10-26&to=2026-10-30&interval=week')).json();
    const wb = (w.bars ?? [])[0] ?? {};
    expect.soft(wb.date, 'API รายสัปดาห์ วันที่แท่ง').toBe('2026-10-26');
    expect.soft(wb.open, 'API รายสัปดาห์ เปิด').toBe('238.3680');
    expect.soft(wb.close, 'API รายสัปดาห์ ปิด').toBe('239.8080');
    expect.soft(wb.high, 'API รายสัปดาห์ สูง').toBe('243.3226');
    expect.soft(wb.low, 'API รายสัปดาห์ ต่ำ').toBe('237.1762');
  });

  await test.step('5. (NFR-16) สแกน a button input select ที่กดได้', async () => {
    await openStock(page, ui, 'AAPL');
    const scan = await page.evaluate(() => {
      const els = [...document.querySelectorAll('a,button,input,select')] as HTMLElement[];
      const usable = els.filter((e) => !(e as HTMLInputElement).disabled && (e as HTMLInputElement).type !== 'hidden');
      const miss = usable.filter((e) => !e.dataset.testid).map((e) => ({ tv: /tradingview\.com/.test((e as HTMLAnchorElement).href || ''), html: e.outerHTML.slice(0, 100) }));
      const ids = usable.map((e) => e.dataset.testid).filter(Boolean) as string[];
      const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
      return { total: usable.length, miss, dup };
    });
    const tvMiss = scan.miss.filter((m) => m.tv);
    const otherMiss = scan.miss.filter((m) => !m.tv);
    info.annotations.push({ type: 'note', description: `NFR-16 สแกน ${scan.total} ตัว · ขาด testid ${scan.miss.length} (TradingView ${tvMiss.length}) · ซ้ำ ${scan.dup.length} ${scan.dup.join(',')}` });
    if (tvMiss.length) info.annotations.push({ type: 'note', description: `ลิงก์ TradingView ไม่มี data-testid ${tvMiss.length} ตัว (บันทึกแยก · 8.2 #24 ยังไม่ยกเว้น จึงนับเป็นขาด · R120)` });
    expect.soft(otherMiss.map((m) => m.html), 'NFR-16 ตัวที่ขาด data-testid (นอกจาก TradingView) ต้อง 0').toEqual([]);
    expect.soft(tvMiss.map((m) => m.html), 'NFR-16 ลิงก์ TradingView ที่ขาด data-testid ต้อง 0 (8.2 #24 ยังไม่ยกเว้น · R120)').toEqual([]);
    expect.soft(scan.dup, 'NFR-16 data-testid ซ้ำ ต้อง 0').toEqual([]);
  });
  await ui.mark(page.getByTestId('stock-chart'), 'ข้อ 5 กราฟ (ลิงก์ TradingView อยู่มุมกราฟ)');
});

// ---------------------------------------------------------------------------
test('TC-CHART-05 · ช่วงวันที่กราฟตามสิทธิ์ Free และความสอดคล้องหลัง error @P2 @5.2', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: ได้ · แท่งแรก 6 พ.ย. 2568 · ข้อ 2: "ระดับ Free ดูย้อนหลังได้ถึง 6 พ.ย. 2568" · ช่อง from กับแท่งแรกของกราฟบอกวันเดียวกัน (ทั้งคู่ 6 พ.ย. 2568 หรือคงช่วงก่อนหน้าทั้งคู่) · ไม่มีแท่งก่อน 6 พ.ย. 2568 · ข้อ 3: กลับเป็นช่วงที่ถูกสิทธิ์ · ข้อ 4: มี error บอกว่าวันเริ่มหลังวันสิ้นสุด กราฟไม่เปลี่ยน · ข้อ 5: GET /api/stocks/AAPL/candles?from=2025-11-05 → 403 ไม่มีข้อมูลราคา (สมมติฐาน 8.2 #28) (RV2-05)',
    source: '[D] บ.14 (FR-12 + ข้อความวันแรก TEST-DATA) · [R] ช่องกับกราฟต้องตรงกัน (ถามคนสร้างเว็บข้อ 17)',
    frbr: 'FR-12',
    rules: 'R23 ✅ · R25 ✅ · R26 ⚠️',
  });
  await ui.login('beam');
  const from = page.getByTestId('stock-range-from');
  const to = page.getByTestId('stock-range-to');
  const err = page.getByTestId('stock-range-error');
  const rows = page.locator('tr[data-testid^="stock-bar-"]');
  const firstBar = async () => {
    const ids = await rows.evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') || '').replace('stock-bar-', '')).sort());
    return ids[0] ?? null;
  };
  const apply = async (f: string, t?: string) => {
    await from.fill(f);
    if (t) await to.fill(t);
    await page.getByTestId('stock-range-apply').click();
    await page.waitForTimeout(800);
    await ui.settle();
  };

  await test.step('1. เปิดหน้า AAPL ตั้ง from 2025-11-06 (to 2026-11-06) กดดู', async () => {
    await openStock(page, ui, 'AAPL');
    await apply('2025-11-06', '2026-11-06');
    await page.getByTestId('stock-bars-toggle').click();
    await rows.first().waitFor({ timeout: 10_000 }).catch(() => {});
  });
  await ui.check(page.getByTestId('stock-bars'), 'ข้อ 1 แท่งแรก 6 พ.ย. 2568', async () => {
    await expect.soft(err, 'ข้อ 1 ไม่มี error').toHaveCount(0);
    expect.soft(await firstBar(), 'ข้อ 1 แท่งแรก').toBe('2025-11-06');
  });

  await test.step('2. ตั้ง from 2025-11-05 กดดู', async () => { await apply('2025-11-05'); });
  await ui.check(err, 'ข้อ 2 ข้อความ ระดับ Free', (l) => expect.soft(l, 'ข้อ 2 ข้อความ').toHaveText('ระดับ Free ดูย้อนหลังได้ถึง 6 พ.ย. 2568'));
  const fromVal = await from.inputValue();
  const fb = await firstBar();
  info.annotations.push({ type: 'note', description: `ข้อ 2 ช่อง from = ${fromVal} · แท่งแรกของกราฟ = ${fb}` });
  await ui.check(from, 'ข้อ 2 ช่อง from ตรงกับแท่งแรกของกราฟ', async () => {
    expect.soft(fromVal, 'ข้อ 2 ช่อง from กับแท่งแรกต้องบอกวันเดียวกัน').toBe(fb);
    expect.soft((fb ?? '9999') >= '2025-11-06', 'ข้อ 2 ไม่มีแท่งก่อน 6 พ.ย. 2568').toBe(true);
  });

  await test.step('3. รีโหลดหน้า', async () => {
    await page.reload();
    await openStock(page, ui, 'AAPL');
  });
  await ui.check(from, 'ข้อ 3 ช่วงกลับเป็นช่วงที่ถูกสิทธิ์', async (l) => {
    const v = await l.inputValue();
    expect.soft(v >= '2025-11-06', `ข้อ 3 ช่อง from (${v}) ต้องไม่ก่อน 2025-11-06`).toBe(true);
    await expect.soft(err, 'ข้อ 3 ไม่มี error ค้าง').toHaveCount(0);
  });

  await test.step('4. ตั้ง from 2026-10-10 to 2026-10-01 กดดู', async () => {
    await page.getByTestId('stock-bars-toggle').click().catch(() => {});
    await rows.first().waitFor({ timeout: 5_000 }).catch(() => {});
  });
  const barsBefore = await page.getByTestId('stock-chart').getAttribute('data-bars');
  const firstBefore = await firstBar();
  await test.step('4. กดดูช่วงกลับด้าน', async () => { await apply('2026-10-10', '2026-10-01'); });
  await ui.check(err, 'ข้อ 4 error วันเริ่มหลังวันสิ้นสุด', async (l) => {
    await expect.soft(l, 'ข้อ 4 ต้องมี error').toBeVisible();
    await expect.soft(l, 'ข้อ 4 error บอกเรื่องวันเริ่ม/วันสิ้นสุด').toContainText(/วันเริ่ม|วันสิ้นสุด/);
  });
  await ui.check(page.getByTestId('stock-chart'), 'ข้อ 4 กราฟไม่เปลี่ยน', async (l) => {
    await expect.soft(l, 'ข้อ 4 จำนวนแท่งเท่าเดิม').toHaveAttribute('data-bars', barsBefore ?? '');
    expect.soft(await firstBar(), 'ข้อ 4 แท่งแรกเท่าเดิม').toBe(firstBefore);
  });

  await test.step('5. เรียก API แท่งเทียน from 2025-11-05 ตรง ๆ', async () => {
    const beam = await api.as('beam');
    const r = await beam.get('/api/stocks/AAPL/candles?from=2025-11-05');
    expect.soft(r.status(), 'ข้อ 5 API from=2025-11-05 → 403').toBe(403);
    const j = await r.json().catch(() => ({}));
    expect.soft(j.bars, 'ข้อ 5 ไม่มีข้อมูลราคา').toBeUndefined();
  });
  await ui.mark(page.getByTestId('stock-range-earliest'), 'ข้อ 5 วันแรกที่ดูได้ (API ตรวจแล้ว)');
});

// ---------------------------------------------------------------------------
test('TC-CHART-06 · เส้นค่าเฉลี่ย 50/200 วัน: ค่า เปิด/ปิด ข้อมูลไม่พอ ขอบ 49/50 วัน และไม่นับวันหยุด @P1 @5.2', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: 50 วัน 238.80 · 200 วัน 235.22 · ปิดเส้นแล้วเส้น 50 วันหาย เส้น 200 ยังอยู่ · ข้อ 2: ไม่มีเส้น · "ข้อมูลไม่พอ (ต้องมี 50 วันทำการ)" และ "ข้อมูลไม่พอ (ต้องมี 200 วันทำการ)" · ข้อ 3: 03:59:59 (49 วัน) ยังไม่มีเส้น 50 วัน · 04:00:00 (รอบ 19 พ.ย. ปิด = 50 วัน) มีเส้น ค่าวันที่ 19 พ.ย. 19.94 (19.9376) · เส้น 200 วันยังไม่มี · ข้อ 4: แท่งและจุดเส้นมี 24, 25, 27 พ.ย. · ไม่มี 26 พ.ย.',
    source: '[D] บ.15–16 §4 (TEST-DATA E71–E73, E75, E76) · [D+R] วิธีคิดค่า',
    frbr: 'FR-13 · BR-26 · BR-27',
    rules: 'R27 ✅ · R28 ✅',
  });
  const s50 = page.getByTestId('stock-sma50-latest');
  const s200 = page.getByTestId('stock-sma200-latest');
  const t50 = page.getByTestId('stock-sma50-toggle');
  const t200 = page.getByTestId('stock-sma200-toggle');
  const ne50 = page.getByTestId('stock-sma50-notenough');
  const ne200 = page.getByTestId('stock-sma200-notenough');

  await test.step('1. เปิด AAPL เปิดเส้น 50 และ 200 วัน', async () => {
    await openStock(page, ui, 'AAPL');
    await t50.check();
    await t200.check();
  });
  await ui.check(s50, 'ข้อ 1 เส้น 50 วัน 238.80', async (l) => {
    await expect.soft(l, 'AAPL 50 วันบนจอ').toHaveText('238.80');
    await expect.soft(l, 'AAPL 50 วัน 4 ตำแหน่ง').toHaveAttribute('data-value', '238.8000');
  });
  await ui.check(s200, 'ข้อ 1 เส้น 200 วัน 235.22', async (l) => {
    await expect.soft(l, 'AAPL 200 วันบนจอ').toHaveText('235.22');
    await expect.soft(l, 'AAPL 200 วัน 4 ตำแหน่ง').toHaveAttribute('data-value', '235.2240');
  });
  const before = await page.getByTestId('stock-chart').screenshot();
  await test.step('1. ปิดเส้น 50 วัน', async () => { await t50.uncheck(); await page.waitForTimeout(500); });
  const after = await page.getByTestId('stock-chart').screenshot();
  await ui.check(page.getByTestId('stock-chart'), 'ข้อ 1 ปิดเส้น 50 วันแล้วเหลือเส้น 200', async () => {
    await expect.soft(t50, 'สวิตช์ 50 วันปิด').not.toBeChecked();
    await expect.soft(t200, 'สวิตช์ 200 วันยังเปิด').toBeChecked();
    expect.soft(Buffer.compare(before, after) !== 0, 'ภาพกราฟต้องเปลี่ยนหลังปิดเส้น 50 วัน').toBe(true);
  });
  info.annotations.push({ type: 'not-automated', description: 'เส้นบนกราฟเป็น canvas ไม่มีค่าใน DOM · ตรวจได้แค่สวิตช์ + ภาพกราฟเปลี่ยน · การเห็นว่าเหลือเส้น 200 จริงดูจากภาพที่แนบ' });

  await test.step('2. เปิด PDNW เปิดทั้ง 2 เส้น', async () => {
    await openStock(page, ui, 'PDNW');
    await t50.check();
    await t200.check();
  });
  await ui.check(ne50, 'ข้อ 2 PDNW ข้อมูลไม่พอ 50', (l) => expect.soft(l, 'PDNW 50 วัน').toHaveText('ข้อมูลไม่พอ (ต้องมี 50 วันทำการ)'));
  await ui.check(ne200, 'ข้อ 2 PDNW ข้อมูลไม่พอ 200', (l) => expect.soft(l, 'PDNW 200 วัน').toHaveText('ข้อมูลไม่พอ (ต้องมี 200 วันทำการ)'));
  await test.step('ข้อ 2 API PDNW ไม่มีจุดเส้น', async () => {
    const j = await (await api.guest.get('/api/stocks/PDNW/indicators')).json();
    expect.soft(j.sma50?.length ?? -1, 'PDNW ไม่มีจุดเส้น 50 วัน').toBe(0);
    expect.soft(j.sma200?.length ?? -1, 'PDNW ไม่มีจุดเส้น 200 วัน').toBe(0);
    await expect.soft(s50, 'PDNW ไม่มีค่าเส้น 50 บนจอ').toHaveCount(0);
  });

  await test.step('3. นาฬิกา 2026-11-20 03:59:59 → รีโหลด PDNW', async () => {
    await api.clock('2026-11-20T03:59:59+07:00');
    await page.reload();
    await openStock(page, ui, 'PDNW');
  });
  await ui.check(ne50, 'ข้อ 3 03:59:59 ยังไม่มีเส้น 50 วัน', async (l) => {
    await expect.soft(l, '03:59:59 ยังข้อมูลไม่พอ 50').toBeVisible();
    await expect.soft(s50, '03:59:59 ไม่มีค่าเส้น 50').toHaveCount(0);
  });
  await test.step('ข้อ 3 API 03:59:59', async () => {
    const j = await (await api.guest.get('/api/stocks/PDNW/indicators')).json();
    expect.soft(j.latest?.sma50 ?? null, 'API 03:59:59 เส้น 50 วันยังไม่มี').toBeNull();
  });

  await test.step('3. นาฬิกา 2026-11-20 04:00:00 → รีโหลด', async () => {
    await api.clock('2026-11-20T04:00:00+07:00');
    await page.reload();
    await openStock(page, ui, 'PDNW');
  });
  await ui.check(s50, 'ข้อ 3 04:00 เส้น 50 วัน 19.94', async (l) => {
    await expect.soft(l, '04:00 เส้น 50 บนจอ').toHaveText('19.94');
    await expect.soft(l, '04:00 เส้น 50 4 ตำแหน่ง').toHaveAttribute('data-value', '19.9376');
  });
  await ui.check(ne200, 'ข้อ 3 04:00 เส้น 200 วันยังไม่มี', (l) => expect.soft(l, '04:00 เส้น 200 ยังไม่มี').toBeVisible());
  await test.step('ข้อ 3 API 04:00', async () => {
    const j = await (await api.guest.get('/api/stocks/PDNW/indicators')).json();
    const p = (j.sma50 ?? []).find((x: any) => x.date === '2026-11-19');
    expect.soft(p?.value, 'API เส้น 50 วันที่ 19 พ.ย.').toBe('19.9376');
    expect.soft(j.latest?.sma200 ?? null, 'API เส้น 200 ยังไม่มี').toBeNull();
  });

  await test.step('4. นาฬิกา 2026-11-30 22:00 → เปิด AAPL รายวัน ช่วงปลายเดือน', async () => {
    await api.clock('2026-11-30T22:00:00+07:00');
    await openStock(page, ui, 'AAPL');
    await page.getByTestId('stock-interval-day').click();
    await page.getByTestId('stock-range-from').fill('2026-11-20');
    await page.getByTestId('stock-range-to').fill('2026-11-30');
    await page.getByTestId('stock-range-apply').click();
    await ui.settle();
    await page.getByTestId('stock-bars-toggle').click();
    await page.locator('tr[data-testid^="stock-bar-"]').first().waitFor({ timeout: 10_000 }).catch(() => {});
  });
  await ui.check(page.getByTestId('stock-bars'), 'ข้อ 4 แท่ง 24 25 27 พ.ย. ไม่มี 26 พ.ย.', async () => {
    for (const d of ['2026-11-24', '2026-11-25', '2026-11-27']) await expect.soft(page.getByTestId(`stock-bar-${d}`), `มีแท่ง ${d}`).toHaveCount(1);
    await expect.soft(page.getByTestId('stock-bar-2026-11-26'), 'ไม่มีแท่ง 26 พ.ย.').toHaveCount(0);
  });
  await test.step('ข้อ 4 API แท่งและจุดเส้น', async () => {
    const c = await (await api.guest.get('/api/stocks/AAPL/candles?from=2026-11-20&to=2026-11-30')).json();
    const cd = (c.bars ?? []).map((b: any) => b.date);
    const ind = await (await api.guest.get('/api/stocks/AAPL/indicators?to=2026-11-30')).json();
    const sets: Record<string, string[]> = {
      แท่ง: cd,
      'เส้น 50': (ind.sma50 ?? []).map((p: any) => p.date),
      'เส้น 200': (ind.sma200 ?? []).map((p: any) => p.date),
    };
    for (const [k, ds] of Object.entries(sets)) {
      for (const d of ['2026-11-24', '2026-11-25', '2026-11-27']) expect.soft(ds.includes(d), `${k} มี ${d}`).toBe(true);
      expect.soft(ds.includes('2026-11-26'), `${k} ไม่มี 26 พ.ย.`).toBe(false);
    }
  });
  await api.reset();
});

// ---------------------------------------------------------------------------
test('TC-CHART-07 · RSI 14 วัน: ค่า ทศนิยม 2 ตำแหน่ง ป้าย และช่วงราคานิ่ง @P1 @5.2', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ZUP 100.00 + "ซื้อมากเกินไป" · ZDN 0.00 + "ขายมากเกินไป" · AAPL 52.54 ไม่มีป้าย · PDNW 51.94 ไม่มีป้าย และไม่มีคำว่าข้อมูลไม่พอ · ข้อ 3: AAPL ยัง 52.54 ไม่มีป้าย',
    source: '[D] บ.15 §4 (TEST-DATA E79–E81, E83) · [R] Wilder + ราคานิ่ง ⚠️ A-16 · ข้อ 3 SPEC ไม่ตรงเว็บ (ถามคนสร้างเว็บข้อ 12)',
    frbr: 'FR-14 · BR-28 · BR-29 · BR-30',
    rules: 'R29 ✅ · R30 ✅ · R31 ✅ · R37 ⚠️',
  });
  const val = page.getByTestId('stock-rsi-value');
  const label = page.getByTestId('stock-rsi-label');
  const notEnough = page.getByTestId('stock-rsi-notenough');
  const cases: { s: string; v: string; lab: string | null; apiLab: string | null }[] = [
    { s: 'ZUP', v: '100.00', lab: 'ซื้อมากเกินไป', apiLab: 'overbought' },
    { s: 'ZDN', v: '0.00', lab: 'ขายมากเกินไป', apiLab: 'oversold' },
    { s: 'AAPL', v: '52.54', lab: null, apiLab: null },
    { s: 'PDNW', v: '51.94', lab: null, apiLab: null },
  ];
  for (const c of cases) {
    await test.step(`1. เปิดหน้า ${c.s}`, async () => { await openStock(page, ui, c.s); });
    await ui.check(val, `${c.s} RSI ${c.v}`, (l) => expect.soft(l, `${c.s} RSI`).toHaveText(c.v));
    if (c.lab) {
      await ui.check(label, `${c.s} ป้าย ${c.lab}`, (l) => expect.soft(l, `${c.s} ป้าย`).toHaveText(c.lab!));
    } else {
      await ui.check(page.getByTestId('stock-indicators'), `${c.s} ไม่มีป้าย`, async () => {
        await expect.soft(label, `${c.s} ไม่มีป้าย RSI`).toHaveCount(0);
        await expect.soft(notEnough, `${c.s} ไม่มีคำว่าข้อมูลไม่พอ (RSI)`).toHaveCount(0);
      });
    }
    await test.step(`2. เทียบ API ตัวชี้วัด ${c.s}`, async () => {
      const j = await (await api.guest.get(`/api/stocks/${c.s}/indicators`)).json();
      expect.soft(j.latest?.rsi14, `API ${c.s} RSI`).toBe(c.v);
      expect.soft(j.latest?.rsiLabel ?? null, `API ${c.s} ป้าย`).toBe(c.apiLab);
      expect.soft(j.notEnough?.rsi14, `API ${c.s} RSI ข้อมูลพอ`).toBe(false);
    });
  }

  await test.step('3. นาฬิกา 2026-11-30 22:00 → เปิด AAPL', async () => {
    await api.clock('2026-11-30T22:00:00+07:00');
    await openStock(page, ui, 'AAPL');
  });
  await ui.check(val, 'ข้อ 3 AAPL RSI ยัง 52.54', (l) => expect.soft(l, 'AAPL RSI หลังราคานิ่ง 15 วัน').toHaveText('52.54'));
  await ui.check(page.getByTestId('stock-indicators'), 'ข้อ 3 AAPL ไม่มีป้าย', (l) => expect.soft(label, 'AAPL ไม่มีป้ายหลังราคานิ่ง').toHaveCount(0));
  await test.step('ข้อ 3 API AAPL', async () => {
    const j = await (await api.guest.get('/api/stocks/AAPL/indicators')).json();
    expect.soft(j.latest?.rsi14, 'API AAPL RSI หลังราคานิ่ง').toBe('52.54');
    expect.soft(j.latest?.rsiLabel ?? null, 'API AAPL ป้ายหลังราคานิ่ง').toBeNull();
  });
  await api.reset();
});

// ---------------------------------------------------------------------------
test('TC-CHART-08 · Golden Cross / Death Cross: เท่ากันไม่นับ และไม่ส่งแจ้งเตือน @P1 @5.2', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ZGC ป้าย "Golden Cross" ที่แท่ง 5 พ.ย. · ZDC ป้าย "Death Cross" ที่แท่ง 5 พ.ย. · ZEQ ไม่มีป้าย · ไม่มีป้ายที่วันอื่นของทั้ง 3 ตัว · หลัง tick จำนวนในกล่องและ outbox เท่าเดิม (0 รายการที่พูดถึง Cross)',
    source: '[D] บ.16 §4 (TEST-DATA E85–E87) · [D+R] ค่าตามส่วน 4.4',
    frbr: 'FR-15 · BR-31 · BR-27',
    rules: 'R33 ✅',
  });
  await ui.login('kan');
  await test.step('เงื่อนไข: เพิ่ม ZGC ZDC ZEQ ในรายการเฝ้าดู', async () => {
    for (const s of ['ZGC', 'ZDC', 'ZEQ']) {
      const r = await page.request.post('/api/watchlist', { data: { symbol: s } });
      expect.soft(r.ok(), `เพิ่ม ${s} ในเฝ้าดู`).toBe(true);
    }
  });
  const crossItems = page.locator('[data-testid^="stock-cross-"]:not([data-testid="stock-cross-none"])');
  const cases = [
    { s: 'ZGC', kind: 'golden', text: 'Golden Cross' },
    { s: 'ZEQ', kind: null, text: null },
    { s: 'ZDC', kind: 'death', text: 'Death Cross' },
  ];
  for (const c of cases) {
    await test.step(`1. เปิดหน้า ${c.s} เปิดเส้น 50/200`, async () => {
      await openStock(page, ui, c.s);
      await page.getByTestId('stock-sma50-toggle').check();
      await page.getByTestId('stock-sma200-toggle').check();
    });
    if (c.text) {
      await ui.check(page.getByTestId('stock-cross-2026-11-05'), `${c.s} ป้าย ${c.text} ที่ 5 พ.ย.`, async (l) => {
        await expect.soft(l, `${c.s} ป้ายที่ 5 พ.ย.`).toContainText(c.text!);
        await expect.soft(l, `${c.s} ชนิดป้าย`).toHaveAttribute('data-kind', c.kind!);
        await expect.soft(crossItems, `${c.s} ไม่มีป้ายวันอื่น`).toHaveCount(1);
      });
    } else {
      await ui.check(page.getByTestId('stock-crosses'), `${c.s} ไม่มีป้าย`, async () => {
        await expect.soft(crossItems, `${c.s} ไม่มีป้าย Cross`).toHaveCount(0);
        await expect.soft(page.getByTestId('stock-cross-none'), `${c.s} ข้อความไม่มีการตัดกัน`).toBeVisible();
      });
    }
    await test.step(`API ตัวชี้วัด ${c.s}`, async () => {
      const j = await (await api.guest.get(`/api/stocks/${c.s}/indicators`)).json();
      const cr = j.crosses ?? [];
      expect.soft(cr, `API ${c.s} crosses`).toEqual(c.kind ? [{ date: '2026-11-05', kind: c.kind }] : []);
    });
  }

  const count = async () => {
    const inbox = await (await page.request.get('/api/inbox')).json();
    const outbox = await (await page.request.get('/api/outbox')).json();
    const all = [...(inbox.items ?? []), ...(outbox.items ?? [])];
    return { inbox: (inbox.items ?? []).length, outbox: (outbox.items ?? []).length, cross: all.filter((x) => /cross/i.test(JSON.stringify(x))).length };
  };
  let base = { inbox: 0, outbox: 0, cross: 0 };
  await test.step('2. จดจำนวนใน /th/inbox และ /th/outbox', async () => {
    base = await count();
    info.annotations.push({ type: 'note', description: `ก่อน tick: inbox ${base.inbox} · outbox ${base.outbox}` });
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.mark(page.getByTestId('inbox-page'), 'กล่องแจ้งเตือนก่อน tick');
    await ui.goto('/th/outbox', 'outbox-page');
    await ui.mark(page.getByTestId('outbox-page'), 'outbox ก่อน tick');
  });

  await test.step('3. POST /api/test/tick แล้วรีโหลด', async () => { await api.tick(); });
  const after1 = await count();
  await ui.goto('/th/inbox', 'inbox-page');
  await ui.check(page.getByTestId('inbox-page'), 'หลัง tick กล่องแจ้งเตือนเท่าเดิม', async () => {
    expect.soft(after1.inbox, 'หลัง tick inbox เท่าเดิม').toBe(base.inbox);
    expect.soft(after1.cross, 'ไม่มีรายการที่พูดถึง Cross').toBe(0);
  });
  await ui.goto('/th/outbox', 'outbox-page');
  await ui.check(page.getByTestId('outbox-page'), 'หลัง tick outbox เท่าเดิม', async () => {
    expect.soft(after1.outbox, 'หลัง tick outbox เท่าเดิม').toBe(base.outbox);
  });

  await test.step('เลื่อนนาฬิกา 2026-11-07 04:00:00 แล้ว tick อีกครั้ง', async () => {
    await api.clock('2026-11-07T04:00:00+07:00');
    await api.tick();
  });
  const after2 = await count();
  await ui.goto('/th/inbox', 'inbox-page');
  await ui.check(page.getByTestId('inbox-page'), 'หลัง tick รอบ 2 กล่องแจ้งเตือนเท่าเดิม', async () => {
    expect.soft(after2.inbox, 'หลัง tick รอบ 2 inbox เท่าเดิม').toBe(base.inbox);
    expect.soft(after2.outbox, 'หลัง tick รอบ 2 outbox เท่าเดิม').toBe(base.outbox);
    expect.soft(after2.cross, 'หลัง tick รอบ 2 ไม่มีรายการ Cross').toBe(0);
  });
  await api.reset();
});

// ---------------------------------------------------------------------------
test('TC-CHART-09 · ราคาปรับแตกพาร์ NVDA และตัวชี้วัดคิดจากราคาปรับแล้วเสมอ @P2 @5.2', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: "ราคาปรับแล้ว" · 7 มิ.ย. ปรับแล้ว 114.30 (114.2960) · ราคาจริง 1,142.96 (× 10) · 10 มิ.ย. 113.67 ทั้ง 2 โหมด · 11 มิ.ย. เท่ากันทั้ง 2 โหมด · โหมดปรับแล้วไม่มีแท่งร่วง ~90% · ข้อ 4: เส้น 50 วันที่ 10 มิ.ย. = 113.05 (113.0480) ทั้ง 2 แบบ · RSI 14 วัน ณ 10 มิ.ย. = 51.46 ไม่มีป้าย ทั้ง 2 แบบ · วันล็อก 129.35 / 127.41 / 52.54 ทั้ง 2 แบบ',
    source: '[D] บ.17 §1 §4 (TEST-DATA E88–E90) · [D+R] เส้น 50 วันวันที่ 10 มิ.ย. คิดด้วยสูตรส่วน 4.2 · ตัวชี้วัดใช้ราคาปรับ ⚠️ A-34',
    frbr: 'FR-16 · BR-32 · FR-13 · FR-14',
    rules: 'R34 ✅',
  });
  await ui.login('kan');
  const o = ohlc(page);
  const state = page.getByTestId('stock-adjusted-state');

  await test.step('1. เปิดหน้า NVDA', async () => { await openStock(page, ui, 'NVDA'); });
  await ui.check(state, 'ข้อ 1 ค่าเริ่มต้นราคาปรับแล้ว', async (l) => {
    await expect.soft(l, 'โหมดเริ่มต้น').toHaveAttribute('data-state', 'adjusted');
    await expect.soft(l, 'ข้อความโหมด').toContainText('ราคาปรับแล้ว');
  });

  await test.step('2. ตั้งช่วง 2024-06-01 ถึง 2024-06-14', async () => {
    await page.getByTestId('stock-range-from').fill('2024-06-01');
    await page.getByTestId('stock-range-to').fill('2024-06-14');
    await page.getByTestId('stock-range-apply').click();
    await page.waitForTimeout(800);
    await ui.settle();
  });
  const close = async (d: string) => { await hoverBar(page, d); return o.close; };

  await ui.check(await close('2024-06-07'), 'ปรับแล้ว 7 มิ.ย. 114.30', async (l) => {
    await expect.soft(o.date, 'ชี้แท่ง 7 มิ.ย.').toHaveAttribute('data-date', '2024-06-07');
    await expect.soft(l, 'ปรับแล้ว 7 มิ.ย. บนจอ').toHaveText('114.30');
    await expect.soft(l, 'ปรับแล้ว 7 มิ.ย. 4 ตำแหน่ง').toHaveAttribute('data-value', '114.2960');
  });
  await ui.check(await close('2024-06-10'), 'ปรับแล้ว 10 มิ.ย. 113.67', async (l) => {
    await expect.soft(o.date, 'ชี้แท่ง 10 มิ.ย.').toHaveAttribute('data-date', '2024-06-10');
    await expect.soft(l, 'ปรับแล้ว 10 มิ.ย.').toHaveText('113.67');
  });
  await close('2024-06-11');
  const adj11 = await o.close.getAttribute('data-value');
  await ui.mark(o.close, `ปรับแล้ว 11 มิ.ย. ${adj11}`);

  await test.step('3. สลับเป็นราคาจริง', async () => {
    await page.getByTestId('stock-adjusted-toggle').click();
    await expect(page.getByTestId('stock-chart-card')).toHaveAttribute('data-adjusted', '0', { timeout: 10_000 }).catch(() => {});
    await ui.settle();
  });
  await ui.check(await close('2024-06-07'), 'ราคาจริง 7 มิ.ย. 1,142.96', async (l) => {
    await expect.soft(o.date, 'ชี้แท่ง 7 มิ.ย. (ราคาจริง)').toHaveAttribute('data-date', '2024-06-07');
    await expect.soft(l, 'ราคาจริง 7 มิ.ย.').toHaveText('1,142.96');
  });
  await ui.check(await close('2024-06-10'), 'ราคาจริง 10 มิ.ย. 113.67', async (l) => {
    await expect.soft(o.date, 'ชี้แท่ง 10 มิ.ย. (ราคาจริง)').toHaveAttribute('data-date', '2024-06-10');
    await expect.soft(l, 'ราคาจริง 10 มิ.ย.').toHaveText('113.67');
  });
  await ui.check(await close('2024-06-11'), '11 มิ.ย. เท่ากันทั้ง 2 โหมด', async (l) => {
    await expect.soft(o.date, 'ชี้แท่ง 11 มิ.ย. (ราคาจริง)').toHaveAttribute('data-date', '2024-06-11');
    await expect.soft(l, '11 มิ.ย. ราคาจริง = ปรับแล้ว').toHaveAttribute('data-value', adj11 ?? '');
  });
  await ui.check(page.getByTestId('stock-sma50-latest'), 'ราคาจริง: ค่าล่าสุดยัง 129.35 / 127.41 / 52.54', async (l) => {
    await expect.soft(l, 'หน้าเว็บ ราคาจริง เส้น 50 ล่าสุด').toHaveText('129.35');
    await expect.soft(page.getByTestId('stock-sma200-latest'), 'หน้าเว็บ ราคาจริง เส้น 200 ล่าสุด').toHaveText('127.41');
    await expect.soft(page.getByTestId('stock-rsi-value'), 'หน้าเว็บ ราคาจริง RSI ล่าสุด').toHaveText('52.54');
  });

  await test.step('โหมดปรับแล้วไม่มีแท่งร่วง ~90%', async () => {
    const j = await (await page.request.get('/api/stocks/NVDA/candles?from=2024-06-01&to=2024-06-14')).json();
    const cl = (j.bars ?? []).map((b: any) => Number(b.close));
    const drops = cl.slice(1).filter((c: number, i: number) => c < cl[i] * 0.5).length;
    expect.soft(cl.length, 'มีแท่งในช่วง').toBeGreaterThan(0);
    expect.soft(drops, 'ปรับแล้วไม่มีแท่งร่วง ~90%').toBe(0);
  });

  await test.step('4. API ตัวชี้วัด to=2024-06-10 ทั้ง 2 แบบ และที่วันล็อก', async () => {
    for (const [q, nm] of [['', 'ปรับแล้ว'], ['&adjusted=0', 'ราคาจริง']] as const) {
      const j = await (await page.request.get(`/api/stocks/NVDA/indicators?to=2024-06-10${q}`)).json();
      const s = (j.sma50 ?? []).find((p: any) => p.date === '2024-06-10');
      const r = (j.rsi14 ?? []).find((p: any) => p.date === '2024-06-10');
      expect.soft(s?.value, `${nm} เส้น 50 วันที่ 10 มิ.ย.`).toBe('113.0480');
      expect.soft(r?.value, `${nm} RSI ณ 10 มิ.ย.`).toBe('51.46');
      const rv = Number(r?.value);
      expect.soft(rv > 30 && rv < 70, `${nm} RSI 10 มิ.ย. ไม่มีป้าย`).toBe(true);
      const l = await (await page.request.get(`/api/stocks/NVDA/indicators${q ? '?adjusted=0' : ''}`)).json();
      expect.soft(l.latest?.sma50, `${nm} วันล็อก เส้น 50`).toBe('129.3500');
      expect.soft(Number(l.latest?.sma200).toFixed(2), `${nm} วันล็อก เส้น 200`).toBe('127.41');
      expect.soft(l.latest?.rsi14, `${nm} วันล็อก RSI`).toBe('52.54');
    }
  });
  await ui.mark(page.getByTestId('stock-indicators'), 'ข้อ 4 ตัวชี้วัด (API ตรวจทั้ง 2 แบบแล้ว)');
});

// ---------------------------------------------------------------------------
test('TC-CHART-10 · ค่าขอบตัวชี้วัดที่ทดสอบผ่านเว็บไม่ได้ (ระดับกฎ) @P1 @5.2', async ({ page, ui }, info) => {
  meta(info, {
    expected: '69.994 → แสดง 69.99 ไม่มีป้าย · 69.995 → แสดง 70.00 มี "ซื้อมากเกินไป" · 70.01 มีป้าย · 30.01 ไม่มี · 30.00 มี "ขายมากเกินไป" · 29.99 มี · Cross: −0.01 ✗ · 0.00 ✗ · +0.01 Golden Cross · RSI: 14 ราคา ไม่มีค่า · 15 มี · 16 มี · เส้น 200 วัน: 199 ไม่มี · 200 มี · 201 มี · Death Cross (RV2-09): เมื่อวาน +0.01 → วันนี้ −0.01 = Death Cross ✓ · 0.00 ✗ · +0.01 ✗ · เมื่อวาน 0.00 → วันนี้ +0.01 = ไม่มีป้าย · เมื่อวาน 0.00 → −0.01 = ไม่มีป้าย',
    source: '[D] §4 (BR-26 BR-29 BR-30 BR-31 · TEST-DATA E74 E82 E84) · [R] BR-28 ⚠️ A-16 (E78)',
    frbr: 'BR-26 · BR-28 · BR-29 · BR-30 · BR-31 · FR-14 · FR-15',
    rules: 'R32 — (ยังไม่ได้ลอง)',
  });
  // แผน (แก้หลัง LAB 12): จังหวะตรวจ = unit test ของทีมสร้างเว็บ web/lib/analysis/boundary.test.ts
  // test นี้รันชุดนั้นแล้วอ่านผล JSON · ไม่อ่านโค้ดเว็บ · ตรวจว่าครบทุกค่าขอบในแผน (20 กรณี) และผ่านทุกข้อ
  await test.step('เปิดหน้า ZGC บันทึกภาพส่วนตัวชี้วัด', async () => {
    await openStock(page, ui, 'ZGC');
    await ui.mark(page.getByTestId('stock-indicators'), 'ส่วนตัวชี้วัด (ค่าขอบตรวจระดับกฎด้านล่าง)');
  });
  const results = await test.step('รัน unit test ค่าขอบของทีมสร้างเว็บ', async () => {
    const { execFileSync } = await import('node:child_process');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const web = path.resolve(__dirname, '../../web');
    const out = path.resolve(__dirname, '../test-report/unit-chart10.json');
    try { execFileSync('npx', ['vitest', 'run', 'lib/analysis/boundary.test.ts', '--reporter=json', `--outputFile=${out}`], { cwd: web, stdio: 'ignore' }); } catch { /* ล้มก็ยังอ่านผล */ }
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    return (j.testResults ?? []).flatMap((f: any) => f.assertionResults ?? []) as { title: string; status: string }[];
  });
  const want = ['RSI 69.994 → แสดง 69.99 ป้าย ไม่มี', 'RSI 69.995 → แสดง 70.00 ป้าย overbought', 'RSI 70.01 → แสดง 70.01 ป้าย overbought',
    'RSI 30.01 → แสดง 30.01 ป้าย ไม่มี', 'RSI 30.00 → แสดง 30.00 ป้าย oversold', 'RSI 29.99 → แสดง 29.99 ป้าย oversold',
    'เมื่อวาน -0.01 → วันนี้ -0.01 = ไม่มีป้าย', 'เมื่อวาน -0.01 → วันนี้ 0.00 = ไม่มีป้าย', 'เมื่อวาน -0.01 → วันนี้ 0.01 = golden',
    'เมื่อวาน 0.01 → วันนี้ -0.01 = death', 'เมื่อวาน 0.01 → วันนี้ 0.00 = ไม่มีป้าย', 'เมื่อวาน 0.01 → วันนี้ 0.01 = ไม่มีป้าย',
    'เมื่อวาน 0.00 → วันนี้ 0.01 = ไม่มีป้าย', 'เมื่อวาน 0.00 → วันนี้ -0.01 = ไม่มีป้าย',
    'RSI 14 ราคาปิด → ไม่มีค่า', 'RSI 15 ราคาปิด → มีค่า', 'RSI 16 ราคาปิด → มีค่า',
    'เส้น 200 วัน 199 ราคาปิด → ไม่มีค่า', 'เส้น 200 วัน 200 ราคาปิด → มีค่า', 'เส้น 200 วัน 201 ราคาปิด → มีค่า'];
  for (const w of want) {
    const r = results.find((x) => x.title === w);
    expect.soft(r?.status, `unit: ${w}`).toBe('passed');
  }
  info.annotations.push({ type: 'unit-results', description: results.map((r) => `${r.status === 'passed' ? '✓' : '✗'} ${r.title}`).join('\n') });
});
