# System Design · พอดีพอร์ต (Pordee Port · US Stock Insight)

ที่มา: `USER-STORIES.md` (48 ข้อ) และ `REQUIREMENTS.md` (FR 60 · BR 57 · NFR 17) · ขั้นนี้ยังไม่เขียนโค้ดเว็บ

**วิธีอ่าน**

- ทุกแผนภาพเป็น Mermaid และ render เป็นภาพจริงไว้ที่ `design/<ชื่อ>.png` (ชื่ออยู่ในคอมเมนต์ `diagram:` เหนือแต่ละแผนภาพ)
- รหัส FR / BR อ้างจาก `REQUIREMENTS.md` · รหัส A-xx คือสมมติฐานเดิม · **D-xx** คือคำถามใหม่ที่เกิดจากการออกแบบ (ท้ายไฟล์)
- **เวลา 2 แบบ:** หน้าจอแสดงเวลาไทยเสมอ แต่กฎตลาดคิดด้วย **เวลานิวยอร์ก** (`America/New_York`) และ "วันซื้อขาย" (`trade_date`, `session_date`) เก็บเป็น **วันที่ของนิวยอร์ก** เพื่อให้ช่วงเวลาออมแสงและการข้ามเที่ยงคืนของไทยไม่ต้องมีกรณีพิเศษ
- พอร์ต: เว็บ **3300** · ฐานข้อมูล **5434** (ไม่ใช้ 3000 / 5433 ของบทต้นฉบับ เพราะเครื่องนี้มี container `petshop` ใช้พอร์ต 3000 อยู่)

---

## 1. System Architecture

<!-- diagram: architecture -->
```mermaid
flowchart LR
  subgraph PC["① เครื่องของเรา"]
    U(["ผู้ใช้"])
    BR["เบราว์เซอร์<br/>หน้าเว็บ + วาดกราฟ"]
    PW["Playwright<br/>ทดสอบอัตโนมัติ"]
  end
  subgraph NET["Docker network: pordee-net"]
    subgraph WEB["② pordee-web · Next.js App Router + TypeScript · พอร์ต 3300"]
      PAGES["หน้าเว็บ /th /en"]
      API["API /api/*"]
      RULES["lib/rules<br/>ตลาด · เงิน · ตัวชี้วัด<br/>แจ้งเตือน · คัดกรอง · สรุป AI"]
      FEED["lib/feed<br/>Pordee Mock Feed<br/>+ โควตา + ใช้ซ้ำ 15 นาที"]
      JOBS["lib/jobs ทุก 60 วินาที<br/>แจ้งเตือน · DCA · ปันผล<br/>ต่ออายุ Pro · ลบบัญชี"]
      CLOCK["lib/clock<br/>นาฬิกาที่ล็อกได้"]
      DBL["lib/db · ไลบรารี pg"]
    end
    subgraph DBP["③ pordee-db · Docker แยกอีกโปรเจกต์"]
      PG[("PostgreSQL 16<br/>volume pordee-pgdata")]
    end
  end
  U --> BR
  PW --> BR
  BR -->|"http://localhost:3300"| PAGES
  BR -->|"fetch JSON"| API
  PW -->|"POST /api/test/*"| API
  PAGES --> API
  API --> RULES
  API --> FEED
  API --> CLOCK
  JOBS --> RULES
  JOBS --> FEED
  JOBS --> CLOCK
  RULES --> DBL
  FEED --> DBL
  API --> DBL
  DBL -->|"pordee-db:5432 ใน network"| PG
  PC -.->|"localhost:5434 ใช้จากเครื่องเราเท่านั้น"| PG
```

| ชั้น | อยู่ที่ไหน | หน้าที่ | ทดสอบด้วยอะไร |
|---|---|---|---|
| หน้าเว็บ | เบราว์เซอร์ (โค้ดจาก pordee-web) | แสดงผล 2 ภาษา วาดกราฟจากตัวเลขที่ API ส่งมา ไม่คิดเงินเอง | Playwright E2E บน Chromium และ Pixel 7 |
| สลับภาษา · ขยายตัวหนังสือ · สลับราคาปรับ/ราคาจริง | เบราว์เซอร์ (ค่าตั้งเก็บที่เซิร์ฟเวอร์ผ่าน API) | เปลี่ยนการแสดงผลเท่านั้น | Playwright ตรวจ `font-size` และข้อความ |
| API | pordee-web | รับคำขอ ตรวจสิทธิ์ เรียกกฎ อ่านเขียนฐานข้อมูล | Playwright `request` ยิงตรง |
| lib/rules | pordee-web | กฎทุกข้อที่มีตัวเลข: สถานะตลาด เงิน (decimal.js + NUMERIC) ตัวชี้วัด แจ้งเตือน คัดกรอง สรุป AI แบบกฎตายตัว | unit test (vitest) ตามตารางค่าขอบ BR |
| lib/feed | pordee-web | แหล่งข้อมูลจำลอง โควตา 5/60 วินาที และ 500/วัน การใช้ซ้ำ 15 นาที ป้ายข้อมูลไม่อัปเดต | unit test + `POST /api/test/feed` สั่งให้ส่ง $0 / ไม่ตอบ |
| lib/jobs | pordee-web | งานตามเวลา ทุก 60 วินาที · ตอนนาฬิกาถูกล็อกจะหยุดเอง และรันผ่าน `POST /api/test/tick` แทน | Playwright: ล็อกนาฬิกา → tick → ตรวจกล่องแจ้งเตือน / อีเมลที่ส่ง |
| lib/clock | pordee-web | "ตอนนี้" ของทั้งเว็บ ล็อกและเลื่อนได้ถึงวินาที (NFR-14) | `POST /api/test/clock` |
| ฐานข้อมูล | pordee-db | เก็บทุกอย่าง และเป็นด่านสุดท้ายของกฎที่ชนกันได้ (CHECK · UNIQUE · advisory lock) | psql ยิงคำสั่งพร้อมกัน · ตรวจข้อมูลหลังทำรายการ |

**ทำไมเงินคิดที่เซิร์ฟเวอร์:** BR-39 ปัดครึ่งขึ้นเป็นเซนต์ ถ้าคิดด้วยทศนิยมลอยตัวใน JavaScript `1.005` จะกลายเป็น `1.00` (ผิด) เงินทุกตัวจึงคิดด้วย decimal.js และเก็บเป็น NUMERIC ซึ่งทดสอบแล้วใน PostgreSQL 16: `round(670.00*0.0015, 2) = 1.01`

---

## 2. Use Case

