# API-CONTRACT · พอดีพอร์ต

สัญญากลางที่ทุก agent ยึด · หัวหน้าเป็นเจ้าของ · สัญญาขาดหรือไม่ชัด → จดใน `web/CONTRACT-NOTES/<ชื่อ>.md` ห้ามแก้ไฟล์นี้หรือไฟล์กลาง

## 0. กติการ่วม

- ทุก route ห่อด้วย `handle()` จาก `@/lib/http` · error = `{"error":{"code","message",...}}` · ข้อความตามภาษา `?lang=th|en` (ค่าเริ่มต้น th)
- ทุก route ใส่ `export const dynamic = 'force-dynamic'` · Next 15: `ctx.params` เป็น Promise (`const { symbol } = await ctx.params`)
- **เงิน ราคา จำนวนหุ้น อัตรา % เป็น string เสมอ** คิดด้วย `@/lib/money` (decimal.js) ห้ามใช้ number ของ JS · ดอลลาร์/บาท 2 ตำแหน่ง · ราคา 4 ตำแหน่ง · หุ้น 4 ตำแหน่ง · % ส่งค่าจริง หน้าเว็บปัด 2 ตำแหน่งตอนแสดง
- "ตอนนี้" = `await now()` จาก `@/lib/clock` เท่านั้น ห้าม `new Date()` ในกฎ · วันที่ซื้อขาย / วันจ่ายปันผล / session = วันที่นิวยอร์ก `'YYYY-MM-DD'` · ช่วงเงียบ วันลบบัญชี รอบ Pro อัตราแลกเปลี่ยน = วันที่ไทย
- ราคาปัจจุบันใช้ `getQuote()` จาก `@/lib/feed` เท่านั้น (นับโควตา) · ราคารายวันใช้ `@/lib/prices` · สถานะตลาด `@/lib/market` · อัตรา `@/lib/fx` · ระดับสมาชิก `@/lib/tier` · ผู้ใช้ `@/lib/session` (`requireUser()` / `currentUser()`)
- ตารางอ่านได้ทุกตัว แต่ **เขียนได้เฉพาะตารางของโมดูลตัวเอง** (ส่วนที่ 9)
- ห้ามมีคำต้องห้ามในข้อความใด ๆ (NFR-06, ไม่สนตัวพิมพ์): ควรซื้อ · ควรขาย · น่าซื้อ · น่าขาย · แนะนำให้ซื้อ · แนะนำให้ขาย · should buy · should sell · recommend (รวม recommended / recommendation) · strong buy · top pick
- หน้าเว็บภาษาอังกฤษต้องไม่มีอักษรไทย (NFR-05) ยกเว้นข้อมูลที่ผู้ใช้กรอกเอง เช่น ชื่อที่แสดง

### ชนิดข้อมูลกลาง

```ts
// @/lib/feed
type Quote = { symbol; price: string|null; asOf: string|null /*ISO*/; prevClose: string|null; change: string|null;
  changePct: string|null /*ค่าจริง*/; stale: boolean; marketOpen: boolean; status: 'listed'|'delisted'; source: 'Pordee Mock Feed' }
// @/lib/market
type MarketStatus = { open; earlyClose; sessionDate: string|null; closesAt: string|null; nextOpen: string; lastClosedSession: string }
type Tier = 'free' | 'pro'   // tierOf(user, now) · คนไม่เข้าสู่ระบบ = free
```

### error ที่ใช้ร่วม (มีใน `E` ของ `@/lib/http`)

| HTTP | code | th | en |
|---|---|---|---|
| 401 | UNAUTHORIZED | กรุณาเข้าสู่ระบบ | Please log in |
| 403 | FORBIDDEN | ไม่มีสิทธิ์เข้าถึง | Access denied |
| 403 | PRO_ONLY | ฟีเจอร์นี้สำหรับสมาชิก Pro | This feature is for Pro members |
| 404 | NOT_FOUND | ไม่พบหุ้นนี้ (หุ้น) / ไม่พบข้อมูล | Stock not found / Not found |
| 404 | OTC_NOT_SUPPORTED | ไม่รองรับหุ้นนอกตลาด NYSE / NASDAQ | OTC stocks are not supported (NYSE / NASDAQ only) |
| 400 | INVALID_INPUT | ข้อมูลไม่ถูกต้อง | Invalid input |

