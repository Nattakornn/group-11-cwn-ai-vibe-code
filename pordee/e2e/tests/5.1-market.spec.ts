// หัวข้อ 5.1 ราคา สถานะตลาด และแหล่งข้อมูล · TC-MKT-01..10 (TEST-PLAN.md บรรทัด 140–385)
import { test, expect, meta, type Api } from '../fixtures/pordee';
import type { Locator, Page } from '@playwright/test';

const T = (s: string) => `${s}+07:00`;
/** แผน 8.2 #25: normalize "−" → "-" ก่อนเทียบ */
const norm = (s: string | null | undefined) => (s ?? '').replace(/−/g, '-').trim();
const noSpace = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '');

const STATUS_TEXT = { open: 'ตลาดเปิด', closed: 'ตลาดปิด', early: 'ปิดเร็ววันนี้ 01:00 น.' } as const;
type St = keyof typeof STATUS_TEXT;

async function marketApi(api: Api) {
  const r = await api.guest.get('/api/market/status');
  return r.json();
}
async function quoteApi(api: Api, sym: string) {
  const r = await api.guest.get(`/api/stocks/${sym}`);
  const j = await r.json();
  return j.quote as { price: string; change: string; changePct: string; asOf: string; stale: boolean };
}
async function feedStatus(api: Api) {
  const kan = await api.as('kan');
  return (await kan.get('/api/staff/feed-status')).json();
}
/** เปิดหน้าแล้วคืน HTTP status */
async function gotoStatus(page: Page, path: string) {
  const r = await page.goto(path);
  await page.locator('html[data-ready="true"]').waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
  return r?.status() ?? 0;
}
const staffCheck = (want: string, what: string) => async (l: Locator) =>
  expect.soft(noSpace(await l.textContent()), what).toBe(noSpace(want));

// ---------------------------------------------------------------------------
test('TC-MKT-01 · สถานะตลาด ขอบเปิด 21:30 ปิด 04:00 และเสาร์–อาทิตย์ของนิวยอร์ก @P2 @5.1', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: '9 พ.ย. 21:29:59 "ตลาดปิด" → 21:30:00 "ตลาดเปิด" · 10 พ.ย. 03:59:59 "ตลาดเปิด" → 04:00:00 "ตลาดปิด" · 14 พ.ย. 03:59:59 "ตลาดเปิด" (= ศ. 13 พ.ย. 15:59:59 นิวยอร์ก) · 04:00:00 "ตลาดปิด" · 14 พ.ย. 21:30:00 "ตลาดปิด" (= ส. 14 พ.ย. 09:30 นิวยอร์ก) · 16 พ.ย. 21:30:00 "ตลาดเปิด" · ทั้ง 2 หน้าข้อความตรงกับ API · 16 พ.ย. 03:00:00 "ตลาดปิด" (ถ้านับจากวันไทยจะได้ "ตลาดเปิด")',
    source: '[D] BR-02 BR-03 BR-08 · TEST-DATA E07–E12 E28–E31 · [R] แปลงเวลานิวยอร์ก (UTC−5 ช่วงมาตรฐาน)',
    frbr: 'FR-04 · BR-02 BR-03 BR-08',
    rules: 'R01 R02 R07',
  });
  const cases: [string, St][] = [
    ['2026-11-09T21:29:59', 'closed'], ['2026-11-09T21:30:00', 'open'],
    ['2026-11-10T03:59:59', 'open'], ['2026-11-10T04:00:00', 'closed'],
    ['2026-11-14T03:59:59', 'open'], ['2026-11-14T04:00:00', 'closed'], ['2026-11-14T21:30:00', 'closed'],
    ['2026-11-16T21:30:00', 'open'], ['2026-11-16T03:00:00', 'closed'],
  ];
  let i = 0;
  for (const [t, st] of cases) {
    i += 1;
    await test.step(`${i}. นาฬิกา ${t} → API + หัวเว็บ /th และ /th/search?q=KO (คาด ${STATUS_TEXT[st]})`, async () => {
      await api.clock(T(t));
      const m = await marketApi(api);
      expect.soft(m.open, `${t} API open`).toBe(st === 'open');
      await ui.goto('/th');
      await ui.check(page.getByTestId('core-market-status'), `${t} /th ${STATUS_TEXT[st]}`, l => expect.soft(l).toHaveText(STATUS_TEXT[st]));
      await ui.goto('/th/search?q=KO');
      await ui.check(page.getByTestId('core-market-status'), `${t} /th/search ${STATUS_TEXT[st]}`, l => expect.soft(l).toHaveText(STATUS_TEXT[st]));
    });
  }
});

// ---------------------------------------------------------------------------
test('TC-MKT-02 · สถานะตลาด ช่วงเวลาออมแสงและวันเปลี่ยนช่วง (นับตามวันนิวยอร์ก) @P2 @5.1', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: '7 เม.ย. 20:29:59 ปิด / 20:30:00 เปิด · 8 เม.ย. 02:59:59 เปิด / 03:00:00 ปิด · 6 มี.ค. 20:30 ปิด / 21:30 เปิด (ยังเป็นเวลามาตรฐาน) · 9 มี.ค. 20:30 เปิด · 30 ต.ค. 20:30 เปิด · 2 พ.ย. 20:30 ปิด / 21:30 เปิด',
    source: '[D] BR-04 BR-05 · TEST-DATA E13–E20 · [R] DST สหรัฐฯ: อาทิตย์ที่ 2 ของมี.ค. ถึงอาทิตย์แรกของพ.ย.',
    frbr: 'FR-04 · BR-04 BR-05',
    rules: 'R03 R04',
  });
  const cases: [string, St][] = [
    ['2026-04-07T20:29:59', 'closed'], ['2026-04-07T20:30:00', 'open'],
    ['2026-04-08T02:59:59', 'open'], ['2026-04-08T03:00:00', 'closed'],
    ['2026-03-06T20:30:00', 'closed'], ['2026-03-06T21:30:00', 'open'],
    ['2026-03-09T20:30:00', 'open'], ['2026-10-30T20:30:00', 'open'],
    ['2026-11-02T20:30:00', 'closed'], ['2026-11-02T21:30:00', 'open'],
  ];
  let i = 0;
  for (const [t, st] of cases) {
    i += 1;
    await test.step(`${i}. นาฬิกา ${t} → API + หัวเว็บ /th (คาด ${STATUS_TEXT[st]})`, async () => {
      await api.clock(T(t));
      const m = await marketApi(api);
      expect.soft(m.open, `${t} API open`).toBe(st === 'open');
      await ui.goto('/th');
      await ui.check(page.getByTestId('core-market-status'), `${t} ${STATUS_TEXT[st]}`, l => expect.soft(l).toHaveText(STATUS_TEXT[st]));
    });
  }
});

