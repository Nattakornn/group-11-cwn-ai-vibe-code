-- พอดีพอร์ต · seed ตาม TEST-DATA.md ทุกค่า
-- ส่วนที่ 1: ข้อมูลตลาด (คงที่) · ส่วนที่ 2: ฟังก์ชัน pordee_reset() ข้อมูลลูกค้า (เรียกซ้ำได้จาก /api/test/reset)

-- ---------- ปฏิทิน (TEST-DATA 4.1) ----------
INSERT INTO market_calendar VALUES
  ('2026-11-26','closed',NULL), ('2026-11-27','early','13:00'),
  ('2026-12-24','early','13:00'), ('2026-12-25','closed',NULL), ('2027-01-01','closed',NULL);

-- ---------- หุ้น (TEST-DATA 3.1, 3.2) ----------
CREATE TEMP TABLE gen (symbol text PRIMARY KEY, anchor numeric, rule text);

INSERT INTO stocks VALUES
 ('AAPL','Apple Inc.','NASDAQ','NASDAQ','stock','listed',32.50,0.50,3400000000000,'quarterly','2026-11-05',NULL),
 ('MSFT','Microsoft Corp.','NASDAQ','NASDAQ','stock','listed',35.10,0.80,3120000000000,'quarterly','2026-11-05',NULL),
 ('NVDA','NVIDIA Corp.','NASDAQ','NASDAQ','stock','listed',52.30,0.03,3200000000000,'quarterly','2026-11-05',NULL),
 ('BRK.B','Berkshire Hathaway Class B','NYSE','NYSE','stock','listed',20.00,NULL,1030000000000,NULL,'2026-11-05',NULL),
 ('KO','The Coca-Cola Co.','NYSE','NYSE','stock','listed',20.01,3.00,293000000000,'quarterly','2026-11-05',NULL),
 ('JNJ','Johnson & Johnson','NYSE','NYSE','stock','listed',15.20,3.10,373000000000,'quarterly','2026-11-05',NULL),
 ('PG','Procter & Gamble','NYSE','NYSE','stock','listed',19.80,2.99,388000000000,'quarterly','2026-11-05',NULL),
 ('O','Realty Income Corp.','NYSE','NYSE','reit','listed',50.40,5.60,51000000000,'monthly','2026-11-05',NULL),
 ('VOO','Vanguard S&P 500 ETF','NYSE','NYSE Arca','etf','listed',24.00,1.30,1400000000000,'quarterly','2026-11-05',NULL),
 ('TSLA','Tesla Inc.','NASDAQ','NASDAQ','stock','listed',180.00,NULL,800000000000,NULL,'2026-11-05',NULL),
 ('RIVN','Rivian Automotive','NASDAQ','NASDAQ','stock','listed',NULL,NULL,12000000000,NULL,'2026-11-05',NULL),
 ('PDNW','Pordee New Co.','NASDAQ','NASDAQ','stock','listed',NULL,NULL,2000000000,NULL,'2026-11-05',NULL),
 ('OLDC','Old Corp.','NYSE','NYSE','stock','delisted',NULL,NULL,NULL,NULL,'2026-10-02','2026-10-02'),
 ('NSRGY','Nestlé ADR','OTC','OTC','stock','listed',NULL,NULL,NULL,NULL,NULL,NULL);

INSERT INTO gen VALUES
 ('AAPL',240,'generic'),('MSFT',420,'generic'),('NVDA',130,'generic'),('BRK.B',480,'generic'),('KO',68,'generic'),
 ('JNJ',155,'generic'),('PG',165,'generic'),('O',58,'generic'),('VOO',500,'generic'),('TSLA',250,'generic'),
 ('RIVN',12,'generic'),('PDNW',20,'pdnw'),('OLDC',3.20,'oldc'),('ZALR',200,'generic'),
 ('ZUP',200,'zup'),('ZDN',200,'zdn'),('ZGC',150,'cross'),('ZEQ',149,'cross'),('ZDC',50,'cross');