## 1. หัวหน้า (มีแล้ว ห้ามแก้)

| method | path | body | ตอบ |
|---|---|---|---|
| GET | `/api/health` | | `{ok:true, db:true\|false}` |
| GET | `/api/market/status` | | `{now, ...MarketStatus}` |
| POST | `/api/test/reset` | `{now?}` | ล้างข้อมูลลูกค้ากลับเป็น seed · ล็อกนาฬิกา (ไม่ส่ง = 2026-11-06T22:00:00+07:00) |
| POST | `/api/test/clock` | `{now: ISO \| null}` | ล็อกนาฬิกา / null = เวลาจริง · GET = ดูเวลา |
| POST | `/api/test/feed` | `{symbol \| '*', mode: price\|zero\|timeout\|normal, price?, clearCache?}` | สั่ง Mock Feed |
| POST | `/api/test/tick` | | รันงานตามเวลาทุกงาน `{jobs:[{name, ok, result}]}` |

ทั้งหมดใน `/api/test/*` ใช้ได้เมื่อ `ALLOW_TEST_API=1` เท่านั้น

## 2. A1 หุ้นและกราฟ

**GET `/api/stocks?q=`** ค้นหา (FR-01, FR-02, D-14)
- ไม่สนตัวพิมพ์ · `-` = `.` · เรียง: ชื่อย่อตรงทั้งคำ → ชื่อย่อขึ้นต้นด้วย → ชื่อบริษัทขึ้นต้นด้วยคำค้น → ชื่อบริษัทมีคำค้น · เท่ากันเรียง A–Z · สูงสุด 10
- ไม่รวมหุ้น OTC และ `status = delisted`
- ตอบ `{results:[{symbol,name,exchange,exchangeLabel,kind}], notice: null | {code:'OTC_NOT_SUPPORTED'|'NOT_FOUND', message}}` (200 เสมอ) · ค้นชื่อย่อ OTC ตรงตัว → notice OTC · ไม่มีผล → notice NOT_FOUND "ไม่พบหุ้นนี้" / "Stock not found"

**GET `/api/stocks/:symbol`** (FR-03, FR-07, FR-08) → `{stock:{symbol,name,exchange,exchangeLabel,kind,status,pe,divYieldPct,marketCapUsd,fundamentalsDate}, quote: Quote}` · ค่าที่ไม่มีเป็น `null` · OTC / ไม่พบ → 404 ตามตารางกลาง (หุ้นถูกถอดยังเปิดหน้านี้ได้ เพราะอยู่ในพอร์ตได้)

**GET `/api/stocks/:symbol/candles?interval=day|week&from=&to=&adjusted=1|0`** (FR-10–FR-12, FR-16, BR-22, BR-23, BR-32)
- ค่าเริ่มต้น: day · to = รอบล่าสุดที่ปิดแล้ว · from = to − 6 เดือน (ถ้าเก่ากว่าสิทธิ์ใช้วันแรกของสิทธิ์) · adjusted = 1
- `from` เก่ากว่า `historyStart(tier, now)` → **403 RANGE_NOT_ALLOWED** `{earliestAllowed}` · th: "ระดับ {Free\|Pro} ดูย้อนหลังได้ถึง {6 พ.ย. 2568}" (ใช้ `fmtDate`) · en: "{Free\|Pro} members can view history back to {6 Nov 2025}"
- แสดงเฉพาะรอบที่ปิดแล้ว (≤ `lastClosedSession`) · week = จันทร์–ศุกร์ของนิวยอร์ก: date = วันทำการแรก · open ของวันแรก · close ของวันสุดท้าย · high/low สูงสุด/ต่ำสุด · volume รวม (สัปดาห์ที่ยังไม่จบแสดงด้วย D-13)
- ตอบ `{symbol, interval, adjusted, from, to, earliestAllowed, bars:[{date,open,high,low,close,volume}]}` ราคา 4 ตำแหน่ง

## 3. A2 พอร์ตและเงิน (ต้องเข้าสู่ระบบทุกเส้น)

