// 5.7 ศึกษา: คัดกรอง เทียบ ลองเทียบ DCA CSV ประวัติ และสรุป AI (TEST-PLAN 5.7 · TC-STUDY-01 – 10)
import * as fs from 'fs';
import { test, expect, meta, type UserKey } from '../fixtures/pordee';
import type { APIRequestContext, Page, TestInfo } from '@playwright/test';

// รายการคำต้องห้าม (TEST-PLAN 5.7 บรรทัดหัว · OWNER-ANSWERS §9 · RV7-06)
const FORBIDDEN_TH = ['ควรซื้อ', 'ควรขาย', 'น่าซื้อ', 'น่าขาย', 'แนะนำให้ซื้อ', 'แนะนำให้ขาย'];
const FORBIDDEN_EN = ['should buy', 'should sell', 'recommend', 'strong buy', 'top pick'];
function forbiddenHits(text: string): string[] {
  const low = text.toLowerCase();
  return [...FORBIDDEN_TH.filter((w) => text.includes(w)), ...FORBIDDEN_EN.filter((w) => low.includes(w))];
}
const THAI = /[฀-๿]/;
const norm = (s: string) => s.replace(/−/g, '-').trim(); // 8.2 #25: "−" → "-" ก่อน assert

/** วันที่ (เวลาไทย) ของ ISO */
const bkkDate = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);

async function rowSymbols(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="scr-row-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid!.replace('scr-row-', '')));
}

async function screen(page: Page, f: { pe?: string; div?: string }) {
  if (f.pe !== undefined) await page.getByTestId('scr-pe-max').fill(f.pe);
  if (f.div !== undefined) await page.getByTestId('scr-div-min').fill(f.div);
  await page.getByTestId('scr-submit').click();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('screener-page')).not.toHaveAttribute('data-state', 'loading').catch(() => {});
}

async function history(ctx: APIRequestContext): Promise<any[]> {
  const r = await ctx.get('/api/history');
  return (await r.json()).items ?? [];
}

async function addChip(page: Page, sym: string) {
  await page.getByTestId('cmp-symbol-input').fill(sym);
  await page.getByTestId('cmp-add').click();
}

async function loginAs(ui: any, page: Page, user: UserKey) {
  await page.context().clearCookies();
  await ui.login(user);
}

// ---------------------------------------------------------------------------

test('TC-STUDY-01 · คัดกรอง P/E ไม่เกินค่าที่ตั้ง ขอบ 20.00 / 20.01 · ไม่มี P/E ไม่อยู่ · ค่าผิดต้องล้างผลเก่า @P2 @5.7', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: พบ 3 ตัว = BRK.B, JNJ, PG (เรียง A–Z) · ไม่มี KO, RIVN, PDNW, OLDC (หุ้น Z ทุกตัว P/E ≥ 26.00 จึงไม่อยู่) · ข้อ 2: พบ 2 ตัว = JNJ, PG (BRK.B 20.00 > 19.99 หลุด) · ข้อ 3–4: ปฏิเสธ มีข้อความบอกให้กรอกตัวเลขตั้งแต่ 0 ขึ้นไป · ตารางผลและคำว่า "พบ 2 ตัว" ต้องหายไป (ไม่แสดงผลของข้อ 2 คู่กับ error) · API ตอบ 400 · ข้อ 5 (รีโหลด): ช่องเป็นค่าว่าง/ค่าเริ่มต้น · ไม่มีตาราง JNJ/PG ค้าง',
    source: '[D] §1, §8 (E145) · [R] ค่าผิดต้องไม่ทิ้งผลเก่า · [O-ยังไม่ยืนยัน] R91 ผลเก่าค้าง (ส่วน F ถามคนสร้างเว็บ ข้อ 17)',
    frbr: 'FR-45 · BR-51',
    rules: 'R90 · R91 ⚠️',
  });
  await test.step('เงื่อนไขก่อนเริ่ม: เข้าสู่ระบบ U01 คุณบีม เปิด /th/study/screener', async () => {
    await ui.login('beam');
    await ui.goto('/th/study/screener', 'screener-page');
  });
  await test.step('1. ใส่ P/E สูงสุด 20 กดคัดกรอง', async () => { await screen(page, { pe: '20' }); });
  await ui.check(page.getByTestId('scr-count'), 'ข้อ 1 พบ 3 ตัว', (l) => expect.soft(l, 'ข้อ 1 จำนวน').toHaveText(/พบ\s*3\s*ตัว/));
  await ui.check(page.getByTestId('scr-table'), 'ข้อ 1 BRK.B JNJ PG เรียง A–Z', async () => {
    const rows = await rowSymbols(page);
    expect.soft(rows, 'ข้อ 1 แถว = BRK.B, JNJ, PG').toEqual(['BRK.B', 'JNJ', 'PG']);
    for (const s of ['KO', 'RIVN', 'PDNW', 'OLDC']) expect.soft(rows, `ข้อ 1 ไม่มี ${s}`).not.toContain(s);
    expect.soft(rows.filter((s) => s.startsWith('Z')), 'ข้อ 1 ไม่มีหุ้น Z').toEqual([]);
  });
  await test.step('ตรวจ API: POST /api/screener peMax 20 ได้ 3 ตัวเท่าจอ', async () => {
    const r = await api.guest.post('/api/screener', { data: { peMax: '20' } });
    const syms = ((await r.json()).results ?? []).map((x: any) => x.symbol);
    expect.soft(syms, 'API peMax 20').toEqual(['BRK.B', 'JNJ', 'PG']);
  });

  await test.step('2. เปลี่ยนเป็น 19.99 กดคัดกรอง', async () => { await screen(page, { pe: '19.99' }); });
  await ui.check(page.getByTestId('scr-count'), 'ข้อ 2 พบ 2 ตัว', (l) => expect.soft(l, 'ข้อ 2 จำนวน').toHaveText(/พบ\s*2\s*ตัว/));
  await ui.check(page.getByTestId('scr-table'), 'ข้อ 2 JNJ PG', async () => {
    expect.soft(await rowSymbols(page), 'ข้อ 2 แถว = JNJ, PG').toEqual(['JNJ', 'PG']);
  });

  for (const [no, bad] of [['3', '-1'], ['4', 'abc']] as const) {
    await test.step(`${no}. เปลี่ยนเป็น ${bad} กดคัดกรอง`, async () => {
      await page.getByTestId('scr-pe-max').fill(bad);
      const v = await page.getByTestId('scr-pe-max').inputValue();
      if (bad === 'abc' && v !== 'abc') info.annotations.push({ type: 'note', description: `ข้อ 4 ช่องไม่รับ abc (ค่าในช่อง "${v}") หน้าเว็บกันไว้` });
      await page.getByTestId('scr-submit').click();
      await page.waitForTimeout(500);
    });
    await ui.check(page.getByTestId('scr-error'), `ข้อ ${no} (${bad}) ข้อความให้กรอกตัวเลขตั้งแต่ 0 ขึ้นไป`, (l) =>
      expect.soft(l, `ข้อ ${no} ข้อความ error`).toContainText('ตัวเลขตั้งแต่ 0 ขึ้นไป'));
    await ui.check(page.getByTestId('screener-page'), `ข้อ ${no} (${bad}) ตารางผลเก่าและ "พบ 2 ตัว" ต้องหาย (R91)`, async () => {
      await expect.soft(page.getByTestId('scr-table'), `ข้อ ${no} ตารางผลเก่าต้องหาย`).toHaveCount(0);
      await expect.soft(page.getByText(/พบ\s*2\s*ตัว/), `ข้อ ${no} คำว่า "พบ 2 ตัว" ต้องหาย`).toHaveCount(0);
      await expect.soft(page.getByTestId('scr-row-JNJ'), `ข้อ ${no} JNJ ต้องไม่ค้าง`).toHaveCount(0);
      await expect.soft(page.getByTestId('scr-row-PG'), `ข้อ ${no} PG ต้องไม่ค้าง`).toHaveCount(0);
    });
    await test.step(`ตรวจ API: POST /api/screener peMax ${bad} → 400`, async () => {
      const r = await api.guest.post('/api/screener', { data: { peMax: bad } });
      expect.soft(r.status(), `API peMax ${bad}`).toBe(400);
    });
  }

  await test.step('5. รีโหลดหน้า', async () => {
    await page.reload();
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' });
    await expect(page.getByTestId('screener-page')).not.toHaveAttribute('data-state', 'loading').catch(() => {});
    await ui.settle();
  });
  await ui.check(page.getByTestId('scr-pe-max'), 'ข้อ 5 ช่อง P/E ว่าง/ค่าเริ่มต้น', (l) => expect.soft(l, 'ข้อ 5 ช่อง P/E').toHaveValue(''));
  await ui.check(page.getByTestId('screener-page'), 'ข้อ 5 ไม่มีตาราง JNJ/PG ค้าง', async () => {
    await expect.soft(page.getByText(/พบ\s*2\s*ตัว/), 'ข้อ 5 ไม่มี "พบ 2 ตัว"').toHaveCount(0);
    const rows = await rowSymbols(page);
    expect.soft(rows.length === 2 && rows[0] === 'JNJ' && rows[1] === 'PG', `ข้อ 5 ไม่ใช่ผล JNJ/PG ค้าง (เห็น ${rows.length} แถว)`).toBe(false);
  });
});

