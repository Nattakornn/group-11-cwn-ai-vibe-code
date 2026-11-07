---
name: lab-prove
description: ช่วง "พิสูจน์" LAB 12–13 — แปลง TEST-PLAN เป็น Playwright TypeScript (writer 1 ตัวต่อหัวข้อย่อย), รันขนานบนเว็บชุดแยก (docker shard ต่อหัวข้อ), อัดวิดีโอเป็น GIF, สร้างรายงาน e2e/index.html ตัดสินตามเกณฑ์แยกเบราว์เซอร์, จำแนกข้อที่ล้มใน triage.json แล้วรันโหมดฝังบั๊ก BUG_MODE=1 เทียบ เขียน BUG-HUNT.md วิเคราะห์ oracle ใช้เมื่อผู้ใช้ขอ e2e, Playwright, รัน test ขนาน, ทำ GIF หลักฐาน, รายงานผลทดสอบ, triage ข้อที่ล้ม, หาบั๊กที่ฝังไว้ หรือ "พิสูจน์ว่าเว็บทำตามแผน"
---

# LAB 12–13 · พิสูจน์

ห้ามอ่าน/แก้โค้ดใน `web/` `db/` (อ่านได้แค่ SPEC.md) · ห้ามเปิด `web/BUGS.md` จนถึง LAB 13 ขั้น 7 · ห้ามแก้ผลที่คาดหวังหรือแผนให้ผ่านเฉย ๆ

## ของที่เตรียมไว้ใน skill นี้ (คัดลอกไป `e2e/` ถ้ายังไม่มี)
| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `assets/playwright.config.ts` | baseURL จาก env `BASE_URL` · ผลไป `PW_OUT` · workers 1 · project `chromium` 1280×720 และ `mobile-chrome` Pixel 7 375×812 (เฉพาะ `@mobile`) · วิดีโอทุก test |
| `assets/pordee.ts` → `e2e/fixtures/` | reset พร้อมวันล็อกก่อนทุก test · `api.reset/clock/feed/tick/as(user)` · `ui.goto/login/mark/check/settle` (ไฮไลต์กรอบแดง + แนบภาพ) · `db.query` อ่านอย่างเดียว · `meta()` ใส่ผลที่คาดหวัง/ที่มา/FR-BR |
| `assets/WRITER-BRIEF.md` → `e2e/` | คำสั่งกลางของ writer: อ่านอะไรได้ ห้ามอะไร รูปแบบ test (`ID · ชื่อ @P1 @5.x`), `test.step` ไทย, `expect.soft`, กดซ้ำ = click 2 ครั้งจริง, [O] ที่ยังรอคำตอบ → annotation `pending` |
| `scripts/shards.sh up "1 2 .. 8" [BUG_MODE]` / `down` | เปิดเว็บ+DB ชุดละคู่ `pordee-web-N` :31N0 · `pordee-db-N` :31N1 (tmpfs, mount db/init) บน `pordee-net` (เปิด 8 ชุด ~10 วินาที) |
| `scripts/run-shards.mjs --sections 1,2,3,4 --tag normal [--project chromium\|both]` | รัน 1 หัวข้อต่อ 1 ชุดพร้อมกัน · จด `data-bug-mode` ของทุกชุด · docker stats หลัง 45 วินาที · ข้อที่ timeout รันซ้ำ 1 ครั้ง · mobile รันหลัง chromium ของชุดนั้น |
| `scripts/build-report.mjs --tag normal [--compare report-normal/test-report/data.json] [--no-gif]` | รวมผล → GIF 9.5 วินาที (เล่น ~6.5 + ค้างท้าย 3) · ภาพกรอบแดง · `e2e/index.html` (ดับเบิลคลิกเปิดได้) จาก `scripts/report-template.html` · ตัดสินเกณฑ์หัวข้อ 6 ต่อเบราว์เซอร์ · คอลัมน์ ปกติ\|ฝังบั๊ก เมื่อมี `--compare` |

ชื่อ container/พอร์ตผูกกับโปรเจกต์นี้ ถ้าใช้กับโปรเจกต์อื่นแก้ใน shards.sh และ run-shards.mjs