ค่าธรรมเนียมของผู้ใช้ = `users.fee_rate_pct` / `fee_min_usd` · `fee(value, rate, min)` จาก `@/lib/money`

**GET `/api/portfolio`** (FR-29–FR-32, FR-35, FR-39)
```
{ asOf, marketOpen, fx:{rate, rateDate, publishedAt},            // rateAt(now) BR-46
  totals:{costUsd, valueUsd, plUsd, plPct, costThb, valueThb, plThb, realizedUsd, dividendsNetUsd, totalReturnUsd},
  holdings:[{symbol,name,status,shares,avgCostUsd,costUsd,costThb,priceUsd,quoteAsOf,stale,valueUsd,valueThb,plUsd,plThb,realizedUsd}],
  pending:[DcaPending] }
```
- ราคา = `getQuote()` · มูลค่า $ = round2(หุ้น × ราคา) · มูลค่า ฿ = round2(มูลค่า $ × อัตราล่าสุด) · ต้นทุน ฿ = ผลรวมของแต่ละล็อต round2(ต้นทุนล็อต × อัตราวันซื้อ) (BR-47) · ไม่รวมหุ้นที่ shares = 0
- `totalReturnUsd` = plUsd + dividendsNetUsd (BR-50)

**GET `/api/transactions`** → `{items:[{id,symbol,side,tradeDate,shares,price,feeUsd,fxRate,source,createdAt}]}`
**POST `/api/transactions`** `{symbol, side:'buy'|'sell', tradeDate, shares, price, feeUsd?}` (FR-27, BR-38–BR-43)
- shares: string > 0 ทศนิยม ≤ 4 (`maxDecimals`) ไม่งั้น **400 INVALID_SHARES** "จำนวนหุ้นต้องมากกว่า 0 และมีทศนิยมไม่เกิน 4 ตำแหน่ง" / "Shares must be greater than 0 with at most 4 decimal places"
- price > 0 ไม่งั้น 400 INVALID_PRICE "ราคาต้องมากกว่า 0" / "Price must be greater than 0" · feeUsd ไม่ส่ง = คิดตามค่าตั้งของผู้ใช้ · fxRate = `rateForDate(tradeDate)`
- ขาย: ใน tx เดียว `UPDATE holdings SET shares = shares − x` ถ้า CHECK `holdings_shares_nonneg` (23514) หรือไม่มีหุ้น → **409 INSUFFICIENT_SHARES** "มีหุ้นไม่พอ" / "Not enough shares" · กำไรที่รับรู้ = round2(หุ้น × ราคา) − ค่าธรรมเนียม − round2(ต้นทุนเฉลี่ย × หุ้น) · ลดต้นทุน $ และ ฿ ตามสัดส่วน (D-07) ต้นทุนเฉลี่ยไม่เปลี่ยน
- ตอบ 201 `{transaction, holding}`
**PATCH / DELETE `/api/transactions/:id`** แก้/ลบแล้วคิด holdings ของหุ้นนั้นใหม่ทั้งหมดตามลำดับวันที่ · ถ้าช่วงใดหุ้นติดลบ → 409 INSUFFICIENT_SHARES (D-08)

**GET / PATCH `/api/me/fees`** `{feeRatePct, feeMinUsd}` (FR-31)

**GET `/api/dca/plans`** · **POST** `{symbol, amountThb, dayOfMonth}` · **PATCH `/api/dca/plans/:id`** `{amountThb?, dayOfMonth?, active?}` (FR-33)
- dayOfMonth 1–28 ไม่งั้น 400 DAY_OUT_OF_RANGE "เลือกวันที่ 1–28" / "Choose a day from 1 to 28" · 1 แผนต่อ 1 หุ้น ซ้ำ → 409 PLAN_EXISTS "มีแผนของหุ้นนี้แล้ว" / "A plan for this stock already exists"
**GET `/api/dca/pending`** → `{items:[DcaPending]}` · `DcaPending = {id, planId, symbol, tradeDate, closePrice, fxRate, usdAmount, feeUsd, investUsd, shares, status}`
**POST `/api/dca/pending/:id/confirm`** (FR-34) `UPDATE … SET status='confirmed' WHERE id=$1 AND user_id=$2 AND status='pending'` ได้ 0 แถว → **409 ALREADY_DONE** "รายการนี้ยืนยันแล้ว" / "This item has already been confirmed" (ถ้าเคยข้าม: "รายการนี้ข้ามไปแล้ว" / "This item was skipped") · สำเร็จ → สร้าง transaction (source dca) ใน tx เดียว
**POST `/api/dca/pending/:id/skip`** → status skipped