test('TC-STUDY-02 · คัดกรองปันผลตั้งแต่ค่าที่ตั้ง และ 2 เงื่อนไขพร้อมกัน @P2 @5.7', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1 และ 2: พบ 3 ตัว = JNJ, KO, O · ไม่มี PG · ข้อ 3: พบ 1 ตัว = JNJ (P/E 15.20 ≤ 20 และ 3.10 ≥ 3 · KO ตก P/E 20.01 · BRK.B PG ตกปันผล) · (RV7-14) 2.995 → 3 ตัว ไม่มี PG',
    source: '[D] §1, §8 (E146, E147) · ⚠️ A-27 · (RV7-14)',
    frbr: 'FR-45 · BR-51 · BR-52',
    rules: 'R92',
  });
  await test.step('เงื่อนไขก่อนเริ่ม: U01 เปิด /th/study/screener ช่องทุกช่องว่าง', async () => {
    await ui.login('beam');
    await ui.goto('/th/study/screener', 'screener-page');
  });
  const cases: { no: string; pe: string; div: string; want: string[] }[] = [
    { no: '1', pe: '', div: '3', want: ['JNJ', 'KO', 'O'] },
    { no: '2', pe: '', div: '3.0', want: ['JNJ', 'KO', 'O'] },
    { no: '2b (RV7-14)', pe: '', div: '2.995', want: ['JNJ', 'KO', 'O'] },
    { no: '3', pe: '20', div: '3', want: ['JNJ'] },
  ];
  for (const c of cases) {
    await test.step(`${c.no}. P/E สูงสุด "${c.pe}" ปันผลต่ำสุด ${c.div} กดคัดกรอง`, async () => { await screen(page, { pe: c.pe, div: c.div }); });
    await ui.check(page.getByTestId('scr-count'), `ข้อ ${c.no} พบ ${c.want.length} ตัว`, (l) =>
      expect.soft(l, `ข้อ ${c.no} จำนวน`).toHaveText(new RegExp(`พบ\\s*${c.want.length}\\s*ตัว`)));
    await ui.check(page.getByTestId('scr-table'), `ข้อ ${c.no} แถว ${c.want.join(', ')}`, async () => {
      const rows = await rowSymbols(page);
      expect.soft(rows, `ข้อ ${c.no} แถว`).toEqual(c.want);
      expect.soft(rows, `ข้อ ${c.no} ไม่มี PG`).not.toContain('PG');
    });
    await test.step(`ตรวจ API: POST /api/screener จำนวนแถวเท่ากับบนจอ (ข้อ ${c.no})`, async () => {
      const r = await api.guest.post('/api/screener', { data: { peMax: c.pe || null, divMin: c.div } });
      const syms = ((await r.json()).results ?? []).map((x: any) => x.symbol);
      expect.soft(syms, `API ข้อ ${c.no}`).toEqual(c.want);
      expect.soft(syms.length, `API ข้อ ${c.no} จำนวนเท่าจอ`).toBe((await rowSymbols(page)).length);
    });
  }
});

test('TC-STUDY-03 · ค่าเริ่มต้นเรียง A–Z ไม่มีป้ายจัดอันดับ และเรียงคอลัมน์ตัวเลขเป็นตัวเลข @P2 @5.7', async ({ page, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: แถวแรก AAPL · เรียงชื่อย่อ A–Z ทั้งตาราง · แถวสุดท้าย ZUP · จำนวน 59 ตัว (สมมติฐาน 8.2 #20) · ข้อ 2: เจอ 0 คำ ("เด่น" "อันดับ" "top" "best" "rank") · ข้อ 3: 5 แถวแรก = JNJ, PG, BRK.B, KO, VOO · แถวท้ายเป็นหุ้นที่ไม่มี P/E (RIVN, PDNW) · ข้อ 4: หุ้นไม่มี P/E ยังอยู่ท้าย · แถวแรก TSLA 180.00 · หลังรีโหลดกลับเป็น A–Z',
    source: '[D] §8 (E148) · [R] เรียงตัวเลขตามค่า · [O-ยังไม่ยืนยัน] จำนวน 59 ไม่รวม OLDC (ส่วน F ถามลูกค้า ข้อ 11)',
    frbr: 'FR-46',
    rules: 'R93',
  });
  await ui.login('beam');
  for (const lang of ['th', 'en'] as const) {
    await test.step(`1. [${lang}] เปิด /${lang}/study/screener ไม่ใส่เงื่อนไข`, async () => {
      await ui.goto(`/${lang}/study/screener`, 'screener-page');
      await ui.settle();
    });
    await ui.check(page.getByTestId('scr-table'), `[${lang}] ข้อ 1 แถวแรก AAPL แถวสุดท้าย ZUP เรียง A–Z 59 ตัว`, async () => {
      const rows = await rowSymbols(page);
      expect.soft(rows[0], `[${lang}] แถวแรก`).toBe('AAPL');
      expect.soft(rows[rows.length - 1], `[${lang}] แถวสุดท้าย`).toBe('ZUP');
      expect.soft(rows, `[${lang}] เรียง A–Z`).toEqual([...rows].sort());
      expect.soft(rows.length, `[${lang}] จำนวน (สมมติฐาน 8.2 #20)`).toBe(59);
      expect.soft(rows, `[${lang}] ไม่มี OLDC`).not.toContain('OLDC');
      info.annotations.push({ type: 'pending', description: `[${lang}] จำนวนในตัวคัดกรองที่เห็น ${rows.length} ตัว (OLDC ${rows.includes('OLDC') ? 'อยู่' : 'ไม่อยู่'}) รอลูกค้ายืนยัน ส่วน F ข้อ 11` });
    });
    await ui.check(page.locator('main, body').first(), `[${lang}] ข้อ 2 ไม่มีคำ เด่น/อันดับ/top/best/rank`, async () => {
      const text = await page.locator('body').innerText();
      const hits = [/เด่น/g, /อันดับ/g, /\btop\b/gi, /\bbest\b/gi, /\brank/gi].flatMap((re) => text.match(re) ?? []);
      expect.soft(hits, `[${lang}] คำจัดอันดับที่เจอ`).toEqual([]);
    });
    await test.step(`3. [${lang}] กดหัวคอลัมน์ P/E 1 ครั้ง (น้อยไปมาก)`, async () => {
      await page.getByTestId('scr-sort-pe').click();
      await page.waitForTimeout(500);
    });
    await ui.check(page.getByTestId('scr-table'), `[${lang}] ข้อ 3 5 แถวแรก JNJ PG BRK.B KO VOO · ท้าย RIVN PDNW`, async () => {
      const rows = await rowSymbols(page);
      expect.soft(rows.slice(0, 5), `[${lang}] 5 แถวแรก`).toEqual(['JNJ', 'PG', 'BRK.B', 'KO', 'VOO']);
      expect.soft([...rows.slice(-2)].sort(), `[${lang}] แถวท้าย = หุ้นไม่มี P/E`).toEqual(['PDNW', 'RIVN']);
    });
    await test.step(`4. [${lang}] กดอีกครั้ง (มากไปน้อย)`, async () => {
      await page.getByTestId('scr-sort-pe').click();
      await page.waitForTimeout(500);
    });
    await ui.check(page.getByTestId('scr-table'), `[${lang}] ข้อ 4 แถวแรก TSLA 180.00 · ไม่มี P/E ยังอยู่ท้าย`, async () => {
      const rows = await rowSymbols(page);
      expect.soft(rows[0], `[${lang}] แถวแรก`).toBe('TSLA');
      await expect.soft(page.getByTestId('scr-cell-pe-TSLA'), `[${lang}] P/E TSLA`).toHaveText('180.00');
      expect.soft([...rows.slice(-2)].sort(), `[${lang}] แถวท้ายยังเป็นหุ้นไม่มี P/E`).toEqual(['PDNW', 'RIVN']);
    });
    await test.step(`[${lang}] รีโหลด`, async () => {
      await page.reload();
      await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' });
      await ui.settle();
    });
    await ui.check(page.getByTestId('scr-table'), `[${lang}] หลังรีโหลดกลับเป็น A–Z`, async () => {
      const rows = await rowSymbols(page);
      expect.soft(rows[0], `[${lang}] หลังรีโหลด แถวแรก`).toBe('AAPL');
      expect.soft(rows, `[${lang}] หลังรีโหลด A–Z`).toEqual([...rows].sort());
    });
  }
});