// ---------------------------------------------------------------------------
test('TC-MKT-03 · วันหยุด วันปิดเร็ว และ "เวลาเปิดครั้งถัดไป" @P2 @5.1', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: '25 พ.ย. 22:00 "ตลาดเปิด" · 26 พ.ย. 22:00 "ตลาดปิด" + เปิดครั้งถัดไป 27 พ.ย. 2569 21:30 น. · 27 พ.ย. 22:00 "ปิดเร็ววันนี้ 01:00 น." (สถานะเปิด) · 28 พ.ย. 00:59:59 แถบ = "ปิดเร็ววันนี้ 01:00 น." (API สถานะเปิด + earlyClose) · 01:00:00 "ตลาดปิด" + เปิดครั้งถัดไป 30 พ.ย. 2569 21:30 น. · 24 ธ.ค. 22:00 แถบ "ปิดเร็ววันนี้ 01:00 น." · 25 ธ.ค. 00:59:59 "ปิดเร็ววันนี้ 01:00 น." / 01:00:00 "ตลาดปิด" · 25 ธ.ค. 22:00 "ตลาดปิด" + เปิดครั้งถัดไป 28 ธ.ค. 2569 21:30 น.',
    source: '[D] BR-06 BR-07 FR-04 · TEST-DATA E21–E27 · ⚠️ A-01 · ขั้น 3 (หัวเว็บบอกเวลาเปิดถัดไปตอนตลาดเปิด/ปิดเร็วไหม) = [O-ยังไม่ยืนยัน] F ถามลูกค้าข้อ 16',
    frbr: 'FR-04 · BR-06 BR-07 BR-08',
    rules: 'R05 R06 R07 R08 ⚠️',
  });
  const cases: { t: string; st: St; next?: string; nextIso?: string }[] = [
    { t: '2026-11-25T22:00:00', st: 'open' },
    { t: '2026-11-26T22:00:00', st: 'closed', next: '27 พ.ย. 2569 21:30 น.', nextIso: '2026-11-27T14:30:00.000Z' },
    { t: '2026-11-27T22:00:00', st: 'early' },
    { t: '2026-11-28T00:59:59', st: 'early' },
    { t: '2026-11-28T01:00:00', st: 'closed', next: '30 พ.ย. 2569 21:30 น.', nextIso: '2026-11-30T14:30:00.000Z' },
    { t: '2026-12-24T22:00:00', st: 'early' },
    { t: '2026-12-25T00:59:59', st: 'early' },
    { t: '2026-12-25T01:00:00', st: 'closed' },
    { t: '2026-12-25T22:00:00', st: 'closed', next: '28 ธ.ค. 2569 21:30 น.', nextIso: '2026-12-28T14:30:00.000Z' },
  ];
  let i = 0;
  for (const c of cases) {
    i += 1;
    await test.step(`${i}. นาฬิกา ${c.t} → API + หัวเว็บ /th/stocks/KO และ /th (คาด ${STATUS_TEXT[c.st]}${c.next ? ' · เปิดถัดไป ' + c.next : ''})`, async () => {
      await api.clock(T(c.t));
      const m = await marketApi(api);
      expect.soft(m.open, `${c.t} API open`).toBe(c.st !== 'closed');
      if (c.st === 'early') expect.soft(m.earlyClose, `${c.t} API earlyClose`).toBe(true);
      if (c.st === 'open') expect.soft(m.earlyClose, `${c.t} API earlyClose`).toBe(false);
      if (c.nextIso) expect.soft(m.nextOpen, `${c.t} API nextOpen`).toBe(c.nextIso);
      for (const path of ['/th/stocks/KO', '/th']) {
        await ui.goto(path);
        await ui.check(page.getByTestId('core-market-status'), `${c.t} ${path} ${STATUS_TEXT[c.st]}`, l => expect.soft(l).toHaveText(STATUS_TEXT[c.st]));
        if (c.next) {
          await ui.check(page.getByTestId('core-market-next'), `${c.t} ${path} เปิดครั้งถัดไป ${c.next}`, l => expect.soft(l).toContainText(c.next!));
        }
      }
      if (c.t === '2026-11-27T22:00:00') {
        // ขั้น 3: [O-ยังไม่ยืนยัน] บันทึกค่า ไม่ตัดสิน
        const n = page.getByTestId('core-market-next');
        const cnt = await n.count();
        const txt = cnt ? (await n.first().textContent())?.trim() : '(ไม่มี core-market-next)';
        await ui.mark(page.getByTestId('core-market-bar'), '27 พ.ย. 22:00 หัวเว็บบอกเวลาเปิดถัดไปไหม');
        info.annotations.push({ type: 'pending', description: `27 พ.ย. 22:00 (ปิดเร็ว) หัวเว็บเวลาเปิดครั้งถัดไป: ${txt} · แถบทั้งหมด: "${(await page.getByTestId('core-market-bar').textContent())?.trim()}" · API nextOpen=${m.nextOpen} (รอลูกค้าตอบ F ข้อ 16)` });
      }
    });
  }
});