**GET `/api/dividends/calendar?month=YYYY-MM`** (FR-36) หุ้นในพอร์ตและรายการเฝ้าดูที่มีประกาศปันผล → `{items:[{symbol,xdDate,payDate,amountPerShare,sharesHeld}]}`
**GET `/api/dividends/received`** (FR-37, FR-38) → `{items:[{symbol,payDate,shares,grossUsd,taxUsd,netUsd,fxRate,netThb}], monthly:[{month,netUsd,netThb}], totalNetUsd}`

**งานตามเวลา (`lib/portfolio/jobs.ts`)**
- `dca`: flow-dca · วันกำหนด BR-45 (วันทำการถัดไปถ้าปิด) · สร้างเมื่อ now ≥ เวลาปิดของรอบนั้น · USD = round2(บาท ÷ อัตราของวันนั้น `rateForDate`) · ค่าธรรมเนียมตามผู้ใช้ · ลงทุน = USD − ค่าธรรมเนียม · หุ้น = `sharesDown(ลงทุน ÷ ราคาปิด)` · `ON CONFLICT DO NOTHING` · ตามทำย้อนหลังทุกเดือนตั้งแต่สร้างแผน (D-10)
- `dividends`: เมื่อวันที่ไทยของ now ≥ pay_date: ผู้ถือ = ผลรวมรายการที่ trade_date < xd_date (BR-49) · ก่อนภาษี round2(หุ้น × ปันผล) · หลังภาษี round2(ก่อนภาษี × 0.85) · บาท round2(หลังภาษี × `rateForDate(pay_date)`) · `ON CONFLICT DO NOTHING`

## 4. A3 บัญชีและสิทธิ์

