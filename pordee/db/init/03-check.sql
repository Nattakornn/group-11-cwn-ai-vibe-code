-- ตรวจ seed ให้ตรง TEST-DATA ส่วนที่ 8 และค่าตัวอย่างสูตร 4.2 · ไม่ตรง = หยุด init
DO $$
DECLARE r record; bad text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('users', (SELECT count(*) FROM users), 11),
    ('watchlist_items', (SELECT count(*) FROM watchlist_items), 146),
    ('alerts', (SELECT count(*) FROM alerts), 44),
    ('transactions', (SELECT count(*) FROM transactions), 9),
    ('stocks (60 + NSRGY)', (SELECT count(*) FROM stocks), 61),
    ('daily_prices', (SELECT count(*) FROM daily_prices), 170585),
    ('market_calendar', (SELECT count(*) FROM market_calendar), 5),
    ('dividends', (SELECT count(*) FROM dividends), 3),
    ('intraday_quotes', (SELECT count(*) FROM intraday_quotes), 7)
  ) v(name, got, want) LOOP
    IF r.got <> r.want THEN bad := bad || format('%s=%s (ต้องเป็น %s); ', r.name, r.got, r.want); END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES
    ('AAPL 2026-11-04', (SELECT close FROM daily_prices WHERE symbol='AAPL' AND trade_date='2026-11-04'), 238.7520),
    ('AAPL 2026-10-30', (SELECT close FROM daily_prices WHERE symbol='AAPL' AND trade_date='2026-10-30'), 239.8080),
    ('AAPL 2026-11-05', (SELECT close FROM daily_prices WHERE symbol='AAPL' AND trade_date='2026-11-05'), 240.0000),
    ('NVDA 2024-06-07 ราคาจริง', (SELECT close FROM daily_prices WHERE symbol='NVDA' AND trade_date='2024-06-07'), 1142.9600),
    ('NVDA 2024-06-10', (SELECT close FROM daily_prices WHERE symbol='NVDA' AND trade_date='2024-06-10'), 113.6720),
    ('ZA01 ต้นทุน $', (SELECT cost_usd FROM holdings WHERE user_id=1 AND symbol='ZA01'), 2403.60),
    ('ZA01 ต้นทุน ฿', (SELECT cost_thb FROM holdings WHERE user_id=1 AND symbol='ZA01'), 83124.50),
    ('VOO ต้นทุน ฿ คุณบีม', (SELECT cost_thb FROM holdings WHERE user_id=1 AND symbol='VOO'), 33539.00),
    ('PDNW จำนวนวัน', (SELECT count(*)::numeric FROM daily_prices WHERE symbol='PDNW' AND trade_date <= '2026-11-05'), 40),
    ('อัตรา 2026-11-06', (SELECT mid_rate FROM fx_rates WHERE rate_date='2026-11-06'), 33.6000)
  ) v(name, got, want) LOOP
    IF r.got IS DISTINCT FROM r.want THEN bad := bad || format('%s=%s (ต้องเป็น %s); ', r.name, r.got, r.want); END IF;
  END LOOP;
  IF bad <> '' THEN RAISE EXCEPTION 'seed ไม่ตรง TEST-DATA: %', bad; END IF;
  RAISE NOTICE 'seed ตรง TEST-DATA ทุกค่าที่ตรวจ';
END $$;
