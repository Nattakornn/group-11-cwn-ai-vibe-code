-- พอดีพอร์ต · schema ตาม ERD ใน DESIGN.md (24 ตาราง)
-- เงิน ราคา จำนวนหุ้น อัตรา เป็น NUMERIC ทั้งหมด (NFR-11)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== ข้อมูลตลาด (คงที่ · seed ครั้งเดียว) =====
CREATE TABLE stocks (
  symbol            text PRIMARY KEY,
  name              text NOT NULL,
  exchange          text NOT NULL CHECK (exchange IN ('NYSE','NASDAQ','OTC')),
  exchange_label    text NOT NULL,                       -- 'NYSE Arca' สำหรับ VOO
  kind              text NOT NULL CHECK (kind IN ('stock','etf','reit')),
  status            text NOT NULL CHECK (status IN ('listed','delisted')),
  pe                numeric(10,2),                        -- null = ไม่มี
  div_yield_pct     numeric(6,2),                         -- null = ไม่จ่าย
  market_cap_usd    numeric(20,0),
  div_frequency     text,
  fundamentals_date date,
  delisted_on       date
);

CREATE TABLE daily_prices (
  symbol     text NOT NULL REFERENCES stocks(symbol),
  trade_date date NOT NULL,                               -- วันที่นิวยอร์ก
  open       numeric(14,4) NOT NULL,
  high       numeric(14,4) NOT NULL,
  low        numeric(14,4) NOT NULL,
  close      numeric(14,4) NOT NULL,                      -- ราคาจริง (ไม่ปรับแตกพาร์)
  volume     bigint NOT NULL,
  PRIMARY KEY (symbol, trade_date)
);

CREATE TABLE splits (
  symbol         text NOT NULL REFERENCES stocks(symbol),
  effective_date date NOT NULL,
  ratio_to       int NOT NULL,
  ratio_from     int NOT NULL,
  PRIMARY KEY (symbol, effective_date)
);

CREATE TABLE dividends (
  id               serial PRIMARY KEY,
  symbol           text NOT NULL REFERENCES stocks(symbol),
  xd_date          date NOT NULL,
  pay_date         date NOT NULL,
  amount_per_share numeric(10,4) NOT NULL
);

CREATE TABLE market_calendar (
  ny_date       date PRIMARY KEY,
  status        text NOT NULL CHECK (status IN ('closed','early')),
  close_time_ny time
);

CREATE TABLE intraday_quotes (
  symbol     text NOT NULL REFERENCES stocks(symbol),
  quote_time timestamptz NOT NULL,
  price      numeric(14,4) NOT NULL,
  PRIMARY KEY (symbol, quote_time)
);

CREATE TABLE fx_rates (
  rate_date    date PRIMARY KEY,                          -- วันทำการไทย
  mid_rate     numeric(10,4) NOT NULL,
  published_at timestamptz NOT NULL
);

-- ===== แหล่งข้อมูลจำลอง =====
CREATE TABLE feed_overrides (
  symbol text PRIMARY KEY REFERENCES stocks(symbol),
  mode   text NOT NULL CHECK (mode IN ('price','zero','timeout')),
  price  numeric(14,4)
);

CREATE TABLE quote_cache (
  symbol     text PRIMARY KEY REFERENCES stocks(symbol),
  price      numeric(14,4) NOT NULL,
  quote_time timestamptz NOT NULL,                        -- เวลาของราคา
  fetched_at timestamptz NOT NULL                         -- เวลาที่ดึง
);

CREATE TABLE feed_requests (
  id           bigserial PRIMARY KEY,
  requested_at timestamptz NOT NULL,
  symbol       text,
  ok           boolean NOT NULL DEFAULT true
);
CREATE INDEX feed_requests_time ON feed_requests (requested_at);

CREATE TABLE app_clock (
  id         int PRIMARY KEY CHECK (id = 1),
  frozen_now timestamptz                                  -- null = นาฬิกาจริง
);