test('TC-STUDY-04 · เทียบหุ้น 1 / 2 / 4 / 5 ตัว และค่า % เริ่มที่ 0% @P2 @5.7', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1, 2, 5: ปฏิเสธ บอกว่าเทียบได้ 2–4 ตัว · ไม่มีกราฟ · ข้อ 3: ทั้ง 2 เส้นเริ่ม 0.00% วันที่ 30 ต.ค. · วันสุดท้าย ZUP +0.10% · AAPL +0.08% · ข้อ 4: แสดง 4 เส้น · ข้อ 6: 20 รายการ · 2 รายการบนสุด = AAPL, MSFT, NVDA, TSLA (ข้อ 4) แล้ว ZUP + AAPL (ข้อ 3) · เก่าสุดคือ 2026-10-03 (10-01 และ 10-02 หาย) · ไม่มีรายการ AAPL ตัวเดียว / AAPL+aapl / 5 ตัว (RV7-01)',
    source: '[D] บ.49 (E149) · [D+R] สูตร % (E150) · ⚠️ A-04',
    frbr: 'FR-17 · BR-53 · BR-55',
    rules: 'R94',
  });
  const jay = await api.as('jay');
  await test.step('เงื่อนไขก่อนเริ่ม: U04 น้องเจ เปิด /th/study/compare', async () => {
    await ui.login('jay');
    await ui.goto('/th/study/compare', 'compare-page');
  });
  const setRange = async () => {
    await page.getByTestId('cmp-from').fill('2026-10-30');
    await page.getByTestId('cmp-to').fill('2026-11-05');
  };
  let cmpRes: any = null;
  const submit = async () => {
    const wait = page.waitForResponse((r) => r.url().includes('/api/compare') && r.request().method() === 'POST', { timeout: 10_000 }).catch(() => null);
    await page.getByTestId('cmp-submit').click();
    const r = await wait;
    cmpRes = r ? await r.json().catch(() => null) : null;
    await page.waitForTimeout(500);
    await ui.settle();
  };
  const clearChips = async () => {
    while ((await page.locator('[data-testid^="cmp-remove-"]').count()) > 0) await page.locator('[data-testid^="cmp-remove-"]').first().click();
  };
  const rejected = async (label: string) => {
    await ui.check(page.getByTestId('cmp-error'), `${label} ปฏิเสธ บอกว่าเทียบได้ 2–4 ตัว`, (l) => expect.soft(l, `${label} ข้อความ`).toContainText('2–4'));
    await ui.check(page.getByTestId('compare-page'), `${label} ไม่มีกราฟ`, async () => {
      await expect.soft(page.getByTestId('cmp-chart'), `${label} ไม่มีกราฟ`).toHaveCount(0);
    });
  };

  await test.step('1. เทียบ AAPL ตัวเดียว', async () => { await addChip(page, 'AAPL'); await setRange(); await submit(); });
  await rejected('ข้อ 1');
  await test.step('ตรวจ API: POST /api/compare AAPL ตัวเดียว → 400', async () => {
    const r = await jay.post('/api/compare', { data: { symbols: ['AAPL'], from: '2026-10-30', to: '2026-11-05' } });
    expect.soft(r.status(), 'API ข้อ 1').toBe(400);
  });

  await test.step('2. AAPL + aapl', async () => { await addChip(page, 'aapl'); await submit(); });
  await rejected('ข้อ 2');
  await test.step('ตรวจ API: POST /api/compare AAPL + aapl → 400', async () => {
    const r = await jay.post('/api/compare', { data: { symbols: ['AAPL', 'aapl'], from: '2026-10-30', to: '2026-11-05' } });
    expect.soft(r.status(), 'API ข้อ 2').toBe(400);
  });

  await test.step('3. ZUP + AAPL ช่วง 2026-10-30 ถึง 2026-11-05', async () => {
    await clearChips();
    await addChip(page, 'ZUP');
    await addChip(page, 'AAPL');
    await setRange();
    await submit();
  });
  await ui.check(page.getByTestId('cmp-final-ZUP'), 'ข้อ 3 ZUP วันสุดท้าย +0.10%', (l) => expect.soft(l, 'ZUP final').toHaveText('+0.10%'));
  await ui.check(page.getByTestId('cmp-final-AAPL'), 'ข้อ 3 AAPL วันสุดท้าย +0.08%', (l) => expect.soft(l, 'AAPL final').toHaveText('+0.08%'));
  await ui.check(page.getByTestId('cmp-chart'), 'ข้อ 3 ทั้ง 2 เส้นเริ่ม 0.00% วันที่ 30 ต.ค. (ข้อมูลกราฟจาก API ที่หน้าเว็บได้)', async () => {
    const series: any[] = cmpRes?.series ?? [];
    expect.soft(series.map((x) => x.symbol).sort(), 'ข้อ 3 มี 2 เส้น').toEqual(['AAPL', 'ZUP']);
    for (const sr of series) {
      expect.soft(sr.points?.[0]?.date, `${sr.symbol} จุดแรกวันที่`).toBe('2026-10-30');
      expect.soft(Number(sr.points?.[0]?.pct).toFixed(2), `${sr.symbol} จุดแรก %`).toBe('0.00');
      const last = sr.points?.[sr.points.length - 1];
      expect.soft(last?.date, `${sr.symbol} วันสุดท้าย`).toBe('2026-11-05');
      expect.soft(Number(last?.pct).toFixed(2), `${sr.symbol} วันสุดท้าย %`).toBe(sr.symbol === 'ZUP' ? '0.10' : '0.08');
    }
  });

  await test.step('4. AAPL, MSFT, NVDA, TSLA', async () => {
    await clearChips();
    for (const s of ['AAPL', 'MSFT', 'NVDA', 'TSLA']) await addChip(page, s);
    await setRange();
    await submit();
  });
  await ui.check(page.getByTestId('cmp-result'), 'ข้อ 4 แสดง 4 เส้น', async () => {
    await expect.soft(page.locator('[data-testid^="cmp-legend-"]'), 'ข้อ 4 จำนวนเส้น').toHaveCount(4);
    await expect.soft(page.getByTestId('cmp-chart'), 'ข้อ 4 มีกราฟ').toHaveCount(1);
  });

  await test.step('5. เพิ่ม VOO เป็นตัวที่ 5', async () => { await addChip(page, 'VOO'); await submit(); });
  await rejected('ข้อ 5');
  await test.step('ตรวจ API: POST /api/compare 5 ตัว → 400', async () => {
    const r = await jay.post('/api/compare', { data: { symbols: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'VOO'], from: '2026-10-30', to: '2026-11-05' } });
    expect.soft(r.status(), 'API ข้อ 5').toBe(400);
  });

  await test.step('6. เปิด /th/study/history นับรายการ', async () => { await ui.goto('/th/study/history', 'history-page'); await ui.settle(); });
  const items = await history(jay);
  await ui.check(page.getByTestId('hist-count'), 'ข้อ 6 20 รายการ', async () => {
    await expect.soft(page.locator('[data-testid^="hist-item-"]'), 'ข้อ 6 จำนวนบนจอ').toHaveCount(20);
    expect.soft(items.length, 'ข้อ 6 จำนวนใน API').toBe(20);
  });
  await ui.check(page.getByTestId('hist-list'), 'ข้อ 6 บนสุด AAPL,MSFT,NVDA,TSLA แล้ว ZUP+AAPL', async () => {
    expect.soft(items[0]?.params?.symbols, 'รายการบนสุด').toEqual(['AAPL', 'MSFT', 'NVDA', 'TSLA']);
    expect.soft(items[1]?.params?.symbols, 'รายการที่ 2').toEqual(['ZUP', 'AAPL']);
    const first = page.locator('[data-testid^="hist-params-"]');
    await expect.soft(first.nth(0), 'บนจอรายการบนสุด').toContainText('AAPL, MSFT, NVDA, TSLA');
    await expect.soft(first.nth(1), 'บนจอรายการที่ 2').toContainText('ZUP, AAPL');
  });
  await ui.check(page.locator('[data-testid^="hist-item-"]').last(), 'ข้อ 6 เก่าสุด 2026-10-03', async (l) => {
    const oldest = items[items.length - 1];
    expect.soft(oldest ? bkkDate(oldest.createdAt) : '', 'เก่าสุด (API)').toBe('2026-10-03');
    await expect.soft(l, 'เก่าสุด (จอ)').toContainText('3 ต.ค. 2569');
    const dates = items.map((x) => bkkDate(x.createdAt));
    expect.soft(dates, 'ไม่มี 2026-10-01').not.toContain('2026-10-01');
    expect.soft(dates, 'ไม่มี 2026-10-02').not.toContain('2026-10-02');
  });
  await test.step('ตรวจ: ไม่มีรายการ AAPL ตัวเดียว / AAPL+aapl / 5 ตัว', async () => {
    const bad = items.filter((x) => x.kind === 'compare' && (!Array.isArray(x.params?.symbols) || x.params.symbols.length < 2 || x.params.symbols.length > 4 || new Set(x.params.symbols.map((s: string) => s.toUpperCase())).size < 2));
    expect.soft(bad, 'รายการเทียบที่ไม่ผ่านต้องไม่อยู่ในประวัติ').toEqual([]);
  });
});