-- ZA01–ZA41: A = 125 + 5k · P/E 25 + k · ปันผล 0.05k · k คี่ NASDAQ
INSERT INTO stocks
SELECT 'ZA' || lpad(k::text, 2, '0'), 'Pordee Sample ' || lpad(k::text, 2, '0'),
       CASE WHEN k % 2 = 1 THEN 'NASDAQ' ELSE 'NYSE' END, CASE WHEN k % 2 = 1 THEN 'NASDAQ' ELSE 'NYSE' END,
       'stock', 'listed', 25.00 + k, 0.05 * k, (10 + k) * 1000000000::numeric, 'quarterly', '2026-11-05', NULL
FROM generate_series(1, 41) k;
INSERT INTO gen SELECT 'ZA' || lpad(k::text, 2, '0'), 125 + 5 * k, 'generic' FROM generate_series(1, 41) k;

INSERT INTO stocks VALUES
 ('ZALR','Pordee Alert Test','NASDAQ','NASDAQ','stock','listed',30.00,NULL,5000000000,NULL,'2026-11-05',NULL),
 ('ZUP','Pordee Up Only','NASDAQ','NASDAQ','stock','listed',40.00,NULL,5000000000,NULL,'2026-11-05',NULL),
 ('ZDN','Pordee Down Only','NASDAQ','NASDAQ','stock','listed',40.00,NULL,5000000000,NULL,'2026-11-05',NULL),
 ('ZGC','Pordee Golden Cross','NASDAQ','NASDAQ','stock','listed',40.00,NULL,5000000000,NULL,'2026-11-05',NULL),
 ('ZEQ','Pordee Equal Lines','NASDAQ','NASDAQ','stock','listed',40.00,NULL,5000000000,NULL,'2026-11-05',NULL),
 ('ZDC','Pordee Death Cross','NYSE','NYSE','stock','listed',40.00,NULL,5000000000,NULL,'2026-11-05',NULL);

INSERT INTO splits VALUES ('NVDA','2024-06-10',10,1);
INSERT INTO dividends (symbol, xd_date, pay_date, amount_per_share) VALUES
 ('JNJ','2026-11-24','2026-12-08',1.30), ('O','2026-11-30','2026-12-15',0.27), ('KO','2026-12-01','2026-12-15',0.51);

-- ---------- ราคารายวัน (TEST-DATA 4.2) ----------
CREATE TEMP TABLE tdays AS
SELECT dt, (row_number() OVER (ORDER BY dt))::int AS rn
FROM (SELECT gs::date AS dt FROM generate_series('2015-12-01'::date, '2026-12-31'::date, interval '1 day') gs
      WHERE extract(isodow FROM gs) < 6
        AND gs::date NOT IN (SELECT ny_date FROM market_calendar WHERE status = 'closed')) d;

CREATE FUNCTION pordee_gen_close(a numeric, i int) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN i > 0 THEN a
         ELSE round(a * (1 + 0.0002 * i + 0.005 * (ARRAY[0,1,2,1,0,-1,-2,-1])[((i % 8) + 8) % 8 + 1]), 4) END
$$;

CREATE TEMP TABLE series AS
WITH ai AS (SELECT rn AS r0 FROM tdays WHERE dt = '2026-11-05'),
     oi AS (SELECT rn AS r1 FROM tdays WHERE dt = '2026-10-02'),
     t AS (SELECT dt, rn - (SELECT r0 FROM ai) AS i, rn - (SELECT r1 FROM oi) AS io FROM tdays)