<!-- diagram: usecase -->
```mermaid
flowchart LR
  G(["ผู้เยี่ยมชม<br/>ไม่เข้าสู่ระบบ"])
  B(["มือใหม่ DCA<br/>(คุณบีม)"])
  P(["เทรดเดอร์<br/>(คุณพลอย)"])
  S(["นักลงทุนปันผล<br/>(ลุงสมชาย)"])
  J(["นักศึกษา<br/>(น้องเจ)"])
  O(["กำกับดูแล<br/>(คุณอร)"])
  T(["ทีมงาน<br/>(พี่ธีร์ · คุณกานต์)"])
  K(["นาฬิกาของระบบ<br/>ทุก 60 วินาที"])
  subgraph SYS["ระบบพอดีพอร์ต"]
    UC1("ค้นหาหุ้น ดูราคา สถานะตลาด<br/>FR-01–FR-07")
    UC2("ดูกราฟ ตัวชี้วัด ราคาปรับ<br/>FR-10–FR-16")
    UC3("คัดกรองหุ้น<br/>FR-45, FR-46")
    UC4("สรุปหุ้นด้วยผู้ช่วย AI<br/>FR-47, FR-48")
    UC5("อ่านหน้าเริ่มต้นลงทุน<br/>FR-49")
    UC6("สมัคร เข้าสู่ระบบ ออก<br/>FR-52, FR-59")
    UC7("จัดการรายการเฝ้าดู<br/>FR-18–FR-20")
    UC8("ตั้งแจ้งเตือน ช่วงเงียบ<br/>FR-21–FR-23, FR-26")
    UC9("อ่านกล่องแจ้งเตือน อีเมลที่ส่ง<br/>FR-24, FR-25")
    UC10("จดรายการซื้อขาย ดูพอร์ต<br/>FR-27–FR-32, FR-35")
    UC11("ตั้งแผน DCA ยืนยันรายการ<br/>FR-33, FR-34")
    UC12("ดูปฏิทินและปันผลที่ได้<br/>FR-36–FR-39")
    UC13("ขยายตัวหนังสือ สลับภาษา<br/>FR-40, FR-57")
    UC14("เทียบหุ้น 2–4 ตัว<br/>FR-17")
    UC15("ลองเทียบ DCA โหลด CSV ประวัติ<br/>FR-41–FR-44")
    UC16("อัปเกรด / ยกเลิก Pro<br/>FR-55, FR-56, FR-58")
    UC17("ขอลบบัญชี<br/>FR-53, FR-54")
    UC18("ตรวจข้อความเตือน คำต้องห้าม แหล่งที่มา<br/>FR-50, FR-51")
    UC19("ดูโควตาและสถานะแหล่งข้อมูล<br/>FR-09, FR-60")
    UC20("ประเมินแจ้งเตือน สร้างรายการ DCA<br/>บันทึกปันผล ต่ออายุ ลบข้อมูล")
  end
  G --> UC1 & UC2 & UC3 & UC4 & UC5 & UC6
  B --> UC5 & UC10 & UC11 & UC13
  P --> UC2 & UC7 & UC8 & UC9
  S --> UC12 & UC13 & UC10
  J --> UC14 & UC15 & UC16
  B & P & S & J --> UC17
  O --> UC18
  T --> UC19
  K --> UC20
```

---

## 3. Flowchart

### 3.1 ขอราคาหุ้น 1 ตัว (ใช้ทุกที่ที่มีราคา)

<!-- diagram: flow-quote -->
```mermaid
flowchart TD
  A["ขอราคา symbol ณ เวลา now"] --> B{"หุ้นอยู่ใน NYSE / NASDAQ?<br/>BR-01"}
  B -->|"OTC / ไม่มี"| B1["ไม่พบหุ้นนี้ / ไม่รองรับหุ้นนอกตลาด<br/>FR-02"]
  B -->|"ถูกถอดแล้ว"| B2["ราคาสุดท้าย + ป้าย หยุดซื้อขาย<br/>FR-08"]
  B -->|"ซื้อขายอยู่"| C{"ตลาดเปิดตอนนี้?<br/>flow-market"}
  C -->|"ปิด"| C1["ใช้ราคาปิดล่าสุด ไม่ขึ้นป้าย<br/>A-14"]
  C -->|"เปิด"| D{"ราคาในที่พักอายุ ≤ 15:00 นาที?<br/>BR-10"}
  D -->|"ใช่"| H
  D -->|"ไม่"| E{"โควตาว่าง?<br/>60 วินาทีล่าสุด < 5 · BR-11<br/>วันนี้ตั้งแต่ 07:00 < 500 · BR-12, BR-13"}
  E -->|"เต็ม"| S1["ใช้ราคาเดิม + ป้าย ข้อมูลไม่อัปเดต<br/>FR-06"]
  E -->|"ว่าง"| F["นับโควตา 1 ครั้ง แล้วขอ Mock Feed<br/>ราคาล่าสุดที่ไม่ใหม่กว่า now − 15 นาที · BR-09"]
  F --> G{"ตอบ และราคา > 0?<br/>BR-14"}
  G -->|"ไม่ตอบ / ≤ 0"| S1
  G -->|"ใช่"| G1["เก็บลงที่พัก quote_cache"] --> H{"ราคาที่แสดงเก่า ≥ 30:00 นาที?<br/>BR-15"}
  H -->|"ใช่"| S1
  H -->|"ไม่"| I["แสดงราคา + เวลาไทย + ล่าช้า 15 นาที<br/>+ Pordee Mock Feed · FR-03, FR-51"]
  C1 --> I
  S1 --> I2["แสดงพร้อมป้าย · FR-06"]
```

### 3.2 สถานะตลาด

<!-- diagram: flow-market -->
```mermaid
flowchart TD
  A["now เวลาไทย"] --> B["แปลงเป็นเวลานิวยอร์ก America/New_York<br/>ช่วงออมแสงจัดการเอง · BR-04, BR-05"]
  B --> C{"วันเสาร์หรืออาทิตย์ของนิวยอร์ก?<br/>BR-08"}
  C -->|"ใช่"| X["ตลาดปิด"]
  C -->|"ไม่"| D{"market_calendar วันนั้น<br/>BR-06, BR-07"}
  D -->|"closed"| X
  D -->|"early"| E1["เวลาปิด = 13:00 นิวยอร์ก (01:00 ไทย)"]
  D -->|"ปกติ"| E2["เวลาปิด = 16:00 นิวยอร์ก"]
  E1 --> F{"09:30 ≤ เวลานิวยอร์ก < เวลาปิด?<br/>BR-02, BR-03, BR-07"}
  E2 --> F
  F -->|"ใช่"| O["ตลาดเปิด / ปิดเร็ววันนี้ 01:00 น."]
  F -->|"ไม่"| X
  X --> N["หาเวลาเปิดครั้งถัดไป แสดงเป็นเวลาไทย<br/>FR-04, A-01"]
```

### 3.3 ประเมินแจ้งเตือน (ทุกรอบของ jobs)