test('TC-STUDY-05 · ลองเทียบ DCA กับซื้อก้อนเดียว ค่าเงิน 3 ตัว (Pro) @P2 @5.7', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'เงินลงทุนรวม $1,200.00 · DCA $1,236.07 · ก้อนเดียว $1,259.97 · ส่วนต่าง −$23.90 (DCA − ก้อนเดียว) · ประวัติมีรายการลองเทียบใหม่อยู่บนสุด',
    source: '[D] บ.48, §8 · [D+R] E151 (คิดซ้ำด้วย decimal) · ⚠️ T-09 T-02',
    frbr: 'FR-42 · FR-44 · BR-54',
    rules: 'R95',
  });
  const ploy = await api.as('ploy');
  await test.step('เงื่อนไขก่อนเริ่ม: U02 คุณพลอย (Pro) เปิด /th/study/backtest', async () => {
    await ui.login('ploy');
    await ui.goto('/th/study/backtest', 'backtest-page');
  });
  let apiRes: any = null;
  await test.step('1. ใส่ VOO · 100 · 2025-11 · 2026-10 กดลองเทียบ', async () => {
    await page.getByTestId('bt-symbol').fill('VOO');
    await page.getByTestId('bt-monthly').fill('100');
    await page.getByTestId('bt-from').fill('2025-11');
    await page.getByTestId('bt-to').fill('2026-10');
    const wait = page.waitForResponse((r) => r.url().includes('/api/backtest') && r.request().method() === 'POST');
    await page.getByTestId('bt-submit').click();
    apiRes = await (await wait).json().catch(() => null);
    await page.getByTestId('bt-result').waitFor({ timeout: 10_000 }).catch(() => {});
  });
  await test.step('2. ดูตัวเลข 4 ตัว', async () => {
    await ui.check(page.getByTestId('bt-invested'), 'เงินลงทุนรวม $1,200.00', (l) => expect.soft(l, 'เงินลงทุนรวม').toHaveText('$1,200.00'));
    await ui.check(page.getByTestId('bt-dca-value'), 'DCA $1,236.07', (l) => expect.soft(l, 'DCA').toHaveText('$1,236.07'));
    await ui.check(page.getByTestId('bt-lump-value'), 'ก้อนเดียว $1,259.97', (l) => expect.soft(l, 'ก้อนเดียว').toHaveText('$1,259.97'));
    await ui.check(page.getByTestId('bt-diff'), 'ส่วนต่าง −$23.90', async (l) => {
      expect.soft(norm(await l.innerText()), 'ส่วนต่าง (normalize − → -)').toBe('-$23.90');
    });
  });
  await test.step('ตรวจ API: POST /api/backtest ค่าเดียวกัน', async () => {
    expect.soft(apiRes?.investedUsd, 'API invested').toBe('1200.00');
    expect.soft(apiRes?.dca?.valueUsd, 'API dca').toBe('1236.07');
    expect.soft(apiRes?.lump?.valueUsd, 'API lump').toBe('1259.97');
    expect.soft(norm(String(apiRes?.diffUsd ?? '')), 'API diff').toBe('-23.90');
  });
  await test.step('3. เปิด /th/study/history', async () => { await ui.goto('/th/study/history', 'history-page'); await ui.settle(); });
  const items = await history(ploy);
  await ui.check(page.locator('[data-testid^="hist-item-"]').first(), 'ประวัติมีรายการลองเทียบใหม่อยู่บนสุด', async (l) => {
    expect.soft(items[0]?.kind, 'รายการบนสุด (API) เป็นลองเทียบ').toBe('backtest');
    expect.soft(items[0]?.params?.symbol, 'รายการบนสุด VOO').toBe('VOO');
    expect.soft(items[0] ? bkkDate(items[0].createdAt) : '', 'รายการบนสุดวันที่ 6 พ.ย.').toBe('2026-11-06');
    await expect.soft(l, 'บนจอรายการบนสุดเป็น VOO').toContainText('VOO');
    await expect.soft(l, 'บนจอรายการบนสุดเป็นลองเทียบ').toHaveAttribute('data-kind', 'backtest');
  });
});

test('TC-STUDY-06 · ลองเทียบ DCA สิทธิ์ Pro ขอบ 119/120/121 เดือน เงินผิด และเดือนที่ยังไม่จบ @P2 @5.7', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1–2: ปฏิเสธ บอกว่าเป็นสิทธิ์ Pro · API 403 · ไม่มีตัวเลขผลลัพธ์ · ประวัติ U04 ยัง 20 · เก่าสุดยังเป็น 2026-10-01 · ไม่มีรายการลองเทียบ DCA (RV7-02) · ข้อ 3: 119 เดือน ✓ เงินลงทุนรวม $11,900.00 · 120 เดือน ✓ $12,000.00 · 121 เดือน ✗ "ไม่เกิน 120 เดือน" API 400 (RV7-07) · ข้อ 4: ✗ / ✗ / ✗ / ✓ (เงินลงทุนรวม $120.00) · ข้อ 5 (สมมติฐาน 8.2 #6): ปฏิเสธ ข้อความบอกว่าเดือนยังไม่จบ · ไม่มีตัวเลขผลลัพธ์',
    source: '[D] บ.48, §8 (E68, E69) · [R] เงินต้องเป็นบวก 2 ตำแหน่ง และผลไม่ควรเปลี่ยนทุกวัน · [O-ยังไม่ยืนยัน] R96 เดือนที่ยังไม่จบ (ส่วน F ถามลูกค้า ข้อ 9)',
    frbr: 'FR-42 · BR-54',
    rules: 'R95 · R96 ⚠️',
  });
  const body = { symbol: 'VOO', monthlyUsd: '100', fromMonth: '2025-11', toMonth: '2026-10' };
  const run = async (o: { symbol?: string; monthly: string; from: string; to: string }) => {
    await page.getByTestId('bt-symbol').fill(o.symbol ?? 'VOO');
    await page.getByTestId('bt-monthly').fill(o.monthly);
    await page.getByTestId('bt-from').fill(o.from);
    await page.getByTestId('bt-to').fill(o.to);
    const wait = page.waitForResponse((r) => r.url().includes('/api/backtest') && r.request().method() === 'POST', { timeout: 10_000 }).catch(() => null);
    await page.getByTestId('bt-submit').click();
    const r = await wait;
    await page.waitForTimeout(400);
    return r ? r.status() : 0;
  };

  // ---- U04 Free ----
  const jay = await api.as('jay');
  await test.step('1. U04 เปิด /th/study/backtest แล้วลอง VOO 2025-11→2026-10', async () => {
    await ui.login('jay');
    await ui.goto('/th/study/backtest', 'backtest-page');
    await run({ monthly: '100', from: '2025-11', to: '2026-10' });
  });
  await ui.check(page.getByTestId('bt-error'), 'ข้อ 1 ปฏิเสธ บอกว่าเป็นสิทธิ์ Pro', (l) => expect.soft(l, 'ข้อ 1 ข้อความ Pro').toContainText('Pro'));
  await ui.check(page.getByTestId('backtest-page'), 'ข้อ 1 ไม่มีตัวเลขผลลัพธ์', async () => {
    await expect.soft(page.getByTestId('bt-result'), 'ข้อ 1 ไม่มีผลลัพธ์').toHaveCount(0);
    await expect.soft(page.getByTestId('bt-invested'), 'ข้อ 1 ไม่มีเงินลงทุนรวม').toHaveCount(0);
  });
  await test.step('2. U04 ส่ง POST /api/backtest ตรงด้วยค่าเดียวกัน → 403', async () => {
    const r = await jay.post('/api/backtest', { data: body });
    expect.soft(r.status(), 'ข้อ 2 API').toBe(403);
    const j = await r.json().catch(() => ({}));
    expect.soft(j?.investedUsd, 'ข้อ 2 ไม่มีตัวเลขผลลัพธ์ใน API').toBeUndefined();
  });
  await test.step('ตรวจ: ประวัติ U04 ยัง 20 · เก่าสุด 2026-10-01 · ไม่มีรายการลองเทียบ DCA', async () => {
    await ui.goto('/th/study/history', 'history-page');
    const items = await history(jay);
    await ui.check(page.getByTestId('hist-list'), 'ประวัติ U04 ยัง 20 เก่าสุด 1 ต.ค.', async () => {
      expect.soft(items.length, 'ประวัติ U04 จำนวน').toBe(20);
      expect.soft(items.length ? bkkDate(items[items.length - 1].createdAt) : '', 'ประวัติ U04 เก่าสุด').toBe('2026-10-01');
      expect.soft(items.filter((x) => x.kind === 'backtest').length, 'ไม่มีรายการลองเทียบ DCA').toBe(0);
      await expect.soft(page.locator('[data-testid^="hist-item-"]'), 'บนจอ 20 รายการ').toHaveCount(20);
    });
  });

  // ---- U02 Pro ----
  const ploy = await api.as('ploy');
  await test.step('เปลี่ยนเป็น U02 คุณพลอย (Pro) เปิด /th/study/backtest', async () => {
    await loginAs(ui, page, 'ploy');
    await ui.goto('/th/study/backtest', 'backtest-page');
  });
  for (const c of [
    { n: '119', from: '2016-12', ok: true, inv: '$11,900.00', invApi: '11900.00' },
    { n: '120', from: '2016-11', ok: true, inv: '$12,000.00', invApi: '12000.00' },
    { n: '121', from: '2016-10', ok: false },
  ]) {
    await test.step(`3. U02 ลอง ${c.n} เดือน (${c.from}→2026-10)`, async () => { await run({ monthly: '100', from: c.from, to: '2026-10' }); });
    if (c.ok) {
      await ui.check(page.getByTestId('bt-invested'), `ข้อ 3 ${c.n} เดือน ✓ เงินลงทุนรวม ${c.inv}`, (l) => expect.soft(l, `${c.n} เดือน`).toHaveText(c.inv!));
    } else {
      await ui.check(page.getByTestId('bt-error'), 'ข้อ 3 121 เดือน ✗ "ไม่เกิน 120 เดือน"', (l) => expect.soft(l, '121 เดือน ข้อความ').toContainText('ไม่เกิน 120 เดือน'));
    }
    await test.step(`ตรวจ API ${c.n} เดือน`, async () => {
      const r = await ploy.post('/api/backtest', { data: { ...body, fromMonth: c.from } });
      if (c.ok) {
        expect.soft(r.status(), `API ${c.n} เดือน`).toBe(200);
        expect.soft((await r.json().catch(() => ({})))?.investedUsd, `API ${c.n} เดือน invested`).toBe(c.invApi);
      } else expect.soft(r.status(), 'API 121 เดือน').toBe(400);
    });
  }
  for (const m of ['0', '-5', '10.005', '10.00']) {
    const ok = m === '10.00';
    await test.step(`4. U02 ลองเงิน ${m} (2025-11→2026-10)`, async () => { await run({ monthly: m, from: '2025-11', to: '2026-10' }); });
    if (ok) {
      await ui.check(page.getByTestId('bt-invested'), 'ข้อ 4 เงิน 10.00 ✓ เงินลงทุนรวม $120.00', (l) => expect.soft(l, 'เงิน 10.00').toHaveText('$120.00'));
    } else {
      await ui.check(page.getByTestId('bt-error'), `ข้อ 4 เงิน ${m} ✗`, (l) => expect.soft(l, `เงิน ${m} ปฏิเสธ`).toBeVisible());
    }
    await test.step(`ตรวจ API เงิน ${m}`, async () => {
      const r = await ploy.post('/api/backtest', { data: { ...body, monthlyUsd: m } });
      expect.soft(r.status(), `API เงิน ${m}`).toBe(ok ? 200 : 400);
    });
  }
  await test.step('5. U02 ลองเดือน 2026-11→2026-11', async () => { await run({ monthly: '100', from: '2026-11', to: '2026-11' }); });
  info.annotations.push({ type: 'pending', description: 'ข้อ 5 ใช้สมมติฐาน 8.2 #6 (ไม่ได้ · [R]) ระหว่างรอลูกค้าตอบ ส่วน F ข้อ 9' });
  await ui.check(page.getByTestId('bt-error'), 'ข้อ 5 ปฏิเสธ เดือนยังไม่จบ', (l) => expect.soft(l, 'ข้อ 5 ปฏิเสธเดือนที่ยังไม่จบ').toBeVisible());
  await ui.check(page.getByTestId('backtest-page'), 'ข้อ 5 ไม่มีตัวเลขผลลัพธ์', async () => {
    await expect.soft(page.getByTestId('bt-result'), 'ข้อ 5 ไม่มีผลลัพธ์').toHaveCount(0);
  });
  await test.step('ตรวจ API เดือน 2026-11→2026-11', async () => {
    const r = await ploy.post('/api/backtest', { data: { ...body, fromMonth: '2026-11', toMonth: '2026-11' } });
    const j = await r.json().catch(() => ({}));
    info.annotations.push({ type: 'pending', description: `ข้อ 5 API ตอบ ${r.status()} ${JSON.stringify(j).slice(0, 200)}` });
    expect.soft(r.status(), 'ข้อ 5 API ปฏิเสธ').toBe(400);
  });
});

