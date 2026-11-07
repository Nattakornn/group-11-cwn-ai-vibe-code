# SPEC · พอดีพอร์ต (Pordee Port · US Stock Insight)

เอกสารที่ AI ผู้สร้างเว็บเขียน (**[A] คำอ้างของผู้สร้าง ยังไม่ได้พิสูจน์**) · เขียนจากโค้ดจริงหลังรวมงาน LAB 6

## 1. เปิดเว็บ

| | macOS | Windows (PowerShell) |
|---|---|---|
| network | `docker network create pordee-net` (ครั้งแรก) | เหมือนกัน |
| ฐานข้อมูล | `cd db && docker compose up -d` รอ `healthy` | เหมือนกัน |
| เว็บ | `cd web && docker compose up -d --build` | เหมือนกัน |
| เปิดดู | `open http://localhost:3300` | `start http://localhost:3300` |
| ปิด | `docker compose down` ใน web แล้ว db (ข้อมูลอยู่ใน volume `pordee-pgdata`) | เหมือนกัน |

- พอร์ต: เว็บ **3300** · ฐานข้อมูล **5434** (เครื่องเรา) · ใน network เว็บต่อ `pordee-db:5432`
- env ของเว็บ: `ALLOW_TEST_API` (ค่าเริ่มต้น 1) · `BUG_MODE` (0) · `DATABASE_URL` · `SESSION_SECRET`
- `/api/health` → `{"ok":true,"db":true}` · `<html data-ready="true" data-bug-mode="0|1">` เมื่อหน้าโหลดเสร็จ

## 2. API สำหรับทดสอบ (ใช้ได้เมื่อ `ALLOW_TEST_API=1`)

| เส้น | ใช้ทำอะไร |
|---|---|
| `POST /api/test/reset {now?}` | ล้างข้อมูลลูกค้ากลับเป็น seed · ล็อกนาฬิกา (ไม่ส่ง = `2026-11-06T22:00:00+07:00`) · ล้างโควตา ที่พักราคา และคำสั่ง feed |
| `POST /api/test/clock {now}` | เลื่อน/ล็อกนาฬิกาของทั้งเว็บ (`null` = เวลาจริง) |
| `POST /api/test/feed {symbol, mode, price?, clearCache?}` | mode: `price` / `zero` / `timeout` / `normal` · `symbol:'*'` = ทุกตัว · **ราคาใหม่จะเห็นเมื่อที่พักราคาหมดอายุ (15 นาที) หรือส่ง `clearCache:true`** |
| `POST /api/test/tick` | รันงานตามเวลาครั้งเดียว: `renew` `purge` (บัญชี) · `alerts` · `dca` `dividends` · นาฬิกาที่ล็อกไว้ทำให้งานไม่รันเอง |

**ลำดับที่แนะนำสำหรับทดสอบแจ้งเตือน:** ตั้งราคาด้วย `/api/test/feed` (ใส่ `clearCache:true`) → เปิด `GET /api/stocks/:symbol` ให้ราคาเข้าที่พัก → `/api/test/tick` (งานแจ้งเตือนใช้ราคาในที่พักก่อน เพราะโควตา 5 ครั้งต่อนาทีมีจำกัด)

## 3. ผู้ใช้ seed (รหัสผ่านทุกบัญชี `Pordee#2569`)

| id | อีเมล | ระดับ ณ วันล็อก | เฝ้าดู | แจ้งเตือน | อื่น ๆ |
|---|---|---|---|---|---|
| 1 | beam@pordee.test | Free | 9 | 2 | พอร์ต ZA01 + VOO · แผน DCA VOO ฿5,000 วันที่ 25 |
| 2 | ploy@pordee.test | Pro ถึง 2026-11-19 ต่ออัตโนมัติ | 50 | 20 | ช่วงเงียบ 02:00–07:00 · AAPL เป้า $250 ทิศขึ้น |
| 3 | somchai@pordee.test | Free | 10 | 0 | พอร์ตปันผล 5 ตัว · ตัวหนังสือใหญ่ |
| 4 | jay@pordee.test | Free | 4 | 0 | ประวัติการลอง 20 รายการ |
| 5 | nok@pordee.test | Free (Pro หมด 2026-10-31) | 12 | 3 | |
| 6 | kan@pordee.test | Pro ถึง 2026-11-30 + ทีมงาน | 5 | 0 | เข้าหน้า `/staff` ได้ |
| 7 | mint@pordee.test | Pro ถึง 2026-11-09 ต่ออัตโนมัติ | 49 | 19 | |
| 8 | nam@pordee.test | Pro ถึง 2026-11-09 (ยกเลิกการต่ออายุแล้ว) | 3 | 0 | |
| 9 | fon@pordee.test | Free | 0 | 0 | บัญชีว่าง |
| 10 | del1@pordee.test | ขอลบ 2026-11-05 | 2 | 0 | เข้าสู่ระบบไม่ได้ |
| 11 | del2@pordee.test | ขอลบ 2026-10-07 | 2 | 0 | หายหลัง tick แรก |

## 4. กฎที่ทำ (โยง FR/BR ใน REQUIREMENTS.md)

| เรื่อง | ทำอย่างไร | รหัส |
|---|---|---|
| สถานะตลาด | คิดด้วยเวลานิวยอร์ก (America/New_York) ตามปฏิทินในฐานข้อมูล · ปิดเร็ว 13:00 นิวยอร์ก | FR-04 · BR-02–BR-08 |
| ราคา | Mock Feed ล่าช้า 15 นาที · ที่พักราคาใช้ซ้ำ ≤ 15:00 นาที · โควตา 5 ครั้ง/60 วินาที และ 500/วัน (เริ่ม 07:00) ของทั้งเว็บ · ราคา ≤ 0 / ไม่ตอบ / โควตาเต็ม / ราคาเก่า ≥ 30 นาที → ราคาล่าสุดที่ถูก + ป้าย "ข้อมูลไม่อัปเดต" | FR-03, FR-05, FR-06 · BR-09–BR-15 |
| สิทธิ์ | Free 10 / Pro 50 เฝ้าดู · 3 / 20 แจ้งเตือน (รวม 2 แบบ) · ย้อนหลัง 1 / 10 ปี · Pro หมดอายุเห็นราคา 10 ตัวแรก | BR-16–BR-25 |
| ตัวชี้วัด | ค่าเฉลี่ย 50/200 วัน · RSI 14 Wilder (ป้ายดูจากค่าที่แสดง 2 ตำแหน่ง) · Golden/Death Cross (เท่ากันไม่นับ) · ราคาปรับแตกพาร์ | FR-13–FR-16 · BR-26–BR-32 |
| แจ้งเตือน | 5% เทียบค่าจริงไม่ปัด · ราคาเป้าหมายแจ้งครั้งเดียว · 1 ครั้งต่อรอบตลาด · ช่วงเงียบเข้ากล่องในเว็บแต่ไม่ส่งอีเมล | FR-21–FR-26 · BR-33–BR-37 |
| พอร์ต | ค่าธรรมเนียม max(0.15%, $1) ปัดครึ่งขึ้น · ต้นทุนเฉลี่ยรวมค่าธรรมเนียม · ขายไม่เกินที่มี · ต้นทุนบาทใช้อัตราวันซื้อ มูลค่าบาทใช้อัตราล่าสุด (ประกาศ 18:00) | FR-27–FR-35 · BR-38–BR-47 |
| DCA | รายการรอยืนยันหลังรอบตลาดปิด · หักค่าธรรมเนียมจากยอด · หุ้นปัดลง 4 ตำแหน่ง · วันปิดใช้วันทำการถัดไป | FR-33, FR-34 · BR-44, BR-45 |
| ปันผล | สิทธิ์จากรายการก่อนวัน XD · หัก 15% · บาทใช้อัตราวันจ่าย · ผลตอบแทน 2 ค่า | FR-36–FR-39 · BR-48–BR-50 |
| ศึกษา | คัดกรอง P/E ≤ · ปันผล ≥ · เทียบ 2–4 ตัว · ลองเทียบ DCA (Pro ≤ 120 เดือน) · CSV (Pro) · ประวัติ 20 รายการ · สรุป AI แม่แบบตายตัว ≤ 3 บรรทัด | FR-17, FR-41–FR-48 · BR-51–BR-56 |
| บัญชี | สมัคร/เข้าสู่ระบบ · Pro ฿199/เดือน (จ่ายจำลอง) ต่ออายุอัตโนมัติ · ลบบัญชี: ออกจากระบบทันที ข้อมูลหายเมื่อครบ 29 วัน | FR-52–FR-60 · BR-24, BR-25, BR-57 |

ข้อความ error ทุกตัว (คำต่อคำ 2 ภาษา) อยู่ในตาราง error ของแต่ละโมดูลใน `API-CONTRACT.md` และในภาคผนวกด้านล่าง

## 5. สิ่งที่ตัดสินใจระหว่างสร้าง (อาจต่างจากเอกสารต้นทาง)

- หน้าอังกฤษแสดงเงินบาทเป็น `THB 1,234.56` (ไม่ใช่ ฿ เพราะ ฿ อยู่ในช่วงอักษรไทย NFR-05)
- % ติดลบใช้ขีดธรรมดา `-5.00%` ไม่ใช่ `−`
- หน้าแรก**ไม่มี**ส่วน "หุ้นที่ขยับมากสุดวันนี้" เพราะต้องดึงราคาหลายตัวจนกินโควตา
- testid ของ error หน้าศึกษาเป็น `scr-error` `cmp-error` `bt-error` `hist-error` · หน้าเฝ้าดูเป็น `watch-error` `alert-error`
- ไม่เข้าสู่ระบบ: บางหน้ารากเป็น `data-state="ready"` บางหน้า `"error"` แต่ทุกหน้ามี `<หน้า>-login-required`
- ปุ่มลบรายการซื้อขายต้องกด 2 ครั้ง (`tx-delete-<id>` → `tx-delete-confirm-<id>`)
- เปิดแผน DCA ที่หยุดไว้ใหม่ = เริ่มนับจากวันที่เปิด ไม่สร้างรายการย้อนหลัง
- ~~ยกเลิกการต่ออายุแล้วเปิดกลับไม่ได้จนจบรอบ (กดอัปเกรดได้ ALREADY_PRO)~~ → เปลี่ยนแล้วในรอบแก้บั๊กทีม B (เปิดกลับได้ด้วย `POST /api/billing/resume`)

### รอบแก้บั๊ก · ทีม A (ราคา วันที่ หน้าหุ้น ศึกษา)