-- ===== ลูกค้า =====
CREATE TABLE users (
  id                  serial PRIMARY KEY,
  email               text NOT NULL UNIQUE,
  password_hash       text NOT NULL,
  display_name        text NOT NULL,
  is_staff            boolean NOT NULL DEFAULT false,
  pro_period_end      date,                               -- เป็น Pro ถ้าวันไทยวันนี้ <= ค่านี้
  pro_auto_renew      boolean NOT NULL DEFAULT false,
  big_font            boolean NOT NULL DEFAULT false,
  fee_rate_pct        numeric(10,4) NOT NULL DEFAULT 0.15 CHECK (fee_rate_pct >= 0),  -- FR-31 ไม่มีเพดาน (TEST-PLAN 8.2 #10 · รับ 100%)
  fee_min_usd         numeric(8,2) NOT NULL DEFAULT 1.00 CHECK (fee_min_usd >= 0),
  lang                text NOT NULL DEFAULT 'th' CHECK (lang IN ('th','en')),
  quiet_start         time,
  quiet_end           time,
  delete_requested_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token      text PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE subscriptions (
  id           serial PRIMARY KEY,
  user_id      int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  amount_thb   numeric(10,2) NOT NULL,
  cancelled_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE watchlist_items (
  user_id  int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol   text NOT NULL REFERENCES stocks(symbol),
  position int NOT NULL,                                  -- ลำดับที่เพิ่ม
  added_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, symbol)
);

CREATE TABLE alerts (
  id           serial PRIMARY KEY,
  user_id      int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol       text NOT NULL REFERENCES stocks(symbol),
  kind         text NOT NULL CHECK (kind IN ('pct','target')),
  target_price numeric(14,4),
  direction    text CHECK (direction IN ('up','down')),
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL,
  CHECK ((kind = 'pct' AND target_price IS NULL) OR (kind = 'target' AND target_price > 0 AND direction IS NOT NULL))
);

CREATE TABLE alert_events (
  id             bigserial PRIMARY KEY,
  alert_id       int NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  user_id        int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol         text NOT NULL,
  session_date   date NOT NULL,                           -- วันที่นิวยอร์กของรอบตลาด
  price          numeric(14,4) NOT NULL,
  change_pct     numeric(9,4),
  triggered_at   timestamptz NOT NULL,
  in_quiet_hours boolean NOT NULL DEFAULT false,
  read_at        timestamptz,
  CONSTRAINT one_per_session UNIQUE (alert_id, session_date)      -- BR-35, BR-36
);

CREATE TABLE email_outbox (
  id             bigserial PRIMARY KEY,
  user_id        int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_event_id bigint REFERENCES alert_events(id) ON DELETE CASCADE,
  to_email       text NOT NULL,
  subject        text NOT NULL,
  body           text NOT NULL,
  sent_at        timestamptz NOT NULL
);

CREATE TABLE transactions (
  id         bigserial PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol     text NOT NULL REFERENCES stocks(symbol),
  side       text NOT NULL CHECK (side IN ('buy','sell')),
  trade_date date NOT NULL,
  shares     numeric(18,4) NOT NULL CONSTRAINT shares_pos CHECK (shares > 0),
  price      numeric(14,4) NOT NULL CHECK (price > 0),
  fee_usd    numeric(12,2) NOT NULL CHECK (fee_usd >= 0),
  fx_rate    numeric(10,4) NOT NULL,
  source     text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','dca')),
  created_at timestamptz NOT NULL
);

CREATE TABLE holdings (
  user_id      int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol       text NOT NULL REFERENCES stocks(symbol),
  shares       numeric(18,4) NOT NULL CONSTRAINT holdings_shares_nonneg CHECK (shares >= 0),   -- BR-41
  cost_usd     numeric(14,2) NOT NULL DEFAULT 0,
  cost_thb     numeric(16,2) NOT NULL DEFAULT 0,
  realized_usd numeric(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, symbol)
);

CREATE TABLE dca_plans (
  id           serial PRIMARY KEY,
  user_id      int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol       text NOT NULL REFERENCES stocks(symbol),
  amount_thb   numeric(12,2) NOT NULL CHECK (amount_thb > 0),
  day_of_month smallint NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),              -- D-06
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL,                                               -- วันสร้างแผน ไม่ถูกเขียนทับ (R84)
  resumed_at   timestamptz,                                                         -- เปิดแผนที่หยุดไว้ใหม่ล่าสุด · รอบที่ปิดก่อนนี้ไม่สร้างย้อนหลัง (A-07)
  UNIQUE (user_id, symbol)                                                            -- A-07
);

CREATE TABLE dca_pending (
  id             bigserial PRIMARY KEY,
  plan_id        int NOT NULL REFERENCES dca_plans(id) ON DELETE CASCADE,
  user_id        int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol         text NOT NULL,
  trade_date     date NOT NULL,
  close_price    numeric(14,4) NOT NULL,
  fx_rate        numeric(10,4) NOT NULL,
  usd_amount     numeric(12,2) NOT NULL,
  fee_usd        numeric(12,2) NOT NULL,
  shares         numeric(18,4) NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','skipped')),
  transaction_id bigint REFERENCES transactions(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL,
  CONSTRAINT one_pending_per_day UNIQUE (plan_id, trade_date)
);

CREATE TABLE dividend_receipts (
  id          bigserial PRIMARY KEY,
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dividend_id int NOT NULL REFERENCES dividends(id),
  symbol      text NOT NULL,
  pay_date    date NOT NULL,
  shares      numeric(18,4) NOT NULL,
  gross_usd   numeric(12,2) NOT NULL,
  tax_usd     numeric(12,2) NOT NULL,
  net_usd     numeric(12,2) NOT NULL,
  fx_rate     numeric(10,4) NOT NULL,
  net_thb     numeric(14,2) NOT NULL,
  CONSTRAINT one_receipt UNIQUE (user_id, dividend_id)
);

CREATE TABLE study_history (
  id         bigserial PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('compare','backtest')),
  params     jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