// ---------------------------------------------------------------------------
test('TC-MKT-04 · ราคาล่าช้า 15 นาที + การเปลี่ยนแปลง $ / % + เวลาไทย @P1 @5.1', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ขั้น 1: $240.80 · +$0.80 · +0.33% · "ราคา ณ 21:40 น. (ล่าช้า 15 นาที)" · ขั้น 2: $241.00 · +$1.00 · +0.42% · "ราคา ณ 21:45 น. (ล่าช้า 15 นาที)" · ขั้น 3: $241.00 · +$1.00 · +0.42% · "ราคา ณ 21:45 น. (ล่าช้า 15 นาที)" · ไม่มีป้าย "ข้อมูลไม่อัปเดต" ทั้ง 3 ขั้น',
    source: '[D] BR-09 FR-03 · TEST-DATA E32–E34 · [R] สูตร % = (ราคา − ปิดวันก่อน) ÷ ปิดวันก่อน · RV1-04 ราคาเปิด = ปิดวันก่อน จับสูตร "เทียบราคาเปิด" ไม่ได้ (8.2 #32)',
    frbr: 'FR-03 · BR-09',
    rules: 'R09',
  });
  const steps = [
    { n: 1, now: '2026-11-06T21:59:59', price: '$240.80', chg: '+$0.80', pct: '+0.33%', asof: 'ราคา ณ 21:40 น. (ล่าช้า 15 นาที)', apiPrice: '240.8000', apiChg: '0.8000', apiAsOf: '2026-11-06T14:40:00.000Z', apiPct: '0.33' },
    { n: 2, now: '2026-11-06T22:00:00', price: '$241.00', chg: '+$1.00', pct: '+0.42%', asof: 'ราคา ณ 21:45 น. (ล่าช้า 15 นาที)', apiPrice: '241.0000', apiChg: '1.0000', apiAsOf: '2026-11-06T14:45:00.000Z', apiPct: '0.42' },
    { n: 3, now: '2026-11-06T22:00:01', price: '$241.00', chg: '+$1.00', pct: '+0.42%', asof: 'ราคา ณ 21:45 น. (ล่าช้า 15 นาที)', apiPrice: '241.0000', apiChg: '1.0000', apiAsOf: '2026-11-06T14:45:00.000Z', apiPct: '0.42' },
  ];
  for (const s of steps) {
    await test.step(`${s.n}. reset → นาฬิกา ${s.now} → เปิด /th/stocks/AAPL ครั้งแรก`, async () => {
      await api.reset(T(s.now));
      await ui.goto('/th/stocks/AAPL', 'stock-page');
      await ui.settle();
    });
    await test.step(`${s.n}. ตรวจจอ + API`, async () => {
      await ui.check(page.getByTestId('quote-price-AAPL'), `ขั้น ${s.n} ราคา ${s.price}`, l => expect.soft(l).toHaveText(s.price));
      await ui.check(page.getByTestId('quote-change-AAPL'), `ขั้น ${s.n} เปลี่ยน ${s.chg}`, l => expect.soft(l).toContainText(s.chg));
      await ui.check(page.getByTestId('quote-pct-AAPL'), `ขั้น ${s.n} % ${s.pct}`, l => expect.soft(l).toHaveText(s.pct));
      await ui.check(page.getByTestId('quote-asof-AAPL'), `ขั้น ${s.n} เวลา`, l => expect.soft(l).toHaveText(s.asof));
      await ui.check(page.getByTestId('quote-stale-AAPL'), `ขั้น ${s.n} ไม่มีป้าย`, l => expect.soft(l).toHaveCount(0));
      const q = await quoteApi(api, 'AAPL');
      expect.soft(q.price, `ขั้น ${s.n} API price`).toBe(s.apiPrice);
      expect.soft(q.change, `ขั้น ${s.n} API change`).toBe(s.apiChg);
      expect.soft(Number(q.changePct).toFixed(2), `ขั้น ${s.n} API changePct ปัด 2 ตำแหน่ง`).toBe(s.apiPct);
      expect.soft(q.asOf, `ขั้น ${s.n} API asOf`).toBe(s.apiAsOf);
      expect.soft(q.stale, `ขั้น ${s.n} API stale`).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
test('TC-MKT-05 · ที่พักราคา 15:00 นาที ชนกับป้ายข้อมูลเก่า 30:00 นาที (ดูบนจอ) @P1 @5.1', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ขั้น 1: $241.00 @21:45 · โควตาวันนี้ 1/500 · ขั้น 2 (ราคาอายุ 29:59): $241.00 @21:45 · ไม่มีป้าย · โควตา 1/500 · ขั้น 3 (ที่พักอายุ 15:00 ใช้ซ้ำ · ราคาอายุ 30:00): $241.00 @21:45 · มีป้าย "ข้อมูลไม่อัปเดต" บนจอ · stale = true · โควตา 1/500 · ขั้น 4 (ที่พักอายุ 15:01 ขอใหม่): $242.00 · +$2.00 · +0.83% · "ราคา ณ 22:00 น." · ไม่มีป้าย · โควตา 2/500',
    source: '[D] BR-10 BR-15 FR-05 FR-06 · TEST-DATA E35–E37 E47 · ⚠️ T-13 (ขอบชนกัน) · ปิดช่องโหว่ R15 ที่ตรวจแค่ API',
    frbr: 'FR-03 FR-05 FR-06 FR-09 · BR-10 BR-15',
    rules: 'R10 R15',
  });
  // แท็บเดียวกันเข้าสู่ระบบ kan (cookie ใช้ร่วมกันทุกแท็บอยู่แล้ว) · สลับระหว่างหน้า AAPL กับ /th/staff
  await ui.login('kan');
  const steps = [
    { n: 1, now: null, stale: false, price: '$241.00', asof: '21:45 น.', quota: '1/500' },
    { n: 2, now: '2026-11-06T22:14:59', stale: false, price: '$241.00', asof: '21:45 น.', quota: '1/500' },
    { n: 3, now: '2026-11-06T22:15:00', stale: true, price: '$241.00', asof: '21:45 น.', quota: '1/500' },
    { n: 4, now: '2026-11-06T22:15:01', stale: false, price: '$242.00', asof: '22:00 น.', quota: '2/500', chg: '+$2.00', pct: '+0.83%' },
  ];
  for (const s of steps) {
    await test.step(`${s.n}. ${s.now ? 'นาฬิกา ' + s.now + ' → ' : '(22:00:00) '}เปิด/รีโหลด /th/stocks/AAPL`, async () => {
      if (s.now) await api.clock(T(s.now));
      await ui.goto('/th/stocks/AAPL', 'stock-page');
      await ui.settle();
      await ui.check(page.getByTestId('quote-price-AAPL'), `ขั้น ${s.n} ราคา ${s.price}`, l => expect.soft(l).toHaveText(s.price));
      await ui.check(page.getByTestId('quote-asof-AAPL'), `ขั้น ${s.n} ราคา ณ ${s.asof}`, l => expect.soft(l).toContainText(`ราคา ณ ${s.asof}`));
      if (s.chg) await ui.check(page.getByTestId('quote-change-AAPL'), `ขั้น ${s.n} ${s.chg}`, l => expect.soft(l).toContainText(s.chg!));
      if (s.pct) await ui.check(page.getByTestId('quote-pct-AAPL'), `ขั้น ${s.n} ${s.pct}`, l => expect.soft(l).toHaveText(s.pct!));
      if (s.stale) {
        await ui.check(page.getByTestId('quote-stale-AAPL'), `ขั้น ${s.n} มีป้ายข้อมูลไม่อัปเดต`, l => expect.soft(l).toHaveText('ข้อมูลไม่อัปเดต'));
      } else {
        await ui.check(page.getByTestId('quote-stale-AAPL'), `ขั้น ${s.n} ไม่มีป้าย`, l => expect.soft(l).toHaveCount(0));
      }
      const q = await quoteApi(api, 'AAPL'); // ใช้ที่พัก ไม่กินโควตา
      expect.soft(q.stale, `ขั้น ${s.n} API stale`).toBe(s.stale);
    });
    await test.step(`${s.n}. รีเฟรช (F5) หน้า staff ดูโควตาวันนี้`, async () => {
      await ui.goto('/th/staff', 'staff-page');
      await ui.check(page.getByTestId('staff-quota-day'), `ขั้น ${s.n} โควตาวันนี้ ${s.quota}`, staffCheck(s.quota, `ขั้น ${s.n} โควตาวันนี้`));
    });
  }
});