test('TC-STUDY-07 · โหลด CSV (Pro) เปิดใน Excel ได้ มีแหล่งที่มา ข้อความเตือน ไม่มีคำต้องห้าม @P3 @5.7', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: ปฏิเสธ · API 403 · ไม่มีไฟล์ · ข้อ 3: 3 byte แรก EF BB BF · Excel แสดงภาษาไทยไม่เพี้ยน · ข้อ 2–4: ส่วนหัวมีแหล่งที่มา "Pordee Mock Feed" และข้อความเตือน "ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน" (FR-50) · แถวข้อมูล 261 แถว · แถวแรก 2025-11-06 ปิด 227.52 · แถวสุดท้าย 2026-11-05 ปิด 240.00 · ข้อ 5: 0 คำ',
    source: '[D] บ.50, §8 (E70) · [D] บ.56, §9 (NFR-06) · [O-ยังไม่ยืนยัน] ช่วงค่าเริ่มต้น 6 เดือน หรือ 1 ปี (ส่วน F ถามลูกค้า ข้อ 10 · จึงระบุช่วงเองใน test นี้)',
    frbr: 'FR-43 · NFR-06',
    rules: 'R97 · R119 ⚠️',
  });
  const url = '/api/export?symbol=AAPL&from=2025-11-06&to=2026-11-05';
  const doExport = async () => {
    await page.getByTestId('cmp-from').fill('2025-11-06');
    await page.getByTestId('cmp-to').fill('2026-11-05');
    await page.getByTestId('study-export-symbol').fill('AAPL');
    const dl = page.waitForEvent('download', { timeout: 8_000 }).catch(() => null);
    await page.getByTestId('study-export-btn').click();
    return dl;
  };

  // ---- U01 Free ----
  await test.step('1. U01 กดโหลด CSV', async () => {
    await ui.login('beam');
    await ui.goto('/th/study/compare', 'compare-page');
    const d = await doExport();
    expect.soft(d, 'ข้อ 1 ไม่มีไฟล์ดาวน์โหลด').toBeNull();
  });
  await ui.check(page.getByTestId('study-export-error'), 'ข้อ 1 ปฏิเสธ', (l) => expect.soft(l, 'ข้อ 1 ข้อความปฏิเสธ').toBeVisible());
  await test.step('1. U01 เรียก GET /api/export ตรง → 403', async () => {
    const beam = await api.as('beam');
    const r = await beam.get(url);
    expect.soft(r.status(), 'ข้อ 1 API').toBe(403);
    expect.soft(r.headers()['content-disposition'] ?? '', 'ข้อ 1 ไม่มีไฟล์แนบ').not.toContain('attachment');
  });

  // ---- U02 Pro ----
  let buf: Buffer = Buffer.alloc(0);
  let fname = '';
  await test.step('2. U02 โหลด AAPL ช่วง 2025-11-06 ถึง 2026-11-05', async () => {
    await loginAs(ui, page, 'ploy');
    await ui.goto('/th/study/compare', 'compare-page');
    const d = await doExport();
    expect.soft(d, 'ข้อ 2 ได้ไฟล์').not.toBeNull();
    if (d) {
      fname = d.suggestedFilename();
      const p = await d.path();
      if (p) buf = fs.readFileSync(p);
      await info.attach(fname || 'export.csv', { body: buf, contentType: 'text/csv' });
    }
    await ui.mark(page.getByTestId('study-export'), `ข้อ 2 ได้ไฟล์ ${fname}`);
    expect.soft(fname, 'ชื่อไฟล์ตรงช่วงที่ส่ง').toBe('AAPL_2025-11-06_2026-11-05.csv');
  });
  await test.step('3. ดู 3 byte แรก', async () => {
    expect.soft(buf.subarray(0, 3).toString('hex').toUpperCase(), '3 byte แรก').toBe('EFBBBF');
    info.annotations.push({ type: 'not-automated', description: 'ข้อ 3 เปิดไฟล์ใน Excel ดูภาษาไทยไม่เพี้ยน ต้องตรวจด้วยคน (ตรวจอัตโนมัติเฉพาะ BOM EF BB BF)' });
  });
  const text = buf.toString('utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  await test.step('ข้อ 2–4 ส่วนหัวมีแหล่งที่มาและข้อความเตือน', async () => {
    const head = lines.filter((l) => !/^\d{4}-\d{2}-\d{2},/.test(l)).join('\n');
    expect.soft(head, 'แหล่งที่มา').toContain('Pordee Mock Feed');
    expect.soft(head, 'ข้อความเตือน (FR-50)').toContain('ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน');
  });
  await test.step('4. นับแถวข้อมูล ดูแถวแรกและสุดท้าย', async () => {
    const header = lines.find((l) => /^date,/i.test(l)) ?? '';
    const ci = header.split(',').findIndex((h) => h.trim().toLowerCase() === 'close');
    const data = lines.filter((l) => /^\d{4}-\d{2}-\d{2},/.test(l));
    expect.soft(data.length, 'แถวข้อมูล').toBe(261);
    const first = data[0]?.split(',') ?? [];
    const last = data[data.length - 1]?.split(',') ?? [];
    expect.soft(first[0], 'แถวแรก วันที่').toBe('2025-11-06');
    expect.soft(Number(first[ci]).toFixed(2), 'แถวแรก ปิด').toBe('227.52');
    expect.soft(last[0], 'แถวสุดท้าย วันที่').toBe('2026-11-05');
    expect.soft(Number(last[ci]).toFixed(2), 'แถวสุดท้าย ปิด').toBe('240.00');
  });
  await test.step('5. ค้นคำต้องห้ามในไฟล์', async () => {
    expect.soft(forbiddenHits(text), 'คำต้องห้ามในไฟล์').toEqual([]);
  });
});