SELECT g.symbol, t.dt, t.i,
  CASE g.rule
    WHEN 'generic' THEN pordee_gen_close(g.anchor, t.i)
    WHEN 'pdnw'    THEN pordee_gen_close(g.anchor, t.i)
    WHEN 'oldc'    THEN pordee_gen_close(g.anchor, t.io)
    WHEN 'zup'     THEN CASE WHEN t.i > 0 THEN 200 ELSE 200 + 0.05 * t.i END
    WHEN 'zdn'     THEN CASE WHEN t.i > 0 THEN 200 ELSE 200 - 0.05 * t.i END
    WHEN 'cross'   THEN CASE WHEN t.i <= -50 THEN 100
                             WHEN t.i <= -1 THEN CASE WHEN g.symbol = 'ZDC' THEN 101 ELSE 99 END
                             ELSE g.anchor END
  END::numeric(14,4) AS close
FROM gen g CROSS JOIN t
WHERE (g.rule <> 'pdnw' OR t.i >= -39)
  AND (g.rule <> 'oldc' OR t.io <= 0);

INSERT INTO daily_prices (symbol, trade_date, open, high, low, close, volume)
SELECT symbol, dt, o, round(greatest(o, close) * 1.005, 4), round(least(o, close) * 0.995, 4), close,
       1000000 + 10000 * (((i % 7) + 7) % 7)
FROM (SELECT s.*, coalesce(lag(close) OVER (PARTITION BY symbol ORDER BY dt), close) AS o FROM series s) x;

-- NVDA: ราคาจริงก่อนวันแตกพาร์ = ราคาปรับ × 10
UPDATE daily_prices SET open = open * 10, high = high * 10, low = low * 10, close = close * 10
WHERE symbol = 'NVDA' AND trade_date < '2024-06-10';

-- ---------- ราคาระหว่างวัน AAPL รอบ 6 พ.ย. (TEST-DATA 4.3) ----------
INSERT INTO intraday_quotes VALUES
 ('AAPL','2026-11-06 21:30+07',240.00), ('AAPL','2026-11-06 21:35+07',240.50), ('AAPL','2026-11-06 21:40+07',240.80),
 ('AAPL','2026-11-06 21:45+07',241.00), ('AAPL','2026-11-06 21:50+07',241.50), ('AAPL','2026-11-06 21:55+07',241.80),
 ('AAPL','2026-11-06 22:00+07',242.00);

-- ---------- อัตราแลกเปลี่ยน (TEST-DATA 5) ----------
INSERT INTO fx_rates
SELECT gs::date, 35.0000, (gs::date + time '18:00') AT TIME ZONE 'Asia/Bangkok'
FROM generate_series('2015-12-01'::date, '2026-12-31'::date, interval '1 day') gs
WHERE extract(isodow FROM gs) < 6;
UPDATE fx_rates SET mid_rate = v.r FROM (VALUES
  ('2026-02-02'::date, 34.0000), ('2026-03-02'::date, 35.0000), ('2026-11-05'::date, 33.5000), ('2026-11-06'::date, 33.6000)
) v(d, r) WHERE rate_date = v.d;

INSERT INTO app_clock VALUES (1, NULL);