// ---------------------------------------------------------------------------
test('TC-MKT-06 · แหล่งข้อมูลไม่ตอบ (ราคาอายุ 30:01) และตลาดปิดไม่ขึ้นป้าย @P1 @5.1', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ขั้น 1: $241.00 · ราคา ณ 21:45 น. + ป้าย "ข้อมูลไม่อัปเดต" (ราคาอายุ 30:01) · ไม่เห็นข้อความ error/หน้าว่าง · ขั้น 2: สถานะแหล่งข้อมูลไม่ใช่ "ทำงานปกติ" · โควตาวันนี้ 2/500 (8.2 #26 ครั้งที่ไม่ตอบนับ +1) · ขั้น 3: ทุกหน้า HTTP 200 · ราคาทุกตัวมีป้าย · ขั้น 4: KO $68.00 · ไม่มีป้าย "ข้อมูลไม่อัปเดต" แม้ราคาอายุ > 30 นาที · แถบ "ตลาดปิด" (A-14)',
    source: '[D] BR-15 FR-06 FR-09 · TEST-DATA E48–E50 · ⚠️ A-14 (ตลาดปิดไม่ขึ้นป้าย) · ⚠️ D-03',
    frbr: 'FR-06 FR-09 · BR-15',
    rules: 'R15 R17',
  });
  await test.step('1. (22:00) ขอราคา AAPL → feed AAPL timeout → นาฬิกา 22:15:01 → เปิด /th/stocks/AAPL', async () => {
    await quoteApi(api, 'AAPL');
    await api.feed({ symbol: 'AAPL', mode: 'timeout' });
    await api.clock(T('2026-11-06T22:15:01'));
    const st = await gotoStatus(page, '/th/stocks/AAPL');
    await expect(page.getByTestId('stock-page')).not.toHaveAttribute('data-state', 'loading', { timeout: 20_000 }).catch(() => {});
    await ui.settle();
    expect.soft(st, 'หน้า AAPL HTTP').toBe(200);
    await ui.check(page.getByTestId('quote-price-AAPL'), 'ขั้น 1 ราคา $241.00', l => expect.soft(l).toHaveText('$241.00'));
    await ui.check(page.getByTestId('quote-asof-AAPL'), 'ขั้น 1 ราคา ณ 21:45 น.', l => expect.soft(l).toContainText('ราคา ณ 21:45 น.'));
    await ui.check(page.getByTestId('quote-stale-AAPL'), 'ขั้น 1 ป้ายข้อมูลไม่อัปเดต', l => expect.soft(l).toHaveText('ข้อมูลไม่อัปเดต'));
    await ui.check(page.getByTestId('stock-error'), 'ขั้น 1 ไม่มี error', l => expect.soft(l).toHaveCount(0));
  });
  await test.step('2. kan ดู /th/staff: สถานะแหล่งข้อมูล + โควตาวันนี้', async () => {
    const fs = await feedStatus(api);
    expect.soft(fs.feedState, 'API feedState ไม่ใช่ ok').not.toBe('ok');
    expect.soft(fs.dayUsed, 'API dayUsed').toBe(2);
    await ui.login('kan');
    await ui.goto('/th/staff', 'staff-page');
    await ui.check(page.getByTestId('staff-feed-state'), 'ขั้น 2 สถานะไม่ใช่ทำงานปกติ', l => expect.soft(l).not.toHaveText('ทำงานปกติ'));
    await ui.check(page.getByTestId('staff-quota-day'), 'ขั้น 2 โควตาวันนี้ 2/500', staffCheck('2/500', 'ขั้น 2 โควตาวันนี้'));
    const q = await quoteApi(api, 'AAPL');
    expect.soft(q.stale, 'ขั้น 1 API AAPL stale (ตรวจหลังดู staff เพื่อไม่ให้กระทบตัวนับ)').toBe(true);
  });
  await test.step('3. feed * timeout → เปิด /th /th/stocks/KO /th/watchlist /th/portfolio (beam) ดู HTTP + ป้าย', async () => {
    await api.feed({ symbol: '*', mode: 'timeout' });
    let st = await gotoStatus(page, '/th');
    await ui.check(page.getByTestId('core-header'), '/th HTTP 200', async () => expect.soft(st, '/th HTTP').toBe(200));
    st = await gotoStatus(page, '/th/stocks/KO');
    await expect(page.getByTestId('stock-page')).not.toHaveAttribute('data-state', 'loading', { timeout: 20_000 }).catch(() => {});
    expect.soft(st, '/th/stocks/KO HTTP').toBe(200);
    await ui.check(page.getByTestId('quote-stale-KO'), 'KO มีป้าย', l => expect.soft(l).toHaveText('ข้อมูลไม่อัปเดต'));
    await ui.login('beam');
    st = await gotoStatus(page, '/th/watchlist');
    await expect(page.getByTestId('watch-page')).not.toHaveAttribute('data-state', 'loading', { timeout: 20_000 }).catch(() => {});
    await ui.settle();
    expect.soft(st, '/th/watchlist HTTP').toBe(200);
    const wp = page.locator('[data-testid^="quote-price-"]');
    const ws = page.locator('[data-testid^="quote-stale-"]');
    const nw = await wp.count();
    await ui.check(page.getByTestId('watch-table'), `เฝ้าดู ราคาทุกตัว (${nw}) มีป้าย`, async () => {
      expect.soft(nw, 'เฝ้าดูมีราคา').toBeGreaterThan(0);
      expect.soft(await ws.count(), 'จำนวนป้ายในหน้าเฝ้าดู = จำนวนราคา').toBe(nw);
    });
    st = await gotoStatus(page, '/th/portfolio');
    await expect(page.getByTestId('portfolio-page')).not.toHaveAttribute('data-state', 'loading', { timeout: 20_000 }).catch(() => {});
    await ui.settle();
    expect.soft(st, '/th/portfolio HTTP').toBe(200);
    const pp = page.locator('[data-testid^="pf-price-"]');
    const ps = page.locator('[data-testid^="pf-stale-"]');
    const np = await pp.count();
    await ui.check(page.getByTestId('pf-holdings'), `พอร์ต ราคาทุกตัว (${np}) มีป้าย`, async () => {
      expect.soft(np, 'พอร์ตมีราคา').toBeGreaterThan(0);
      expect.soft(await ps.count(), 'จำนวนป้ายในหน้าพอร์ต = จำนวนราคา').toBe(np);
    });
  });
  await test.step('4. reset → นาฬิกา 2026-11-07 10:00 → เปิด /th/stocks/KO', async () => {
    await api.reset(T('2026-11-07T10:00:00'));
    await ui.goto('/th/stocks/KO', 'stock-page');
    await ui.settle();
    await ui.check(page.getByTestId('core-market-status'), 'ขั้น 4 ตลาดปิด', l => expect.soft(l).toHaveText('ตลาดปิด'));
    await ui.check(page.getByTestId('quote-price-KO'), 'ขั้น 4 KO $68.00', l => expect.soft(l).toHaveText('$68.00'));
    await ui.check(page.getByTestId('quote-stale-KO'), 'ขั้น 4 ไม่มีป้าย', l => expect.soft(l).toHaveCount(0));
  });
});