test('TC-STUDY-08 · ประวัติเก็บ 20 รายการล่าสุด และเปิดซ้ำไม่รันเอง @P3 @5.7', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: 20 รายการ ล่างสุด 2026-10-01 · ข้อ 3: ยัง 20 · รายการ 2026-10-01 หาย · รายการ 2026-10-02 เป็นเก่าสุด · บนสุดเป็น AAPL + MSFT วันที่ 6 พ.ย. 2569 · ข้อ 4: หน้าเทียบเปิดพร้อม AAPL, MSFT และช่วง 30 ต.ค.–5 พ.ย. เดิม · ประวัติยัง 20 · เก่าสุดยังเป็น 2026-10-02 · มีรายการ AAPL + MSFT 1 รายการ (RV7-03) · ข้อ 5: ผลเหมือนข้อ 4 (เก่าสุด 2026-10-02 · AAPL + MSFT 1 รายการ)',
    source: '[D] §8 (E152)',
    frbr: 'FR-44 · BR-55',
    rules: 'R98',
  });
  const jay = await api.as('jay');
  // รายการใหม่ของ test นี้ = AAPL + MSFT ช่วง 2026-10-30 ถึง 2026-11-05 (seed เป็น AAPL + MSFT ช่วงอื่น)
  const isNew = (x: any) => x.kind === 'compare' && JSON.stringify(x.params?.symbols) === '["AAPL","MSFT"]' && x.params?.from === '2026-10-30' && x.params?.to === '2026-11-05';
  const verify = async (no: string) => {
    await ui.goto('/th/study/history', 'history-page');
    await ui.settle();
    const items = await history(jay);
    await ui.check(page.getByTestId('hist-list'), `ข้อ ${no} ประวัติยัง 20 · เก่าสุด 2026-10-02 · AAPL+MSFT ใหม่ 1 รายการ`, async () => {
      expect.soft(items.length, `ข้อ ${no} จำนวน`).toBe(20);
      await expect.soft(page.locator('[data-testid^="hist-item-"]'), `ข้อ ${no} จำนวนบนจอ`).toHaveCount(20);
      expect.soft(items.length ? bkkDate(items[items.length - 1].createdAt) : '', `ข้อ ${no} เก่าสุด`).toBe('2026-10-02');
      expect.soft(items.filter(isNew).length, `ข้อ ${no} AAPL+MSFT (30 ต.ค.–5 พ.ย.) 1 รายการ`).toBe(1);
      await expect.soft(page.locator('[data-testid^="hist-item-"]').last(), `ข้อ ${no} เก่าสุดบนจอ`).toContainText('2 ต.ค. 2569');
    });
  };

  await test.step('1. เปิด /th/study/history นับรายการ ดูรายการล่างสุด', async () => {
    await ui.login('jay');
    await ui.goto('/th/study/history', 'history-page');
    await ui.settle();
  });
  await ui.check(page.getByTestId('hist-list'), 'ข้อ 1 20 รายการ ล่างสุด 2026-10-01', async () => {
    const items = await history(jay);
    expect.soft(items.length, 'ข้อ 1 จำนวน').toBe(20);
    await expect.soft(page.locator('[data-testid^="hist-item-"]'), 'ข้อ 1 จำนวนบนจอ').toHaveCount(20);
    expect.soft(items.length ? bkkDate(items[items.length - 1].createdAt) : '', 'ข้อ 1 ล่างสุด').toBe('2026-10-01');
    await expect.soft(page.locator('[data-testid^="hist-item-"]').last(), 'ข้อ 1 ล่างสุดบนจอ').toContainText('1 ต.ค. 2569');
  });

  await test.step('2. เทียบใหม่ AAPL + MSFT ช่วง 2026-10-30 ถึง 2026-11-05', async () => {
    await ui.goto('/th/study/compare', 'compare-page');
    await addChip(page, 'AAPL');
    await addChip(page, 'MSFT');
    await page.getByTestId('cmp-from').fill('2026-10-30');
    await page.getByTestId('cmp-to').fill('2026-11-05');
    await page.getByTestId('cmp-submit').click();
    await page.getByTestId('cmp-result').waitFor({ timeout: 10_000 }).catch(() => {});
    await ui.mark(page.getByTestId('cmp-result'), 'ข้อ 2 ผลเทียบ AAPL + MSFT');
  });

  await test.step('3. กลับ /th/study/history', async () => { await ui.goto('/th/study/history', 'history-page'); await ui.settle(); });
  const items3 = await history(jay);
  await ui.check(page.getByTestId('hist-list'), 'ข้อ 3 ยัง 20 · 10-01 หาย · 10-02 เก่าสุด · บนสุด AAPL+MSFT 6 พ.ย. 2569', async () => {
    expect.soft(items3.length, 'ข้อ 3 จำนวน').toBe(20);
    await expect.soft(page.locator('[data-testid^="hist-item-"]'), 'ข้อ 3 จำนวนบนจอ').toHaveCount(20);
    const dates = items3.map((x) => bkkDate(x.createdAt));
    expect.soft(dates, 'ข้อ 3 รายการ 2026-10-01 หาย').not.toContain('2026-10-01');
    expect.soft(dates[dates.length - 1], 'ข้อ 3 เก่าสุด').toBe('2026-10-02');
    expect.soft(items3[0] && isNew(items3[0]), 'ข้อ 3 บนสุดเป็น AAPL + MSFT ใหม่').toBe(true);
    expect.soft(dates[0], 'ข้อ 3 บนสุดวันที่ 6 พ.ย.').toBe('2026-11-06');
    const top = page.locator('[data-testid^="hist-item-"]').first();
    await expect.soft(top, 'ข้อ 3 บนสุดบนจอ AAPL, MSFT').toContainText('AAPL, MSFT');
    await expect.soft(top, 'ข้อ 3 บนสุดบนจอ 6 พ.ย. 2569').toContainText('6 พ.ย. 2569');
  });

  await test.step('4. กดเปิดรายการใหม่', async () => {
    await page.locator('[data-testid^="hist-item-"]').first().click();
    await page.waitForURL(/\/study\/compare/);
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' });
    await ui.settle();
  });
  const checkReopen = async (no: string) => {
    await ui.check(page.getByTestId('cmp-form'), `ข้อ ${no} หน้าเทียบเปิดพร้อม AAPL, MSFT และช่วง 30 ต.ค.–5 พ.ย.`, async () => {
      await expect.soft(page.getByTestId('cmp-chip-AAPL'), `ข้อ ${no} ชิป AAPL`).toBeVisible();
      await expect.soft(page.getByTestId('cmp-chip-MSFT'), `ข้อ ${no} ชิป MSFT`).toBeVisible();
      await expect.soft(page.getByTestId('cmp-from'), `ข้อ ${no} from`).toHaveValue('2026-10-30');
      await expect.soft(page.getByTestId('cmp-to'), `ข้อ ${no} to`).toHaveValue('2026-11-05');
    });
  };
  await checkReopen('4');
  await test.step('4. กลับมาที่ประวัติ', async () => { await verify('4'); });

  await test.step('5. รีโหลดหน้าเทียบที่เปิดจากประวัติ', async () => {
    await page.goBack();
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' });
    await page.reload();
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' });
    await ui.settle();
  });
  await checkReopen('5');
  await test.step('5. กลับไปดู /th/study/history', async () => { await verify('5'); });
});