<!-- diagram: flow-alert -->
```mermaid
flowchart TD
  A["แจ้งเตือนที่ active ทีละรายการ"] --> B{"ตลาดเปิด?"}
  B -->|"ปิด"| Z["ข้าม"]
  B -->|"เปิด"| C["อ่านราคาตาม flow-quote<br/>D-02"]
  C --> D{"ชนิดแจ้งเตือน"}
  D -->|"5%"| E["เปลี่ยน % = (ราคา − ปิดวันก่อน) ÷ ปิดวันก่อน × 100"]
  E --> F{"≥ +5.00% หรือ ≤ −5.00%?<br/>BR-33, BR-34 · D-01"}
  F -->|"ไม่"| Z
  F -->|"ใช่"| G
  D -->|"ราคาเป้าหมาย"| T{"ถึงหรือผ่านเป้าตามทิศทาง?<br/>BR-36, A-32"}
  T -->|"ไม่"| Z
  T -->|"ใช่"| T1["ตั้ง active = false"] --> G
  G{"INSERT alert_events<br/>UNIQUE alert_id + session_date<br/>BR-35"}
  G -->|"ซ้ำในรอบนี้"| Z
  G -->|"สำเร็จ"| H["เข้ากล่องแจ้งเตือนในเว็บ · FR-24"]
  H --> I{"เวลาไทยอยู่ใน [เริ่ม, จบ) ของช่วงเงียบ?<br/>BR-37"}
  I -->|"ใช่"| Z2["ไม่ส่งอีเมล นับเป็น 1 ครั้งแล้ว"]
  I -->|"ไม่"| J["บันทึก email_outbox · FR-25"]
```

### 3.4 บันทึกรายการซื้อขายและคิดพอร์ต

<!-- diagram: flow-portfolio -->
```mermaid
flowchart TD
  A["รายการ: ซื้อ/ขาย · จำนวนหุ้น · ราคา · trade_date"] --> B{"จำนวน > 0 และไม่เกิน 4 ตำแหน่ง?<br/>BR-40"}
  B -->|"ไม่"| B1["ปฏิเสธ"]
  B -->|"ใช่"| C["มูลค่า = round(จำนวน × ราคา, 2)<br/>ค่าธรรมเนียม = max(round(มูลค่า × 0.15%, 2), $1)<br/>BR-38, BR-39"]
  C --> D{"ซื้อหรือขาย"}
  D -->|"ซื้อ"| E["ต้นทุน $ += มูลค่า + ค่าธรรมเนียม<br/>ต้นทุน ฿ += round(ต้นทุนรายการ × อัตราวันซื้อ, 2)<br/>BR-42, BR-47"]
  D -->|"ขาย"| F{"จำนวนขาย ≤ หุ้นที่มี?<br/>BR-41 + CHECK ในฐานข้อมูล"}
  F -->|"ไม่"| F1["409 มีหุ้นไม่พอ"]
  F -->|"ใช่"| G["กำไรที่รับรู้ = มูลค่า − ค่าธรรมเนียม − round(ต้นทุนเฉลี่ย × จำนวน, 2)<br/>ลดต้นทุนตามสัดส่วน ต้นทุนเฉลี่ยไม่เปลี่ยน<br/>BR-42, BR-43 · D-07"]
  E --> H["ต้นทุนเฉลี่ย = ต้นทุน $ ÷ จำนวนหุ้น"]
  G --> H
  H --> I["มูลค่า $ = จำนวน × ราคาล่าสุด (flow-quote)<br/>มูลค่า ฿ = มูลค่า $ × อัตราที่ประกาศล่าสุด ≤ now<br/>BR-46, BR-47"]
  I --> J["กำไรจากราคา และรวมปันผลหลังภาษี<br/>BR-48, BR-50 · FR-29, FR-39"]
```

### 3.5 สร้างรายการ DCA รอยืนยัน

<!-- diagram: flow-dca -->
```mermaid
flowchart TD
  A["แผน DCA active: เงินบาท + วันที่ของเดือน"] --> B["วันกำหนด = วันที่นั้นของเดือนนี้ (นิวยอร์ก)"]
  B --> C{"ตลาดปิดทั้งวัน?<br/>BR-45"}
  C -->|"ใช่"| C1["เลื่อนไปวันทำการถัดไป"] --> C
  C -->|"ไม่"| D{"รอบตลาดของวันนั้นปิดแล้ว<br/>และมีราคาปิด?"}
  D -->|"ยัง"| W["รอ tick ถัดไป"]
  D -->|"ใช่"| E["USD = round(บาท ÷ อัตราของวันนั้น, 2)<br/>ค่าธรรมเนียม = max(round(USD × 0.15%, 2), $1)<br/>ลงทุน = USD − ค่าธรรมเนียม · BR-44, D-05"]
  E --> F["จำนวน = trunc(ลงทุน ÷ ราคาปิด, 4)<br/>BR-44"]
  F --> G{"INSERT dca_pending<br/>UNIQUE plan_id + trade_date"}
  G -->|"มีแล้ว"| W
  G -->|"สำเร็จ"| H["รายการรอยืนยัน · FR-34"]
  H --> I{"ลูกค้ากด"}
  I -->|"ยืนยัน"| J["บันทึกรายการซื้อ ตาม flow-portfolio"]
  I -->|"ข้าม"| K["status = skipped · A-08"]
```

### 3.6 สิทธิ์ตามระดับสมาชิก

<!-- diagram: flow-entitlement -->
```mermaid
flowchart TD
  A["คำขอที่ใช้สิทธิ์"] --> B["ระดับ ณ now: เป็น Pro ถ้า now อยู่ในรอบที่จ่ายแล้ว<br/>รอบละ 1 เดือนนับจากวันสมัคร · ยกเลิกแล้วใช้ถึงจบรอบ<br/>BR-24, BR-25, A-15"]
  B --> C{"ชนิดคำขอ"}
  C -->|"เพิ่มเฝ้าดู"| W["SELECT users FOR UPDATE แล้วนับ"]
  W --> W1{"จำนวนหลังเพิ่ม ≤ 10 (Free) / ≤ 50 (Pro)?<br/>BR-16, BR-17<br/>Pro หมดอายุแล้วมี 9 ตัวเพิ่มได้ มี 10 ขึ้นไปไม่ได้ · BR-19"}
  W1 -->|"ไม่"| X["ปฏิเสธ + ข้อความครบโควตา · A-30"]
  W1 -->|"ใช่"| OK["ทำรายการ"]
  C -->|"ดูราคาในรายการเฝ้าดู"| V{"Pro หรือ ลำดับที่เพิ่ม ≤ 10?<br/>BR-18"}
  V -->|"ไม่"| VP["ป้าย เฉพาะ Pro ไม่ดึงราคา"]
  V -->|"ใช่"| OK
  C -->|"ตั้งแจ้งเตือน"| AL{"แจ้งเตือน 2 แบบรวมกันหลังเพิ่ม ≤ 3 (Free) / ≤ 20 (Pro)?<br/>BR-20, BR-21"}
  AL -->|"ไม่"| X
  AL -->|"ใช่"| OK
  C -->|"เลือกช่วงกราฟ"| H{"วันเริ่ม ≥ วันนี้ − 1 ปี (Free) / − 10 ปี (Pro)?<br/>BR-22, BR-23"}
  H -->|"ไม่"| HX["ปฏิเสธ + บอกวันแรกที่ดูได้ · FR-41"]
  H -->|"ใช่"| OK
  C -->|"ลองเทียบ DCA / โหลด CSV"| BT{"เป็น Pro และช่วง ≤ 120 เดือน?<br/>BR-54"}
  BT -->|"ไม่"| X
  BT -->|"ใช่"| OK
```

### 3.7 ตัวชี้วัดบนกราฟ

