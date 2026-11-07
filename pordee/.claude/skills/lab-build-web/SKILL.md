---
name: lab-build-web
description: ช่วง "สร้างเว็บ" LAB 5–6 — เขียน BUILD-PROMPT.md ใบสั่งงานสร้างเว็บจากเอกสาร LAB 1–4 แล้วสร้างเว็บจริงด้วยหัวหน้า + subagent หลายตัว (Next.js + PostgreSQL + Docker) พร้อม API ทดสอบ, SPEC.md และบั๊กปริศนาที่สลับด้วย BUG_MODE ใช้เมื่อผู้ใช้ขอเขียนพรอมต์สร้างเว็บ, สร้างเว็บจาก requirement, แบ่ง agent สร้างเว็บ, ฝังบั๊กให้ tester หา, หรือแก้ปัญหา build/Docker ของเว็บนี้
---

# LAB 5–6 · สร้างเว็บ

## LAB 5 · `BUILD-PROMPT.md` (ใบสั่งงาน ~100 บรรทัด)
โครงที่ใช้ได้ผล:
- **ขั้น 0** อ่านเอกสารทั้งหมด และตัดสินจุดที่เอกสารชนกัน (จดลง SPEC ส่วน 5)
- **ช่วง A (หัวหน้าทำคนเดียว)** โครงโปรเจกต์ + Docker 2 โปรเจกต์ (db, web) · `db/init/01-schema.sql` `02-seed.sql` `03-check.sql` (RAISE EXCEPTION ถ้า seed ไม่ตรง TEST-DATA) · แกนกลาง `lib/` (clock, money ด้วย decimal.js, market, http, session) · design system กลาง · `web/API-CONTRACT.md` + ตารางเจ้าของไฟล์
- **ช่วง B** สั่ง subagent พร้อมกันในข้อความเดียว แต่ละตัวเป็นเจ้าของไฟล์ไม่ทับกัน
- **ช่วง C** หัวหน้ารวมงาน แล้วสั่งผู้ตรวจ 2 ตัว (V1 กฎเงิน/เวลา · V2 กฎอื่นผ่าน API) บนโหมดปกติ
- ตรวจครบด้วย `tools/check_prompt.py` (FR/BR/NFR ทุกข้อถูกอ้างในพรอมต์)

ของที่ต้องมีเพื่อให้ทดสอบได้ในภายหลัง:
- นาฬิกาจำลอง + `POST /api/test/reset {now?}` `clock` `feed` `tick` เปิดด้วย `ALLOW_TEST_API=1` · `/api/health`
- `<html data-ready="true" data-bug-mode="0|1">` · `data-testid` ทุกจุดที่ตรวจ
- **บั๊กปริศนา 3 ตัว** สลับด้วย env `BUG_MODE` อ่านตอนรัน (ไม่ต้อง build ใหม่) · เลือกบั๊กที่ "ถ้าลอกค่าจากจอไปเป็นผลที่คาดหวัง จะจับไม่ได้" (ตัวเลขสอดคล้องกันเองและดูสมเหตุสมผล) · เขียนเฉลยลง `web/BUGS.md` เท่านั้น

## LAB 6 · สร้างจริง
- ทำตาม BUILD-PROMPT · รอจน container healthy · `/api/health` → `{"ok":true,"db":true}`
- `web/SPEC.md`: วิธีเปิดเว็บ · API ทดสอบ · ผู้ใช้ seed · กฎที่ทำ (โยง FR/BR) · สิ่งที่ตัดสินใจเอง · ภาคผนวก API/หน้า/testid ดึงจากโค้ด
- ตรวจส่งมอบ: สคริปต์ค่าขอบผ่านเว็บ (`web/scripts/verify-edges.mjs` ต้องผ่านทั้งหมดที่ BUG_MODE=0) · vitest · `BUG_MODE=1` แล้ว unit test ต้องล้มตามที่เฉลยบอก

## บทเรียนที่เจอในโปรเจกต์นี้ (อย่าทำซ้ำ)
- `instrumentation.ts` import `pg` ตรง ๆ แล้วเข้า edge bundle → 500 · แยกเป็น `instrumentation-node.ts` และ `if (process.env.NEXT_RUNTIME==='nodejs') await import(...)`
- vitest ที่เรียก reset DB ชนกันเมื่อรันขนาน → `fileParallelism: false`
- หน้า EN ห้ามมีอักษรไทย (รวม ป้ายสลับภาษา และ ฿ ซึ่งอยู่ในบล็อกไทย → ใช้ "THB " ในหน้า EN)
- โค้ดจริงห้ามพึ่งตารางของ test API (เช่นเรียงลำดับตาม feed_overrides)
- กราฟ canvas สร้างใหม่ตอนเปลี่ยนธีมด้วยตัวนับ ไม่ใช่ boolean (React batch false→true หาย)
- ธีมมืด: token ซ้ำ 2 ที่ `@media (prefers-color-scheme: dark){:root:not([data-theme='light'])}` และ `:root[data-theme='dark']` · ปุ่มหลักใช้ `--primary` ไม่ใช่สีกรมท่าตายตัว

## ก่อนไปต่อ
container healthy · verify-edges ผ่าน · BUG_MODE สลับได้ · อัปเดต README · ต่อด้วย `lab-explore` (ตั้งแต่ตรงนี้ tester ห้ามอ่านโค้ดและ BUGS.md)