// ---------------------------------------------------------------------------
test('TC-MKT-07 · โควตา 5 ครั้งต่อ 60 วินาทีแบบเลื่อน (ทั้งเว็บ) และงานแจ้งเตือนต้องไม่ตกหล่น @P1 @5.1', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'AAPL $241.00 · MSFT $420.00 · NVDA $130.00 · TSLA $250.00 · VOO $500.00 ไม่มีป้าย · โควตา 1→5/5 · KO 22:00:50: $68.00 + ป้าย · โควตายัง 5/5 · KO 22:01:01: $68.00 ราคา ณ 21:45 น. ไม่มีป้าย · RIVN 22:01:02: $12.00 + ป้าย · RIVN 22:01:11: $12.00 ไม่มีป้าย · ภาคต่อ: tick 1 ต้อง fired = 0 และ AAPL อยู่ใน staleSymbols · ภายใน tick ที่ 5 ploy ต้องมีแจ้งเตือน AAPL $250.00 1 รายการพอดี และแจ้งเตือนนั้นเปลี่ยนเป็น inactive · KO 22:01:01 ตัวนับ 5/5 · RIVN 22:01:11 ตัวนับ 5/5',
    source: '[D] BR-11 FR-05 FR-06 · TEST-DATA E38–E40 · ⚠️ A-17 · ⚠️ T-06 · ภาคต่อ [R] ราคาถึงเป้าต้องแจ้ง + [O-ยังไม่ยืนยัน] พฤติกรรม staleSymbols (F ถามคนสร้างเว็บข้อ 1)',
    frbr: 'FR-05 FR-06 FR-09 · BR-11 (ภาคต่อโยง FR-21)',
    rules: 'R11 R19 ⚠️',
  });
  await ui.login('kan');
  const seq = [
    { t: '22:00:00', s: 'AAPL', price: '241.0000', stale: false, minute: '1/5' },
    { t: '22:00:10', s: 'MSFT', price: '420.0000', stale: false, minute: '2/5' },
    { t: '22:00:20', s: 'NVDA', price: '130.0000', stale: false, minute: '3/5' },
    { t: '22:00:30', s: 'TSLA', price: '250.0000', stale: false, minute: '4/5' },
    { t: '22:00:40', s: 'VOO', price: '500.0000', stale: false, minute: '5/5' },
    { t: '22:00:50', s: 'KO', price: '68.0000', stale: true, minute: '5/5' },
    { t: '22:01:01', s: 'KO', price: '68.0000', stale: false, minute: '5/5', asOf: '2026-11-06T14:45:00.000Z' },
    { t: '22:01:02', s: 'RIVN', price: '12.0000', stale: true, minute: '5/5' },
    { t: '22:01:11', s: 'RIVN', price: '12.0000', stale: false, minute: '5/5' },
  ];
  for (const x of seq) {
    await test.step(`นาฬิกา ${x.t} → ขอราคา ${x.s} (API) → รีเฟรช staff`, async () => {
      await api.clock(T(`2026-11-06T${x.t}`));
      const q = await quoteApi(api, x.s);
      expect.soft(q.price, `${x.t} ${x.s} price`).toBe(x.price);
      expect.soft(q.stale, `${x.t} ${x.s} stale`).toBe(x.stale);
      if (x.asOf) expect.soft(q.asOf, `${x.t} ${x.s} asOf (ราคา ณ 21:45 น.)`).toBe(x.asOf);
      await ui.goto('/th/staff', 'staff-page');
      await ui.check(page.getByTestId('staff-quota-minute'), `${x.t} ${x.s} ${x.stale ? 'ป้าย' : 'สด'} · โควตา 60 วิ ${x.minute}`, staffCheck(x.minute, `${x.t} โควตา 60 วินาที`));
    });
  }

  // ภาคต่อ R19
  await test.step('ภาคต่อ: reset → feed AAPL 250 clearCache → ขอ MSFT NVDA TSLA VOO KO (เต็ม 5)', async () => {
    await api.reset();
    await api.feed({ symbol: 'AAPL', mode: 'price', price: 250, clearCache: true });
    for (const s of ['MSFT', 'NVDA', 'TSLA', 'VOO', 'KO']) await quoteApi(api, s);
  });
  let fired = false;
  await test.step('ภาคต่อ: tick 1 ต้อง fired = 0 และ AAPL อยู่ใน staleSymbols', async () => {
    const r = await api.tick();
    const a = r.jobs.find((j: any) => j.name === 'alerts')?.result ?? {};
    expect.soft(a.fired, 'tick 1 fired').toBe(0);
    expect.soft(a.staleSymbols ?? [], 'tick 1 staleSymbols มี AAPL (สร้างสภาวะได้จริง)').toContain('AAPL');
    if (!(a.fired === 0 && (a.staleSymbols ?? []).includes('AAPL'))) {
      info.annotations.push({ type: 'invalid-round', description: `tick 1 ไม่ได้สภาวะที่ต้องการ (fired=${a.fired} staleSymbols=${JSON.stringify(a.staleSymbols)}) = รอบใช้ไม่ได้ ไม่ใช่ "ผ่าน"` });
    }
  });
  const ploy = async () => api.as('ploy');
  let usedTicks = 1;
  for (let k = 1; k <= 5 && !fired; k++) {
    await test.step(`ภาคต่อ: นาฬิกา +${61 * k} วินาที → tick ${k + 1}`, async () => {
      const d = new Date(Date.parse(T('2026-11-06T22:00:00')) + 61_000 * k);
      await api.clock(d.toISOString());
      const r = await api.tick();
      usedTicks = k + 1;
      const a = r.jobs.find((j: any) => j.name === 'alerts')?.result ?? {};
      info.annotations.push({ type: 'note', description: `tick ${k + 1} @${d.toISOString()} fired=${a.fired} staleSymbols มี AAPL=${(a.staleSymbols ?? []).includes('AAPL')}` });
      const ib = await (await (await ploy()).get('/api/inbox')).json();
      fired = (ib.items ?? []).some((i: any) => i.symbol === 'AAPL');
    });
  }
  await test.step('ภาคต่อ: ตรวจกล่องแจ้งเตือนและสถานะแจ้งเตือนของ ploy', async () => {
    const ctx = await ploy();
    const ib = await (await ctx.get('/api/inbox')).json();
    const aapl = (ib.items ?? []).filter((i: any) => i.symbol === 'AAPL');
    expect.soft(aapl.length, `ploy แจ้งเตือน AAPL 1 รายการพอดี (ภายใน tick ที่ ${usedTicks})`).toBe(1);
    if (aapl[0]) expect.soft(aapl[0].price, 'ราคาในแจ้งเตือน').toBe('250.0000');
    const al = await (await ctx.get('/api/alerts')).json();
    const target = (al.items ?? []).find((a: any) => a.symbol === 'AAPL' && a.kind === 'target' && a.targetPrice === '250.0000');
    expect.soft(target?.active, 'แจ้งเตือน AAPL $250 เปลี่ยนเป็น inactive').toBe(false);
    await ui.login('ploy');
    await ui.goto('/th/inbox', 'inbox-page');
    await ui.check(page.getByTestId('inbox-list'), 'กล่องแจ้งเตือน ploy มี AAPL $250.00', l => expect.soft(l).toContainText('AAPL'));
  });
});