<!-- diagram: flow-indicators -->
```mermaid
flowchart TD
  A["ราคาปิดรายวันจาก daily_prices<br/>มีเฉพาะวันที่ตลาดเปิด"] --> B["ปรับแตกพาร์: ราคาก่อนวันมีผล ÷ อัตรา<br/>BR-32"]
  B --> C{"จำนวนวันทำการพอไหม?<br/>เส้น 50 / 200 วัน · BR-26<br/>RSI ต้องมี 15 วัน · BR-28"}
  C -->|"ไม่พอ"| C1["ไม่วาดเส้น + ข้อมูลไม่พอ (ต้องมี N วันทำการ)"]
  C -->|"พอ"| D["ค่าเฉลี่ย N วัน = ผลรวมราคาปิด N วันทำการล่าสุด ÷ N<br/>BR-27"]
  C -->|"พอ"| E["RSI 14 แบบ Wilder แล้วปัด 2 ตำแหน่ง"]
  E --> F{"ค่าที่แสดง"}
  F -->|"≥ 70.00 · BR-29"| F1["ป้าย ซื้อมากเกินไป"]
  F -->|"≤ 30.00 · BR-30"| F2["ป้าย ขายมากเกินไป"]
  F -->|"อื่น ๆ"| F3["ไม่มีป้าย"]
  D --> G{"เมื่อวาน 50 วัน < 200 วัน<br/>และวันนี้ 50 วัน > 200 วัน?<br/>BR-31 เท่ากันไม่นับ"}
  G -->|"ใช่"| G1["ป้าย Golden Cross ไม่ส่งแจ้งเตือน"]
  G -->|"ไม่"| G2{"เมื่อวาน > และวันนี้ < ?"}
  G2 -->|"ใช่"| G3["ป้าย Death Cross"]
  B --> T["ปุ่ม ราคาจริง: แท่งเทียนแสดงค่าไม่หาร<br/>แต่ตัวชี้วัดยังใช้ราคาปรับ · A-34"]
```

### 3.8 คัดกรอง เทียบหุ้น ประวัติ และสรุป AI

<!-- diagram: flow-study -->
```mermaid
flowchart TD
  A{"คำขอ"} -->|"คัดกรอง"| S1{"ตั้งเงื่อนไข P/E?"}
  S1 -->|"ใช่"| S2["เก็บเฉพาะ P/E ที่มีค่า และ ≤ ค่าที่ตั้ง<br/>BR-51"]
  S1 -->|"ไม่"| S3
  S2 --> S3["ปันผล ≥ ค่าที่ตั้ง · BR-52<br/>มูลค่าตลาดตามช่วงที่ตั้ง"]
  S3 --> S4["เรียง A–Z หรือคอลัมน์ที่ลูกค้าเลือก<br/>ไม่มีป้ายเด่นหรืออันดับ · FR-46"]
  A -->|"เทียบหุ้น"| C1{"เลือก 2–4 ตัว?<br/>BR-53"}
  C1 -->|"ไม่"| CX["ปฏิเสธ เทียบได้ 2–4 ตัว"]
  C1 -->|"ใช่"| C2["% = (ราคา ÷ ราคาวันแรก − 1) × 100<br/>ทุกเส้นเริ่ม 0.00%"]
  C2 --> HI
  A -->|"ลองเทียบ DCA"| BT["ผ่าน flow-entitlement แล้วคิดด้วยราคาปิดวันทำการแรกของเดือน<br/>ไม่คิดค่าธรรมเนียม ไม่รวมปันผล · FR-42"]
  BT --> HI["บันทึก study_history แล้วลบรายการเก่าที่เกิน 20<br/>BR-55"]
  A -->|"สรุป AI"| AI1["แม่แบบตายตัวจากราคาและตัวชี้วัด · NFR-12"]
  AI1 --> AI2{"≤ 3 บรรทัด และไม่มีคำต้องห้าม?<br/>BR-56 · NFR-06"}
  AI2 -->|"ใช่"| AI3["แสดงพร้อมเวลาของข้อมูล · FR-47"]
  AI2 -->|"ไม่"| AI4["ไม่แสดง แจ้งทีม · ต้องไม่เกิดใน test"]
```

### 3.9 ปันผลเข้าพอร์ต

<!-- diagram: flow-dividend -->
```mermaid
flowchart TD
  A["tick ในวันจ่ายของประกาศปันผล"] --> B["หาลูกค้าที่ถือ: รวมรายการที่ trade_date ก่อนวัน XD<br/>BR-49, D-11"]
  B --> C{"จำนวนหุ้น > 0?"}
  C -->|"ไม่"| Z["ข้าม"]
  C -->|"ใช่"| D["ก่อนภาษี = round(หุ้น × ปันผลต่อหุ้น, 2)<br/>หลังภาษี = round(ก่อนภาษี × 0.85, 2)<br/>BR-48"]
  D --> E["บาท = round(หลังภาษี × อัตราวันจ่าย, 2)"]
  E --> F{"INSERT dividend_receipts<br/>UNIQUE ลูกค้า + ประกาศ"}
  F -->|"มีแล้ว"| Z
  F -->|"สำเร็จ"| G["รวมปันผล = กำไรจากราคา + ผลรวมหลังภาษี<br/>BR-50 · FR-37, FR-38"]
```

### 3.10 ลบบัญชี

<!-- diagram: flow-delete -->
```mermaid
flowchart TD
  A["กด ขอลบบัญชี แล้วยืนยัน · FR-53"] --> B["delete_requested_at = now<br/>ลบ sessions ทั้งหมด = ออกจากระบบทันที"]
  B --> C["เข้าสู่ระบบด้วยบัญชีนี้ → ปฏิเสธ<br/>ยกเลิกคำขอไม่ได้"]
  B --> D{"tick รายวัน: ผ่านไปตั้งแต่ 29 วัน?<br/>วันที่ขอ = วันที่ 0 · BR-57, A-22"}
  D -->|"ยัง"| W["รอ"]
  D -->|"ใช่"| E["ลบ users และทุกตารางของลูกค้าใน transaction เดียว<br/>ON DELETE CASCADE · FR-54"]
  E --> F["อีเมลนี้สมัครใหม่ได้ · D-16"]
```

---

## 4. ERD