test('TC-STUDY-09 · สรุป AI ไม่เกิน 3 บรรทัด บอกเวลาข้อมูล กดซ้ำได้ข้อความเดิม ไม่มีช่องพิมพ์ @P1 @5.7', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 1: ไม่มีช่องพิมพ์ · ข้อ 2: 1–3 บรรทัด (นับจาก \\n ในข้อความของ POST /api/stocks/AAPL/summary · RV7-13) · บอกเวลาข้อมูล 6 พ.ย. 2569 04:00 น. (รอบปิด 5 พ.ย.) · ถ้าอ้างตัวชี้วัด ต้องเป็น 238.80 / 235.22 / 52.54 ตรงกับหน้าหุ้น · ข้อ 3–4: AAPL ข้อความเหมือนกันทุกตัวอักษรทั้ง 11 ครั้ง (ข้อ 2–3 + หลังรีโหลด) · VOO 22:00 กับ 22:30 เหมือนกันทุกตัวอักษร · ข้อ 5: 1–3 บรรทัด ไม่มีอักษรไทย',
    source: '[D] บ.22, §9 · [D] §9 (NFR-12) · [D+R] ค่าตัวชี้วัด TEST-DATA 4.4 · [R] เวลาปิดตลาดนิวยอร์กแปลงเป็นเวลาไทย · ⚠️ A-11 (FR-48)',
    frbr: 'FR-47 · FR-48 · BR-56 · NFR-12',
    rules: 'R99 · R100',
  });
  const summarize = async () => {
    const wait = page.waitForResponse((r) => r.url().includes('/summary') && r.request().method() === 'POST', { timeout: 10_000 }).catch(() => null);
    await page.getByTestId('stock-summary-btn').click();
    const r = await wait;
    await expect(page.getByTestId('stock-summary')).toHaveAttribute('data-state', 'ready', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(150);
    const ui_ = (await page.getByTestId('stock-summary-result').innerText().catch(() => '')).trim();
    const j = r ? await r.json().catch(() => null) : null;
    return { ui: ui_, api: j };
  };
  const apiText = (j: any): string => (Array.isArray(j?.lines) ? j.lines.join('\n') : String(j?.text ?? j?.summary ?? ''));
  const lineCount = (j: any) => apiText(j).split('\n').filter((l) => l.trim()).length;

  await test.step('เงื่อนไขก่อนเริ่ม: U01 เปิด /th/stocks/AAPL', async () => {
    await ui.login('beam');
    await ui.goto('/th/stocks/AAPL', 'stock-page');
    await ui.settle();
  });
  await ui.check(page.getByTestId('stock-summary'), 'ข้อ 1 ไม่มีช่องพิมพ์ในส่วนผู้ช่วย AI', async (l) => {
    await expect.soft(l.locator('input, textarea, [contenteditable="true"]'), 'ข้อ 1 ช่องพิมพ์').toHaveCount(0);
  });

  const texts: string[] = [];
  let first: any = null;
  await test.step('2. กด "สรุปหุ้นนี้"', async () => {
    const r = await summarize();
    first = r.api;
    texts.push(r.ui);
  });
  await ui.check(page.getByTestId('stock-summary-result'), 'ข้อ 2 1–3 บรรทัด', async () => {
    const n = lineCount(first);
    expect.soft(n >= 1 && n <= 3, `ข้อ 2 จำนวนบรรทัด (API) = ${n}`).toBe(true);
    const nUi = await page.locator('[data-testid^="stock-summary-line-"]').count();
    expect.soft(nUi >= 1 && nUi <= 3, `ข้อ 2 จำนวนบรรทัด (จอ) = ${nUi}`).toBe(true);
  });
  await ui.check(page.getByTestId('stock-summary-asof'), 'ข้อ 2 เวลาข้อมูล 6 พ.ย. 2569 04:00 น.', async (l) => {
    await expect.soft(l, 'ข้อ 2 เวลาข้อมูล').toContainText('6 พ.ย. 2569');
    await expect.soft(l, 'ข้อ 2 เวลา 04:00 น.').toContainText('04:00');
    expect.soft(first?.asOf, 'ข้อ 2 asOf API = 04:00 น. 6 พ.ย. เวลาไทย').toBe('2026-11-05T21:00:00.000Z');
  });
  await ui.check(page.getByTestId('stock-indicators'), 'ข้อ 2 ตัวชี้วัดในสรุปตรงกับหน้าหุ้น 238.80 / 235.22 / 52.54', async () => {
    const t = apiText(first);
    const sma50 = (await page.getByTestId('stock-sma50-latest').innerText().catch(() => '')).trim();
    const sma200 = (await page.getByTestId('stock-sma200-latest').innerText().catch(() => '')).trim();
    const rsi = (await page.getByTestId('stock-rsi-value').innerText().catch(() => '')).trim();
    for (const [name, want, onPage] of [['ค่าเฉลี่ย 50 วัน', '238.80', sma50], ['ค่าเฉลี่ย 200 วัน', '235.22', sma200], ['RSI', '52.54', rsi]] as const) {
      expect.soft(onPage, `หน้าหุ้น ${name}`).toContain(want);
      if (/50|200|RSI/.test(t)) expect.soft(t, `สรุปอ้าง ${name}`).toContain(want);
    }
    expect.soft(texts[0].replace(/\s+/g, ' '), 'ข้อความบนจอตรงกับ API').toContain(apiText(first).split('\n')[0]);
  });

  await test.step('3. กดซ้ำอีก 9 ครั้ง เก็บข้อความทั้ง 10 ครั้ง', async () => {
    for (let i = 0; i < 9; i++) {
      const r = await summarize();
      texts.push(r.ui);
      expect.soft(apiText(r.api), `ครั้งที่ ${i + 2} API ตรงกับครั้งแรก`).toBe(apiText(first));
    }
  });
  await test.step('4. รีโหลด กดอีก 1 ครั้ง', async () => {
    await page.reload();
    await page.locator('html[data-ready="true"]').waitFor({ state: 'attached' });
    const r = await summarize();
    texts.push(r.ui);
    expect.soft(apiText(r.api), 'หลังรีโหลด API ตรงกับครั้งแรก').toBe(apiText(first));
  });
  await ui.check(page.getByTestId('stock-summary-result'), 'ข้อ 3–4 AAPL เหมือนกันทุกตัวอักษรทั้ง 11 ครั้ง', async () => {
    expect.soft(texts.length, 'จำนวนครั้ง').toBe(11);
    expect.soft(new Set(texts).size, `AAPL ข้อความต่างกัน ${new Set(texts).size} แบบ`).toBe(1);
    texts.forEach((t, i) => expect.soft(t, `ครั้งที่ ${i + 1}`).toBe(texts[0]));
  });

  let voo1 = '', voo2 = '', vooApi1 = '', vooApi2 = '';
  await test.step('4. เปิดหน้า VOO กดสรุป 1 ครั้ง (22:00)', async () => {
    await ui.goto('/th/stocks/VOO', 'stock-page');
    const r = await summarize();
    voo1 = r.ui; vooApi1 = apiText(r.api);
  });
  await test.step('4. เลื่อนนาฬิกาเป็น 22:30 กดสรุป VOO อีก 1 ครั้ง', async () => {
    await api.clock('2026-11-06T22:30:00+07:00');
    const r = await summarize();
    voo2 = r.ui; vooApi2 = apiText(r.api);
  });
  await ui.check(page.getByTestId('stock-summary-result'), 'ข้อ 4 VOO 22:00 กับ 22:30 เหมือนกันทุกตัวอักษร', async () => {
    expect.soft(voo2, 'VOO จอ 22:30 = 22:00').toBe(voo1);
    expect.soft(vooApi2, 'VOO API 22:30 = 22:00').toBe(vooApi1);
  });

  await test.step('5. ทำซ้ำข้อ 2 บนหน้าอังกฤษ /en/stocks/AAPL', async () => {
    await ui.goto('/en/stocks/AAPL', 'stock-page');
    const r = await summarize();
    const n = lineCount(r.api);
    await ui.check(page.getByTestId('stock-summary-result'), 'ข้อ 5 EN 1–3 บรรทัด ไม่มีอักษรไทย', async (l) => {
      expect.soft(n >= 1 && n <= 3, `ข้อ 5 จำนวนบรรทัด (API) = ${n}`).toBe(true);
      const nUi = await page.locator('[data-testid^="stock-summary-line-"]').count();
      expect.soft(nUi >= 1 && nUi <= 3, `ข้อ 5 จำนวนบรรทัด (จอ) = ${nUi}`).toBe(true);
      expect.soft(THAI.test(r.ui), `ข้อ 5 จอมีอักษรไทย: ${r.ui}`).toBe(false);
      expect.soft(THAI.test(apiText(r.api)), 'ข้อ 5 API มีอักษรไทย').toBe(false);
      await expect.soft(l.locator('input, textarea'), 'ข้อ 5 ไม่มีช่องพิมพ์').toHaveCount(0);
    });
    await ui.check(page.getByTestId('stock-summary-asof'), 'ข้อ 5 EN เวลาข้อมูล', async (l) => {
      expect.soft(r.api?.asOf, 'ข้อ 5 asOf').toBe('2026-11-05T21:00:00.000Z');
      await expect.soft(l, 'ข้อ 5 เวลา 04:00').toContainText('04:00');
    });
  });
});