-- ==================== ข้อมูลลูกค้า (TEST-DATA 2, 6) ====================
CREATE FUNCTION pordee_reset(p_now timestamptz DEFAULT '2026-11-06 22:00:00+07') RETURNS void
LANGUAGE plpgsql AS $$
DECLARE h text := crypt('Pordee#2569', gen_salt('bf', 8));
BEGIN
  TRUNCATE users, sessions, subscriptions, watchlist_items, alerts, alert_events, email_outbox, transactions,
           holdings, dca_plans, dca_pending, dividend_receipts, study_history,
           feed_requests, quote_cache, feed_overrides RESTART IDENTITY CASCADE;
  UPDATE app_clock SET frozen_now = p_now WHERE id = 1;

  INSERT INTO users (id, email, password_hash, display_name, is_staff, pro_period_end, pro_auto_renew, big_font,
                     quiet_start, quiet_end, delete_requested_at, created_at) VALUES
   (1,'beam@pordee.test',h,'คุณบีม',false,NULL,false,false,NULL,NULL,NULL,'2026-01-10 10:00+07'),
   (2,'ploy@pordee.test',h,'คุณพลอย',false,'2026-11-19',true,false,'02:00','07:00',NULL,'2026-01-10 10:00+07'),
   (3,'somchai@pordee.test',h,'ลุงสมชาย',false,NULL,false,true,NULL,NULL,NULL,'2026-01-10 10:00+07'),
   (4,'jay@pordee.test',h,'น้องเจ',false,NULL,false,false,NULL,NULL,NULL,'2026-01-10 10:00+07'),
   (5,'nok@pordee.test',h,'คุณนก',false,'2026-10-31',false,false,NULL,NULL,NULL,'2026-01-10 10:00+07'),
   (6,'kan@pordee.test',h,'คุณกานต์',true,'2026-11-30',true,false,NULL,NULL,NULL,'2026-01-10 10:00+07'),
   (7,'mint@pordee.test',h,'คุณมิ้นท์',false,'2026-11-09',true,false,NULL,NULL,NULL,'2026-01-10 10:00+07'),
   (8,'nam@pordee.test',h,'คุณน้ำ',false,'2026-11-09',false,false,NULL,NULL,NULL,'2026-01-10 10:00+07'),
   (9,'fon@pordee.test',h,'คุณฝน',false,NULL,false,false,NULL,NULL,NULL,'2026-01-10 10:00+07'),
   (10,'del1@pordee.test',h,'ขอลบใหม่',false,NULL,false,false,NULL,NULL,'2026-11-05 10:00+07','2026-01-10 10:00+07'),
   (11,'del2@pordee.test',h,'ขอลบเก่า',false,NULL,false,false,NULL,NULL,'2026-10-07 10:00+07','2026-01-10 10:00+07');
  PERFORM setval('users_id_seq', 11);

  INSERT INTO subscriptions (user_id, period_start, period_end, amount_thb, cancelled_at, created_at) VALUES
   (2,'2026-10-20','2026-11-19',199.00,NULL,'2026-10-20 09:00+07'),
   (5,'2026-10-01','2026-10-31',199.00,NULL,'2026-10-01 09:00+07'),
   (6,'2026-11-01','2026-11-30',199.00,NULL,'2026-11-01 09:00+07'),
   (7,'2026-10-10','2026-11-09',199.00,NULL,'2026-10-10 09:00+07'),
   (8,'2026-10-10','2026-11-09',199.00,'2026-10-20 09:00+07','2026-10-10 09:00+07');

  -- รายการเฝ้าดูตามลำดับที่เพิ่ม
  INSERT INTO watchlist_items (user_id, symbol, position, added_at)
  SELECT u, s, ord, '2026-10-01 09:00+07'::timestamptz + (ord || ' minutes')::interval
  FROM (VALUES
    (1, ARRAY['VOO','AAPL','MSFT','NVDA','KO','JNJ','PG','TSLA','BRK.B']),
    (2, ARRAY['AAPL','MSFT','NVDA','TSLA','VOO','ZALR','ZUP','ZDN','ZGC'] || (SELECT array_agg('ZA'||lpad(k::text,2,'0') ORDER BY k) FROM generate_series(1,41) k)),
    (3, ARRAY['KO','JNJ','PG','O','VOO','AAPL','MSFT','BRK.B','ZA01','ZA02']),
    (4, ARRAY['AAPL','MSFT','NVDA','TSLA']),
    (5, ARRAY['AAPL','MSFT','NVDA','TSLA','VOO','KO','JNJ','PG','O','BRK.B','ZA01','ZA02']),
    (6, ARRAY['AAPL','MSFT','VOO','KO','JNJ']),
    (7, ARRAY['AAPL','MSFT','NVDA','TSLA','VOO','KO','JNJ','PG'] || (SELECT array_agg('ZA'||lpad(k::text,2,'0') ORDER BY k) FROM generate_series(1,41) k)),
    (8, ARRAY['AAPL','VOO','KO']),
    (10, ARRAY['AAPL','VOO']),
    (11, ARRAY['AAPL','VOO'])
  ) v(u, arr), unnest(arr) WITH ORDINALITY AS x(s, ord);

  -- แจ้งเตือน
  INSERT INTO alerts (user_id, symbol, kind, target_price, direction, created_at) VALUES
   (1,'VOO','pct',NULL,NULL,'2026-10-02 09:00+07'), (1,'AAPL','target',260.00,'up','2026-10-02 09:01+07'),
   (2,'AAPL','target',250.00,'up','2026-10-21 09:00+07'), (2,'ZALR','pct',NULL,NULL,'2026-10-21 09:01+07'),
   (5,'AAPL','pct',NULL,NULL,'2026-10-02 09:00+07'), (5,'MSFT','pct',NULL,NULL,'2026-10-02 09:01+07'),
   (5,'NVDA','pct',NULL,NULL,'2026-10-02 09:02+07');
  INSERT INTO alerts (user_id, symbol, kind, created_at)
  SELECT 2, 'ZA'||lpad(k::text,2,'0'), 'pct', '2026-10-22 09:00+07'::timestamptz + (k || ' minutes')::interval FROM generate_series(1,18) k;
  INSERT INTO alerts (user_id, symbol, kind, created_at)
  SELECT 7, 'ZA'||lpad(k::text,2,'0'), 'pct', '2026-10-12 09:00+07'::timestamptz + (k || ' minutes')::interval FROM generate_series(1,19) k;

  -- รายการซื้อขาย (ค่าธรรมเนียม 0.15% ขั้นต่ำ $1 · อัตราของวันซื้อ)
  INSERT INTO transactions (user_id, symbol, side, trade_date, shares, price, fee_usd, fx_rate, source, created_at) VALUES
   (1,'ZA01','buy','2026-02-02',10,100.00,1.50,34.0000,'manual','2026-02-02 23:00+07'),
   (1,'ZA01','buy','2026-03-02',10,140.00,2.10,35.0000,'manual','2026-03-02 23:00+07'),
   (1,'VOO','buy','2026-02-02',1,480.00,1.00,34.0000,'manual','2026-02-03 08:00+07'),
   (1,'VOO','buy','2026-03-02',1,490.00,1.00,35.0000,'manual','2026-03-03 08:00+07'),
   (3,'KO','buy','2026-02-02',100,60.00,9.00,34.0000,'manual','2026-02-02 23:00+07'),
   (3,'JNJ','buy','2026-02-02',50,150.00,11.25,34.0000,'manual','2026-02-02 23:00+07'),
   (3,'PG','buy','2026-02-02',40,160.00,9.60,34.0000,'manual','2026-02-02 23:00+07'),
   (3,'O','buy','2026-02-02',200,55.00,16.50,34.0000,'manual','2026-02-02 23:00+07'),
   (3,'VOO','buy','2026-02-02',10,450.00,6.75,34.0000,'manual','2026-02-02 23:00+07');
  INSERT INTO holdings (user_id, symbol, shares, cost_usd, cost_thb, realized_usd)
  SELECT user_id, symbol, sum(shares), sum(round(shares * price, 2) + fee_usd),
         sum(round((round(shares * price, 2) + fee_usd) * fx_rate, 2)), 0
  FROM transactions GROUP BY user_id, symbol;

  INSERT INTO dca_plans (user_id, symbol, amount_thb, day_of_month, active, created_at)
  VALUES (1,'VOO',5000.00,25,true,'2026-10-30 09:00+07');

  INSERT INTO study_history (user_id, kind, params, created_at)
  SELECT 4, 'compare', jsonb_build_object('symbols', jsonb_build_array('AAPL','MSFT'), 'from', '2026-01-02', 'to', '2026-09-30'),
         ('2026-10-' || lpad(d::text, 2, '0') || ' 20:00+07')::timestamptz
  FROM generate_series(1, 20) d;
END $$;

SELECT pordee_reset();