**POST `/api/auth/signup`** `{email, password, displayName}` → 201 `{user: Me}` + cookie · อีเมลเก็บตัวพิมพ์เล็ก · ซ้ำ (รวมบัญชีที่รอลบ D-16) → 409 EMAIL_TAKEN "อีเมลนี้ถูกใช้แล้ว" / "This email is already in use" · รหัสผ่าน < 8 → 400 WEAK_PASSWORD "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" / "Password must be at least 8 characters" · รหัสผ่านเก็บด้วย bcryptjs
**POST `/api/auth/login`** `{email, password}` → 200 `{user: Me}` · ผิด → 401 INVALID_LOGIN "อีเมลหรือรหัสผ่านไม่ถูกต้อง" / "Incorrect email or password" · บัญชีที่ขอลบแล้ว → 403 ACCOUNT_DELETING "บัญชีนี้อยู่ระหว่างการลบ เข้าสู่ระบบไม่ได้" / "This account is being deleted and cannot log in"
**POST `/api/auth/logout`** → 200
**GET `/api/me`** → `{user: Me}` หรือ 401 · **PATCH `/api/me`** `{displayName?, bigFont?, lang?}`
```
Me = {id,email,displayName,isStaff,tier,proPeriodEnd,proAutoRenew,bigFont,lang,feeRatePct,feeMinUsd,quietStart,quietEnd,
      usage:{watchlist:{used,limit}, alerts:{used,limit}}, historyStart}
```
**POST `/api/billing/upgrade`** (FR-55) → `{user, subscription:{periodStart,periodEnd,amountThb:'199.00', paid:true}}` · รอบ = วันนี้ (ไทย) ถึงวันเดียวกันเดือนหน้า − 1 วัน (A-15) · auto_renew true · เป็น Pro อยู่แล้ว → 409 ALREADY_PRO "คุณเป็นสมาชิก Pro อยู่แล้ว" / "You are already a Pro member"
**POST `/api/billing/cancel`** (FR-56) → auto_renew false + cancelled_at · ไม่ใช่ Pro → 409 NOT_PRO "คุณยังไม่ได้เป็นสมาชิก Pro" / "You are not a Pro member" · ยกเลิกแล้ว → 409 ALREADY_CANCELLED "ยกเลิกการต่ออายุแล้ว" / "Auto-renewal is already cancelled"
**POST `/api/billing/resume`** (8.2 #13 · รอบแก้บั๊กทีม B) → เปิด auto_renew กลับ + ล้าง cancelled_at ของรอบล่าสุด · ไม่เก็บเงินระหว่างรอบ · ไม่ใช่ Pro → 409 NOT_PRO · เปิดอยู่แล้ว → 409 ALREADY_RENEWING "เปิดต่ออายุอัตโนมัติอยู่แล้ว" / "Auto-renewal is already on"
**POST `/api/account/delete`** `{confirm:true}` (FR-53) → ตั้ง delete_requested_at = now · ลบ sessions · ลบ cookie
**GET `/api/staff/feed-status`** (FR-09, FR-60) → `quotaStatus(now)` + `{feedState:'ok'|'degraded'}` (degraded = คำขอล่าสุด ok=false) · ไม่เข้าสู่ระบบ 401 · ไม่ใช่ทีมงาน 403

**งานตามเวลา (`lib/account/jobs.ts`)**
- `renew`: auto_renew และวันที่ไทย > pro_period_end → รอบใหม่ start = end + 1 วัน · end = วันเดียวกันเดือนถัดไป − 1 วัน · INSERT subscriptions ฿199.00 · วนจนครอบคลุมวันนี้ (BR-24)
- `purge`: daysBetween(วันไทยที่ขอ, วันไทยของ now) ≥ 29 → `DELETE FROM users` (cascade) (BR-57, A-22)

## 5. A4 เฝ้าดูและแจ้งเตือน (ต้องเข้าสู่ระบบทุกเส้น)

**GET `/api/watchlist`** → `{items:[{symbol,name,position,proOnly,quote: Quote|null}], used, limit, tier}` · Free ตัวที่ position > 10 → proOnly true, quote null ไม่ดึงราคา (BR-18)
**POST `/api/watchlist`** `{symbol}` → 201 · ทำใน tx: `SELECT … FROM users WHERE id=$1 FOR UPDATE` แล้วนับ · หลังเพิ่มเกิน limit → **409 WATCHLIST_FULL** {limit} th: "รายการเฝ้าดูครบ {limit} ตัวแล้ว ({Free\|Pro})" en: "Your watchlist is full ({limit} stocks, {Free\|Pro})" · มีแล้ว → 409 ALREADY_IN_LIST "หุ้นนี้อยู่ในรายการเฝ้าดูแล้ว" / "This stock is already in your watchlist" · position = max + 1
**DELETE `/api/watchlist/:symbol`**
**GET `/api/alerts`** → `{items:[{id,symbol,kind,targetPrice,direction,active,createdAt}], used, limit, tier}`
**POST `/api/alerts`** `{symbol, kind:'pct'|'target', targetPrice?}` → 201 · นับรวม 2 แบบ เกิน → **409 ALERTS_FULL** th: "ตั้งแจ้งเตือนครบ {limit} รายการแล้ว ({Free\|Pro})" en: "You have reached {limit} alerts ({Free\|Pro})" · target: direction = up ถ้าเป้า > ราคาปัจจุบัน ไม่งั้น down (A-32) · เป้า ≤ 0 → 400 INVALID_TARGET "ราคาเป้าหมายต้องมากกว่า 0" / "Target price must be greater than 0"
**PATCH `/api/alerts/:id`** `{active?, targetPrice?}` · **DELETE `/api/alerts/:id`**
**GET `/api/inbox`** → `{items:[{id,alertId,symbol,kind,price,changePct,triggeredAt,inQuietHours,read}], unread}` ใหม่สุดก่อน · **POST `/api/inbox/:id/read`**
**GET `/api/outbox`** → `{items:[{id,toEmail,subject,body,sentAt}]}` ของผู้ใช้เอง ใหม่สุดก่อน
**PATCH `/api/me/quiet-hours`** `{start:'HH:mm'|null, end:'HH:mm'|null}` (FR-26)

**งานตามเวลา (`lib/alerts/jobs.ts`) `alerts`** (flow-alert · BR-33–BR-37 · D-01, D-02)
- ตลาดปิด → ไม่ทำอะไร · session_date = `marketStatus(now).sessionDate`
- ราคา: เรียงหุ้นที่มี quote_cache อายุ ≤ 15 นาทีก่อน (ใช้ `getQuote` ซึ่งจะใช้ที่พักโดยไม่กินโควตา) แล้วจึงตัวอื่น · หุ้นที่ได้ `stale = true` ไม่ประเมินในรอบนี้
- pct: `|changePct| ≥ 5` ด้วยค่าจริง ไม่ปัด (D-01: $209.99 จาก $200 = 4.995% ไม่แจ้ง) · target: up → ราคา ≥ เป้า · down → ราคา ≤ เป้า แล้ว `active = false`
- `INSERT alert_events … ON CONFLICT (alert_id, session_date) DO NOTHING` ได้แถวใหม่ → ถ้าเวลาไทยอยู่ใน `[quiet_start, quiet_end)` (รองรับข้ามเที่ยงคืน) → `in_quiet_hours = true` ไม่ส่งอีเมล · ไม่งั้น INSERT email_outbox (หัวเรื่อง "พอดีพอร์ต: {symbol} {+5.00%}" หรือ "พอดีพอร์ต: {symbol} แตะ ${250.00}" ตามภาษาผู้ใช้)
- **หมายเหตุสำหรับคนทดสอบ:** ตั้งราคาด้วย `/api/test/feed` แล้วเปิด `GET /api/stocks/:symbol` ก่อน tick เพื่อให้ราคาอยู่ในที่พัก

## 6. A5 วิเคราะห์

**GET `/api/stocks/:symbol/indicators?from=&to=`** (FR-13–FR-15, BR-26–BR-31) คิดจาก `adjustedCloses` ถึง `lastClosedSession` (T-07)
```
{ sma50:[{date,value}], sma200:[{date,value}], rsi14:[{date,value}],          // value 4 ตำแหน่ง (RSI 2 ตำแหน่ง) เฉพาะช่วง from–to
  latest:{sma50,sma200,rsi14, rsiLabel:'overbought'|'oversold'|null},        // ป้ายดูจาก RSI ที่ปัด 2 ตำแหน่ง ≥70.00 / ≤30.00
  crosses:[{date, kind:'golden'|'death'}],                                   // เมื่อวาน < และวันนี้ > (เท่ากันไม่นับ)
  notEnough:{sma50:boolean, sma200:boolean, rsi14:boolean}, counts:{closes} }
```
ค่าเฉลี่ย N = ผลรวมราคาปิด N วันทำการล่าสุด ÷ N (round4) · RSI Wilder: เฉลี่ยแรก = ค่าเฉลี่ย 14 ช่วงแรก แล้ว (เดิม × 13 + ใหม่) ÷ 14 · ไม่มีขาลง = 100.00 · ไม่มีขาขึ้น = 0.00 · ต้องมีราคาปิด ≥ 15 วัน
**POST `/api/stocks/:symbol/summary`** (FR-47, FR-48, BR-56) → `{lines:[≤3 string], asOf, lang}` แม่แบบตายตัวจากราคา ค่าเฉลี่ย RSI · ข้อมูลเดิมได้ข้อความเดิมทุกตัวอักษร (NFR-12) · ห้ามคำต้องห้าม
**POST `/api/screener`** `{peMax?, divMin?, capMinUsd?, capMaxUsd?, sort?:'symbol'|'pe'|'div'|'cap', dir?:'asc'|'desc'}` (FR-45, FR-46, BR-51, BR-52) → `{results:[{symbol,name,exchangeLabel,pe,divYieldPct,marketCapUsd}]}` · ตั้ง peMax: เฉพาะ pe ไม่ null และ ≤ peMax · ตั้ง divMin: เฉพาะ div ไม่ null และ ≥ divMin · ไม่รวม OTC และ delisted · ค่าเริ่มต้นเรียงชื่อย่อ A–Z
**POST `/api/compare`** `{symbols:[], from, to}` (FR-17, BR-53) → `{series:[{symbol,points:[{date,pct}]}], final:[{symbol,pct}]}` · % = (ราคาปิดปรับ ÷ ราคาปิดวันแรกของช่วง − 1) × 100 · จำนวน < 2 หรือ > 4 → 400 COMPARE_COUNT "เทียบได้ 2–4 ตัว" / "Compare 2–4 stocks" · from เก่ากว่าสิทธิ์ → 403 RANGE_NOT_ALLOWED (ข้อความเดียวกับ A1) · เข้าสู่ระบบอยู่ → บันทึกประวัติ
**POST `/api/backtest`** `{symbol, monthlyUsd, fromMonth:'YYYY-MM', toMonth:'YYYY-MM'}` (FR-42, BR-54, T-09) → `{months, investedUsd, dca:{shares,valueUsd}, lump:{shares,valueUsd}, diffUsd, valuedAt, priceUsed}`
- ไม่เข้าสู่ระบบ 401 · Free → 403 PRO_ONLY · เดือน > 120 → 400 RANGE_TOO_LONG "ลองเทียบได้ไม่เกิน 120 เดือน" / "Backtests are limited to 120 months" (ตรวจจำนวนเดือนเท่านั้น)
- ซื้อที่ราคาปิดปรับของวันทำการแรกของแต่ละเดือน · หุ้นไม่ปัด · มูลค่าที่ราคาปิดรอบล่าสุด · valueUsd ปัด 2 · diffUsd = round2(dca) − round2(lump) · บันทึกประวัติ
**GET `/api/export?symbol=&from=&to=`** (FR-43) ไม่เข้าสู่ระบบ 401 · Free 403 PRO_ONLY · ช่วงเกินสิทธิ์ 403 RANGE_NOT_ALLOWED · ตอบ `text/csv; charset=utf-8` ขึ้นต้นด้วย BOM · บรรทัด 1 `# Source: Pordee Mock Feed` · บรรทัด 2 ข้อความเตือนตามภาษา · บรรทัด 3 `date,open,high,low,close,volume`
**GET `/api/history`** (FR-44, BR-55) → `{items:[{id,kind,params,createdAt}]}` ใหม่สุดก่อน · ทุกครั้งที่บันทึกให้ลบรายการเกิน 20 ล่าสุดในทรานแซกชันเดียวกัน

## 7. หน้าเว็บ (F1–F8)

- path: `app/[lang]/<หน้า>/page.tsx` เป็น server component บาง ๆ ที่ `await params` แล้วโหลด dict (`getDict(lang, '<โมดูล>')` และ `getDict(lang,'core')`) ส่งให้ client component ของโมดูล
- client component เรียก API ด้วย `api()` จาก `@/lib/api-client` (ส่ง `lang` เสมอ) · ไม่คิดเงินเอง แสดงด้วย `fmtUsd fmtThb fmtPct fmtShares` จาก `@/lib/money`
- **รากของทุกหน้า:** `<section data-testid="<โมดูล>-page" data-state="loading|ready|error">` · ข้อความ error จาก API แสดงใน `data-testid="<โมดูล>-error"` · ต้องเข้าสู่ระบบแต่ไม่ได้เข้า (401) → แสดง `data-testid="<โมดูล>-login-required"` พร้อมลิงก์ไป `/{lang}/login`
- data-testid ใช้ `tid()` · ราคาปัจจุบันใช้ `<QuoteLine>` / `<QuoteBadges>` จาก `@/components/quote` (server) หรือทำเองในรูปเดียวกัน (testid `quote-price-<id>` `quote-pct-<id>` `quote-asof-<id>` `quote-stale-<id>`)
- CSS: ใช้ class ใน `app/globals.css` เป็นหลัก ถ้าต้องเพิ่มใช้ `*.module.css` ในโฟลเดอร์ของตัวเอง · ขนาดตัวอักษรใช้ `var(--fs-*)` เท่านั้น · สีใช้ตัวแปร
- กราฟใช้ `lightweight-charts` 4.2 ใน client component (`'use client'` + `useEffect`)

| โมดูล (i18n) | path |
|---|---|
| home (F1) | `/{lang}` · `/{lang}/learn` |
| stock (F2) | `/{lang}/search?q=` · `/{lang}/stocks/[symbol]` |
| watch (F3) | `/{lang}/watchlist` · `/{lang}/alerts` · `/{lang}/inbox` · `/{lang}/outbox` |
| portfolio (F4) | `/{lang}/portfolio` (รวมรายการซื้อขาย DCA รายการรอยืนยัน) |
| dividends (F5) | `/{lang}/dividends` |
| study (F6) | `/{lang}/study/screener` · `/compare` · `/backtest` · `/history` |
| account (F7) | `/{lang}/login` · `/{lang}/signup` · `/{lang}/account` |
| staff (F8) | `/{lang}/staff` · `app/[lang]/not-found.tsx` · `app/[lang]/error.tsx` |

## 8. ตารางเจ้าของไฟล์

| เจ้าของ | ไฟล์ |
|---|---|
| หัวหน้า | `db/**` · `lib/{db,clock,money,market,fx,prices,feed,http,session,tier,i18n,testid,bug,jobs,testapi,api-client}.ts` · `lib/core.test.ts` · `app/[lang]/layout.tsx` · `app/globals.css` · `app/api/{health,market,test}/**` · `components/{chrome,client,quote}.tsx` · `messages/index.ts` · `messages/core.*.json` · `middleware.ts` · `instrumentation*.ts` · config ทุกไฟล์ · `API-CONTRACT.md` · `SPEC.md` · `ASSETS.md` · `BUGS.md` |
| A1 | `app/api/stocks/route.ts` · `app/api/stocks/[symbol]/route.ts` · `app/api/stocks/[symbol]/candles/**` · `lib/stocks/**` |
| A2 | `app/api/{portfolio,transactions,dca,dividends}/**` · `app/api/me/fees/**` · `lib/portfolio/**` |
| A3 | `app/api/{auth,billing,account,staff}/**` · `app/api/me/route.ts` · `lib/account/**` |
| A4 | `app/api/{watchlist,alerts,inbox,outbox}/**` · `app/api/me/quiet-hours/**` · `lib/alerts/**` |
| A5 | `app/api/stocks/[symbol]/{indicators,summary}/**` · `app/api/{screener,compare,backtest,export,history}/**` · `lib/analysis/**` |
| F1 | `app/[lang]/page.tsx` · `app/[lang]/learn/**` · `components/home/**` · `messages/home.*.json` |
| F2 | `app/[lang]/{search,stocks}/**` · `components/stock/**` · `messages/stock.*.json` |
| F3 | `app/[lang]/{watchlist,alerts,inbox,outbox}/**` · `components/watch/**` · `messages/watch.*.json` |
| F4 | `app/[lang]/portfolio/**` · `components/portfolio/**` · `messages/portfolio.*.json` |
| F5 | `app/[lang]/dividends/**` · `components/dividends/**` · `messages/dividends.*.json` |
| F6 | `app/[lang]/study/**` · `components/study/**` · `messages/study.*.json` |
| F7 | `app/[lang]/{login,signup,account}/**` · `components/account/**` · `messages/account.*.json` |
| F8 | `app/[lang]/staff/**` · `app/[lang]/not-found.tsx` · `app/[lang]/error.tsx` · `components/staff/**` · `messages/staff.*.json` |
| ทุกคน | `web/CONTRACT-NOTES/<ชื่อ>.md` ของตัวเอง |

## 9. ตารางที่เขียนได้

| โมดูล | ตาราง |
|---|---|
| หัวหน้า | `feed_requests` `quote_cache` `feed_overrides` `app_clock` |
| A2 | `transactions` `holdings` `dca_plans` `dca_pending` `dividend_receipts` · `users.fee_*` |
| A3 | `users` (ยกเว้น `fee_*` `quiet_*`) `sessions` `subscriptions` |
| A4 | `watchlist_items` `alerts` `alert_events` `email_outbox` · `users.quiet_*` |
| A5 | `study_history` |