<!-- diagram: erd -->
```mermaid
erDiagram
  users ||--o{ sessions : "เข้าสู่ระบบ"
  users ||--o{ subscriptions : "สมัคร Pro"
  users ||--o{ watchlist_items : "เฝ้าดู"
  users ||--o{ alerts : "ตั้ง"
  users ||--o{ transactions : "จด"
  users ||--o{ holdings : "ถือ"
  users ||--o{ dca_plans : "ตั้งแผน"
  users ||--o{ dividend_receipts : "ได้รับ"
  users ||--o{ study_history : "ลอง"
  users ||--o{ email_outbox : "ได้อีเมล"
  stocks ||--o{ daily_prices : "ราคารายวัน"
  stocks ||--o{ intraday_quotes : "ราคาจำลองระหว่างวัน"
  stocks ||--o{ splits : "แตกพาร์"
  stocks ||--o{ dividends : "ประกาศปันผล"
  stocks ||--o| quote_cache : "ราคาที่พัก"
  stocks ||--o| feed_overrides : "สั่งทดสอบ"
  stocks ||--o{ watchlist_items : ""
  stocks ||--o{ alerts : ""
  stocks ||--o{ transactions : ""
  stocks ||--o{ holdings : ""
  alerts ||--o{ alert_events : "เกิด"
  alert_events ||--o| email_outbox : "ส่ง"
  dca_plans ||--o{ dca_pending : "สร้าง"
  dca_pending |o--o| transactions : "ยืนยันเป็น"
  dividends ||--o{ dividend_receipts : "จ่ายให้"

  users {
    int id PK
    text email UK
    text password_hash
    text tier "free / pro"
    bool is_staff
    date pro_period_end "null = ไม่เคย Pro"
    bool pro_auto_renew
    bool big_font
    text lang "th / en"
    time quiet_start
    time quiet_end
    timestamptz delete_requested_at
  }
  sessions {
    text token PK
    int user_id FK
    timestamptz expires_at
  }
  subscriptions {
    int id PK
    int user_id FK
    date period_start
    date period_end
    numeric amount_thb "10,2 = 199.00"
    timestamptz cancelled_at
  }
  stocks {
    text symbol PK "BRK.B"
    text name
    text exchange "NYSE / NASDAQ / OTC"
    text kind "stock / etf / reit"
    text status "listed / delisted"
    numeric pe "10,2 null = ไม่มี"
    numeric div_yield_pct "6,2"
    numeric market_cap_usd "20,0"
    text div_frequency
    date fundamentals_date
  }
  daily_prices {
    text symbol PK, FK
    date trade_date PK "วันที่นิวยอร์ก"
    numeric open "14,4"
    numeric high "14,4"
    numeric low "14,4"
    numeric close "14,4 ราคาจริงไม่ปรับ"
    bigint volume
  }
  splits {
    text symbol PK, FK
    date effective_date PK
    int ratio_to "10"
    int ratio_from "1"
  }
  dividends {
    int id PK
    text symbol FK
    date xd_date
    date pay_date
    numeric amount_per_share "10,4"
  }
  market_calendar {
    date ny_date PK
    text status "closed / early"
    time close_time_ny "13:00 เมื่อ early"
  }
  intraday_quotes {
    text symbol PK, FK
    timestamptz quote_time PK
    numeric price "14,4"
  }
  feed_overrides {
    text symbol PK, FK
    text mode "price / zero / timeout"
    numeric price "14,4"
  }
  quote_cache {
    text symbol PK, FK
    numeric price "14,4"
    timestamptz quote_time "เวลาของราคา"
    timestamptz fetched_at "เวลาที่ดึง"
  }
  feed_requests {
    bigint id PK
    timestamptz requested_at "นับโควตา"
    text symbol
    bool ok
  }
  fx_rates {
    date rate_date PK "วันทำการไทย"
    numeric mid_rate "10,4"
    timestamptz published_at "18:00"
  }
  watchlist_items {
    int user_id PK, FK
    text symbol PK, FK
    int position "ลำดับที่เพิ่ม"
    timestamptz added_at
  }
  alerts {
    int id PK
    int user_id FK
    text symbol FK
    text kind "pct / target"
    numeric target_price "14,4"
    text direction "up / down"
    bool active
  }
  alert_events {
    bigint id PK
    int alert_id FK "UNIQUE กับ session_date"
    date session_date "วันที่นิวยอร์กของรอบ"
    numeric price "14,4"
    numeric change_pct "9,4"
    timestamptz triggered_at
    bool in_quiet_hours
    timestamptz read_at
  }
  email_outbox {
    bigint id PK
    int user_id FK
    bigint alert_event_id FK
    text to_email
    text subject
    text body
    timestamptz sent_at
  }
  transactions {
    bigint id PK
    int user_id FK
    text symbol FK
    text side "buy / sell"
    date trade_date
    numeric shares "18,4"
    numeric price "14,4"
    numeric fee_usd "12,2"
    numeric fx_rate "10,4 วันซื้อ"
    text source "manual / dca"
  }
  holdings {
    int user_id PK, FK
    text symbol PK, FK
    numeric shares "18,4 CHECK >= 0"
    numeric cost_usd "14,2"
    numeric cost_thb "16,2"
    numeric realized_usd "14,2"
  }
  dca_plans {
    int id PK
    int user_id FK
    text symbol FK
    numeric amount_thb "12,2"
    smallint day_of_month
    bool active
  }
  dca_pending {
    bigint id PK
    int plan_id FK "UNIQUE กับ trade_date"
    date trade_date
    numeric close_price "14,4"
    numeric fx_rate "10,4"
    numeric usd_amount "12,2"
    numeric fee_usd "12,2"
    numeric shares "18,4"
    text status "pending / confirmed / skipped"
  }
  dividend_receipts {
    bigint id PK
    int user_id FK "UNIQUE กับ dividend_id"
    int dividend_id FK
    numeric shares "18,4"
    numeric gross_usd "12,2"
    numeric tax_usd "12,2"
    numeric net_usd "12,2"
    numeric fx_rate "10,4 วันจ่าย"
    numeric net_thb "14,2"
  }
  study_history {
    bigint id PK
    int user_id FK
    text kind "compare / backtest"
    jsonb params
    timestamptz created_at
  }
  app_clock {
    int id PK "แถวเดียว"
    timestamptz frozen_now "null = นาฬิกาจริง"
  }
```

**ชนิดข้อมูลเงิน:** ทุกคอลัมน์เงิน ราคา จำนวนหุ้น อัตรา และ % เป็น `NUMERIC` ไม่มี `float` · ราคา 4 ตำแหน่ง (`14,4`) เพราะราคาปรับแตกพาร์อาจมีเศษ · เงินดอลลาร์ 2 ตำแหน่ง (`12,2` / `14,2`) · จำนวนหุ้น `18,4` ตาม BR-40

**กฎที่ฐานข้อมูลกันไว้เป็นด่านสุดท้าย** (ลองกับ `postgres:16-alpine` ใน container ชั่วคราวแล้ว ผลอยู่ในส่วนที่ 6)

```sql
-- ขายเกินหุ้นที่มีไม่ได้ (BR-41) แม้ 2 คำขอมาพร้อมกัน
ALTER TABLE holdings ADD CONSTRAINT holdings_shares_nonneg CHECK (shares >= 0);
-- แจ้งเตือน 1 ครั้งต่อรอบตลาด (BR-35) และราคาเป้าหมายแจ้งครั้งเดียว (BR-36)
ALTER TABLE alert_events ADD CONSTRAINT one_per_session UNIQUE (alert_id, session_date);
-- รายการ DCA 1 รายการต่อแผนต่อวัน · ปันผล 1 ครั้งต่อคนต่อประกาศ
ALTER TABLE dca_pending ADD CONSTRAINT one_pending_per_day UNIQUE (plan_id, trade_date);
ALTER TABLE dividend_receipts ADD CONSTRAINT one_receipt UNIQUE (user_id, dividend_id);
-- จำนวนหุ้นในรายการต้องมากกว่า 0 (BR-40 ส่วนทศนิยมคุมด้วย NUMERIC(18,4) + ตรวจที่ API)
ALTER TABLE transactions ADD CONSTRAINT shares_pos CHECK (shares > 0);
```