// ---------------------------------------------------------------------------
test('TC-MKT-08 · ราคาที่ไม่มากกว่า 0 ห้ามแสดงและห้ามนำไปคิด @P1 @5.1', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'ขั้น 1: $0.01 · −$239.99 · ไม่มีป้าย · % บันทึกค่าที่เห็น · ขั้น 2–3: $240.00 + ป้าย "ข้อมูลไม่อัปเดต" · ไม่มีข้อความ "$0.00" "−100.00%" "−$1.00" "−$241.00" ทั้งหน้าหุ้นและหน้าเฝ้าดูของ ploy · ขั้น 4: $241.00 · ราคา ณ 21:45 น. · ไม่มีป้าย · ขั้น 5: VOO 2 หุ้นคิดที่ $500.00 + ป้าย · มูลค่า VOO $1,000.00',
    source: '[D] BR-14 FR-06 · TEST-DATA E44–E46 · ⚠️ T-06 · % ของ $0.01 ไม่ตัดสิน (8.2 #3)',
    frbr: 'FR-06 · BR-14',
    rules: 'R14',
  });
  // หมายเหตุการตีความ: "$0.00" ตรวจที่ช่องราคา (ช่องเปลี่ยนแปลงของราคา $240.00 = ปิดวันก่อน จะเป็น $0.00 โดยชอบ)
  const forbidden = ['-100.00%', '-$1.00', '-$241.00'];
  const quoteText = async (sym: string) =>
    norm([await page.getByTestId(`quote-price-${sym}`).textContent().catch(() => ''), await page.getByTestId(`quote-change-${sym}`).textContent().catch(() => ''), await page.getByTestId(`quote-pct-${sym}`).textContent().catch(() => '')].join(' | '));

  await test.step('1. feed AAPL price 0.01 (clearCache) → เปิด /th/stocks/AAPL', async () => {
    await api.feed({ symbol: 'AAPL', mode: 'price', price: 0.01, clearCache: true });
    await ui.goto('/th/stocks/AAPL', 'stock-page');
    await ui.settle();
    await ui.check(page.getByTestId('quote-price-AAPL'), 'ขั้น 1 $0.01', l => expect.soft(l).toHaveText('$0.01'));
    await ui.check(page.getByTestId('quote-change-AAPL'), 'ขั้น 1 −$239.99', async l => expect.soft(norm(await l.textContent())).toContain(norm('−$239.99')));
    await ui.check(page.getByTestId('quote-stale-AAPL'), 'ขั้น 1 ไม่มีป้าย', l => expect.soft(l).toHaveCount(0));
    const pct = (await page.getByTestId('quote-pct-AAPL').textContent().catch(() => ''))?.trim();
    const q = await quoteApi(api, 'AAPL');
    info.annotations.push({ type: 'pending', description: `ขั้น 1 % ของ $0.01 บนจอ = "${pct}" · API changePct=${q.changePct} (แผนคาด −100.00% ถ้าปัดครึ่งขึ้น · ไม่ตัดสิน 8.2 #3)` });
  });

  for (const [n, mode, label] of [[2, 'zero', '$0'], [3, 'price-1', '−$1']] as const) {
    await test.step(`${n}. reset → feed AAPL ${label} (clearCache) → เปิด AAPL → ploy เปิด /th/watchlist`, async () => {
      await api.reset();
      if (mode === 'zero') await api.feed({ symbol: 'AAPL', mode: 'zero', clearCache: true });
      else await api.feed({ symbol: 'AAPL', mode: 'price', price: -1, clearCache: true });
      await ui.goto('/th/stocks/AAPL', 'stock-page');
      await ui.settle();
      await ui.check(page.getByTestId('quote-price-AAPL'), `ขั้น ${n} หน้าหุ้น $240.00`, l => expect.soft(l).toHaveText('$240.00'));
      await ui.check(page.getByTestId('quote-stale-AAPL'), `ขั้น ${n} หน้าหุ้น ป้าย`, l => expect.soft(l).toHaveText('ข้อมูลไม่อัปเดต'));
      let t = await quoteText('AAPL');
      expect.soft(t.split(' | ')[0], `ขั้น ${n} หน้าหุ้นราคาไม่ใช่ "$0.00"`).not.toBe('$0.00');
      for (const f of forbidden) expect.soft(t, `ขั้น ${n} หน้าหุ้นไม่มี "${f}"`).not.toContain(f);
      await ui.login('ploy');
      await ui.goto('/th/watchlist', 'watch-page');
      await ui.settle();
      const row = page.getByTestId('watch-row-AAPL');
      await ui.check(page.getByTestId('quote-price-AAPL'), `ขั้น ${n} เฝ้าดู ploy $240.00`, l => expect.soft(l).toHaveText('$240.00'));
      await ui.check(row.getByTestId('quote-stale-AAPL'), `ขั้น ${n} เฝ้าดู ploy ป้าย`, l => expect.soft(l).toHaveText('ข้อมูลไม่อัปเดต'));
      t = await quoteText('AAPL');
      expect.soft(t.split(' | ')[0], `ขั้น ${n} เฝ้าดูราคาไม่ใช่ "$0.00"`).not.toBe('$0.00');
      for (const f of forbidden) expect.soft(t, `ขั้น ${n} เฝ้าดูไม่มี "${f}"`).not.toContain(f);
    });
    await test.step(`4 (ต่อจากขั้น ${n}). feed AAPL normal ไม่ใส่ clearCache → นาฬิกา 22:01:01 → เปิด AAPL`, async () => {
      await api.feed({ symbol: 'AAPL', mode: 'normal' });
      await api.clock(T('2026-11-06T22:01:01'));
      await ui.goto('/th/stocks/AAPL', 'stock-page');
      await ui.settle();
      await ui.check(page.getByTestId('quote-price-AAPL'), `ขั้น 4/${n} $241.00`, l => expect.soft(l).toHaveText('$241.00'));
      await ui.check(page.getByTestId('quote-asof-AAPL'), `ขั้น 4/${n} ราคา ณ 21:45 น.`, l => expect.soft(l).toContainText('ราคา ณ 21:45 น.'));
      await ui.check(page.getByTestId('quote-stale-AAPL'), `ขั้น 4/${n} ไม่มีป้าย`, l => expect.soft(l).toHaveCount(0));
    });
  }

  for (const [mode, label] of [['zero', '$0'], ['neg', '−$1']] as const) {
    await test.step(`5. reset → feed VOO ${label} + clearCache → beam เปิด /th/portfolio`, async () => {
      await api.reset();
      if (mode === 'zero') await api.feed({ symbol: 'VOO', mode: 'zero', clearCache: true });
      else await api.feed({ symbol: 'VOO', mode: 'price', price: -1, clearCache: true });
      await ui.login('beam');
      await ui.goto('/th/portfolio', 'portfolio-page');
      await ui.settle();
      await ui.check(page.getByTestId('pf-price-VOO'), `ขั้น 5 (${label}) VOO $500.00`, l => expect.soft(l).toHaveText('$500.00'));
      await ui.check(page.getByTestId('pf-stale-VOO'), `ขั้น 5 (${label}) VOO ป้าย`, l => expect.soft(l).toHaveText('ข้อมูลไม่อัปเดต'));
      await ui.check(page.getByTestId('pf-value-usd-VOO'), `ขั้น 5 (${label}) มูลค่า VOO $1,000.00`, l => expect.soft(l).toHaveText('$1,000.00'));
    });
  }
});