## LAB 12
0. เช็ก `node -v` `ffmpeg -version` `/api/health` · ติดตั้ง `@playwright/test` รุ่นที่ใช้ browser ที่มีอยู่แล้วในเครื่อง (`ls ~/Library/Caches/ms-playwright`) — การดาวน์โหลด chromium อาจค้าง โปรเจกต์นี้เปลี่ยนเป็น 1.65 ที่ใช้ chromium-1254 ที่มีอยู่
1. เปิดเว็บชุดเพิ่ม **ก่อน** สั่ง writer แล้วให้ writer แต่ละตัวมีเว็บของตัวเอง → ดูเว็บด้วย `playwright-cli -s=5.x` และลองรันไฟล์ตัวเองได้ ≤ 3 รอบ เพื่อแก้ selector/จังหวะเท่านั้น
2. สั่ง writer 1 ตัวต่อหัวข้อย่อยในข้อความเดียว (อ้าง WRITER-BRIEF + ช่วงบรรทัดของแผน + พอร์ตของชุด) · `npx playwright test --list` และ `npx tsc -p .` ให้ผ่านก่อนรัน
3. รันจริง: 4 ชุดก่อน ดู stats แล้วเพิ่มอีก 4 ให้เป็น 8 พร้อมกัน (เครื่อง 11 คอร์ 18 GB ไหว: CPU container ~46% RAM ~2.5 GB)
4. `build-report.mjs` → index.html + GIF
5. **จำแนกด้วย agent ใหม่** (ไม่ใช่ writer): web / plan / test / unclear + หา fake-pass (test ไม่มี assert, เปลี่ยน [D] เป็น pending ทั้งที่ 8.2 มีสมมติฐาน, ตรวจผิดช่อง) → `e2e/triage.json` `{"TC-..": {"class","note"}}` + `TRIAGE-NOTES.md` · "plan" ต้องมีเหตุจาก [D]/[R] ไม่ใช่แค่เว็บทำต่าง · ข้อ plan ยังนับเป็นล้ม
6. แก้ข้อ "test" และ fake-pass (agent แยก) → รันซ้ำทั้งหัวข้อนั้น → build ใหม่
7. เทียบ EXPLORATION ส่วน C: ทุก ❌ ต้องมี test ล้มตรงจุด ถ้าผ่านต้องรู้สาเหตุ
8. `shards.sh down` · อัปเดต README

## LAB 13
1. คัดลอกผลปกติไป `e2e/report-normal/` (index.html, triage.json, TRIAGE-NOTES.md, test-report/{gifs,shots,data.json}, raw)
2. `cd web && BUG_MODE=1 docker compose up -d` · ตรวจ `data-bug-mode="1"` · `shards.sh up "1..8" 1`
3. `run-shards.mjs --project chromium --tag bug` · `build-report.mjs --tag bug --compare report-normal/test-report/data.json`
4. หา "ผ่านรอบปกติ แต่ล้มรอบนี้" และ "ล้มทั้งคู่แต่ค่าจริงเปลี่ยน" (ดึง Expected/Received จาก errors) → จัดกลุ่มเป็นบั๊ก → เพิ่มใน triage.json
5. `BUG-HUNT.md` ส่วน 1 ต่อบั๊ก: ขั้นตอนทำซ้ำ · ผลคาด (ที่มา) · ผลจริง · หลักฐาน GIF · ความรุนแรง · test ที่จับได้ · ทายไว้ใน 8.1 ไหม
6. ส่วน 2 oracle: ตาราง test | ค่าในแผน [D]/[R] | ถ้าเขียนจาก SPEC [A] | ถ้าลอกจากจอวันนี้ [O] (ดูเว็บจริง) | จับได้ไหม
7. **ตอนนี้ค่อยเปิด `web/BUGS.md`** เทียบ บั๊ก | test | จับได้ไหม · ตัวที่พลาด/จับได้ด้วย test เดียว ควรเพิ่ม test อะไร · จดจุดที่เฉลยต่างจากเว็บจริง
8. คืน `BUG_MODE=0` ตรวจ `data-bug-mode="0"` · `shards.sh down` · อัปเดต README

ผลของโปรเจกต์นี้ไว้เทียบ: ปกติ Chromium 47/82 (P1 29/52) ไม่ผ่านเกณฑ์ · ฝังบั๊ก 41/82 · จับบั๊ก 3/3 · oracle [D]/[R] 3/3 · [A] 1/3 · [O] 0/3

## หลังพิสูจน์: รอบแก้บั๊ก (ถ้าผู้ใช้ขอให้ผ่านครบ)
- แยกตามการจำแนก: "เว็บผิด" → ทีมแก้เว็บต่อหมวด (คำสั่งกลาง `e2e/FIX-BRIEF.md` · รายการ `e2e/FIX-LIST.md` · แต่ละทีมใช้ `scripts/fix-shard.sh N` build image ของตัวเองแล้วรัน test ของทีม) · "แผนผิด" → แก้แผนเปิดเผยใน TEST-PLAN 8.3 พร้อมเหตุผล [D]/[R] · test ที่ตรวจผ่านเว็บไม่ได้ → ให้เว็บมี unit test แล้ว e2e อ่านผล
- ห้ามทีมแก้แตะ `modeFlag()` · หลังรวม: schema/seed เปลี่ยน → `docker compose down -v` ใน db · vitest · verify-edges · รันชุดเต็ม · รันโหมดฝังบั๊กยืนยันว่ายังจับได้
- แก้แผนแล้วอาจเผยบั๊กเว็บที่เคยถูกบัง (โปรเจกต์นี้: TC-DIV-04 หลัง XD)
- ผลของโปรเจกต์นี้: ปกติ 82/82 · P1 52/52 · มือถือ 1/1 · ฝังบั๊กล้ม 10 ข้อ = บั๊กที่ฝัง 3/3 ทั้งหมด