```sql
-- โควตา 5 ครั้งใน 60 วินาที (BR-11) และ 500 ครั้งต่อวัน (BR-12, BR-13) ของทั้งเว็บ
-- ใช้ advisory lock ตัวเดียว ให้คำขอเข้าแถวทีละคำขอ แล้วนับ
BEGIN;
SELECT pg_advisory_xact_lock(4242);
INSERT INTO feed_requests(requested_at, symbol)
SELECT $now, $symbol
WHERE (SELECT count(*) FROM feed_requests WHERE requested_at > $now - interval '60 seconds') < 5
  AND (SELECT count(*) FROM feed_requests WHERE requested_at >= $quota_day_start) < 500
RETURNING id;   -- ไม่มีแถวกลับมา = โควตาเต็ม ใช้ราคาเดิม + ป้าย
COMMIT;
```

- จำนวนรายการเฝ้าดูและแจ้งเตือน (BR-16 ถึง BR-21) ตรวจใน transaction เดียวกับการเพิ่ม โดย `SELECT … FROM users WHERE id = $1 FOR UPDATE` ก่อนนับ เพื่อให้กดเพิ่มพร้อมกัน 2 แท็บแล้วไม่เกินโควตา
- `holdings` เป็นผลรวมของ `transactions` ที่อัปเดตใน transaction เดียวกัน เมื่อแก้หรือลบรายการเก่า (FR-28) จะคิด `holdings` ใหม่ทั้งหุ้นตัวนั้น
- ตารางนาฬิกา `app_clock` และ `feed_overrides` มีไว้ทดสอบเท่านั้น (NFR-14, NFR-15) เปิดใช้เมื่อ `ALLOW_TEST_API=1`

---

## 5. Sequence

### 5.1 คุณบีมเปิดหน้า VOO (ราคาเก่าเกิน 15 นาที ต้องขอใหม่)

<!-- diagram: seq-quote -->
```mermaid
sequenceDiagram
  autonumber
  actor Beam as คุณบีม
  participant BR as เบราว์เซอร์
  participant API as pordee-web API
  participant R as lib/rules + clock
  participant F as lib/feed (Mock Feed)
  participant DB as PostgreSQL
  Beam->>BR: เปิด /th/stocks/VOO
  BR->>API: GET /api/stocks/VOO
  API->>R: now() และ marketStatus(now)
  R-->>API: 22:00:00 ไทย · ตลาดเปิด
  API->>DB: SELECT quote_cache WHERE symbol = VOO
  DB-->>API: fetched_at 21:44:59 (อายุ 15:01)
  Note over API: เกิน 15:00 ต้องขอใหม่ (BR-10)
  API->>DB: BEGIN · advisory lock 4242 · นับโควตา · INSERT feed_requests
  alt โควตาว่าง
    DB-->>API: RETURNING id แล้ว COMMIT
    API->>F: quote(VOO, asOf = 21:45:00)
    F-->>API: 500.00 @ 21:45
    API->>DB: UPSERT quote_cache
    API-->>BR: 200 price 500.00 · asOf 21:45 · stale false · source Pordee Mock Feed
  else โควตาเต็ม
    DB-->>API: ไม่มีแถว แล้ว COMMIT
    API-->>BR: 200 ราคาเดิม · stale true
  end
  BR-->>Beam: ราคา ณ 21:45 น. (ล่าช้า 15 นาที) · Pordee Mock Feed
```

### 5.2 แจ้งเตือน AAPL ของคุณพลอยในช่วงเงียบ

<!-- diagram: seq-alert -->
```mermaid
sequenceDiagram
  autonumber
  participant J as lib/jobs (tick)
  participant R as lib/rules
  participant F as lib/feed
  participant DB as PostgreSQL
  actor Ploy as คุณพลอย
  Note over J: ทุก 60 วินาที หรือ POST /api/test/tick เมื่อนาฬิกาถูกล็อก
  J->>R: marketStatus(02:30 ไทย)
  R-->>J: เปิด · session_date = วันที่นิวยอร์ก
  J->>DB: SELECT alerts ที่ active
  loop ทุกแจ้งเตือน
    J->>F: ราคา AAPL (ใช้ที่พักก่อน ตาม flow-quote)
    F-->>J: 252.00
    J->>R: ถึงเป้า $250.00 ทิศขึ้น?
    R-->>J: ใช่ (BR-36)
    J->>DB: INSERT alert_events ON CONFLICT DO NOTHING
    alt แถวใหม่
      J->>DB: UPDATE alerts SET active = false
      J->>R: 02:30 อยู่ใน [02:00, 07:00)?
      R-->>J: ใช่ (BR-37)
      Note over J,DB: ไม่ INSERT email_outbox · in_quiet_hours = true
    else ซ้ำในรอบนี้
      Note over J: ข้าม (BR-35)
    end
  end
  Ploy->>DB: 07:30 เปิดกล่องแจ้งเตือน (ผ่าน API)
  DB-->>Ploy: AAPL แตะ $250.00 เมื่อ 02:30 · ไม่มีอีเมล
```

### 5.3 DCA ของคุณบีม: สร้างรายการรอยืนยัน แล้วกดยืนยัน 2 ครั้งเร็ว ๆ

<!-- diagram: seq-dca -->
```mermaid
sequenceDiagram
  autonumber
  participant J as lib/jobs (tick)
  participant DB as PostgreSQL
  actor Beam as คุณบีม
  participant BR as เบราว์เซอร์
  participant API as pordee-web API
  Note over J: หลังรอบตลาดวันที่ 25 พ.ย. 2569 ปิด (04:00 ไทยของ 26 พ.ย.)
  J->>DB: SELECT ราคาปิด VOO 25 พ.ย. และอัตราของวันนั้น
  DB-->>J: 500.00 · 35.0000
  Note over J: 5000 ÷ 35 = 142.86 − 1.00 = 141.86 ÷ 500 = 0.2837 (BR-44)
  J->>DB: INSERT dca_pending (plan, 2026-11-25) status pending
  Beam->>BR: เปิดพอร์ต เห็นรายการรอยืนยัน
  par กดครั้งที่ 1
    BR->>API: POST /api/dca/pending/31/confirm
    API->>DB: BEGIN · UPDATE dca_pending SET status = confirmed WHERE id = 31 AND status = pending
    DB-->>API: 1 แถว
    API->>DB: INSERT transactions (buy 0.2837 @ 500.00, fee 1.00, fx 35.0000) · UPSERT holdings · COMMIT
    API-->>BR: 200
  and กดครั้งที่ 2 (ห่าง 50 มิลลิวินาที)
    BR->>API: POST /api/dca/pending/31/confirm
    API->>DB: UPDATE … WHERE status = pending (รอ lock แล้วได้ 0 แถว)
    API-->>BR: 409 รายการนี้ยืนยันแล้ว
  end
  BR-->>Beam: VOO เพิ่ม 0.2837 หุ้น (ครั้งเดียว)
```

### 5.4 ขาย 20 หุ้นพร้อมกันจาก 2 แท็บ (มีอยู่ 20 หุ้น)