// ---------------------------------------------------------------------------
test('TC-MKT-09 · ราคาเก่าต้องบอกความจริง (หัวพอร์ตตอนโควตาหมด) @P1 @5.1', async ({ page, api, ui }, info) => {
  meta(info, {
    expected: 'แถบ "ตลาดเปิด" · VOO $500.00 พร้อมป้าย "ข้อมูลไม่อัปเดต" ทั้งหน้าพอร์ตและหน้าหุ้น · stale = true · เวลาของราคาต้องระบุวัน (เช่น 6 พ.ย. 04:00 น.) ไม่ใช่ "04:00 น. (ล่าช้า 15 นาที)" ลอย ๆ · หน้าพอร์ตกับหน้าหุ้นบอกสถานะราคาเหมือนกัน · แถว ZA01 ต้องมีป้าย "ข้อมูลไม่อัปเดต" เช่นเดียวกับ VOO',
    source: '[D] FR-06 BR-11 · [R] ราคาเก่าต้องบอกวันที่จริง · ข้อความ "(ล่าช้า 15 นาที)" ตั้งใจไหม = [O-ยังไม่ยืนยัน] F ถามคนสร้างเว็บข้อ 2',
    frbr: 'FR-03 FR-06 · BR-09 BR-11 BR-15',
    rules: 'R16 ❌',
  });
  await test.step('1. ขอราคา AAPL MSFT NVDA TSLA KO (22:00:00–22:00:40) ให้โควตาเต็ม', async () => {
    const seq: [string, string][] = [['22:00:00', 'AAPL'], ['22:00:10', 'MSFT'], ['22:00:20', 'NVDA'], ['22:00:30', 'TSLA'], ['22:00:40', 'KO']];
    for (const [t, s] of seq) { await api.clock(T(`2026-11-06T${t}`)); await quoteApi(api, s); }
  });
  await test.step('2. นาฬิกา 22:00:50 → beam เปิด /th/portfolio', async () => {
    await api.clock(T('2026-11-06T22:00:50'));
    await ui.login('beam');
    await ui.goto('/th/portfolio', 'portfolio-page');
    await ui.settle();
    await ui.check(page.getByTestId('core-market-status'), 'แถบตลาดเปิด', l => expect.soft(l).toHaveText('ตลาดเปิด'));
    await ui.check(page.getByTestId('pf-price-VOO'), 'พอร์ต VOO $500.00', l => expect.soft(l).toHaveText('$500.00'));
    await ui.check(page.getByTestId('pf-stale-VOO'), 'พอร์ต VOO ป้าย', l => expect.soft(l).toHaveText('ข้อมูลไม่อัปเดต'));
    await ui.check(page.getByTestId('pf-stale-ZA01'), 'พอร์ต ZA01 ป้าย', l => expect.soft(l).toHaveText('ข้อมูลไม่อัปเดต'));
    await ui.check(page.getByTestId('pf-summary'), 'หัวพอร์ต เวลาราคาต้องระบุวัน 6 พ.ย.', async () => {
      const t = norm(await page.getByTestId('pf-market-open').textContent().catch(() => '')) || norm(await page.getByTestId('pf-summary').textContent());
      expect.soft(t, 'หัวพอร์ตเวลาราคาต้องมีวันที่ (6 พ.ย.)').toContain('6 พ.ย.');
      expect.soft(t, 'หัวพอร์ตไม่ใช่ "ราคา ณ 04:00 น. (ล่าช้า 15 นาที)" ลอย ๆ').not.toBe('ราคา ณ 04:00 น. (ล่าช้า 15 นาที)');
    });
  });
  await test.step('3. เทียบ GET /api/stocks/VOO และ /th/stocks/VOO', async () => {
    const q = await quoteApi(api, 'VOO');
    expect.soft(q.price, 'API VOO price').toBe('500.0000');
    expect.soft(q.stale, 'API VOO stale').toBe(true);
    await ui.goto('/th/stocks/VOO', 'stock-page');
    await ui.settle();
    await ui.check(page.getByTestId('quote-price-VOO'), 'หน้าหุ้น VOO $500.00', l => expect.soft(l).toHaveText('$500.00'));
    await ui.check(page.getByTestId('quote-stale-VOO'), 'หน้าหุ้น VOO ป้าย', l => expect.soft(l).toHaveText('ข้อมูลไม่อัปเดต'));
    await ui.check(page.getByTestId('quote-asof-VOO'), 'หน้าหุ้น VOO เวลาต้องระบุวัน 6 พ.ย.', async l => {
      const t = norm(await l.textContent());
      expect.soft(t, 'หน้าหุ้นเวลาราคาต้องมีวันที่ (6 พ.ย.)').toContain('6 พ.ย.');
    });
  });
});

