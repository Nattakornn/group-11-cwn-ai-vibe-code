# คำสั่ง writer (LAB 12) · ทุกตัวใช้ร่วมกัน

ทำงานในโฟลเดอร์ `pordee/` เขียน test Playwright (TypeScript) ของ **หัวข้อย่อยของตัวเองเท่านั้น** จาก `TEST-PLAN.md`

## อ่านได้
- `TEST-PLAN.md` หัวข้อย่อยของตัวเอง + หัวข้อ 3, 7, 8.2 (คำตอบชั่วคราวของคำถามที่ค้าง)
- `TEST-DATA.md` · `EXPLORATION.md` · `web/SPEC.md` · `web/ASSETS.md`
- `e2e/fixtures/pordee.ts` (อ่านอย่างเดียว ห้ามแก้) · `e2e/playwright.config.ts`

## ห้าม
- ห้ามเปิดอ่านโค้ดใน `web/` (ยกเว้น SPEC.md ASSETS.md) `db/` `tools/` · **ห้ามเปิด `web/BUGS.md`**
- ห้ามแก้ไฟล์อื่นนอกจาก `e2e/tests/<ไฟล์ของตัวเอง>`
- ห้ามใช้เว็บของชุดอื่น (reset ล้างทั้งเว็บ) · ใช้เฉพาะเว็บชุดของตัวเอง
- **ห้ามเปลี่ยนตัวเลข/ข้อความที่คาดหวังตามที่เว็บแสดง** ใช้ค่าจากแผนเท่านั้น ถ้าเว็บต่างจากแผน ปล่อยให้ test ล้ม แล้วจดในรายงาน

## รูปแบบ test
```ts
import { test, expect, meta } from '../fixtures/pordee';
test('TC-MKT-01 · สถานะตลาด ขอบเปิด 21:30 ปิด 04:00 @P2 @5.1', async ({ page, api, ui, db }, info) => {
  meta(info, { expected: '<คัด "ผลที่คาดหวัง" จากแผน>', source: '<คัด "ที่มา">', frbr: '<FR/BR>', rules: '<อ้างกฎ>' });
  await test.step('1. ตั้งนาฬิกา จ. 9 พ.ย. 21:29:59', async () => { await api.clock('2026-11-09T21:29:59+07:00'); });
  await test.step('2. เปิดหน้าแรก', async () => { await ui.goto('/th'); });
  await ui.check(page.getByTestId('core-market-status'), '21:29:59 ตลาดปิด', l => expect.soft(l).toHaveText('ตลาดปิด'));
});
```
- 1 test case ในแผน = 1 `test()` ชื่อขึ้นต้นด้วย ID · tag ระดับ (`@P1/@P2/@P3`) และหัวข้อย่อย (`@5.x`) · ข้อที่แผนติด @mobile ใส่ `@mobile`
- fixture reset เว็บพร้อมวันล็อกให้ก่อนทุก test แล้ว · ใน test เรียก `api.reset(now)` ซ้ำได้ถ้าแผนต้องการ
- ขั้นตอนภาษาไทยด้วย `test.step` · ตรวจด้วย `expect.soft` · ตรวจบนจอให้ใช้ `ui.check()` (ไฮไลต์กรอบแดง + แนบภาพ) · ตรวจผ่าน API ใช้ `expect.soft` ตรง แต่ให้เปิดหน้าที่เกี่ยวข้องและ `ui.mark()` จุดบนจอด้วย เพื่อให้วิดีโอ/GIF มีภาพ
- ตรวจทุกจุดที่แผนเขียนในผลที่คาดหวัง ไม่ใช่แค่จุดแรก · ข้อความ soft ใส่ข้อความอธิบาย เช่น `expect.soft(v, 'ZA01 ต้นทุนบาท').toBe('83124.50')`
- "กดซ้ำ" = `click()` 2 ครั้งติดกันจริง (ไม่ใช้ dblclick) แล้วนับผลในระบบ (API หรือ `db.query` อ่านอย่างเดียว)
- ราคาบนจอมาจาก API: รอรากหน้า `data-state` ไม่ใช่ loading / `ui.settle()` ก่อนอ่าน
- ส่วนที่แผนติด [O-ยังไม่ยืนยัน] หรือรอคำตอบลูกค้า: บันทึกค่าจริงด้วย `info.annotations.push({type:'pending', description:'...ค่าที่เห็น...'})` ไม่ assert
- ไม่ใช้ `test.skip` / `test.fixme` · ถ้าส่วนใดทำผ่านเว็บไม่ได้จริง ให้ทำส่วนที่ทำได้ และใส่ annotation `{type:'not-automated', description:'เหตุผล'}`
- ใช้ `page.waitForTimeout` ได้ไม่เกิน 1 วินาทีต่อครั้ง (ยกเว้นแผนต้องรอเวลาจริง)

## ดูเว็บ / ลองรัน
- ดูหน้าเว็บด้วย `playwright-cli -s=<หัวข้อ>` บนเว็บชุดของตัวเอง หรือ `curl` API (reset เว็บของตัวเองได้)
- ลองรันไฟล์ของตัวเองบนเว็บชุดของตัวเองได้ไม่เกิน 3 รอบ เพื่อแก้ selector / จังหวะรอ / syntax เท่านั้น:
  `cd e2e && BASE_URL=http://localhost:31N0 DB_URL=postgres://pordee:pordee@localhost:31N1/pordee PW_OUT=test-report/raw/writer-5.N npx playwright test tests/5.N-*.spec.ts --project=chromium`
- test ที่ล้มเพราะเว็บต่างจากแผน = ผลที่ถูกต้อง ไม่ต้องทำให้ผ่าน

## รายงานกลับ (ไม่เกิน 15 บรรทัด)
จำนวน test ที่เขียน · ผลรอบสุดท้ายที่ลองรัน (ผ่าน/ล้ม ต่อ ID) · ข้อที่ล้มและเหตุที่คิดว่าเป็น (เว็บต่างจากแผน / ยังไม่แน่ใจ) · ส่วนที่ทำอัตโนมัติไม่ได้