<!-- diagram: seq-race-sell -->
```mermaid
sequenceDiagram
  autonumber
  actor U as ผู้ใช้ (2 แท็บ)
  participant A1 as API คำขอ A
  participant A2 as API คำขอ B
  participant DB as PostgreSQL
  U->>A1: POST /api/transactions ขาย AAPL 20
  U->>A2: POST /api/transactions ขาย AAPL 20
  A1->>DB: BEGIN · INSERT transactions · UPDATE holdings SET shares = shares − 20
  A2->>DB: BEGIN · INSERT transactions · UPDATE holdings … (รอ row lock ของ A)
  A1->>DB: COMMIT (เหลือ 0.0000)
  DB-->>A2: ERROR 23514 holdings_shares_nonneg (−20.0000)
  A2->>DB: ROLLBACK (รายการขายของ B หายด้วย)
  A1-->>U: 201 ขายแล้ว กำไรที่รับรู้ตาม BR-43
  A2-->>U: 409 มีหุ้นไม่พอ
```

---

## 6. ผลการลองกลไกกับ PostgreSQL 16 จริง

ลองใน container ชั่วคราว `postgres:16-alpine` (ลบทิ้งแล้ว) ไม่ได้เขียนตามทฤษฎีอย่างเดียว

| ลองอะไร | ผล | ตรงกฎ |
|---|---|---|
| `round(670.00*0.0015, 2)` · `round(669.00*0.0015, 2)` · `greatest(round(666.00*0.0015, 2), 1.00)` | 1.01 · 1.00 · 1.00 | BR-38, BR-39 ✅ |
| `round(0.27*0.85, 2)` | 0.23 | BR-48 ✅ |
| `round(5000/35.00, 2)` · `trunc(141.86/500.00, 4)` · `trunc(141.86/141.87, 4)` | 142.86 · 0.2837 · 0.9999 | BR-44 ✅ |
| 2 transaction ขาย 20 หุ้นพร้อมกัน (มี 20) | A ถูกปฏิเสธด้วย `holdings_shares_check` · B สำเร็จ · เหลือ 0.0000 | BR-41 ✅ |
| INSERT `alert_events` (7, 2026-11-09) 2 ครั้ง | ครั้งที่ 2 `duplicate key … alert_events_alert_id_session_date_key` | BR-35 ✅ |
| ขอโควตาพร้อมกัน 8 คำขอ ด้วย advisory lock | ได้ 5 คำขอพอดี | BR-11 ✅ |

---

## 7. API ที่ได้จากการออกแบบ (ร่าง รายละเอียดจะอยู่ใน API-CONTRACT ตอน LAB 6)

| กลุ่ม | เส้นทาง |
|---|---|
| หุ้นและตลาด | `GET /api/stocks?q=` · `GET /api/stocks/:symbol` · `GET /api/stocks/:symbol/candles?interval=day\|week&from&to&adjusted=` · `POST /api/stocks/:symbol/summary` · `GET /api/market/status` |
| เฝ้าดูและแจ้งเตือน | `GET/POST/DELETE /api/watchlist` · `GET/POST/PATCH/DELETE /api/alerts` · `GET /api/inbox` · `GET /api/outbox` · `PATCH /api/me/quiet-hours` |
| พอร์ต | `GET /api/portfolio` · `GET/POST/PATCH/DELETE /api/transactions` · `GET/POST/PATCH /api/dca/plans` · `POST /api/dca/pending/:id/confirm\|skip` · `GET /api/dividends/calendar` |
| ศึกษา | `POST /api/screener` · `POST /api/compare` · `POST /api/backtest` · `GET /api/export.csv` · `GET /api/history` |
| บัญชี | `POST /api/auth/signup\|login\|logout` · `GET/PATCH /api/me` · `POST /api/billing/upgrade\|cancel` · `POST /api/account/delete` |
| ทีมงาน | `GET /api/staff/feed-status` |
| ทดสอบ (`ALLOW_TEST_API=1`) | `POST /api/test/reset {now?}` · `POST /api/test/clock {now}` · `POST /api/test/feed {symbol, mode, price?}` · `POST /api/test/tick` · `GET /api/health` |

---

## 8. คำถามที่ได้จากการออกแบบ

เรื่องที่ `USER-STORIES.md` และ `REQUIREMENTS.md` ยังไม่บอก การวาดแผนภาพทำให้เห็นเรื่องเหล่านี้ ทีมใช้สมมติฐานในคอลัมน์ขวาไปก่อน