test('TC-STUDY-10 · สรุป AI กรณีขอบ (RSI สุดขั้ว หุ้นถูกถอด) และคำต้องห้ามทั้ง 60 ตัว + หน้าเริ่มต้นลงทุน @P1 @5.7', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ข้อ 2: ทุกข้อความ ≤ 3 บรรทัด · คำต้องห้าม 0 คำ ใน 120 ข้อความ · ข้อ 3: PDNW ไม่แสดงค่าเฉลี่ยเป็น 0 หรือตัวเลขที่ไม่มีจริง · OLDC บอกเวลาข้อมูลเป็นรอบ 2 ต.ค. (03:00 น. 3 ต.ค. 2569) และบอกว่าหยุดซื้อขายแล้ว ไม่ใช่ 6 พ.ย. · ZUP: ผ่านถ้าคำ "ซื้อมากเกินไป" ปรากฏเฉพาะในชื่อป้าย RSI (สมมติฐาน 8.2 #18) · ถ้าใช้เป็นคำแนะนำ (เช่น "ควรขาย") = ล้ม (RV7-05) · ข้อ 4: ค้นตรงตัวอักษร "รับประกัน" เจอได้เฉพาะใน "ไม่ได้รับประกัน" · คำต้องห้ามอื่น 0 คำ · ไม่มีชื่อย่อหุ้นตัวใดในประโยคบอกว่าดี/น่าซื้อ · ข้อ 5: มีหัวข้อครบ 5 หัวข้อ: P/E · ปันผล · ค่าเฉลี่ย · RSI · วิธีใช้ตัวคัดกรอง ทั้ง 2 ภาษา',
    source: '[D] บ.56, §9 (NFR-06, E153) · [D] บ.22 (BR-56) · [D] §9 (FR-49) · [R] เวลาปิดตลาดตอนยังเป็นเวลาออมแสง · ⚠️ A-29 · [O-ยังไม่ยืนยัน] "ซื้อมากเกินไป" และ "ไม่ได้รับประกัน" นับเป็นคำต้องห้ามไหม (ส่วน F ถามลูกค้า ข้อ 12)',
    frbr: 'FR-47 · FR-49 · BR-56 · NFR-06',
    rules: 'R99 · R100 · R119 ⚠️',
  });
  await ui.login('beam');
  const apiText = (j: any): string => (Array.isArray(j?.lines) ? j.lines.join('\n') : String(j?.text ?? j?.summary ?? ''));

  let symbols: string[] = [];
  await test.step('เตรียมรายชื่อหุ้น 60 ตัว (ตัวคัดกรอง 59 ตัว + OLDC)', async () => {
    const r = await api.guest.post('/api/screener', { data: {} });
    symbols = ((await r.json()).results ?? []).map((x: any) => x.symbol);
    if (!symbols.includes('OLDC')) symbols.push('OLDC');
    expect.soft(symbols.length, 'จำนวนหุ้นทั้งหมด').toBe(60);
  });

  const all: Record<string, any> = {};
  await test.step('1. เรียก POST /api/stocks/:symbol/summary ครบ 60 ตัว × TH/EN (120 ข้อความ)', async () => {
    await ui.goto('/th/study/screener', 'screener-page');
    await ui.mark(page.getByTestId('scr-table'), 'ข้อ 1 หุ้นทั้งหมดที่ใช้เรียกสรุป');
    for (const s of symbols) for (const lang of ['th', 'en']) {
      const r = await api.guest.post(`/api/stocks/${encodeURIComponent(s)}/summary?lang=${lang}`);
      all[`${s}/${lang}`] = { status: r.status(), body: await r.json().catch(() => null) };
    }
    expect.soft(Object.keys(all).length, 'จำนวนข้อความ').toBe(120);
  });
  await test.step('2. นับบรรทัดและค้นคำต้องห้ามทุกข้อความ', async () => {
    const over: string[] = [], bad: string[] = [], fail: string[] = [], thaiInEn: string[] = [];
    for (const [k, v] of Object.entries(all)) {
      if (v.status !== 200) { fail.push(`${k}:${v.status}`); continue; }
      const t = apiText(v.body);
      const n = t.split('\n').filter((l) => l.trim()).length;
      if (n > 3 || n < 1) over.push(`${k}:${n}`);
      const h = forbiddenHits(t);
      if (h.length) bad.push(`${k}:${h.join('|')}`);
      if (k.endsWith('/en') && THAI.test(t)) thaiInEn.push(k);
    }
    await info.attach('summaries-120.json', { body: JSON.stringify(all, null, 2), contentType: 'application/json' });
    expect.soft(fail, 'สรุปที่เรียกไม่สำเร็จ').toEqual([]);
    expect.soft(over, 'ข้อความเกิน 3 บรรทัด').toEqual([]);
    expect.soft(bad, 'คำต้องห้ามใน 120 ข้อความ').toEqual([]);
    expect.soft(thaiInEn, 'อักษรไทยในข้อความอังกฤษ').toEqual([]);
  });

  await test.step('3. ดู ZUP PDNW OLDC เป็นพิเศษ', async () => {
    // PDNW
    const pd = apiText(all['PDNW/th']?.body) + '\n' + apiText(all['PDNW/en']?.body);
    await ui.goto('/th/stocks/PDNW', 'stock-page');
    await ui.check(page.getByTestId('stock-indicators'), 'ข้อ 3 PDNW ค่าเฉลี่ยข้อมูลไม่พอ ไม่แสดงเป็น 0', async () => {
      expect.soft(pd, 'PDNW ไม่มีค่าเฉลี่ยเป็น $0').not.toMatch(/\$0(\.0+)?\b/);
      expect.soft(pd, 'PDNW ไม่อ้างตัวเลขค่าเฉลี่ย 50/200 วัน').not.toMatch(/(ค่าเฉลี่ย|average)[^\n]{0,20}\(\$\d/i);
    });
    // OLDC
    const oth = all['OLDC/th']?.body, oen = all['OLDC/en']?.body;
    expect.soft(oth?.asOf, 'OLDC asOf = 03:00 น. 3 ต.ค. 2569 เวลาไทย').toBe('2026-10-02T20:00:00.000Z');
    expect.soft(oen?.asOf, 'OLDC asOf (en)').toBe('2026-10-02T20:00:00.000Z');
    expect.soft(apiText(oth), 'OLDC บอกว่าหยุดซื้อขายแล้ว').toMatch(/หยุดซื้อขาย|ถูกถอด/);
    expect.soft(apiText(oth), 'OLDC ไม่ใช่รอบ 6 พ.ย.').not.toContain('6 พ.ย.');
    await ui.goto('/th/stocks/OLDC', 'stock-page');
    await page.getByTestId('stock-summary-btn').click();
    await expect(page.getByTestId('stock-summary')).toHaveAttribute('data-state', 'ready', { timeout: 10_000 }).catch(() => {});
    await ui.check(page.getByTestId('stock-summary-asof'), 'ข้อ 3 OLDC เวลาข้อมูล 3 ต.ค. 2569 03:00 น.', async (l) => {
      await expect.soft(l, 'OLDC วันที่').toContainText('3 ต.ค. 2569');
      await expect.soft(l, 'OLDC เวลา').toContainText('03:00');
      await expect.soft(l, 'OLDC ไม่ใช่ 6 พ.ย.').not.toContainText('6 พ.ย.');
    });
    await ui.check(page.getByTestId('stock-summary-result'), 'ข้อ 3 OLDC บอกว่าหยุดซื้อขายแล้ว', (l) => expect.soft(l, 'OLDC หยุดซื้อขาย').toContainText(/หยุดซื้อขาย|ถูกถอด/));
    // ZUP
    const zt = apiText(all['ZUP/th']?.body);
    await ui.goto('/th/stocks/ZUP', 'stock-page');
    await page.getByTestId('stock-summary-btn').click();
    await expect(page.getByTestId('stock-summary')).toHaveAttribute('data-state', 'ready', { timeout: 10_000 }).catch(() => {});
    await ui.check(page.getByTestId('stock-summary-result'), 'ข้อ 3 ZUP "ซื้อมากเกินไป" เฉพาะชื่อป้าย RSI', async () => {
      const lines = zt.split('\n').filter((l) => l.includes('ซื้อมากเกินไป'));
      for (const l of lines) {
        expect.soft(l, 'บรรทัดที่มี "ซื้อมากเกินไป" ต้องเป็นป้าย RSI').toMatch(/RSI/);
        expect.soft(l, 'ใช้เป็นชื่อป้าย (อยู่ในเครื่องหมายคำพูด/คำว่าป้าย)').toMatch(/ป้าย|["“”]ซื้อมากเกินไป["“”]/);
      }
      expect.soft(forbiddenHits(zt), 'ZUP ไม่มีคำแนะนำ').toEqual([]);
      info.annotations.push({ type: 'pending', description: `ZUP สรุป TH (ส่งคุณอรตรวจ "ซื้อมากเกินไป" · 8.2 #18): ${zt.replace(/\n/g, ' / ')}` });
    });
  });

  for (const lang of ['th', 'en'] as const) {
    await test.step(`4. เปิด /${lang}/learn ค้นคำต้องห้าม และชื่อย่อหุ้น 60 ตัว`, async () => {
      await ui.goto(`/${lang}/learn`, 'learn-page');
      const text = await page.getByTestId('learn-page').innerText();
      await ui.check(page.getByTestId('learn-page'), `[${lang}] ข้อ 4 คำต้องห้าม 0 คำ · "รับประกัน" เฉพาะใน "ไม่ได้รับประกัน"`, async () => {
        expect.soft(forbiddenHits(text), `[${lang}] คำต้องห้ามใน /learn`).toEqual([]);
        const total = (text.match(/รับประกัน/g) ?? []).length;
        const allowed = (text.match(/ไม่ได้รับประกัน/g) ?? []).length;
        expect.soft(total - allowed, `[${lang}] "รับประกัน" นอก "ไม่ได้รับประกัน"`).toBe(0);
        if (allowed) info.annotations.push({ type: 'pending', description: `[${lang}] /learn มี "ไม่ได้รับประกัน" ${allowed} ครั้ง (ไม่นับ · ส่งคุณอรตรวจ 8.2 #18)` });
      });
      const found = symbols.filter((s) => new RegExp(`(^|[^A-Za-z.])${s.replace('.', '\\.')}([^A-Za-z.]|$)`).test(text));
      const sentences = text.split(/\n|(?<=[.!?])\s+/).filter((sn) => found.some((s) => new RegExp(`(^|[^A-Za-z.])${s.replace('.', '\\.')}([^A-Za-z.]|$)`).test(sn)));
      info.annotations.push({ type: 'pending', description: `[${lang}] /learn ชื่อย่อหุ้นที่พบ: ${found.join(', ') || '(ไม่มี)'} · ประโยค: ${sentences.slice(0, 10).join(' | ').slice(0, 800)}` });
      const praise = /ดี|น่าซื้อ|น่าลงทุน|good|great|best|buy/i;
      expect.soft(sentences.filter((sn) => praise.test(sn) && !/ไม่ได้|ไม่ใช่|not\b/i.test(sn)), `[${lang}] ประโยคที่มีชื่อย่อหุ้นและคำชม`).toEqual([]);
      info.annotations.push({ type: 'not-automated', description: `[${lang}] การตัดสินว่าประโยคที่มีชื่อย่อหุ้น "บอกว่าดี" ตรวจแบบคำสำคัญเท่านั้น ควรให้คนอ่านซ้ำ` });
    });
    await test.step(`5. /${lang}/learn ตรวจหัวข้อ FR-49 ครบ 5 หัวข้อ`, async () => {
      for (const [id, name] of [['pe', 'P/E'], ['div', 'ปันผล'], ['sma', 'ค่าเฉลี่ย'], ['rsi', 'RSI'], ['screener', 'วิธีใช้ตัวคัดกรอง']] as const) {
        await ui.check(page.getByTestId(`learn-section-${id}`), `[${lang}] ข้อ 5 หัวข้อ ${name}`, (l) => expect.soft(l, `[${lang}] หัวข้อ ${name}`).toBeVisible());
      }
    });
  }
});