- เวลาราคา (R16): ราคาสดตอนตลาดเปิดยังเป็น "ราคา ณ HH:mm น. (ล่าช้า 15 นาที)" · ราคาเก่า (stale) ตอนตลาดเปิด หรือหุ้นถูกถอด แสดงวันที่จริงและไม่มีคำว่าล่าช้า: ใช้ราคาปิด → "ราคาปิดรอบ <วันซื้อขาย> · ณ <วันเวลาไทย>" (เช่น OLDC "ราคาปิดรอบ 2 ต.ค. 2569 · ณ 3 ต.ค. 2569 03:00 น.") · ใช้ราคาที่พักของรอบที่เปิดอยู่ → "ราคา ณ HH:mm น." (ไม่มีคำว่าล่าช้า · มีป้ายกำกับ) · ราคาที่พักจากรอบก่อน → "ราคา ณ <วันเวลาไทย>" · หน้าเฝ้าดูแสดงวันเวลาเต็มในกรณีเดียวกัน · หัวพอร์ต (`pf-market-open`) ถ้ามีหุ้นที่ราคาเก่า/ถูกถอด → "ราคา ณ <วันเวลาที่เก่าสุด> (ข้อมูลไม่อัปเดต)"
- `Quote` มีฟิลด์เพิ่ม `closeDate` (วันซื้อขายของราคาปิดที่ใช้ · null = ราคาระหว่างวัน) และ `currentSession` (ราคาระหว่างวันของรอบที่เปิดอยู่)
- footer `core-source` ต่อท้าย "ราคาอัปเดตล่าสุด <วันเวลา>" (`core-source-updated`) = เวลาดึงจากแหล่งข้อมูลสำเร็จล่าสุด ถ้าไม่มีใช้เวลาปิดรอบล่าสุด (FR-51)
- ลิงก์ TradingView ในกราฟมี testid `stock-chart-tv-link` `stock-rsi-tv-link` `cmp-chart-tv-link` (NFR-16 · R120)
- ช่วงวันที่กราฟ (R26): ขอช่วงแล้ว error (เกินสิทธิ์ / วันเริ่มหลังวันสิ้นสุด) ช่อง from/to กลับเป็นช่วงของกราฟที่แสดงอยู่
- คัดกรอง (R91): error แล้วซ่อนตารางผลและตัวนับ "พบ n ตัว"
- ลองเทียบ DCA (R96 · 8.2 #6): เดือนสุดท้าย ≥ เดือนปัจจุบัน (วันไทย) → 400 `MONTH_NOT_COMPLETE` "เดือน YYYY-MM ยังไม่จบ ..."

### รอบแก้บั๊ก · ทีม C (แจ้งเตือน)

- งานแจ้งเตือน (R19 · 8.2 #22): หุ้นที่ tick นี้ไม่ได้ราคาใหม่ (โควตาร่วมเต็ม / feed ไม่ตอบ) เข้า "คิวเก็บตก" · tick ถัดไป (เวลาหลังกว่า ≤ 10 นาที) หุ้นในคิวขอราคาด้วยโควตาสำรองของงานแจ้งเตือน 30 ครั้ง/นาที แยกจากโควตา 5/นาที · 500/วันของหน้าเว็บ (ไม่บันทึกใน `feed_requests` จึงไม่ลดโควตาหน้าเว็บ และตัวนับหน้าทีมงานไม่รวม) · tick แรกที่พลาดยังอยู่ใน `staleSymbols` ตามเดิม · คิวอยู่ในหน่วยความจำ (`lib/alerts/jobs.ts`) ล้างเองเมื่อ reset · `getQuote(sym, at, {takeQuota})` เพิ่มตัวเลือกโควตาแหล่งอื่น
- โควตาแจ้งเตือน (R48 · 8.2 #2): นับเฉพาะ `active` (ราคาเป้าที่แจ้งแล้วปิดตัวเอง / ที่ผู้ใช้ปิดไว้ ไม่นับ) ทั้ง `GET/POST /api/alerts` `DELETE` และ `Me.usage.alerts` · เปิดแจ้งเตือนที่ปิดอยู่กลับ (`PATCH active:true`) ตอนเต็ม → 409 `ALERTS_FULL` (แทนข้อ 2 ของ CONTRACT-NOTES A4)
- ช่วงเงียบ (8.2 #30): PATCH รับ `{start,end}` หรือ `{quietStart,quietEnd}` · ส่งช่องว่าง `''` ทั้งคู่ / ไม่ส่งช่องใดเลย → 400 "กรุณาเลือกเวลาเริ่มและเวลาจบ" ค่าเดิมไม่เปลี่ยน · ล้างช่วงเงียบต้องส่ง `null` ทั้งคู่ (ปุ่ม `quiet-clear`) · หน้า /alerts ปุ่มบันทึกส่งค่าที่กรอกตามจริง
- ตั้งแจ้งเตือนไม่กรอกชื่อย่อ → 400 "กรุณากรอกชื่อย่อหุ้น" (R41) · ลบแจ้งเตือนถาม `window.confirm` ก่อน (R52 · 8.2 #8)
- หน้าหุ้นที่ถูกถอด (OLDC) ไม่แสดงปุ่ม `stock-alert-link` (R50 · 8.2 #7)
- หัวเว็บ `core-nav-inbox` มีตัวเลขยังไม่อ่าน `core-nav-inbox-unread` (data-count · ไม่แสดงเมื่อ 0) (R60 · A-05) · กด "อ่านแล้ว" ในกล่องแล้ว router.refresh ให้หัวเว็บอัปเดต

### รอบแก้บั๊ก · ทีม D (พอร์ต DCA)

- ขายบางส่วน (R75 · 8.2 #1): ต้นทุน ฿ ที่เหลือ = round2(ต้นทุน ฿ × หุ้นคงเหลือ ÷ หุ้นที่มี) ปัดครึ่งขึ้นครั้งเดียว (ขาย ZA01 3 จาก 20 → ฿70,655.83) · ต้นทุน $ ตัดออกยังเป็น round2(ต้นทุน $ × ขาย ÷ ที่มี)
- จดรายการวันอนาคต (เทียบวันที่นิวยอร์กของนาฬิการะบบ) → 400 `FUTURE_DATE` "วันที่ซื้อขายอยู่ในอนาคต ..." (8.2 #9) · ราคาทศนิยมเกิน 4 → `INVALID_PRICE` "ราคามีทศนิยมได้ไม่เกิน 4 ตำแหน่ง"
- ค่าธรรมเนียมของฉัน (8.2 #10 · R41): อัตราไม่มีเพดาน (รับ 100% · คอลัมน์ `users.fee_rate_pct` เป็น numeric(10,4)) · ค่าผิดบอกช่อง `INVALID_FEE_RATE` "อัตราค่าธรรมเนียม..." / `INVALID_FEE_MIN` "ค่าธรรมเนียมขั้นต่ำ..."
- รายการ DCA (8.2 #4): ต้นทุน $ = เงินของรายการรอยืนยัน (`dca_pending.usd_amount` เช่น $142.86) ไม่ใช่ round2(หุ้น × ราคา) + ค่าธรรมเนียม · ต้นทุน ฿ = เงินนั้น × อัตราวันซื้อ (฿5,000.10) · ถ้าแก้จำนวน/ราคา/ค่าธรรมเนียมของรายการแล้วกลับไปคิดตามสูตรปกติ
- seed VOO ของบีม 2 ก.พ./2 มี.ค. ที่มา = `manual` (ก่อนสร้างแผน 30 ต.ค.)
- ปฏิทินปันผล (BR-49 · R89): ถ้าวันนี้ (วันไทยของนาฬิการะบบ) ถึงวัน XD แล้ว การ์ดไม่แสดง "ต้องถือหุ้นก่อนวันนี้…" แต่แสดง "ถึงวัน XD แล้ว ซื้อตอนนี้ไม่ได้ปันผลรอบนี้" (`div-cal-xd-passed-<SYMBOL>-<XD>`) · ก่อน XD ยังแสดงข้อความเดิม
- เปิดแผน DCA ใหม่ (R84): ไม่เขียนทับ `created_at` อีกต่อไป · เก็บเวลาเปิดใหม่ใน `dca_plans.resumed_at` และงาน dca นับรอบจากค่าที่หลังกว่าของ 2 ค่านี้

### รอบแก้บั๊ก · ทีม B (เฝ้าดู สมาชิก บัญชี)

- ปุ่มเฝ้าดูหน้าหุ้น (R51): หลังเพิ่มสำเร็จหรือ API ตอบ "มีแล้ว" ปุ่ม `stock-watch-btn` เปลี่ยนเป็น "อยู่ในรายการเฝ้าดูแล้ว" / "In your watchlist" และกดไม่ได้ (`data-state="added"`) · ไม่ดึง /api/watchlist ตอนเปิดหน้า (ไม่กินโควตาราคาเพิ่ม)
- ช่องชื่อย่อว่าง (R41): `POST /api/watchlist` และ `/api/alerts` ตอบ 400 INVALID_INPUT "กรุณากรอกชื่อย่อหุ้น เช่น AAPL" + `field:"symbol"` (เดิม "ข้อมูลไม่ถูกต้อง")
- หุ้นถูกถอด (R50 · 8.2 #7): `POST /api/watchlist` หุ้น delisted ที่ไม่ส่ง `confirmDelisted:true` → 409 `DELISTED_CONFIRM` "<SYM> หยุดซื้อขายแล้ว (ถูกถอดออกจากตลาด) ราคาจะไม่เปลี่ยนอีก" ไม่เพิ่ม ไม่กินโควตา · หน้าหุ้นและหน้าเฝ้าดูขึ้น `confirm()` ก่อน กดยกเลิก = ไม่เพิ่ม · `POST /api/alerts` หุ้น delisted ยังเป็น 404 "ไม่พบหุ้นนี้" แต่มี `reason:"DELISTED"` และหน้าแจ้งเตือนต่อท้ายว่า "หุ้นนี้หยุดซื้อขายแล้ว ... จึงตั้งแจ้งเตือนไม่ได้"
- ลบเฝ้าดู (R52 · 8.2 #8): กด `watch-remove-<SYM>` ขึ้น `confirm()` ถามก่อน กดยกเลิก = ไม่ลบ
- ต่ออายุไม่ขาดสิทธิ์ (R107 · 8.2 #13): `tierOf` ถือว่ายัง Pro ถ้ารอบจบแล้วแต่ `pro_auto_renew = true` (และไม่ได้ขอลบบัญชี) จนกว่า tick ต่ออายุจะเก็บเงินรอบใหม่ · upgrade ตรวจ auto_renew ด้วย (ช่วงนี้กดอัปเกรด = 409 ALREADY_PRO ไม่เก็บซ้ำ)
- เปิดต่ออายุกลับ (R109 · 8.2 #13 · **เปลี่ยนจากที่ §5 เคยตัดสินว่าเปิดกลับไม่ได้**): `POST /api/billing/resume` → auto_renew true + ล้าง `cancelled_at` รอบล่าสุด · ไม่เก็บเงินระหว่างรอบ · ไม่ใช่ Pro → 409 NOT_PRO · เปิดอยู่แล้ว → 409 ALREADY_RENEWING · หน้าบัญชีมีปุ่ม `acct-resume` "ต่ออายุอัตโนมัติกลับ" เมื่อเป็น Pro ที่ยกเลิกแล้ว
- signup (R102): รหัสผ่านช่องว่างล้วน → 400 WEAK_PASSWORD "รหัสผ่านต้องไม่เป็นช่องว่างล้วน"
- ลิงก์เข้าสู่ระบบ (FR-59): `*-login-link` ของ portfolio / watch / alerts / inbox / outbox / dividends / hist ใส่ `?next=/<lang>/<หน้านั้น>` (stock-watch-login ด้วย)
- หัวเว็บจอ ≤ 480px (R116 · NFR-01): ลดช่องไฟและให้ขึ้นบรรทัดใหม่แทนล้นจอ (เพิ่ม media query ท้าย `globals.css`)

## A. API ทุกเส้น (ดึงจากโค้ด)

| method | path | ไฟล์ |
|---|---|---|
| POST | `/api/account/delete` | `app/api/account/delete/route.ts` |
| DELETE PATCH | `/api/alerts/:id` | `app/api/alerts/[id]/route.ts` |
| GET POST | `/api/alerts` | `app/api/alerts/route.ts` |
| POST | `/api/auth/login` | `app/api/auth/login/route.ts` |
| POST | `/api/auth/logout` | `app/api/auth/logout/route.ts` |
| POST | `/api/auth/signup` | `app/api/auth/signup/route.ts` |
| POST | `/api/backtest` | `app/api/backtest/route.ts` |
| POST | `/api/billing/cancel` | `app/api/billing/cancel/route.ts` |
| POST | `/api/billing/upgrade` | `app/api/billing/upgrade/route.ts` |
| POST | `/api/compare` | `app/api/compare/route.ts` |
| POST | `/api/dca/pending/:id/confirm` | `app/api/dca/pending/[id]/confirm/route.ts` |
| POST | `/api/dca/pending/:id/skip` | `app/api/dca/pending/[id]/skip/route.ts` |
| GET | `/api/dca/pending` | `app/api/dca/pending/route.ts` |
| PATCH | `/api/dca/plans/:id` | `app/api/dca/plans/[id]/route.ts` |
| GET POST | `/api/dca/plans` | `app/api/dca/plans/route.ts` |
| GET | `/api/dividends/calendar` | `app/api/dividends/calendar/route.ts` |
| GET | `/api/dividends/received` | `app/api/dividends/received/route.ts` |
| GET | `/api/export` | `app/api/export/route.ts` |
| GET | `/api/health` | `app/api/health/route.ts` |
| GET | `/api/history` | `app/api/history/route.ts` |
| POST | `/api/inbox/:id/read` | `app/api/inbox/[id]/read/route.ts` |
| GET | `/api/inbox` | `app/api/inbox/route.ts` |
| GET | `/api/market/status` | `app/api/market/status/route.ts` |
| GET PATCH | `/api/me/fees` | `app/api/me/fees/route.ts` |
| GET PATCH | `/api/me/quiet-hours` | `app/api/me/quiet-hours/route.ts` |
| GET PATCH | `/api/me` | `app/api/me/route.ts` |
| GET | `/api/outbox` | `app/api/outbox/route.ts` |
| GET | `/api/portfolio` | `app/api/portfolio/route.ts` |
| POST | `/api/screener` | `app/api/screener/route.ts` |
| GET | `/api/staff/feed-status` | `app/api/staff/feed-status/route.ts` |
| GET | `/api/stocks/:symbol/candles` | `app/api/stocks/[symbol]/candles/route.ts` |
| GET | `/api/stocks/:symbol/indicators` | `app/api/stocks/[symbol]/indicators/route.ts` |
| GET | `/api/stocks/:symbol` | `app/api/stocks/[symbol]/route.ts` |
| POST | `/api/stocks/:symbol/summary` | `app/api/stocks/[symbol]/summary/route.ts` |
| GET | `/api/stocks` | `app/api/stocks/route.ts` |
| GET POST | `/api/test/clock` | `app/api/test/clock/route.ts` |
| POST | `/api/test/feed` | `app/api/test/feed/route.ts` |
| POST | `/api/test/reset` | `app/api/test/reset/route.ts` |
| POST | `/api/test/tick` | `app/api/test/tick/route.ts` |
| DELETE PATCH | `/api/transactions/:id` | `app/api/transactions/[id]/route.ts` |
| GET POST | `/api/transactions` | `app/api/transactions/route.ts` |
| DELETE | `/api/watchlist/:symbol` | `app/api/watchlist/[symbol]/route.ts` |
| GET POST | `/api/watchlist` | `app/api/watchlist/route.ts` |

## B. หน้าเว็บทุกหน้า (ดึงจากโค้ด)

| path | ไฟล์ |
|---|---|
| `/{lang}/[...rest]` | `app/[lang]/[...rest]/page.tsx` |
| `/{lang}/account` | `app/[lang]/account/page.tsx` |
| `/{lang}/alerts` | `app/[lang]/alerts/page.tsx` |
| `/{lang}/dividends` | `app/[lang]/dividends/page.tsx` |
| `/{lang}/inbox` | `app/[lang]/inbox/page.tsx` |
| `/{lang}/learn` | `app/[lang]/learn/page.tsx` |
| `/{lang}/login` | `app/[lang]/login/page.tsx` |
| `/{lang}/outbox` | `app/[lang]/outbox/page.tsx` |
| `/{lang}` | `app/[lang]/page.tsx` |
| `/{lang}/portfolio` | `app/[lang]/portfolio/page.tsx` |
| `/{lang}/search` | `app/[lang]/search/page.tsx` |
| `/{lang}/signup` | `app/[lang]/signup/page.tsx` |
| `/{lang}/staff/[...rest]` | `app/[lang]/staff/[...rest]/page.tsx` |
| `/{lang}/staff` | `app/[lang]/staff/page.tsx` |
| `/{lang}/stocks/[symbol]` | `app/[lang]/stocks/[symbol]/page.tsx` |
| `/{lang}/study/backtest` | `app/[lang]/study/backtest/page.tsx` |
| `/{lang}/study/compare` | `app/[lang]/study/compare/page.tsx` |
| `/{lang}/study/history` | `app/[lang]/study/history/page.tsx` |
| `/{lang}/study` | `app/[lang]/study/page.tsx` |
| `/{lang}/study/screener` | `app/[lang]/study/screener/page.tsx` |
| `/{lang}/watchlist` | `app/[lang]/watchlist/page.tsx` |

## C. data-testid (ดึงจากโค้ด · `${…}` = ส่วนที่เปลี่ยนตามข้อมูล เช่น SYMBOL, id, วันที่)

- **`app/[lang]/error.tsx`**: `error-home` · `error-page` · `error-ref` · `error-retry`
- **`app/[lang]/not-found.tsx`**: `notfound-home` · `notfound-page` · `notfound-search`
- **`app/global-error.tsx`**: `global-error-page` · `global-error-retry`
- **`components/account/AccountView.tsx`**: `account-login-link` · `account-login-required` · `account-page` · `acct-benefit-alerts` · `acct-benefit-history` · `acct-benefit-watchlist` · `acct-bigfont` · `acct-cancel` · `acct-cancel-ok` · `acct-danger` · `acct-delete` · `acct-delete-cancel` · `acct-delete-confirm` · `acct-delete-explain` · `acct-delete-panel` · `acct-delete-submit` · `acct-email` · `acct-error` · `acct-history-start` · `acct-lang` · `acct-loading` · `acct-logout` · `acct-membership` · `acct-name` · `acct-period` · `acct-renew` · `acct-saving` · `acct-settings` · `acct-tier` · `acct-upgrade` · `acct-upgrade-card` · `acct-upgrade-ok` · `acct-usage`
- **`components/account/LoginForm.tsx`**: `login-email` · `login-error` · `login-form` · `login-page` · `login-password` · `login-submit` · `login-to-signup` · `tid('login', notice === 'deleted' ? 'deleted' : 'logged-out')`
- **`components/account/SignupForm.tsx`**: `signup-email` · `signup-error` · `signup-form` · `signup-name` · `signup-no-broker` · `signup-page` · `signup-password` · `signup-submit` · `signup-to-login`
- **`components/chrome.tsx`**: `core-brand` · `core-disclaimer` · `core-header` · `core-market-bar` · `core-market-closes` · `core-market-next` · `core-market-status` · `core-mnav-account` · `core-mnav-home` · `core-mnav-portfolio` · `core-mnav-search` · `core-mnav-watchlist` · `core-nav-account` · `core-nav-alerts` · `core-nav-dividends` · `core-nav-inbox` · `core-nav-learn` · `core-nav-portfolio` · `core-nav-staff` · `core-nav-study` · `core-nav-watchlist` · `core-search-input` · `core-source`
- **`components/client.tsx`**: `core-lang-en` · `core-lang-switch` · `core-lang-th`
- **`components/dividends/DividendsView.tsx`**: `dividends-error` · `dividends-login-required` · `dividends-page` · `tid(P, 'cal', id)` · `tid(P, 'cal-amount', id)` · `tid(P, 'cal-empty')` · `tid(P, 'cal-link', id)` · `tid(P, 'cal-list')` · `tid(P, 'cal-loading')` · `tid(P, 'cal-pay', id)` · `tid(P, 'cal-shares', id)` · `tid(P, 'cal-xd', id)` · `tid(P, 'calendar')` · `tid(P, 'day', date)` · `tid(P, 'grid')` · `tid(P, 'loading')` · `tid(P, 'login-link')` · `tid(P, 'month', ym)` · `tid(P, 'month-label')` · `tid(P, 'month-next')` · `tid(P, 'month-prev')` · `tid(P, 'monthly', `${ym}-thb`)` · `tid(P, 'monthly', `${ym}-usd`)` · `tid(P, 'monthly-empty')` · `tid(P, 'rcv', id)` · `tid(P, 'rcv-date', id)` · `tid(P, 'rcv-empty')` · `tid(P, 'rcv-fx', id)` · `tid(P, 'rcv-gross', id)` · `tid(P, 'rcv-net-thb', id)` · `tid(P, 'rcv-net-usd', id)` · `tid(P, 'rcv-shares', id)` · `tid(P, 'rcv-tax', id)` · `tid(P, 'received')` · `tid(P, 'return-asof')` · `tid(P, 'return-formula')` · `tid(P, 'return-price')` · `tid(P, 'return-total')` · `tid(P, 'returns')` · `tid(P, 'title')` · `tid(P, 'total-net')`
- **`components/home/HeroChart.tsx`**: `home-hero-chart`
- **`components/home/HomeLive.tsx`**: `home-clock-ny` · `home-clock-th` · `home-error` · `home-market` · `home-market-closes` · `home-market-countdown` · `home-market-dial` · `home-market-last` · `home-market-loading` · `home-market-next` · `home-market-retry` · `home-market-status` · `home-page` · `home-stats`
- **`components/home/HomeSections.tsx`**: `home-cta-band` · `home-cta-learn` · `home-cta-learn-bottom` · `home-cta-screener` · `home-cta-search` · `home-feature-${it.key}` · `home-features` · `home-hero` · `home-stale-note` · `home-time` · `home-time-${r.id}` · `home-time-band` · `home-title`
- **`components/home/LearnDiagrams.tsx`**: `learn-diagram-cross` · `learn-diagram-delay` · `learn-diagram-div` · `learn-diagram-pe` · `learn-diagram-rsi` · `learn-diagram-screener` · `learn-diagram-sma`
- **`components/home/LearnView.tsx`**: `learn-back-top` · `learn-cta-home` · `learn-cta-screener` · `learn-cta-search` · `learn-end` · `learn-page` · `learn-screener-steps` · `learn-section-${id}` · `learn-title` · `learn-toc` · `learn-toc-${id}`
- **`components/portfolio/DcaSection.tsx`**: `dca-amount` · `dca-cancel-edit` · `dca-day` · `dca-edit-${p.symbol}` · `dca-error` · `dca-form` · `dca-ok` · `dca-plan-${p.symbol}` · `dca-plan-error` · `dca-plan-line-${p.symbol}` · `dca-plan-next-${p.symbol}` · `dca-plan-status-${p.symbol}` · `dca-plans-empty` · `dca-plans-error` · `dca-save` · `dca-section` · `dca-symbol` · `dca-toggle-${p.symbol}`
- **`components/portfolio/FeeSettings.tsx`**: `fee-error` · `fee-form` · `fee-min` · `fee-ok` · `fee-rate` · `fee-save`
- **`components/portfolio/Holdings.tsx`**: `pf-avg-${h.symbol}` · `pf-cost-thb-${h.symbol}` · `pf-empty` · `pf-halted-${h.symbol}` · `pf-holdings` · `pf-link-${h.symbol}` · `pf-pl-pct-${h.symbol}` · `pf-pl-thb-${h.symbol}` · `pf-pl-usd-${h.symbol}` · `pf-price-${h.symbol}` · `pf-row-${h.symbol}` · `pf-shares-${h.symbol}` · `pf-stale-${h.symbol}` · `pf-value-thb-${h.symbol}` · `pf-value-usd-${h.symbol}`
- **`components/portfolio/PendingSection.tsx`**: `dca-confirm-${p.id}` · `dca-pending-${p.id}` · `dca-pending-close-${p.id}` · `dca-pending-date-${p.id}` · `dca-pending-empty` · `dca-pending-error-${p.id}` · `dca-pending-fee-${p.id}` · `dca-pending-fx-${p.id}` · `dca-pending-invest-${p.id}` · `dca-pending-ok` · `dca-pending-section` · `dca-pending-shares-${p.id}` · `dca-pending-symbol-${p.id}` · `dca-pending-usd-${p.id}` · `dca-skip-${p.id}`
- **`components/portfolio/PortfolioClient.tsx`**: `portfolio-error` · `portfolio-loading` · `portfolio-login-link` · `portfolio-login-required` · `portfolio-page` · `portfolio-retry`
- **`components/portfolio/Summary.tsx`**: `pf-explain` · `pf-fx` · `pf-market-closed` · `pf-market-open` · `pf-summary` · `pf-total-cost-thb` · `pf-total-cost-usd` · `pf-total-dividends` · `pf-total-pl-pct` · `pf-total-pl-thb` · `pf-total-pl-usd` · `pf-total-realized` · `pf-total-return` · `pf-total-value-thb` · `pf-total-value-usd`
- **`components/portfolio/TxSection.tsx`**: `tx-cancel-edit` · `tx-date` · `tx-date-${x.id}` · `tx-delete-${x.id}` · `tx-delete-cancel-${x.id}` · `tx-delete-confirm-${x.id}` · `tx-edit-${x.id}` · `tx-empty` · `tx-error` · `tx-fee` · `tx-fee-${x.id}` · `tx-fee-hint` · `tx-form` · `tx-fx-${x.id}` · `tx-list` · `tx-list-error` · `tx-ok` · `tx-price` · `tx-price-${x.id}` · `tx-row-${x.id}` · `tx-row-error` · `tx-row-ok` · `tx-shares` · `tx-shares-${x.id}` · `tx-side-${x.id}` · `tx-side-buy` · `tx-side-sell` · `tx-source-${x.id}` · `tx-submit` · `tx-symbol` · `tx-symbol-${x.id}`
- **`components/quote.tsx`**: `quote-asof-${id}` · `quote-change-${id}` · `quote-halted-${idSuffix}` · `quote-pct-${id}` · `quote-price-${id}` · `quote-stale-${idSuffix}`
- **`components/staff/StaffDashboard.tsx`**: `tid(P, 'day-card')` · `tid(P, 'error')` · `tid(P, 'feed-card')` · `tid(P, 'feed-source')` · `tid(P, 'feed-state')` · `tid(P, 'forbidden')` · `tid(P, 'home-link')` · `tid(P, 'last-fetch')` · `tid(P, 'last-request')` · `tid(P, 'loading')` · `tid(P, 'login-link')` · `tid(P, 'login-required')` · `tid(P, 'minute-card')` · `tid(P, 'page')` · `tid(P, 'quota-day')` · `tid(P, 'quota-day-meter')` · `tid(P, 'quota-daystart')` · `tid(P, 'quota-minute')` · `tid(P, 'quota-minute-meter')` · `tid(P, 'refresh')` · `tid(P, 'retry')` · `tid(P, 'rules')` · `tid(P, 'title')` · `tid(P, id)`
- **`components/stock/PriceChart.tsx`**: `stock-chart` · `stock-rsi-chart`
- **`components/stock/SearchView.tsx`**: `search-count` · `search-error` · `search-form` · `search-hint` · `search-input` · `search-loading` · `search-notice` · `search-page` · `search-results` · `search-submit` · `tid('search', 'suggest', s)` · `tid('stock', 'result', r.symbol)`
- **`components/stock/StockView.tsx`**: `stock-adjusted-state` · `stock-adjusted-toggle` · `stock-alert-link` · `stock-back` · `stock-bars` · `stock-bars-toggle` · `stock-chart-card` · `stock-chart-empty` · `stock-chart-loading` · `stock-cross-none` · `stock-crosses` · `stock-delisted-note` · `stock-error` · `stock-exchange` · `stock-fund-date` · `stock-fundamentals` · `stock-ind-asof` · `stock-indicators` · `stock-indicators-error` · `stock-indicators-loading` · `stock-interval-day` · `stock-interval-week` · `stock-kind` · `stock-loading` · `stock-name` · `stock-ohlc` · `stock-ohlc-close` · `stock-ohlc-date` · `stock-ohlc-high` · `stock-ohlc-low` · `stock-ohlc-open` · `stock-page` · `stock-range-apply` · `stock-range-earliest` · `stock-range-error` · `stock-range-form` · `stock-range-from` · `stock-range-to` · `stock-rsi-label` · `stock-rsi-neutral` · `stock-rsi-notenough` · `stock-rsi-value` · `stock-sma200-latest` · `stock-sma200-notenough` · `stock-sma200-toggle` · `stock-sma50-latest` · `stock-sma50-notenough` · `stock-sma50-toggle` · `stock-summary` · `stock-summary-asof` · `stock-summary-btn` · `stock-summary-error` · `stock-summary-line-${i + 1}` · `stock-summary-result` · `stock-symbol` · `stock-watch-btn` · `stock-watch-login` · `stock-watch-msg` · `stock-watch-view` · `tid('stock', 'bar', b.date)` · `tid('stock', 'bar-close', b.date)` · `tid('stock', 'cross', c.date)` · `tid('stock', it.key)` · `tid('stock-range', k)`
- **`components/study/Backtest.tsx`**: `backtest-login-required` · `backtest-page` · `bt-dca-shares` · `bt-dca-value` · `bt-diff` · `bt-error` · `bt-error-message` · `bt-form` · `bt-from` · `bt-invested` · `bt-loading` · `bt-lump-shares` · `bt-lump-value` · `bt-method` · `bt-monthly` · `bt-months` · `bt-note` · `bt-pro-badge` · `bt-result` · `bt-submit` · `bt-symbol` · `bt-to` · `bt-upgrade-link` · `bt-valued-at`
- **`components/study/Compare.tsx`**: `cmp-add` · `cmp-chips` · `cmp-chips-count` · `cmp-chips-empty` · `cmp-earliest` · `cmp-error` · `cmp-form` · `cmp-from` · `cmp-hover-date` · `cmp-loading` · `cmp-notice` · `cmp-result` · `cmp-submit` · `cmp-symbol-input` · `cmp-to` · `compare-page` · `tid('cmp', 'chip', x)` · `tid('cmp', 'final', sr.symbol)` · `tid('cmp', 'legend', sr.symbol)` · `tid('cmp', 'remove', x)`
- **`components/study/CompareChart.tsx`**: `cmp-chart`
- **`components/study/ExportCsv.tsx`**: `study-export` · `study-export-btn` · `study-export-error` · `study-export-ok` · `study-export-pro` · `study-export-symbol`
- **`components/study/History.tsx`**: `hist-count` · `hist-empty` · `hist-error` · `hist-list` · `hist-loading` · `hist-login-link` · `history-login-required` · `history-page` · `tid('hist', 'item', it.id)` · `tid('hist', 'kind', it.id)` · `tid('hist', 'params', it.id)` · `tid('hist', 'time', it.id)`
- **`components/study/Screener.tsx`**: `${id}-hint` · `scr-count` · `scr-empty` · `scr-error` · `scr-form` · `scr-loading` · `scr-reset` · `scr-submit` · `scr-table` · `screener-page` · `tid('scr', 'cell-cap', r.symbol)` · `tid('scr', 'cell-div', r.symbol)` · `tid('scr', 'cell-pe', r.symbol)` · `tid('scr', 'link', r.symbol)` · `tid('scr', 'row', r.symbol)` · `tid('scr', 'sort', col)`
- **`components/study/StudyTabs.tsx`**: `study-tab-${name}` · `study-tabs`
- **`components/watch/AlertsView.tsx`**: `alert-add-btn` · `alert-empty` · `alert-error` · `alert-form` · `alert-kind-pct` · `alert-kind-target` · `alert-list` · `alert-ok` · `alert-symbol-input` · `alert-target-input` · `alert-usage` · `alerts-page` · `quiet-clear` · `quiet-current` · `quiet-end` · `quiet-error` · `quiet-ok` · `quiet-save` · `quiet-section` · `quiet-start` · `tid('alert', 'delete', id)` · `tid('alert', 'desc', id)` · `tid('alert', 'edit', id)` · `tid('alert', 'edit-cancel', id)` · `tid('alert', 'edit-input', id)` · `tid('alert', 'edit-save', id)` · `tid('alert', 'kind', id)` · `tid('alert', 'row', id)` · `tid('alert', 'status', id)` · `tid('alert', 'symbol', id)` · `tid('alert', 'toggle', id)`
- **`components/watch/InboxView.tsx`**: `inbox-empty` · `inbox-error` · `inbox-list` · `inbox-page` · `inbox-read-all` · `inbox-unread` · `tid('inbox', 'item', id)` · `tid('inbox', 'kind', id)` · `tid('inbox', 'new', id)` · `tid('inbox', 'pct', id)` · `tid('inbox', 'price', id)` · `tid('inbox', 'quiet', id)` · `tid('inbox', 'read', id)` · `tid('inbox', 'symbol', id)` · `tid('inbox', 'time', id)`
- **`components/watch/OutboxView.tsx`**: `outbox-count` · `outbox-empty` · `outbox-error` · `outbox-list` · `outbox-page` · `tid('outbox', 'body', id)` · `tid('outbox', 'item', id)` · `tid('outbox', 'subject', id)` · `tid('outbox', 'time', id)` · `tid('outbox', 'to', id)`
- **`components/watch/WatchlistView.tsx`**: `quote-asof-${sym}` · `quote-change-${sym}` · `quote-pct-${sym}` · `quote-price-${sym}` · `tid('watch', 'alert', sym)` · `tid('watch', 'link', sym)` · `tid('watch', 'proonly', sym)` · `tid('watch', 'remove', sym)` · `tid('watch', 'row', sym)` · `watch-add-btn` · `watch-add-form` · `watch-add-input` · `watch-empty` · `watch-error` · `watch-ok` · `watch-page` · `watch-proonly-note` · `watch-table` · `watch-tier` · `watch-usage`
- **`components/watch/common.tsx`**: `${page}-loading` · `${page}-login-link` · `${page}-login-required` · `watch-nav-${k}`

## D. ภาคผนวก · บันทึกของทีม (testid ละเอียด พฤติกรรม และ error ที่เพิ่มจากสัญญา)

### A1

#### A1 · โน้ตสัญญา (หุ้นและกราฟ)

#### สิ่งที่ตีความเพิ่มจากสัญญา
1. **ค้นหา notice OTC:** นอกจากค้นชื่อย่อ OTC ตรงตัว ถ้าไม่มีผลเลยแต่ชื่อบริษัทของหุ้น OTC ตรงคำค้น (เช่น `Nestl`) ก็ตอบ notice `OTC_NOT_SUPPORTED` แทน `NOT_FOUND` (FR-02) · `q` ว่าง → `{results:[], notice:null}`
2. **ชื่อย่อในหน้าหุ้น/กราฟ:** ไม่สนตัวพิมพ์และ `-` = `.` (`/api/stocks/brk-b` ได้ BRK.B) · ผลตอบ `symbol` เป็นชื่อย่อจริงเสมอ
3. **candles · `to` เกินรอบที่ปิดแล้ว** → ตัดเป็น `lastClosedSession` (ไม่ error) · ค่า `to` ในผลตอบเป็นค่าหลังตัด
4. **candles · `to` (ที่ส่งมา) เก่ากว่าสิทธิ์ และไม่ส่ง `from`** → 403 RANGE_NOT_ALLOWED เหมือนกรณี `from` เก่ากว่าสิทธิ์
5. **candles · `from > to`, interval ไม่ใช่ day/week, adjusted ไม่ใช่ 1/0, วันที่ผิดรูป** → 400 INVALID_INPUT (ข้อความกลาง)
6. **รายสัปดาห์:** ดึงแท่งรายวันตั้งแต่วันจันทร์ของสัปดาห์ที่ `from` อยู่ (แต่ไม่เก่ากว่า `earliestAllowed`) เพื่อให้แท่งแรกครบสัปดาห์ · ผลตอบ `from` ยังเป็นค่าที่ขอ จึงอาจมีแท่งแรกที่ `date` < `from` ได้ (เช่น ค่าเริ่มต้น from 2026-05-05 → แท่งแรก 2026-05-04)
7. `volume` ในแท่งเป็น number (ไม่ใช่เงิน) · รายสัปดาห์ = ผลรวม

#### ใช้ร่วมได้ (สำหรับ A5)
- `rangeNotAllowed(tier, earliestAllowed)` และ `assertRange(from, tier, now)` ใน `lib/stocks/candles.ts` ให้ข้อความ RANGE_NOT_ALLOWED ตรงกับ A1 ทุกตัวอักษร
- `findStock(symbol)` ใน `lib/stocks/search.ts` (OTC / ไม่พบ → `StockNotFound` ที่ `handle()` แปลงเป็น 404)

### A2

#### CONTRACT-NOTES · A2 พอร์ตและเงิน

สิ่งที่สัญญาไม่ได้ระบุ แล้ว A2 ตัดสินเอง (หัวหน้าตรวจ/ปรับได้)

1. `avgCostUsd` ส่ง 4 ตำแหน่ง (เป็นราคาต่อหุ้น) เช่น `"120.1800"` · หน้าเว็บแสดงด้วย `fmtUsd` → $120.18
2. `GET /api/portfolio` มีฟิลด์เพิ่ม `lastClosedSession` (ใช้ทำข้อความ FR-35) และ `holdings[].plPct` · ราคา null → value/pl เป็น null และไม่รวมใน totals
3. `POST /api/transactions` ไม่ห้าม tradeDate ในอนาคต (E140 ต้องจด 2026-11-30 ตอนนาฬิกา 6 พ.ย.) · ราคาทศนิยมเกิน 4 → 400 INVALID_PRICE · feeUsd ผิดรูปแบบ / side / tradeDate ผิด → 400 INVALID_INPUT · หุ้นถูกถอดยังจดได้ OTC → 404
4. รายการย้อนหลัง (มีรายการวันหลังกว่าอยู่แล้ว) → คิด holdings ใหม่ทั้งหุ้น · ขายตามปกติใช้ `UPDATE holdings SET shares = shares − x` + CHECK (ทดสอบ 2 คำขอพร้อมกันได้ 201 + 409)
5. `PATCH /api/transactions/:id` รับ `{symbol?, side?, tradeDate?, shares?, price?, feeUsd?}` · ไม่ส่ง feeUsd แต่จำนวน/ราคาเปลี่ยน → คิดค่าธรรมเนียมใหม่ตามค่าตั้ง · tradeDate เปลี่ยน → fxRate ใหม่ · ตอบ `{transaction, holding}` · DELETE ตอบ `{ok, transaction, holding}` · ไม่พบ → 404 NOT_FOUND
6. holdings ปรับแตกพาร์ตาม D-12 (ซื้อก่อน split คูณอัตรา) · ต้นทุนไม่เปลี่ยน
7. DCA: `GET /api/dca/plans` item มี `name`, `createdAt`, `nextTradeDate` · `GET /api/dca/pending?status=all` รวมที่ยืนยัน/ข้ามแล้ว · confirm ตอบ 200 `{item, transaction, holding}` · skip ตอบ `{item}` · skip ของที่ยืนยันแล้ว → 409 ALREADY_DONE "รายการนี้ยืนยันแล้ว" · ไม่พบ → 404
8. amountThb ≤ 0 → 400 INVALID_INPUT "จำนวนเงินต้องมากกว่า 0" / "Amount must be greater than 0" (สัญญาไม่มีรหัสเฉพาะ)
9. งาน dca: สร้างเฉพาะรอบที่ปิดหลัง `created_at` ของแผน · เงินไม่พอค่าธรรมเนียม (หุ้น = 0) ไม่สร้าง · แผนที่หยุดแล้วเปิดใหม่จะตามทำย้อนหลังเดือนที่หยุดด้วย (ไม่มีคอลัมน์เก็บวันหยุด) — ถ้าไม่ต้องการ ต้องเพิ่มคอลัมน์ใน schema
10. งาน dividends ข้ามบัญชีที่ขอลบแล้วไม่ได้ (บันทึกตามรายการ) · `GET /api/dividends/calendar` ตอบ `{month, items}` items มี `name` เพิ่ม · `sharesHeld` = หุ้นที่มีสิทธิ์ (รายการก่อน XD) · แสดงเมื่อวัน XD หรือวันจ่ายอยู่ในเดือนนั้น · `GET /api/dividends/received` มี `totalNetThb` เพิ่ม
11. `GET/PATCH /api/me/fees` ส่ง `feeRatePct` 4 ตำแหน่ง `feeMinUsd` 2 ตำแหน่ง · อัตรา 0–<100 ทศนิยม ≤ 4 · ขั้นต่ำ 0–<1,000,000 ทศนิยม ≤ 2 · ผิด → 400 INVALID_INPUT
12. `runDcaJob(now, {userId}?)` / `runDividendJob(now, {userId}?)` รับตัวกรองผู้ใช้ (ใช้ในเทสต์เท่านั้น)

### A3

#### A3 · บัญชีและสิทธิ์ · โน้ตสัญญา

#### สิ่งที่สัญญาไม่ได้ระบุ (ตัดสินเองแล้ว)
- **รูปแบบตอบ:** `POST /api/auth/logout` → `{ok:true}` · `POST /api/account/delete` → `{ok:true}` · `POST /api/billing/cancel` → `{user: Me}`
- **signup:** อีเมลรูปแบบผิด / displayName ว่างหรือเกิน 100 ตัว → 400 INVALID_INPUT (ตรวจก่อน WEAK_PASSWORD) · `lang` ของบัญชีใหม่ = `?lang=` ที่ส่งมา (ไม่ส่ง = th) · ความยาวรหัสผ่านนับเป็นตัวอักษร (code point)
- **PATCH /api/me:** displayName 1–100 ตัว (ตัดช่องว่างหัวท้าย) · bigFont ต้องเป็น boolean · lang ต้องเป็น th|en · ผิด → 400 INVALID_INPUT
- **account/delete:** ต้องส่ง `{confirm:true}` (boolean) ไม่งั้น 400 INVALID_INPUT · ลบ sessions ของผู้ใช้ทุกเครื่อง
- **Me.usage.alerts.used** = จำนวนแจ้งเตือนทั้งหมดของผู้ใช้ (รวม active=false และรวม 2 แบบ) · A4 ควรนับแบบเดียวกันเพื่อให้ตัวเลขตรงกัน (ถ้า A4 นับเฉพาะ active ต้องแก้ให้ตรงกันที่ `lib/account/me.ts`)
- **Me.historyStart** เป็นวันที่ `'YYYY-MM-DD'` เท่านั้น · ข้อความ FR-41 ให้หน้าเว็บประกอบเองด้วย `fmtDate`
- **quietStart / quietEnd** ใน Me ตัดเป็น `'HH:mm'`
- **upgrade ตอนเป็น Pro ที่ยกเลิกการต่ออายุแล้ว** → 409 ALREADY_PRO ตามสัญญา (เปิดต่ออายุกลับใช้ `POST /api/billing/resume` · รอบแก้บั๊กทีม B)
- **cancel** ตั้ง `cancelled_at` ที่แถว subscriptions ล่าสุดที่ยังไม่ถูกยกเลิก

#### จุดที่ควรให้หัวหน้าตัดสิน
- **รอบ Pro หลังรอบที่ 2 (A-15):** ทำตามสัญญาตรงตัว คือรอบใหม่เริ่ม end+1 แล้วจบ "วันเดียวกันเดือนถัดไปของวันเริ่ม − 1" · ผลคือสมัคร 31 ม.ค. → 31 ม.ค.–27 ก.พ. → 28 ก.พ.–27 มี.ค. (วันรอบเลื่อนจาก 31 เป็น 28 ถาวร) · ถ้าต้องการยึดวันสมัครเดิม (28 ก.พ. → 31 มี.ค.) ต้องเก็บวันตั้งต้น ซึ่ง schema ไม่มี · E63, E64 ผ่านทั้ง 2 แบบ
- **purge วันที่ 29:** ทำตามสัญญา `daysBetween ≥ 29` จึงลบตั้งแต่วันที่ 29 (30 พ.ย. สำหรับคำขอ 1 พ.ย.) · ตรงกับ A-22 "หายก่อนสิ้นวันที่ 29" และ E157 "อาจยังอยู่"
- **renew ข้ามบัญชีที่ขอลบแล้ว** (ไม่เก็บเงินบัญชีที่รอลบ)

### A4

#### CONTRACT-NOTES · A4 เฝ้าดูและแจ้งเตือน

จุดที่สัญญาไม่ได้ระบุ และ A4 ตัดสินเอง (หัวหน้าเปลี่ยนได้)

1. **`position` ใน GET `/api/watchlist` = ลำดับที่ 1, 2, 3 …** (row_number ตาม `position` ในตาราง) ไม่ใช่ค่าดิบ · `proOnly` ดูจากลำดับนี้ (> 10 สำหรับ Free)
   เหตุผล: ค่าดิบเป็น max + 1 จึงมีช่องว่างหลังลบ (เช่น E56 คุณนกลบ AAPL ตำแหน่ง 1 แล้วเพิ่มตัวใหม่ จะได้ position ดิบ 11 ทั้งที่มีแค่ 10 ตัว) BR-18 พูดถึง "10 ตัวแรกตามลำดับที่เพิ่ม"
2. ~~โควตาแจ้งเตือนนับทุกแถว~~ (รอบแก้บั๊ก ทีม C: นับเฉพาะ active ดูส่วน 5) **โควตาแจ้งเตือนนับทุกแถวใน `alerts` รวมที่ปิดอยู่** (เช่นราคาเป้าหมายที่แจ้งแล้ว) ตรงกับ `usage.alerts.used` ของ A3 (`lib/account/me.ts`) · ผู้ใช้ลบแล้วจึงตั้งใหม่ได้
3. **รูปตอบของ POST/DELETE** (สัญญาบอกแค่ 201):
   - POST `/api/watchlist` → 201 `{item:{symbol,name,position,proOnly:false}, used, limit, tier}`
   - DELETE `/api/watchlist/:symbol` → `{ok, symbol, used, limit, tier}` · ไม่มีในรายการ → 404 NOT_FOUND
   - POST `/api/alerts` → 201 `{alert, used, limit, tier}` · PATCH → `{alert}` · DELETE → `{ok, id, used}`
   - POST `/api/inbox/:id/read` → `{ok, id, unread}` (อ่านซ้ำได้ ไม่ error)
   - `alert` = `{id,symbol,kind,targetPrice,direction,active,createdAt}` · targetPrice 4 ตำแหน่ง
4. **ลำดับการตรวจ POST `/api/watchlist`:** หุ้นไม่พบ/OTC (404) → มีแล้ว ALREADY_IN_LIST → เกินโควตา WATCHLIST_FULL · ชื่อย่อรับ `brk-b` = `BRK.B` · หุ้นถูกถอดเพิ่มในรายการได้
5. **error เพิ่มที่ไม่มีในสัญญา**
   - POST `/api/alerts` แบบ 5% ซ้ำหุ้นเดิม → **409 ALERT_EXISTS** "มีแจ้งเตือน 5% ของหุ้นนี้แล้ว" / "A 5% alert for this stock already exists" (ตรวจหลังโควตา) · ราคาเป้าหมายตั้งซ้ำหุ้นเดิมได้
   - ตั้งแจ้งเตือนหุ้นถูกถอด → 404 NOT_FOUND "ไม่พบหุ้นนี้" / "Stock not found"
   - targetPrice ไม่ใช่ตัวเลข หรือทศนิยมเกิน 4 → 400 INVALID_INPUT (≤ 0 หรือไม่ส่ง → INVALID_TARGET ตามสัญญา)
   - PATCH `/api/me/quiet-hours`: ส่งค่าเดียว → 400 INVALID_INPUT "กรุณาเลือกทั้งเวลาเริ่มและเวลาจบ" / "Please choose both a start and an end time" · รูปแบบผิด → "เวลาต้องอยู่ในรูปแบบ HH:mm" / "Times must be in HH:mm format" · เริ่ม = จบ → "เวลาเริ่มและเวลาจบต้องไม่ซ้ำกัน" / "Start and end times must be different"
6. **เพิ่ม GET `/api/me/quiet-hours`** → `{quietStart, quietEnd}` ('HH:mm' | null) · PATCH ตอบรูปเดียวกัน
7. **PATCH `/api/alerts/:id`:** เปลี่ยน targetPrice หรือเปิด (active false → true) แจ้งเตือนราคาเป้าหมาย → คิด direction ใหม่จากราคาตอนนั้น (A-32) · ส่ง targetPrice ให้แบบ 5% → 400 INVALID_INPUT
8. **GET `/api/inbox` แต่ละรายการมี `targetPrice` เพิ่ม** (null สำหรับแบบ 5%) ให้หน้าเว็บเขียน "แตะ $250.00" ได้ · `changePct` เป็นค่าที่เก็บใน `alert_events.change_pct` (NUMERIC 9,4) · ราคา 4 ตำแหน่ง
9. **งาน `alerts`:** ในกลุ่ม "ตัวอื่น" (ไม่มีที่พักสด) ให้หุ้นที่มี `feed_overrides` มาก่อน แล้วเรียง A–Z (ในงานจริงตารางนี้ว่าง จึงไม่มีผล) · ข้ามผู้ใช้ที่ขอลบบัญชีและหุ้นถูกถอด · ผลของงาน `{sessionDate, symbols, staleSymbols, fired, emailed, quiet}` หรือ `{skipped:'market-closed'}`
   - **คนทดสอบ (V2):** ถ้าเปลี่ยนราคาหุ้นที่มีที่พักอยู่แล้ว (เช่น E100 → E101 AAPL 249.99 → 250.00) ต้องส่ง `clearCache: true` ใน `/api/test/feed` ไม่งั้นที่พักอายุ ≤ 15 นาทีจะคืนราคาเดิม
10. **อีเมลจำลอง:** หัวเรื่อง th "พอดีพอร์ต: ZALR +5.00%" / "พอดีพอร์ต: AAPL แตะ $250.00" · en "Pordee Port: ZALR +5.00%" / "Pordee Port: AAPL reached $250.00" · % ใช้ `fmtPct` (ขาลงเป็น "-5.00%" เครื่องหมายขีดธรรมดา) · เนื้อหามีราคา % ราคาปิดวันก่อน เวลาไทย ที่มา และข้อความเตือน
11. **ทดสอบกับฐานข้อมูล:** `lib/alerts/jobs.db.test.ts` รันเฉพาะเมื่อตั้ง `A4_TEST_DB_URL` เป็นฐานข้อมูลแยกที่ชื่อลงท้าย `_a4test` (ไฟล์เรียก `pordee_reset` จึงไม่แตะฐาน `pordee`) · ปกติข้าม

### A5

#### A5 วิเคราะห์ · โน้ตสัญญา

สิ่งที่สัญญาไม่ได้เขียนไว้ และ A5 เลือกทำแบบนี้ (F2 / F6 อ่านด้วย)

#### ตัวชี้วัด `GET /api/stocks/:symbol/indicators`
- ช่วงวันที่ใช้กติกาเดียวกับ candles ของ A1: ไม่ส่ง `to` = รอบล่าสุดที่ปิดแล้ว · `to` ที่เกินจะถูกตัดลงมา · ไม่ส่ง `from` = to − 6 เดือน (ถ้าเก่ากว่าสิทธิ์ใช้วันแรกของสิทธิ์) · **`from` เก่ากว่าสิทธิ์ → 403 RANGE_NOT_ALLOWED `{earliestAllowed}`** (ข้อความเดียวกับ A1) · วันที่ผิดรูปแบบ → 400 INVALID_INPUT
- ตอบเพิ่ม `symbol`, `from`, `to` (ช่วงที่ใช้จริง)
- `latest` = ค่าของรอบล่าสุดที่ปิดแล้วเสมอ ไม่ขึ้นกับ `to` · `crosses` ตัดเฉพาะวันที่ในช่วง from–to
- ป้ายตัดเทียบค่าเฉลี่ยที่ปัด 4 ตำแหน่งแล้ว (ค่าเดียวกับที่ส่ง) · เมื่อวานเท่ากันแล้ววันนี้ต่างกัน ไม่นับเป็นการตัด
- RSI: ช่วงที่ไม่มีทั้งขาขึ้นและขาลง (ราคานิ่ง) ให้ 100.00 ตามลำดับในสัญญา ("ไม่มีขาลง = 100.00")

#### สรุป `POST /api/stocks/:symbol/summary`
- ไม่ต้องเข้าสู่ระบบ · body ไม่ใช้ · ภาษาจาก `?lang=`
- ใช้ราคาปิดปรับแล้วของรอบล่าสุดที่ปิดแล้ว **ไม่เรียก `getQuote()`** (ให้ข้อความเหมือนเดิมทุกครั้งตาม NFR-12 และไม่กินโควตา)
- `asOf` = ISO ของเวลาปิดของรอบนั้น (เช่น `2026-11-05T21:00:00.000Z`) · ตอบเพิ่ม `symbol`
- ถ้าตรวจไม่ผ่าน (เกิน 3 บรรทัด / มีคำต้องห้าม / มีอักษรไทยในภาษาอังกฤษ) ตอบ 500 `SUMMARY_UNAVAILABLE` (ไม่ควรเกิด · ทดสอบครบทั้ง 60 ตัว 2 ภาษาแล้ว)

#### คัดกรอง `POST /api/screener`
- ค่าตัวเลขรับเป็น string หรือ number · ว่าง/null = ไม่ตั้ง · ไม่ใช่ตัวเลขไม่ติดลบ หรือ sort/dir ไม่อยู่ในรายการ → 400 INVALID_INPUT
- ตั้ง capMinUsd / capMaxUsd แล้วหุ้นที่ไม่มีมูลค่าตลาดไม่อยู่ในผล · เรียงตามคอลัมน์: ค่า null อยู่ท้ายเสมอ แล้วเรียงชื่อย่อ A–Z
- ค่า `pe` `divYieldPct` `marketCapUsd` เป็น string ตามฐานข้อมูล (`"20.00"`, `"3.10"`, `"3500000000000"`)

#### เทียบ `POST /api/compare`
- ชื่อย่อซ้ำนับครั้งเดียว (`['AAPL','aapl']` = 1 ตัว → COMPARE_COUNT) · `symbols` ไม่ใช่ array → COMPARE_COUNT · หุ้นไม่พบ/OTC → 404 ตามตารางกลาง · หุ้นถูกถอดเทียบได้
- ช่วงวันที่กติกาเดียวกับตัวชี้วัด (from/to ไม่ส่งได้) · ตอบเพิ่ม `from`, `to`
- `pct` เป็นค่าจริงไม่ปัด (string ของ decimal) · ฐาน = ราคาปิดปรับวันแรกที่หุ้นตัวนั้นมีข้อมูลในช่วง · หุ้นที่ไม่มีข้อมูลในช่วง: `points: []`, `final.pct: null`
- ประวัติเก็บ `params = {symbols, from, to}` (รูปเดียวกับ seed ของน้องเจ) ด้วยค่าที่ใช้จริง

#### ลองเทียบ `POST /api/backtest`
- ลำดับการตรวจ: 401 → 403 PRO_ONLY → 400 INVALID_INPUT (monthlyUsd > 0 ทศนิยม ≤ 2 · เดือน `YYYY-MM` · from ≤ to) → 400 RANGE_TOO_LONG → 404 หุ้น
- `monthlyUsd` รับ string หรือ number · ข้อความ monthlyUsd ผิด: "จำนวนเงินต่อเดือนต้องมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง" / "Monthly amount must be greater than 0 with at most 2 decimal places"
- เดือนที่ไม่มีราคาเลย (ก่อนหุ้นเข้าตลาด หรือเดือนที่ยังไม่มีรอบที่ปิดแล้ว) → 400 INVALID_INPUT `{month}` "ไม่มีราคาของ {SYM} ในเดือน {YYYY-MM}" / "No {SYM} price data for {YYYY-MM}"
- วันทำการแรกของเดือน = วันแรกที่มีราคาใน `daily_prices` (ตรงกับ `market_calendar` เพราะ seed สร้างจากปฏิทินนั้น)
- `dca.shares` / `lump.shares` แสดง 4 ตำแหน่ง (ปัดเฉพาะตอนส่ง การคิดมูลค่าใช้ค่าเต็มตาม T-09) · `valuedAt` = วันที่ของราคาปิดล่าสุด `YYYY-MM-DD` · `priceUsed` = ราคาปิดปรับแล้ว 4 ตำแหน่ง
- ตอบเพิ่ม `symbol`, `fromMonth`, `toMonth`, `monthlyUsd` · ประวัติเก็บ `params = {symbol, monthlyUsd, fromMonth, toMonth}`

#### CSV `GET /api/export`
- รับ `adjusted=1|0` เพิ่ม (ค่าเริ่มต้น 1 = ราคาปรับแล้ว) · ช่วงวันที่กติกาเดียวกับตัวชี้วัด · ไม่ส่ง symbol → 400 INVALID_INPUT
- ขึ้นบรรทัดด้วย `\n` · บรรทัด 2 = `# ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน` / `# For educational purposes only. Not investment advice.` (FR-50)
- `content-disposition: attachment; filename="AAPL_2025-11-06_2026-11-05.csv"` · ไม่บันทึกประวัติ (study_history มีแค่ compare / backtest)

#### ประวัติ `GET /api/history`
- ล็อกตอนบันทึกด้วย `pg_advisory_xact_lock(hashtext('study_history:<userId>'))` แทน `SELECT … FROM users FOR UPDATE` (A5 ไม่ได้เป็นเจ้าของตาราง users) · ลบรายการที่เกิน 20 ใน tx เดียวกัน เรียง `created_at DESC, id DESC`
- `createdAt` = ISO · `id` = number

#### ถึงหัวหน้า
- ตอนทดสอบ dev server ตอบ 500 ทุกเส้นเพราะ `components/portfolio/PortfolioClient.tsx` import ไฟล์ที่ยังไม่มี (`./FeeSettings`, `./DcaSection`) ของ F4 · ไม่ใช่ไฟล์ของ A5
- ตอนทดสอบ A5 เข้าสู่ระบบเป็นคุณพลอย (U02) แล้วลองเทียบ 2 ครั้ง จึงมีแถว `study_history` ของ U02 ค้างอยู่ 2 แถว (ลบเองไม่ได้เพราะระบบสิทธิ์ไม่อนุญาต) · `POST /api/test/reset` จะล้างให้ · ไม่ได้แตะประวัติ 20 รายการของน้องเจ (U04)

### F1

#### F1 · หน้าแรก + เริ่มต้นลงทุน

- หน้าแรกเรียกเฉพาะ `GET /api/market/status` และ `POST /api/screener {}` (นับจำนวนผล = "หุ้นที่รองรับ") · ไม่เรียก `/api/stocks/:symbol` และไม่ดึงราคาสด
- ไม่ได้ทำ "หุ้นที่มีการเปลี่ยนแปลงมากสุดวันนี้" (BUILD-PROMPT ขั้น 6) เพราะต้องดึงราคาหลายตัว ซึ่งจะใช้โควตา Mock Feed (5 ครั้ง/นาที) จนหมด · ถ้าอยากได้ ต้องมี endpoint ที่อ่านจาก `quote_cache` โดยไม่กินโควตา (หัวหน้า/A1 ตัดสินใจ)
- ถ้า `/api/screener` ล้ม ตัวเลขจะแสดง "—" และหน้ายังเป็น `data-state="ready"` · ถ้า `/api/market/status` ล้ม จะเป็น `data-state="error"` แสดง `home-error` และปุ่ม `home-market-retry`
- metadata title ของ 2 หน้านี้ตั้งตามภาษา (หน้า EN ไม่มีอักษรไทยใน <title>) · ส่วน title ค่าเริ่มต้นใน layout ยังมีอักษรไทย เผื่อหน้าอื่นอยากตั้งเอง
- เมนูมือถือ (`MobileNav`) ไม่มีลิงก์ไป `/learn` · มือถือเข้าได้จากการ์ดฟีเจอร์และปุ่มบนหน้าแรก (เพิ่มในไฟล์ chrome ได้ถ้าหัวหน้าอยากให้มี)
- testid หลัก: `home-page` `home-hero` `home-title` `home-cta-learn|search|screener|learn-bottom` `home-market` (data-state open|early|closed|loading|error) `home-market-status` `home-market-closes` `home-market-next` `home-market-countdown` `home-market-last` `home-market-dial` `home-clock-th` `home-clock-ny` `home-error` `home-market-retry` `home-market-loading` `home-stats` `home-stat-stocks|exchanges|delay|langs` (data-value = ค่าจริง) `home-features` `home-feature-watch|portfolio|dividends|study|learn` `home-time` `home-time-band` `home-time-summer|winter` `home-stale-note` `home-cta-band`
- learn: `learn-page` (data-state="ready") `learn-title` `learn-toc` `learn-toc-<id>` `learn-section-<id>` `learn-diagram-<id>` (id = pe div sma rsi cross delay screener) `learn-screener-steps` `learn-cta-screener` `learn-end` `learn-cta-search` `learn-cta-home` `learn-back-top`

### F2

#### F2 · ค้นหาและหน้าหุ้น · โน้ตถึงหัวหน้า

ไม่ต้องแก้ไฟล์กลาง · ใช้ API A1/A5/A4 ตามสัญญาได้ครบ (ทดสอบกับ API จริงแล้ว)

#### data-testid ที่ควรลงใน SPEC.md
- ค้นหา: `search-page`(data-state) `search-form` `search-input` `search-submit` `search-notice`(data-code) `search-error` `search-count` `search-results` `stock-result-<SYMBOL>` `search-hint` `search-suggest-<SYMBOL>`
- หน้าหุ้น: `stock-page`(data-state, data-symbol) `stock-error`(data-code) `stock-back` `stock-symbol` `stock-name` `stock-exchange` `stock-kind` `stock-delisted-note`
  ราคา: `quote-price-<SYMBOL>` `quote-change-<SYMBOL>` `quote-pct-<SYMBOL>` `quote-asof-<SYMBOL>` `quote-stale-<SYMBOL>` `quote-halted-<SYMBOL>` (ใช้ `<QuoteLine>` กลาง)
  พื้นฐาน: `stock-fundamentals` `stock-pe` `stock-div` `stock-cap` `stock-fund-date` (ค่า null = "ไม่มี" / "None")
  กราฟ: `stock-chart-card`(data-state, data-interval, data-adjusted) `stock-chart`(data-bars) `stock-interval-day` `stock-interval-week` `stock-adjusted-toggle`(data-state adjusted|raw) `stock-adjusted-state` `stock-sma50-toggle` `stock-sma200-toggle`
  ช่วง: `stock-range-form` `stock-range-from` `stock-range-to` `stock-range-apply` `stock-range-p3m|p6m|p1y|p5y|max` `stock-range-earliest`(data-date) `stock-range-error`(ข้อความ 403 RANGE_NOT_ALLOWED จาก API)
  แท่ง: `stock-ohlc` `stock-ohlc-date|open|high|low|close` (data-value = ค่าเต็ม 4 ตำแหน่ง) · ตาราง `stock-bars` `stock-bars-toggle` `stock-bar-<date>` `stock-bar-close-<date>` (แสดง 2 ตำแหน่ง data-value 4 ตำแหน่ง → ใช้ตรวจ E88/E89 ได้: เปิดตาราง เลือกช่วงที่มี 2024-06-07 ด้วยบัญชี Pro)
  ตัวชี้วัด: `stock-indicators`(data-state) `stock-ind-asof` `stock-sma50-latest` `stock-sma200-latest` `stock-sma50-notenough` `stock-sma200-notenough` `stock-rsi-value` `stock-rsi-label`(data-state overbought|oversold) `stock-rsi-neutral` `stock-rsi-notenough` `stock-rsi-chart` `stock-crosses` `stock-cross-<date>`(data-kind) `stock-cross-none` `stock-indicators-error`
  สรุป: `stock-summary`(data-state) `stock-summary-btn` `stock-summary-line-1..3` `stock-summary-asof` `stock-summary-error`
  ปุ่ม: `stock-watch-btn` `stock-watch-msg`(data-state ok|error, data-code) `stock-watch-view` `stock-watch-login` `stock-alert-link` (→ `/{lang}/alerts?symbol=`)

#### พฤติกรรมที่ควรรู้
- `GET /api/stocks/:symbol` เรียก 1 ครั้งต่อการเปิดหน้า (กันซ้ำตอน React strict mode ด้วย WeakMap ต่อ instance) · สลับภาษา = เปิดหน้าใหม่ = เรียกใหม่ 1 ครั้ง
- URL `/{lang}/stocks/brk-b` → แปลงเป็น `BRK.B` ก่อนเรียก API (FR-01)
- ปุ่มช่วงด่วน (3 เดือน ฯลฯ) ตัดให้ไม่เก่ากว่า `earliestAllowed` · ช่องวันที่พิมพ์เองส่งตรงให้ API เพื่อให้เห็น 403 (E61/E62)
- ตัวชี้วัดโหลดตามช่วงวันที่ ไม่โหลดใหม่ตอนกดราคาจริง (A-34 · E90 ผ่าน)
- error ที่ API ตอบไม่เป็น JSON (เช่น 500 ตอน dev compile) แสดง "เกิดข้อผิดพลาด กรุณาลองใหม่" แทนเลข 500
- `lightweight-charts` โหลดด้วย dynamic import ใน useEffect (ไม่ถ่วง LCP · NFR-02) · โลโก้ TradingView มุมกราฟเป็นค่าเริ่มต้นของไลบรารี (attribution)

#### ฝากหัวหน้า (ไม่ใช่งาน F2)
- `/favicon.ico` 404 ทุกหน้า (console error)

### F3

#### F3 · เฝ้าดูและแจ้งเตือน · โน้ตถึงหัวหน้าและ A4

#### สิ่งที่หน้าเว็บคาดหวังจาก API (ช่วยยืนยัน)
1. **PATCH `/api/me/quiet-hours`** สัญญาไม่บอกรูปแบบคำตอบ · หน้าเว็บรับได้ทั้ง `{quietStart, quietEnd}` · `{start, end}` · `{user:{quietStart, quietEnd}}` (ถ้าไม่มีจะใช้ค่าที่ส่งไป) · A4 ตอบ `{quietStart, quietEnd}` แล้ว (ตรงกัน) · ขอให้หัวหน้าใส่รูปแบบนี้ในสัญญาส่วนที่ 5
   - กรอกแค่ฝั่งเดียว / รูปแบบเวลาผิด → ขอให้ API ตอบ 400 พร้อมข้อความ หน้าเว็บแสดงคำต่อคำใน `quiet-error`
2. **ค่าช่วงเงียบปัจจุบัน** หน้าเว็บอ่านจาก `GET /api/me` (A3) → `user.quietStart / quietEnd` (รับได้ทั้ง `HH:mm` และ `HH:mm:ss`) · ถ้า A3 ยังไม่มีเส้นนี้ ช่องจะว่าง
3. **`/api/inbox` items[].changePct** ขอให้มีค่าทั้งแบบ pct และ target (คิดจากราคาปิดวันก่อน) · ถ้าเป็น null หน้าเว็บจะไม่แสดง `inbox-pct-<id>`
4. **`POST /api/inbox/:id/read`** หน้าเว็บส่ง body `{}` แล้วโหลด `/api/inbox` ใหม่เพื่อเอา `unread` จากเซิร์ฟเวอร์ (ไม่ลบเลขเอง)
5. หลังเพิ่ม/ลบ เฝ้าดูหรือแจ้งเตือน หน้าเว็บโหลด GET ใหม่ทุกครั้ง ตัวนับ `watch-usage` / `alert-usage` จึงมาจาก `used/limit` ของ API ตรง ๆ

#### เรื่องที่ต้องตัดสิน
6. **E96 เขียน "−5.00%" (U+2212)** แต่ `fmtPct` ให้ "-5.00%" (ขีดธรรมดา) · หน้าเว็บใช้ `fmtPct` ตามกติกา → ตัวตรวจควรเทียบ "-5.00%" หรือหัวหน้าเปลี่ยน `fmtPct`
7. **NFR-05:** `metadata.title` ใน `app/[lang]/layout.tsx` เป็น "พอดีพอร์ต · Pordee Port" มีอักษรไทยในหน้า EN · หน้า F3 ทั้ง 4 ตั้ง `generateMetadata` ทับเองแล้ว (EN = "Watchlist · Pordee Port") แต่หน้าอื่นยังติด
8. เมนูหลักไม่มีลิงก์ไป `/outbox` · F3 เพิ่มแถบย่อยบนทั้ง 4 หน้า testid `watch-nav-{watchlist|alerts|inbox|outbox}`
9. ไม่เข้าสู่ระบบ (401) → รากหน้าเป็น `data-state="error"` และแสดง `<หน้า>-login-required` + ลิงก์ `<หน้า>-login-link`

#### data-testid ของ F3 (สำหรับ SPEC.md)
- ราก: `watch-page` `alerts-page` `inbox-page` `outbox-page` (data-state loading|ready|error) · `<หน้า>-loading` · `<หน้า>-login-required` · `<หน้า>-login-link` · `watch-nav-<หน้า>`
- เฝ้าดู: `watch-usage` (ข้อความ "รายการเฝ้าดู 9/10", data-used data-limit) · `watch-tier` · `watch-add-form` `watch-add-input` `watch-add-btn` · `watch-error` · `watch-ok` · `watch-empty` · `watch-table` · `watch-row-<SYM>` (data-position data-pro-only) · `watch-link-<SYM>` · `watch-proonly-<SYM>` · `watch-proonly-note` · `quote-price-<SYM>` `quote-change-<SYM>` `quote-pct-<SYM>` `quote-asof-<SYM>` `quote-stale-<SYM>` `quote-halted-<SYM>` · `watch-alert-<SYM>` (ไปหน้าแจ้งเตือนพร้อม ?symbol=) · `watch-remove-<SYM>`
- แจ้งเตือน: `alert-usage` ("แจ้งเตือน 2/3") · `alert-form` `alert-symbol-input` `alert-kind-pct` `alert-kind-target` (role=radio, aria-checked) `alert-target-input` (แสดงเมื่อเลือกราคาเป้าหมาย) `alert-add-btn` `alert-error` `alert-ok` · `alert-list` `alert-empty` · `alert-row-<id>` (data-kind data-active data-symbol) · `alert-symbol-<id>` `alert-kind-<id>` `alert-status-<id>` `alert-desc-<id>` · `alert-toggle-<id>` (PATCH active) · `alert-delete-<id>` · `alert-edit-<id>` `alert-edit-input-<id>` `alert-edit-save-<id>` `alert-edit-cancel-<id>` (PATCH targetPrice)
- ช่วงเงียบ: `quiet-section` `quiet-current` (data-start data-end) `quiet-start` `quiet-end` (input type=time) `quiet-save` `quiet-clear` `quiet-ok` `quiet-error`
- กล่อง: `inbox-unread` (ตัวเลขล้วน + data-count) · `inbox-read-all` · `inbox-error` · `inbox-empty` · `inbox-list` · `inbox-item-<id>` (data-read data-quiet data-symbol data-kind) · `inbox-symbol-<id>` `inbox-kind-<id>` `inbox-new-<id>` `inbox-quiet-<id>` ("เกิดในช่วงเงียบ") `inbox-price-<id>` `inbox-pct-<id>` ("+5.00%") `inbox-time-<id>` (เวลาไทย) `inbox-read-<id>`
- อีเมล: `outbox-count` · `outbox-error` · `outbox-empty` · `outbox-list` · `outbox-item-<id>` `outbox-subject-<id>` `outbox-to-<id>` `outbox-time-<id>` `outbox-body-<id>`

### F4

#### F4 · พอร์ต · โน้ตถึงหัวหน้า

1. **NFR-05 กับเครื่องหมาย ฿ (U+0E3F)**: `฿` อยู่ในช่วง U+0E00–U+0E7F ที่ NFR-05 นับว่าเป็นอักษรไทย ถ้า `fmtThb()` ใช้บนหน้า EN จะนับเป็นอักษรไทย
   - F4 แก้เฉพาะหน้าตัวเองแล้ว: หน้า EN แสดงเป็น `THB 87,360.00` (`components/portfolio/shared.ts` → `mkFmt`) หน้า TH ยังเป็น `฿87,360.00`
   - ขอให้หัวหน้าตัดสินแบบรวมทั้งเว็บ เช่นเพิ่ม `fmtThb(v, dp, lang)` ใน `lib/money.ts` ไม่งั้น F5 (ปันผล) และหน้าอื่นที่แสดงบาทบนหน้า EN จะไม่ผ่าน NFR-05
   - test ที่เช็กตัวเลขบาทบนหน้า EN ให้ใช้ `data-value` (มีค่าดิบจาก API ทุกเซลล์) หรือเช็กบนหน้า TH
2. **ไม่ได้เข้าสู่ระบบ**: `portfolio-page` ใช้ `data-state="ready"` แล้วแสดง `portfolio-login-required` (+ ลิงก์ `portfolio-login-link`) หน้า server ตรวจ `currentUser()` ก่อน และ client ก็ตรวจ 401 ด้วย
3. **รูปของ `GET /api/dca/plans` ไม่มีในสัญญา**: ใช้ตามที่ A2 ส่งจริง `{items:[{id,symbol,name,amountThb,dayOfMonth,active,createdAt,nextTradeDate}]}` (รับ `plans` ด้วยเผื่อไว้)
4. **ลบรายการต้องกด 2 ครั้ง**: `tx-delete-<id>` → `tx-delete-confirm-<id>` (ยกเลิก `tx-delete-cancel-<id>`) ไม่ใช้ `window.confirm`
5. testid เพิ่มเติมที่ใช้ทดสอบได้: `pf-market-closed` / `pf-market-open` · `pf-total-pl-pct` · `pf-total-dividends` · `pf-stale-<SYM>` · `pf-halted-<SYM>` · `pf-value-usd-<SYM>` · `pf-cost-thb-<SYM>` · `pf-pl-pct-<SYM>` · `pf-empty` · `tx-ok` · `tx-row-error` / `tx-row-ok` · `tx-cancel-edit` · `fee-error` / `fee-ok` · `dca-ok` · `dca-plan-status-<SYM>` · `dca-plan-next-<SYM>` · `dca-edit-<SYM>` · `dca-toggle-<SYM>` · `dca-pending-{date,close,fx,usd,fee,invest,shares,error}-<id>` · `dca-pending-ok`
6. ช่อง `tx-fee` ถ้าเว้นว่าง จะไม่ส่ง `feeUsd` ให้ API คิดเอง (หน้าเว็บไม่คิดค่าธรรมเนียมเอง) แล้ว `tx-ok` บอกค่าธรรมเนียมที่ API คิด เช่น "บันทึกรายการแล้ว · ค่าธรรมเนียม $1.50"
7. ฟอร์มทั้งหมดใช้ `noValidate` ค่าที่ผิด (เช่น หุ้น 5 ตำแหน่ง หรือวันที่ 29) จึงถูกส่งถึง API และแสดงข้อความ 400 ของ API ใน `tx-error` / `dca-error`

### F5

#### F5 · ปันผล (`/{lang}/dividends`) · โน้ตถึงหัวหน้า / A2

#### สิ่งที่หน้าเว็บสมมติไว้ (ขอให้ A2 ยืนยัน)
1. `GET /api/dividends/calendar?month=YYYY-MM` — (ตอนนี้ A2 กรองด้วย xdDate: พ.ย. 2569 เห็น JNJ, O) สัญญาไม่ได้บอกว่ากรอง "เดือน" ด้วย `xdDate` หรือ `payDate`
   หน้าเว็บแสดงทุกรายการที่ API ส่งมา และจุดบนตารางเดือนทั้ง XD และวันจ่ายที่อยู่ในเดือนนั้น
   เสนอ: ส่งรายการที่ `xdDate` **หรือ** `payDate` อยู่ในเดือนนั้น (เช่น ธ.ค. 2569 เห็น JNJ ที่ XD 24 พ.ย. แต่จ่าย 8 ธ.ค.)
2. `sharesHeld` ของหุ้นที่อยู่แค่ในรายการเฝ้าดู — หน้าเว็บรองรับทั้ง `"0.0000"` และ `null` (แสดง "ยังไม่ได้ถือ (อยู่ในรายการเฝ้าดู)")
3. `amountPerShare` เป็น string 4 ตำแหน่ง (`"0.2700"`) หน้าเว็บตัด `00` ท้ายตอนแสดง → `$0.27` (ถ้าเป็น `0.1234` แสดงครบ 4 ตำแหน่ง)
4. `taxUsd` เป็นค่าบวก (`"7.65"`) หน้าเว็บแสดงตรง ๆ ภายใต้ป้าย "ภาษี 15%"
5. 401 จากเส้นใดก็ได้ (`received`, `portfolio`, `calendar`) → แสดง `dividends-login-required` และ `data-state="ready"`

#### ขอเพิ่ม (ไม่บังคับ)
- `GET /api/dividends/received` ขอ `totalNetThb` ด้วย เพื่อแสดงยอดรวมเป็นบาท (ตอนนี้แสดงรวมเป็น $ อย่างเดียว เพราะหน้าเว็บห้ามบวกเงินเอง)
- ปฏิทิน: ขอ `estGrossUsd` / `estNetUsd` (ประมาณการปันผลของหุ้นที่ถือ) ถ้าอยากให้ลุงสมชายเห็นยอดที่จะได้ก่อนวันจ่าย

#### เรื่องกลาง (NFR-05)
- `fmtThb` ใช้ `฿` (U+0E3F) ซึ่งอยู่ในช่วงยูนิโค้ดภาษาไทย U+0E00–U+0E7F · ถ้าตัวตรวจ NFR-05 ใช้ regex `[฀-๿]` หรือ `[ก-๙]` หน้า EN ที่แสดงเงินบาท (พอร์ต ปันผล) จะไม่ผ่าน
  เสนอให้ตัวตรวจยกเว้น `฿` หรือให้ `fmtThb` ฝั่ง en ใช้ `THB ` แทน (หัวหน้าตัดสิน) · ข้อความของ F5 เองใน en ไม่มี `฿` (อัตราใช้ "35.0000 THB per $1")

#### testid ของหน้า (สำหรับ SPEC)
- ราก `dividends-page[data-state]` · `dividends-error[data-code]` · `dividends-login-required` · `div-login-link` · `div-loading`
- ปฏิทิน: `div-calendar[data-month]` · `div-month-prev` · `div-month-next` · `div-month-label[data-month]` · `div-grid` · `div-day-<YYYY-MM-DD>[data-xd][data-pay]`
  `div-cal-loading` · `div-cal-empty` · `div-cal-list` · `div-cal-<SYM>-<xdDate>` และลูก `div-cal-{amount,xd,pay,shares,link}-<SYM>-<xdDate>`
- ได้รับแล้ว: `div-received` · `div-total-net` · `div-rcv-empty` · `div-month-<YYYY-MM>` · `div-monthly-<YYYY-MM>-thb` · `div-monthly-<YYYY-MM>-usd`
  `div-rcv-<SYM>-<payDate>` และลูก `div-rcv-{date,shares,gross,tax,net-usd,net-thb,fx}-<SYM>-<payDate>` · `div-monthly-empty`
- ผลตอบแทน: `div-returns` · `div-return-price` (= totals.plUsd) · `div-return-total` (= totals.totalReturnUsd) · `div-return-formula` · `div-return-asof`
- เดือนเริ่มต้น = เดือนไทยของ `now` จาก `GET /api/market/status` · เปิดเดือนอื่นตรง ๆ ได้ด้วย `?month=YYYY-MM` (หน้าเว็บอัปเดต URL ตามเดือนที่เลื่อน)

### F6

#### F6 · หน้าศึกษา · โน้ตถึงหัวหน้า

#### ชื่อ data-testid ที่ใช้ (ต่างจากรูปแบบ `<โมดูล>-error` ในสัญญาส่วนที่ 7 ตามโจทย์ F6)
- รากหน้า: `screener-page` `compare-page` `backtest-page` `history-page` (มี `data-state="loading|ready|error"`)
- แท็บ: `study-tabs` · `study-tab-screener|compare|backtest|history` (อยู่ใน `app/[lang]/study/layout.tsx`)
- error: `scr-error` `cmp-error` `bt-error` (มี `data-code`, ข้อความใน `bt-error-message`) `hist-error` `study-export-error`
- ต้องเข้าสู่ระบบ: `history-login-required` (การ์ด + ลิงก์ `hist-login-link`) · `backtest-login-required` (ลิงก์ไป /login ภายใน `bt-error`)
- คัดกรอง: `scr-pe-max` `scr-div-min` `scr-cap-min` `scr-cap-max` (+ `-hint`) `scr-submit` `scr-reset` `scr-count` `scr-table` `scr-empty`
  `scr-sort-symbol|pe|div|cap` (มี `data-dir`, `aria-sort` ที่ th) · `scr-row-<SYM>` `scr-link-<SYM>` `scr-cell-pe|div|cap-<SYM>`
- เทียบ: `cmp-symbol-input` `cmp-add` `cmp-chips` `cmp-chip-<SYM>` `cmp-remove-<SYM>` `cmp-chips-count` `cmp-notice` `cmp-from` `cmp-to` `cmp-submit`
  `cmp-earliest` `cmp-result` `cmp-chart` `cmp-legend-<SYM>` `cmp-final-<SYM>` (เช่น `+0.10%`) `cmp-hover-date`
- CSV (อยู่หน้า compare): `study-export` `study-export-symbol` `study-export-btn` `study-export-error` `study-export-ok` `study-export-pro`
- ลองเทียบ: `bt-symbol` `bt-monthly` `bt-from` `bt-to` (input type=month รับ `YYYY-MM`) `bt-submit` `bt-result` `bt-months` (เช่น "12 เดือน")
  `bt-invested` `bt-dca-value` `bt-lump-value` `bt-dca-shares` `bt-lump-shares` `bt-diff` (เช่น `-$23.90`) `bt-valued-at` `bt-method` `bt-note` `bt-upgrade-link`
- ประวัติ: `hist-count` `hist-list` `hist-empty` `hist-item-<id>` `hist-kind-<id>` `hist-params-<id>` `hist-time-<id>`

#### พฤติกรรมที่ตัดสินเอง
- Free / ไม่เข้าสู่ระบบเปิดหน้า backtest → แสดง `bt-error` ทันที (ข้อความ PRO_ONLY ตามตารางกลาง + ลิงก์ `/account`) โดยดูระดับจาก `currentUser()` + `tierOf()` ฝั่งเซิร์ฟเวอร์ · ฟอร์มยังกดส่งได้ แล้วจะแสดงข้อความจาก API แทน
- กดรายการประวัติ → เปิดหน้าเดิมพร้อมค่าเดิมผ่าน query (`/study/compare?symbols=A,B&from=&to=` · `/study/backtest?symbol=&monthly=&from=YYYY-MM&to=YYYY-MM`) **ไม่รันใหม่อัตโนมัติ** (กันประวัติเพิ่มเองโดยไม่ได้กด)
- อ่าน params ของ backtest ในประวัติรองรับทั้ง `{symbol, monthlyUsd, fromMonth, toMonth}` และ `{symbol, monthly, from, to}` · compare ใช้ `{symbols, from, to}` ตาม seed
- ฟอร์มทุกตัวใช้ `noValidate` และไม่ตั้ง `min` ของวันที่ เพื่อให้ช่วงเกินสิทธิ์ไปถึง API แล้วเห็น RANGE_NOT_ALLOWED ใน `cmp-error` (FR-41) · มีข้อความบอกวันแรกที่ดูได้ใน `cmp-earliest`
- ไม่ตรวจจำนวนหุ้น 2–4 ฝั่งหน้าเว็บ ให้ API ตอบ COMPARE_COUNT (เพิ่มชิปตัวที่ 5 ได้ เพื่อทดสอบ E149)
- ช่องมูลค่าตลาดกรอกเป็น USD เต็มจำนวน (ส่งเป็น `capMinUsd` / `capMaxUsd` ตรง ๆ) มีตัวช่วยแสดงแบบย่อ `$1.00B` ใต้ช่อง
- ค่าเริ่มต้น compare: to = `lastClosedSession` · from = to − 6 เดือน (ไม่เก่ากว่าสิทธิ์) · backtest: เดือนสุดท้าย = เดือนก่อนรอบล่าสุด · เริ่ม = ย้อน 11 เดือน · $100/เดือน

#### ถึงหัวหน้า
- หน้า EN มี "พอดีพอร์ต" ใน `<title>` จาก `metadata` ของ `app/[lang]/layout.tsx` (ไฟล์กลาง) อาจชน NFR-05 ถ้าสแกนทั้ง HTML
- ตอนตรวจ dev server เคยตอบ 500 ทุกหน้าเพราะ `components/home` (F1) import `./home.module.css` ที่ยังไม่มี (ไม่ใช่ไฟล์ของ F6)

### F7

#### F7 · บัญชี (login / signup / account)

#### จุดที่หัวหน้าควรรู้ / ตัดสิน

1. **เครื่องหมาย ฿ (U+0E3F) อยู่ในช่วงอักษรไทย `฀-๿`** · ถ้าตัวสแกน NFR-05 ใช้ช่วงนี้ หน้า EN ที่ใช้ `fmtThb()` (พอร์ต ปันผล) จะตกทั้งหมด
   - F7 เลี่ยงแล้ว: หน้า EN ใช้ "THB 199" / "THB 199.00" แทน ฿ (หน้า TH ใช้ ฿)
   - ขอให้หัวหน้าตัดสิน: ให้สแกนด้วย `[ก-ฺเ-๛]` (ไม่นับ ฿) หรือให้ `fmtThb` ฝั่ง EN ใช้ "THB"
2. ลิงก์ "เข้าสู่ระบบ" ใน header (`core-nav-login`) ไม่ส่ง `?next=` · หน้าที่ต้องเข้าสู่ระบบควรลิงก์ `/{lang}/login?next=<path ปัจจุบัน>` เอง (หน้า login รับ `next` ที่ขึ้นต้นด้วย `/` เท่านั้น ไม่รับ `//` และ `/api/` กัน open redirect · ไม่มี next → `/{lang}/portfolio`)
3. หน้า login รับ `?notice=deleted` (หลังขอลบบัญชี → testid `login-deleted`) และ `?notice=loggedOut` (หลังออกจากระบบ → `login-logged-out`)
4. หน้า account ไม่เข้าสู่ระบบ (401) → `data-state="ready"` + `account-login-required` (ลิงก์ `account-login-link` ไป `/{lang}/login?next=/{lang}/account`) · error อื่นของ `GET /api/me` → `data-state="error"` + `acct-error`
5. NFR-08: ช่อง `type=password` มีเฉพาะ `login-password` และ `signup-password` · ไม่มีหน้าเปลี่ยนรหัสผ่าน · หน้า account ไม่มีช่องรหัสผ่านเลย (การยืนยันลบบัญชีเป็น checkbox)
6. หลัง `PATCH /api/me {bigFont}` → `window.location.reload()` ให้ layout อ่าน `big_font` ใหม่ · หลัง `PATCH {lang}` → ไป `/{ใหม่}/account`

#### data-testid ของ F7 (สำหรับ SPEC.md)

- login: `login-page[data-state=ready|loading|error]` `login-form` `login-email` `login-password` `login-submit` `login-error` `login-to-signup` `login-deleted` `login-logged-out`
- signup: `signup-page[data-state]` `signup-form` `signup-name` `signup-email` `signup-password` `signup-submit` `signup-error` `signup-no-broker` `signup-to-login`
- account: `account-page[data-state=loading|ready|error]` `acct-loading` `account-login-required` `account-login-link` `acct-error`
  `acct-name` `acct-email` `acct-logout`
  `acct-membership` `acct-tier[data-tier=free|pro]` (ข้อความ "Free"/"Pro") `acct-period` `acct-renew[data-renew=on|off]` (มีเฉพาะ Pro) `acct-history-start` `acct-cancel` (เฉพาะ Pro ที่ยังต่ออายุ) `acct-cancel-ok`
  `acct-usage` `acct-usage-watchlist` ("รายการเฝ้าดู 9/10" / "Watchlist 9/10" · `data-used` `data-limit`) `acct-usage-alerts` ("แจ้งเตือน 2/3" / "Alerts 2/3")
  `acct-upgrade-card` (แสดงเมื่อ Free) `acct-benefit-watchlist` `acct-benefit-alerts` `acct-benefit-history` `acct-upgrade` (กดแล้วจ่ายจำลองทันที) `acct-upgrade-ok` ("ชำระแล้ว"/"Paid" + ยอดและรอบ)
  `acct-settings` `acct-bigfont` (checkbox role=switch · `data-state=on|off`) `acct-lang` (select th/en) `acct-saving`
  `acct-danger` `acct-delete` → `acct-delete-panel` `acct-delete-explain` `acct-delete-confirm` (checkbox) `acct-delete-submit` (disabled จนกว่าจะติ๊ก) `acct-delete-cancel`

#### ข้อความหน้าบัญชี (คำต่อคำ)

- รอบ: Pro "รอบปัจจุบันสิ้นสุด {6 พ.ย. 2569}" / "Current period ends {6 Nov 2026}" · Pro หมดแล้ว "Pro สิ้นสุดเมื่อ {date}" / "Pro ended on {date}" · ไม่เคย "ใช้งานระดับ Free" / "You are on the Free plan"
- ต่ออายุ: "ต่ออายุอัตโนมัติ {end+1 วัน} · ฿199.00" / "Renews automatically on {date} · THB 199.00" · ยกเลิกแล้ว "ยกเลิกการต่ออายุแล้ว · ใช้ Pro ได้ถึง {end} แล้วกลับเป็น Free"
- ย้อนหลัง: "ดูย้อนหลังได้ถึง {fmtDate(historyStart)}" / "History available back to {date}"

### F8

#### F8 · โน้ตถึงหัวหน้า

#### 1. หน้า 404 ของ path ที่ไม่มีจริง (ต้องการไฟล์นอกขอบเขต F8)
`app/[lang]/not-found.tsx` จะถูกใช้ก็ต่อเมื่อมีหน้าใต้ `[lang]` เรียก `notFound()` เท่านั้น
URL ที่ไม่ตรง route ใดเลย เช่น `/th/no-such-page` Next จะแสดงหน้า 404 เริ่มต้นของ Next (ไม่มี header/footer · ข้อความอังกฤษ "This page could not be found") แทน
ขอให้หัวหน้าเพิ่มไฟล์นี้ (specific route ชนะ catch-all เสมอ จึงไม่กระทบหน้าอื่น):

```tsx
// app/[lang]/[...rest]/page.tsx
import { notFound } from 'next/navigation';
export default function CatchAll() { notFound(); }
```

ตอนนี้ F8 ใส่ไว้เฉพาะใต้ขอบเขตตัวเอง: `app/[lang]/staff/[...rest]/page.tsx` (เช่น `/th/staff/xxx` → หน้า 404 สวยของเรา)

#### 2. error ใน layout กลาง
`app/[lang]/error.tsx` จับ error ของหน้าใต้ layout ได้ แต่ **ไม่จับ error ที่เกิดใน `app/[lang]/layout.tsx` เอง** (เช่น `currentUser()` / `marketStatus()` ต่อ DB ไม่ได้)
ถ้าต้องการให้ไม่ล่มทั้งเว็บกรณีนั้น (NFR-10) ต้องมี `app/global-error.tsx` (client, มี `<html><body>` ของตัวเอง) — ไฟล์นี้อยู่นอกขอบเขต F8
ถ้าต้องการ F8 ทำให้ได้ โดยใช้ `components/staff/StatusNotice.tsx` + `messages/staff.*.json` (คีย์ `errorpage.*`) ซ้ำได้ทันที

#### 3. NFR-05 · `<title>` ของหน้าอังกฤษ
`metadata.title` ใน layout = 'พอดีพอร์ต · Pordee Port' จะติดไปทุกหน้า EN ที่ไม่ตั้ง title เอง (เช่นหน้า 404) → มีอักษรไทยใน `<title>` ของหน้าอังกฤษ
หน้า `/en/staff` ตั้ง title เองแล้ว ("Staff · Feed status") · แนะนำให้ layout ใช้ `generateMetadata` ตามภาษา

#### 4. รูปแบบ `/api/staff/feed-status` ที่หน้าเว็บอ่าน
แบนตาม `quotaStatus(now)` + `feedState`:
`{minuteUsed, minuteLimit, dayUsed, dayLimit, dayStartsAt, lastRequestAt, lastFetchAt, feedState:'ok'|'degraded'}`
(หน้าเว็บรับแบบซ้อน `{quota:{...}, feedState}` ได้ด้วย เผื่อ A3 ห่อ)

#### 5. data-testid ของ F8
- `/{lang}/staff`: `staff-page` (data-state loading|ready|error, data-view loading|ready|login|forbidden|error) · `staff-title` · `staff-refresh` · `staff-loading`
  · `staff-feed-card` · `staff-feed-state` (data-state ok|degraded · ข้อความ "ทำงานปกติ"/"ขัดข้อง" · "Operational"/"Degraded") · `staff-feed-source`
  · `staff-last-fetch` (data-value = ISO ของ lastFetchAt) · `staff-last-request` (data-value = ISO ของ lastRequestAt)
  · `staff-minute-card` · `staff-quota-minute` (ข้อความ "x / 5" · data-used · data-limit) · `staff-quota-minute-meter` · `staff-quota-minute-left`
  · `staff-day-card` · `staff-quota-day` (ข้อความ "x / 500" · data-used · data-limit) · `staff-quota-day-meter` (role=progressbar) · `staff-quota-day-left`
  · `staff-quota-daystart` (ข้อความ "เริ่มนับ 6 พ.ย. 2569 07:00 น." · data-value = ISO) · `staff-rules`
  · 401 → `staff-login-required` + `staff-login-link` · 403 → `staff-forbidden` + `staff-home-link` · ทั้งสองกรณีหัวข้อมี `staff-error` (ข้อความจาก API: "กรุณาเข้าสู่ระบบ" / "ไม่มีสิทธิ์เข้าถึง")
  · error อื่น → `staff-error` + `staff-retry`
- 404: `notfound-page` · `notfound-card` · `notfound-title` · `notfound-message` · `notfound-home` · `notfound-search`
- error: `error-page` · `error-card` · `error-title` · `error-message` · `error-retry` · `error-home` · `error-ref` (มีเมื่อมี digest)