| รหัส | เจอตอนวาด | คำถาม | สมมติฐานที่ใช้ | กระทบ |
|---|---|---|---|---|
| D-01 | flow-alert | % เปลี่ยนเทียบ 5.00% ด้วยค่าจริงหรือค่าที่แสดง 2 ตำแหน่ง · $209.99 จาก $200 = 4.995% ถ้าใช้ค่าที่แสดงจะได้ 5.00% แล้วแจ้ง ขณะที่ RSI ใช้ค่าที่แสดง (BR-29) | ใช้ค่าจริง ไม่ปัด $209.99 ไม่แจ้ง | BR-33, BR-34 |
| D-02 | flow-alert + โควตา | ระบบต้องเช็กแจ้งเตือนทุกนาที แต่โควตา 500 ครั้งต่อวัน ทั้งรอบตลาด 6.5 ชม. มี 26 ช่วง ช่วงละ 15 นาที จึงดึงราคาให้ทันได้แค่ราว **19 หุ้น** ทั้งเว็บ (500 ÷ 26) · K9 ยืนยันจากการออกแบบแล้วว่าโควตาไม่พอเมื่อมีลูกค้าจริง | แจ้งเตือนใช้ราคาในที่พักก่อน ขอใหม่เมื่อเกิน 15 นาทีและโควตาว่าง · หุ้นที่ไม่ได้ราคาใหม่ไม่ประเมิน | US-05, US-18, K9 |
| D-03 | flow-quote | ขอแหล่งข้อมูลแล้วไม่ตอบ นับเป็น 1 ครั้งของโควตาไหม | นับ เพราะแหล่งข้อมูลจริงนับ | BR-11, BR-12 |
| D-04 | ERD | "วันที่ 25" ของ DCA และ "วันซื้อ" หมายถึงวันของนิวยอร์ก (คืนวันที่ 25 ตามเวลาไทย) ใช่ไหม | ใช่ เก็บเป็นวันที่นิวยอร์ก | BR-45, BR-47 |
| D-05 | flow-dca | DCA ใช้อัตราแลกเปลี่ยนของวันไหน | อัตราของวันไทยที่ตรงกับวันซื้อขายนิวยอร์ก ซึ่งประกาศ 18:00 ก่อนตลาดเปิด | BR-44, BR-46 |
| D-06 | ERD `dca_plans` | ตั้งวันที่ 29–31 ได้ไหม เดือนที่ไม่มีวันนั้นทำอย่างไร | ตั้งได้ 1–28 เท่านั้น | FR-33 |
| D-07 | flow-portfolio | ขายบางส่วนแล้วต้นทุนบาทลดอย่างไร ปัดเศษตรงไหน | ลดตามสัดส่วนจำนวนหุ้น ปัด 2 ตำแหน่ง | BR-43, BR-47 |
| D-08 | flow-portfolio | แก้รายการเก่าจนทำให้ช่วงหนึ่งมีหุ้นติดลบ (ขายก่อนซื้อตามวันที่) ยอมไหม | ไม่ยอม ตรวจตามลำดับวันที่ทุกครั้งที่แก้ | FR-28, BR-41 |
| D-09 | flow-quote | ข้อมูลจำลองระหว่างวันมีราคาทุกกี่นาที ถ้าไม่มีราคา ณ เวลานั้นใช้อะไร | ใช้ราคาจุดล่าสุดที่ไม่ใหม่กว่า now − 15 นาที · `TEST-DATA.md` ต้องกำหนดจุดราคา | BR-09, NFR-15 |
| D-10 | Architecture | งานตามเวลาทำงานใน container เว็บ ถ้าเว็บปิดอยู่ตอนถึงเวลา DCA ต้องตามทำย้อนหลังไหม | ตามทำย้อนหลังทุกวันที่ยังไม่มีรายการ (UNIQUE กันซ้ำ) | FR-34, FR-37 |
| D-11 | ERD `dividend_receipts` | ปันผลบันทึกวันไหน ใช้จำนวนหุ้น ณ เวลาไหน | บันทึกในวันจ่าย ใช้จำนวนหุ้นจากรายการที่ trade_date ก่อนวัน XD | BR-49, A-09 |
| D-12 | ERD `splits` | หุ้นในพอร์ตตอนแตกพาร์ (A-23) ปรับที่ `transactions` หรือแค่ `holdings` | `transactions` เก็บค่าจริงตามที่จด · `holdings` และหน้าพอร์ตแสดงแบบปรับแล้ว | BR-32, A-23 |
| D-13 | flow-market | สัปดาห์ของแท่งรายสัปดาห์คือจันทร์–ศุกร์ของนิวยอร์ก และสัปดาห์ปัจจุบันที่ยังไม่จบแสดงไหม | ใช้สัปดาห์นิวยอร์ก แสดงแท่งที่ยังไม่จบด้วย | FR-10 |
| D-14 | Use Case | ค้นคำว่า "Apple" แล้วผลแรกต้องเป็น AAPL ใช้กฎเรียงอะไร | ชื่อย่อตรงทั้งคำก่อน แล้วชื่อบริษัทขึ้นต้นด้วยคำค้น แล้ว A–Z | FR-01 |
| D-15 | Use Case | คุณอรต้องเป็นบัญชีทีมงานไหม (§10 มีแค่คุณกานต์) | คุณอรไม่ต้องมีบัญชีพิเศษ ตรวจจากหน้าเว็บปกติ | FR-60 |
| D-16 | ERD `users` | อีเมลของบัญชีที่ขอลบ สมัครใหม่ได้ทันทีไหม | ได้หลังข้อมูลถูกลบจริงเท่านั้น ระหว่างรอขึ้นว่าอีเมลถูกใช้แล้ว | BR-57 |
| D-17 | flow ต่ออายุ Pro | ต่ออายุอัตโนมัติด้วยการจ่ายจำลอง มีกรณีจ่ายไม่ผ่านไหม | จ่ายจำลองผ่านเสมอ | BR-24 |
| D-18 | seq-quote | ป้าย "ข้อมูลไม่อัปเดต" (BR-15) วัดอายุจากเวลาของราคา หรือเวลาที่ดึง | เวลาของราคา (`quote_time`) ซึ่งปกติเก่า 15 นาทีอยู่แล้ว | BR-15 |
| D-19 | Architecture | ข้อความสรุปของผู้ช่วย AI (แม่แบบภาษาไทยและอังกฤษ) ใครเขียนและใครอนุมัติ | ทีมเขียน คุณอรตรวจคำต้องห้ามก่อนขึ้นจริง | FR-47, NFR-06 |
| D-20 | seq-dca | ราคาปิดที่ใช้ใน DCA ถ้าคุณบีมยืนยันช้าไป 3 วัน ยังใช้ราคาปิดวันที่ 25 ไหม | ใช่ ราคาและอัตราล็อกตอนสร้างรายการ | FR-34 |

---

## 9. ความครอบคลุมของแผนภาพ

<!-- COVERAGE:START -->
สคริปต์อ่านรหัส FR / BR จากในแผนภาพเท่านั้น (ไม่นับข้อความรอบ ๆ) และขยายช่วง เช่น FR-01–FR-07

| แผนภาพ | ไฟล์ภาพ | FR | BR |
|---|---|---|---|
| architecture | `design/architecture.png` | — | — |
| usecase | `design/usecase.png` | FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, FR-07, FR-09, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-21, FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-28, FR-29, FR-30, FR-31, FR-32, FR-33, FR-34, FR-35, FR-36, FR-37, FR-38, FR-39, FR-40, FR-41, FR-42, FR-43, FR-44, FR-45, FR-46, FR-47, FR-48, FR-49, FR-50, FR-51, FR-52, FR-53, FR-54, FR-55, FR-56, FR-57, FR-58, FR-59, FR-60 | — |
| flow-quote | `design/flow-quote.png` | FR-02, FR-03, FR-06, FR-08, FR-51 | BR-01, BR-09, BR-10, BR-11, BR-12, BR-13, BR-14, BR-15 |
| flow-market | `design/flow-market.png` | FR-04 | BR-02, BR-03, BR-04, BR-05, BR-06, BR-07, BR-08 |
| flow-alert | `design/flow-alert.png` | FR-24, FR-25 | BR-33, BR-34, BR-35, BR-36, BR-37 |
| flow-portfolio | `design/flow-portfolio.png` | FR-29, FR-39 | BR-38, BR-39, BR-40, BR-41, BR-42, BR-43, BR-46, BR-47, BR-48, BR-50 |
| flow-dca | `design/flow-dca.png` | FR-34 | BR-44, BR-45 |
| flow-entitlement | `design/flow-entitlement.png` | FR-41 | BR-16, BR-17, BR-18, BR-19, BR-20, BR-21, BR-22, BR-23, BR-24, BR-25, BR-54 |
| flow-indicators | `design/flow-indicators.png` | — | BR-26, BR-27, BR-28, BR-29, BR-30, BR-31, BR-32 |
| flow-study | `design/flow-study.png` | FR-06, FR-12, FR-42, FR-46, FR-47 | BR-51, BR-52, BR-53, BR-55, BR-56 |
| flow-dividend | `design/flow-dividend.png` | FR-37, FR-38 | BR-48, BR-49, BR-50 |
| flow-delete | `design/flow-delete.png` | FR-53, FR-54 | BR-57 |
| erd | `design/erd.png` | — | — |
| seq-quote | `design/seq-quote.png` | — | BR-10 |
| seq-alert | `design/seq-alert.png` | — | BR-35, BR-36, BR-37 |
| seq-dca | `design/seq-dca.png` | — | BR-44 |
| seq-race-sell | `design/seq-race-sell.png` | — | BR-43 |

**รวม:** แผนภาพ 17 รูป · FR 60/60 · BR 57/57

- FR ที่ยังไม่อยู่ในแผนภาพใดเลย: ไม่มี
- BR ที่ยังไม่อยู่ในแผนภาพใดเลย: ไม่มี
<!-- COVERAGE:END -->