// ---------------------------------------------------------------------------
test('TC-MKT-10 · โควตา 500 ครั้งต่อวัน วันใหม่เริ่ม 07:00 และตัวนับหน้าทีมงาน @P2 @5.1', async ({ page, api, ui }, info) => {
  test.setTimeout(600_000);
  meta(info, {
    expected: 'ขั้น 1: stale = false · "โควตาวันนี้ 499/500" · ขั้น 2: stale = false · 500/500 · ขั้น 3: stale = true · ยัง 500/500 · โควตานาทีนี้ 0/5 · ขั้น 4: ตัวนับวันนี้ 500/500 · ขั้น 5: ตัวนับ 0/500 · เริ่มนับ 7 พ.ย. 2569 07:00 · ขั้น 6: stale = false · ตัวนับ 1/500 ของวันโควตาที่เริ่ม 9 พ.ย. 07:00 · เวลาดึงล่าสุด 9 พ.ย. 21:30 · สถานะแหล่งข้อมูล = ปกติ',
    source: '[D] BR-12 BR-13 FR-09 · TEST-DATA E42 E43 · ขั้น 4–5 ตลาดปิด → ตัดสินด้วยตัวนับเท่านั้น (RV1-03) · F ถามลูกค้าข้อ 20',
    frbr: 'FR-05 FR-09 · BR-12 BR-13',
    rules: 'R12 R13 ⚠️ R18',
  });
  const SYMS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'KO'];
  const start = Date.parse(T('2026-11-06T22:00:00'));
  const roundAt = (r: number) => new Date(start + (r - 1) * 61_000).toISOString();
  const staffUi = async (label: string, checks: [string, string][]) => {
    await ui.login('kan');
    await ui.goto('/th/staff', 'staff-page');
    for (const [tid, want] of checks) await ui.check(page.getByTestId(tid), `${label} ${tid} ${want}`, staffCheck(want, `${label} ${tid}`));
  };
  let last: any;
  await test.step('1. รอบที่ 1–99 + 4 ครั้งของรอบที่ 100 (ครั้งที่ 499)', async () => {
    let n = 0;
    const staleSeen: string[] = [];
    for (let r = 1; r <= 100; r++) {
      await api.clock(roundAt(r));
      await api.feed({ symbol: '*', mode: 'normal', clearCache: true });
      for (const s of SYMS) {
        if (r === 100 && s === 'KO') break;
        last = await quoteApi(api, s);
        n += 1;
        if (last.stale) staleSeen.push(`#${n} r${r} ${s}`);
      }
    }
    expect.soft(n).toBe(499);
    expect.soft(last.stale, 'ครั้งที่ 499 stale').toBe(false);
    if (staleSeen.length) info.annotations.push({ type: 'note', description: `ครั้งที่ stale ระหว่าง 1–499: ${staleSeen.slice(0, 10).join(', ')}${staleSeen.length > 10 ? ' …' : ''}` });
    const fs = await feedStatus(api);
    expect.soft(fs.dayUsed, 'API dayUsed หลังครั้งที่ 499').toBe(499);
    await staffUi('ขั้น 1', [['staff-quota-day', '499/500']]);
  });
  await test.step('2. ครั้งที่ 500 (KO รอบ 100)', async () => {
    const q = await quoteApi(api, 'KO');
    expect.soft(q.stale, 'ครั้งที่ 500 stale').toBe(false);
    const fs = await feedStatus(api);
    expect.soft(fs.dayUsed, 'API dayUsed หลังครั้งที่ 500').toBe(500);
    await staffUi('ขั้น 2', [['staff-quota-day', '500/500']]);
  });
  await test.step('3. +61 วินาที → clearCache → ขอ MSFT (ครั้งที่ 501)', async () => {
    await api.clock(new Date(start + 100 * 61_000).toISOString());
    await api.feed({ symbol: '*', mode: 'normal', clearCache: true });
    const q = await quoteApi(api, 'MSFT');
    expect.soft(q.stale, 'ครั้งที่ 501 stale').toBe(true);
    const fs = await feedStatus(api);
    expect.soft(fs.dayUsed, 'API dayUsed หลังครั้งที่ 501').toBe(500);
    expect.soft(fs.minuteUsed, 'API minuteUsed หลังครั้งที่ 501').toBe(0);
    await staffUi('ขั้น 3', [['staff-quota-day', '500/500'], ['staff-quota-minute', '0/5']]);
  });
  await test.step('4. นาฬิกา 2026-11-07 06:59:59 → feed-status', async () => {
    await api.clock(T('2026-11-07T06:59:59'));
    const fs = await feedStatus(api);
    expect.soft(fs.dayUsed, '06:59:59 dayUsed').toBe(500);
    await staffUi('ขั้น 4', [['staff-quota-day', '500/500']]);
  });
  await test.step('5. นาฬิกา 07:00:00 → feed-status (ยังไม่ขอราคา)', async () => {
    await api.clock(T('2026-11-07T07:00:00'));
    const fs = await feedStatus(api);
    expect.soft(fs.dayUsed, '07:00:00 dayUsed').toBe(0);
    expect.soft(fs.dayStartsAt, '07:00:00 dayStartsAt').toBe('2026-11-07T00:00:00.000Z');
    await staffUi('ขั้น 5', [['staff-quota-day', '0/500']]);
    await ui.check(page.getByTestId('staff-quota-daystart'), 'ขั้น 5 เริ่มนับ 7 พ.ย. 2569 07:00', l => expect.soft(l).toContainText('7 พ.ย. 2569 07:00'));
  });
  await test.step('6. นาฬิกา จ. 2026-11-09 21:30:00 → clearCache → ขอ MSFT → feed-status', async () => {
    await api.clock(T('2026-11-09T21:30:00'));
    await api.feed({ symbol: '*', mode: 'normal', clearCache: true });
    const q = await quoteApi(api, 'MSFT');
    // แก้แผนหลัง LAB 12 (PLAN-FIX-3): ราคาล่าช้า 15 นาที (BR-09) ทำให้ 21:30:00 ยังไม่มีราคารอบใหม่ ราคาล่าสุดคือราคาปิดวันศุกร์ เก่าเกิน 30 นาทีขณะตลาดเปิด → stale=true ตาม BR-15
    expect.soft(q.stale, '9 พ.ย. 21:30 MSFT stale (ยังไม่มีราคารอบใหม่)').toBe(true);
    const fs = await feedStatus(api);
    expect.soft(fs.dayUsed, '9 พ.ย. dayUsed').toBe(1);
    expect.soft(fs.dayStartsAt, '9 พ.ย. dayStartsAt').toBe('2026-11-09T00:00:00.000Z');
    expect.soft(fs.lastFetchAt, '9 พ.ย. lastFetchAt').toBe('2026-11-09T14:30:00.000Z');
    expect.soft(fs.feedState, '9 พ.ย. feedState').toBe('ok');
    await staffUi('ขั้น 6', [['staff-quota-day', '1/500']]);
    await ui.check(page.getByTestId('staff-quota-daystart'), 'ขั้น 6 เริ่มนับ 9 พ.ย. 2569 07:00', l => expect.soft(l).toContainText('9 พ.ย. 2569 07:00'));
    await ui.check(page.getByTestId('staff-last-fetch'), 'ขั้น 6 ดึงล่าสุด 9 พ.ย. 21:30', async l => {
      expect.soft(await l.getAttribute('data-value'), 'staff-last-fetch data-value').toBe('2026-11-09T14:30:00.000Z');
      await expect.soft(l).toContainText('21:30');
    });
    await ui.check(page.getByTestId('staff-feed-state'), 'ขั้น 6 สถานะปกติ', l => expect.soft(l).toHaveText('ทำงานปกติ'));
  });
});
