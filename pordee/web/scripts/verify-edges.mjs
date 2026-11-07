#!/usr/bin/env node
// V2 ผู้ตรวจกฎ · ยิง API ตามทุกแถว "ทดสอบที่: เว็บ" ใน TEST-DATA ส่วนที่ 7 (141 แถว)
// ผลที่คาดหวังมาจาก ../TEST-DATA.md เท่านั้น
// ใช้: BASE_URL=http://localhost:3302 node scripts/verify-edges.mjs [E01 E32 ...]
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE_URL || 'http://localhost:3302').replace(/\/$/, '');
const PASSWORD = 'Pordee#2569';
const ONLY = new Set(process.argv.slice(2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- HTTP ----------
async function http(method, path, { body, cookie, raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await res.text();
  let json = null;
  if (!raw) { try { json = JSON.parse(text); } catch { /* not json */ } }
  return { status: res.status, json, text, headers: res.headers };
}
const th = (s) => new Date(s.replace(' ', 'T') + (s.length <= 16 ? ':00' : '') + '+07:00').toISOString();
async function reset(now) { const r = await http('POST', '/api/test/reset', { body: now ? { now: th(now) } : {} }); if (r.status !== 200) throw new Error('reset ' + r.status); }
async function clock(now) { const r = await http('POST', '/api/test/clock', { body: { now: th(now) } }); if (r.status !== 200) throw new Error('clock ' + r.status + ' ' + r.text); }
async function feed(symbol, mode, price, clearCache = true) {
  const r = await http('POST', '/api/test/feed', { body: { symbol, mode, ...(price !== undefined ? { price: String(price) } : {}), clearCache } });
  if (r.status !== 200) throw new Error('feed ' + r.status + ' ' + r.text);
}
async function tick() { const r = await http('POST', '/api/test/tick', { body: {} }); if (r.status !== 200) throw new Error('tick ' + r.status); return r.json; }
const job = (t, name) => t.jobs.find((j) => j.name === name);

async function login(user) {
  const email = user.includes('@') ? user : `${user}@pordee.test`;
  const r = await http('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  if (r.status !== 200) { const e = new Error(`login ${email} → ${r.status}`); e.res = r; throw e; }
  const sc = r.headers.get('set-cookie') || '';
  const cookie = sc.split(';')[0];
  return {
    cookie,
    get: (p) => http('GET', p, { cookie }),
    post: (p, b = {}) => http('POST', p, { body: b, cookie }),
    del: (p) => http('DELETE', p, { cookie }),
    raw: (p) => http('GET', p, { cookie, raw: true }),
  };
}
const anon = { get: (p) => http('GET', p), post: (p, b = {}) => http('POST', p, { body: b }) };
async function quota() { const k = await login('kan'); const r = await k.get('/api/staff/feed-status'); return r.json; }
const stock = (sym, who = anon) => who.get(`/api/stocks/${encodeURIComponent(sym)}`);

// ---------- ตรวจ ----------
class Fail extends Error {}
class Skip extends Error {}
const notes = [];
function ok(cond, msg) { if (!cond) throw new Fail(msg); notes.push(msg); }
function eq(actual, expected, label) {
  if (actual !== expected) throw new Fail(`${label}: ได้ ${JSON.stringify(actual)} คาด ${JSON.stringify(expected)}`);
  notes.push(`${label}=${expected}`);
}
const n2 = (v) => (v === null || v === undefined ? v : Number(v).toFixed(2));
const n4 = (v) => (v === null || v === undefined ? v : Number(v).toFixed(4));
const r2 = (v) => { // ปัดครึ่งขึ้นจาก string decimal (ใช้แสดง %)
  if (v === null || v === undefined) return v;
  const neg = String(v).startsWith('-'); const s = String(v).replace('-', '');
  const [i, f = ''] = s.split('.'); const f3 = (f + '000').slice(0, 3);
  let cents = BigInt(i + f3.slice(0, 2)); if (Number(f3[2]) >= 5) cents += 1n;
  const str = (cents / 100n).toString() + '.' + (cents % 100n).toString().padStart(2, '0');
  return (neg && cents !== 0n ? '-' : '') + str;
};

// สถานะตลาด: API + ข้อความบนหน้าเว็บ (แถบตลาดใน layout)
async function marketAt(now) {
  await clock(now);
  const api = (await http('GET', '/api/market/status')).json;
  const html = (await http('GET', '/th/learn', { raw: true })).text;
  const m = html.match(/data-testid="core-market-status"[^>]*>([^<]*)</);
  const n = html.match(/data-testid="core-market-next"[^>]*>([^<]*(?:<!-- -->[^<]*)*)</);
  return { api, text: m ? m[1] : null, next: n ? n[1].replace(/<!-- -->/g, '') : null, html };
}
function marketRow(cases) {
  return async () => {
    await reset();
    for (const [now, want] of cases) {
      const s = await marketAt(now);
      eq(s.api.open, want === 'ตลาดเปิด', `${now} api.open`);
      eq(s.text, want, `${now} หน้าเว็บ`);
    }
  };
}

// ---------- แถว ----------
const R = {};
const SKIP = {};

// 7.1 ค้นหา
R.E01 = async () => { await reset(); const r = (await anon.get('/api/stocks?q=AAPL')).json; eq(r.results[0]?.symbol, 'AAPL', 'ผลแรก'); eq(r.results[0]?.name, 'Apple Inc.', 'ชื่อ'); eq(r.results[0]?.exchangeLabel, 'NASDAQ', 'ตลาด'); };
R.E02 = async () => { await reset(); const r = (await anon.get('/api/stocks?q=VOO')).json; eq(r.results[0]?.symbol, 'VOO', 'ผลแรก'); ok(/NYSE/.test(r.results[0]?.exchangeLabel || ''), `ตลาด ${r.results[0]?.exchangeLabel} มี NYSE`); };
R.E03 = async () => { await reset(); const r = (await anon.get('/api/stocks?q=NSRGY')).json; eq(r.results.length, 0, 'จำนวนผล'); eq(r.notice?.message, 'ไม่รองรับหุ้นนอกตลาด NYSE / NASDAQ', 'notice'); };
R.E04 = async () => { await reset(); const r = (await anon.get('/api/stocks?q=OLDC')).json; eq(r.results.length, 0, 'จำนวนผล'); eq(r.notice?.message, 'ไม่พบหุ้นนี้', 'notice'); };
R.E05 = async () => { await reset(); const r = (await anon.get('/api/stocks?q=brk-b')).json; eq(r.results[0]?.symbol, 'BRK.B', 'ผลแรก'); };
R.E06 = async () => { await reset(); const r = (await anon.get('/api/stocks?q=Apple')).json; eq(r.results[0]?.symbol, 'AAPL', 'ผลแรก'); };

R.E07 = marketRow([['2026-11-09 21:29:59', 'ตลาดปิด']]);
R.E08 = marketRow([['2026-11-09 21:30:00', 'ตลาดเปิด']]);
R.E09 = marketRow([['2026-11-09 21:31:00', 'ตลาดเปิด']]);
R.E10 = marketRow([['2026-11-10 03:59:59', 'ตลาดเปิด']]);
R.E11 = marketRow([['2026-11-10 04:00:00', 'ตลาดปิด']]);
R.E12 = marketRow([['2026-11-10 04:01:00', 'ตลาดปิด']]);
R.E13 = marketRow([['2026-04-07 20:29:59', 'ตลาดปิด']]);
R.E14 = marketRow([['2026-04-07 20:30:00', 'ตลาดเปิด']]);
R.E15 = marketRow([['2026-04-08 02:59:59', 'ตลาดเปิด']]);
R.E16 = marketRow([['2026-04-08 03:00:00', 'ตลาดปิด']]);
R.E17 = async () => {
  await reset(); const s = await marketAt('2026-03-06 20:30:00');
  eq(s.api.open, false, 'api.open'); eq(s.text, 'ตลาดปิด', 'หน้าเว็บ');
  eq(s.api.nextOpen, th('2026-03-06 21:30:00'), 'nextOpen (เปิด 21:30)');
};
R.E18 = marketRow([['2026-03-09 20:30:00', 'ตลาดเปิด']]);
R.E19 = marketRow([['2026-10-30 20:30:00', 'ตลาดเปิด']]);
R.E20 = marketRow([['2026-11-02 20:30:00', 'ตลาดปิด'], ['2026-11-02 21:30:00', 'ตลาดเปิด']]);
R.E21 = marketRow([['2026-11-25 22:00', 'ตลาดเปิด']]);
R.E22 = async () => {
  await reset(); const s = await marketAt('2026-11-26 22:00');
  eq(s.api.open, false, 'api.open'); eq(s.text, 'ตลาดปิด', 'หน้าเว็บ');
  eq(s.api.nextOpen, th('2026-11-27 21:30:00'), 'nextOpen');
  ok(s.next && s.next.includes('27') && s.next.includes('21:30'), `ข้อความเปิดครั้งถัดไป "${s.next}" มี 27 และ 21:30`);
};
R.E23 = async () => {
  await reset(); const s = await marketAt('2026-11-27 22:00');
  eq(s.api.open, true, 'api.open'); eq(s.api.earlyClose, true, 'earlyClose');
  eq(s.api.closesAt, th('2026-11-28 01:00:00'), 'closesAt');
  eq(s.text, 'ปิดเร็ววันนี้ 01:00 น.', 'หน้าเว็บ');
};
R.E24 = marketRow([['2026-12-25 22:00', 'ตลาดปิด']]);
R.E26 = marketRow([['2026-11-28 01:00:00', 'ตลาดปิด']]);
R.E28 = marketRow([['2026-11-14 03:59:59', 'ตลาดเปิด']]);
R.E29 = marketRow([['2026-11-14 04:00:00', 'ตลาดปิด']]);
R.E30 = marketRow([['2026-11-14 21:30:00', 'ตลาดปิด']]);
R.E31 = marketRow([['2026-11-16 21:30:00', 'ตลาดเปิด']]);
// ปิดเร็ว: หน้าเว็บแสดง "ปิดเร็ววันนี้" แทน "ตลาดเปิด" ตอนเปิดอยู่ (E23) → E25 / E27 เช็กสถานะ "เปิด" จาก API + ข้อความขึ้นต้นด้วย ปิดเร็ว
for (const id of ['E25', 'E27']) {
  const cases = id === 'E25' ? [['2026-11-28 00:59:59', 'ตลาดเปิด']] : [['2026-12-25 00:59:59', 'ตลาดเปิด'], ['2026-12-25 01:00:00', 'ตลาดปิด']];
  R[id] = async () => {
    await reset();
    for (const [now, want] of cases) {
      const s = await marketAt(now);
      eq(s.api.open, want === 'ตลาดเปิด', `${now} api.open`);
      if (want === 'ตลาดเปิด') ok(s.text === 'ตลาดเปิด' || /^ปิดเร็ววันนี้/.test(s.text || ''), `${now} หน้าเว็บ "${s.text}" (เปิดอยู่ วันปิดเร็ว)`);
      else eq(s.text, want, `${now} หน้าเว็บ`);
    }
  };
}

// 7.2 ราคา ที่พัก โควตา
async function e32Chain() { await reset(); return (await stock('AAPL')).json.quote; }
R.E32 = async () => {
  const q = await e32Chain();
  eq(q.price, '241.0000', 'ราคา'); eq(q.asOf, th('2026-11-06 21:45:00'), 'asOf 21:45');
  eq(q.prevClose, '240.0000', 'ปิดวันก่อน'); eq(n2(q.change), '1.00', 'เปลี่ยน'); eq(r2(q.changePct), '0.42', '%');
  eq(q.stale, false, 'stale');
};
R.E33 = async () => { await reset(); await clock('2026-11-06 21:59:59'); const q = (await stock('AAPL')).json.quote; eq(q.price, '240.8000', 'ราคา'); eq(q.asOf, th('2026-11-06 21:40:00'), 'asOf 21:40'); };
R.E34 = async () => { await reset(); await clock('2026-11-06 22:00:01'); const q = (await stock('AAPL')).json.quote; eq(q.price, '241.0000', 'ราคา'); eq(q.asOf, th('2026-11-06 21:45:00'), 'asOf 21:45'); };
R.E35 = async () => { await e32Chain(); await clock('2026-11-06 22:14:59'); const q = (await stock('AAPL')).json.quote; eq(q.price, '241.0000', 'ราคา'); eq(q.asOf, th('2026-11-06 21:45:00'), 'asOf'); eq((await quota()).dayUsed, 1, 'โควตาวันนี้'); };
R.E36 = async () => { await e32Chain(); await clock('2026-11-06 22:15:00'); const q = (await stock('AAPL')).json.quote; eq(q.price, '241.0000', 'ราคา'); eq(q.asOf, th('2026-11-06 21:45:00'), 'asOf'); eq(q.stale, true, 'ป้ายข้อมูลไม่อัปเดต'); eq((await quota()).dayUsed, 1, 'โควตา'); };
R.E37 = async () => { await e32Chain(); await clock('2026-11-06 22:15:01'); const q = (await stock('AAPL')).json.quote; eq(q.price, '242.0000', 'ราคา'); eq(q.asOf, th('2026-11-06 22:00:00'), 'asOf 22:00'); eq(q.stale, false, 'ไม่มีป้าย'); eq((await quota()).dayUsed, 2, 'โควตา'); };
async function e38Chain() {
  await reset(); const out = [];
  const syms = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'VOO'];
  for (let i = 0; i < 5; i++) { await clock(`2026-11-06 22:00:${String(i * 10).padStart(2, '0')}`); out.push((await stock(syms[i])).json.quote); }
  return out;
}
R.E38 = async () => { const qs = await e38Chain(); for (const q of qs) eq(q.stale, false, `${q.symbol} ได้ราคาใหม่ (stale)`); eq((await quota()).minuteUsed, 5, 'โควตานาทีนี้'); };
R.E39 = async () => { await e38Chain(); await clock('2026-11-06 22:00:50'); const q = (await stock('KO')).json.quote; eq(q.price, '68.0000', 'ราคาปิด'); eq(q.stale, true, 'ป้าย'); const qq = await quota(); eq(qq.minuteUsed, 5, 'โควตานาที'); eq(qq.dayUsed, 5, 'โควตาวัน'); };
R.E40 = async () => { await e38Chain(); await clock('2026-11-06 22:00:50'); await stock('KO'); await clock('2026-11-06 22:01:01'); const q = (await stock('KO')).json.quote; eq(q.price, '68.0000', 'ราคา'); eq(q.asOf, th('2026-11-06 21:45:00'), 'asOf 21:45'); eq(q.stale, false, 'ไม่มีป้าย'); };
R.E44 = async () => { await reset(); await feed('AAPL', 'price', '0.01'); const q = (await stock('AAPL')).json.quote; eq(q.price, '0.0100', 'ราคา'); eq(q.stale, false, 'ไม่มีป้าย'); };
async function badPrice(mode, price) {
  await reset(); await feed('AAPL', mode, price); const q = (await stock('AAPL')).json.quote;
  eq(q.price, '240.0000', 'แสดงราคาปิด'); eq(q.stale, true, 'ป้าย'); ok(q.changePct === null || Number(q.changePct) > -100, `ไม่แสดง -100% (${q.changePct})`);
}
R.E45 = () => badPrice('zero');
R.E46 = () => badPrice('price', '-1');
R.E47 = async () => { await e32Chain(); await clock('2026-11-06 22:14:59'); const q = (await stock('AAPL')).json.quote; eq(q.stale, false, 'ไม่มีป้าย'); };
async function e48Chain() { await e32Chain(); await feed('AAPL', 'timeout', undefined, false); await clock('2026-11-06 22:15:00'); return (await stock('AAPL')).json.quote; }
R.E48 = async () => { const q = await e48Chain(); eq(q.stale, true, 'ป้าย'); eq(q.price, '241.0000', 'ราคา'); };
R.E49 = async () => { await e48Chain(); await clock('2026-11-06 22:15:01'); const q = (await stock('AAPL')).json.quote; eq(q.price, '241.0000', 'ราคา'); eq(q.asOf, th('2026-11-06 21:45:00'), 'asOf'); eq(q.stale, true, 'ป้าย'); eq((await quota()).dayUsed, 2, 'โควตา +1'); };
const PAGES = ['', '/learn', '/search?q=AAPL', '/stocks/AAPL', '/stocks/OLDC', '/watchlist', '/alerts', '/inbox', '/outbox', '/portfolio', '/dividends', '/study', '/study/screener', '/study/compare', '/study/backtest', '/study/history', '/login', '/signup', '/account', '/staff'];
R.E50 = async () => {
  await reset(); await feed('*', 'timeout');
  const bad = [];
  for (const who of [null, 'beam', 'kan']) {
    const c = who ? await login(who) : null;
    for (const lang of ['th', 'en']) for (const p of PAGES) {
      let r = await http('GET', `/${lang}${p}`, { cookie: c?.cookie, raw: true });
      for (let hop = 0; hop < 3 && r.status >= 300 && r.status < 400; hop++) r = await http('GET', new URL(r.headers.get('location'), BASE).pathname, { cookie: c?.cookie, raw: true });
      if (r.status !== 200 || /data-testid="(error-page|global-error-page)"/.test(r.text)) bad.push(`${who || 'guest'} /${lang}${p} ${r.status}`);
    }
  }
  for (const api of ['/api/stocks/AAPL', '/api/market/status']) { const r = await anon.get(api); if (r.status !== 200) bad.push(`${api} ${r.status}`); }
  const b = await login('beam'); for (const api of ['/api/watchlist', '/api/portfolio']) { const r = await b.get(api); if (r.status !== 200) bad.push(`${api} ${r.status}`); }
  ok(bad.length === 0, `ทุกหน้า 200 ไม่มีหน้า error (${PAGES.length * 6} หน้า + API)${bad.length ? ' · พัง: ' + bad.join(', ') : ''}`);
};

// 7.3 สิทธิ์
R.E51 = async () => { await reset(); const u = await login('beam'); const r = await u.post('/api/watchlist', { symbol: 'ZA01' }); eq(r.status, 201, 'status'); eq(`${r.json.used}/${r.json.limit}`, '10/10', 'รายการเฝ้าดู'); };
R.E52 = async () => { await reset(); const u = await login('somchai'); const r = await u.post('/api/watchlist', { symbol: 'ZA03' }); eq(r.status, 409, 'status'); eq(r.json.error?.message, 'รายการเฝ้าดูครบ 10 ตัวแล้ว (Free)', 'ข้อความ'); };
R.E53 = async () => { await reset(); const u = await login('mint'); const r = await u.post('/api/watchlist', { symbol: 'O' }); eq(r.status, 201, 'status'); eq(`${r.json.used}/${r.json.limit}`, '50/50', 'รายการเฝ้าดู'); };
R.E54 = async () => { await reset(); const u = await login('ploy'); const r = await u.post('/api/watchlist', { symbol: 'KO' }); eq(r.status, 409, 'status'); eq(r.json.error?.message, 'รายการเฝ้าดูครบ 50 ตัวแล้ว (Pro)', 'ข้อความ'); };
R.E55 = async () => {
  await reset(); const u = await login('nok'); const r = (await u.get('/api/watchlist')).json; const it = r.items;
  eq(it[8]?.symbol, 'O', 'ตัวที่ 9'); eq(it[8]?.quote?.price, '58.0000', 'O ราคา');
  eq(it[9]?.symbol, 'BRK.B', 'ตัวที่ 10'); eq(it[9]?.quote?.price, '480.0000', 'BRK.B ราคา');
  for (const i of [10, 11]) { eq(it[i]?.proOnly, true, `${it[i]?.symbol} เฉพาะ Pro`); eq(it[i]?.quote, null, `${it[i]?.symbol} ไม่มีราคา`); }
  eq(it[10]?.symbol, 'ZA01', 'ตัวที่ 11'); eq(it[11]?.symbol, 'ZA02', 'ตัวที่ 12');
};
R.E56 = async () => {
  await reset(); const u = await login('nok');
  eq((await u.post('/api/watchlist', { symbol: 'ZA03' })).status, 409, '12 ตัว เพิ่ม');
  await u.del('/api/watchlist/ZA01'); await u.del('/api/watchlist/ZA02');
  eq((await u.post('/api/watchlist', { symbol: 'ZA03' })).status, 409, '10 ตัว เพิ่ม');
  await u.del('/api/watchlist/BRK.B');
  eq((await u.post('/api/watchlist', { symbol: 'ZA03' })).status, 201, '9 ตัว เพิ่ม');
};
R.E57 = async () => { await reset(); const u = await login('beam'); const r = await u.post('/api/alerts', { symbol: 'MSFT', kind: 'pct' }); eq(r.status, 201, 'status'); };
R.E58 = async () => { await reset(); const u = await login('nok'); const r = await u.post('/api/alerts', { symbol: 'TSLA', kind: 'target', targetPrice: '300.00' }); eq(r.status, 409, 'status'); eq(r.json.error?.message, 'ตั้งแจ้งเตือนครบ 3 รายการแล้ว (Free)', 'ข้อความ'); };
R.E59 = async () => { await reset(); const u = await login('mint'); const r = await u.post('/api/alerts', { symbol: 'ZA20', kind: 'pct' }); eq(r.status, 201, 'status'); };
R.E60 = async () => { await reset(); const u = await login('ploy'); const r = await u.post('/api/alerts', { symbol: 'KO', kind: 'pct' }); eq(r.status, 409, 'status'); };
R.E61 = async () => {
  await reset(); const u = await login('beam');
  eq((await u.get('/api/stocks/AAPL/candles?from=2025-11-07')).status, 200, '2025-11-07');
  eq((await u.get('/api/stocks/AAPL/candles?from=2025-11-06')).status, 200, '2025-11-06');
  const r = await u.get('/api/stocks/AAPL/candles?from=2025-11-05'); eq(r.status, 403, '2025-11-05');
  eq(r.json.error?.message, 'ระดับ Free ดูย้อนหลังได้ถึง 6 พ.ย. 2568', 'ข้อความ');
};
R.E62 = async () => {
  await reset(); const u = await login('ploy');
  eq((await u.get('/api/stocks/AAPL/candles?from=2016-11-07&to=2016-12-31')).status, 200, '2016-11-07');
  const r = await u.get('/api/stocks/AAPL/candles?from=2016-11-06&to=2016-12-31'); eq(r.status, 200, '2016-11-06'); eq(r.json.bars[0]?.date, '2016-11-07', 'แท่งแรก');
  eq((await u.get('/api/stocks/AAPL/candles?from=2016-11-05&to=2016-12-31')).status, 403, '2016-11-05');
};
R.E63 = async () => {
  await reset(); const u = await login('mint');
  await clock('2026-11-09 23:59:59'); eq((await u.get('/api/me')).json.user.tier, 'pro', '23:59:59 ระดับ');
  await clock('2026-11-10 00:00:00'); const t = await tick();
  const me = (await u.get('/api/me')).json.user; eq(me.tier, 'pro', '00:00 ระดับ'); eq(me.proPeriodEnd, '2026-12-09', 'สิ้นรอบใหม่');
  const ren = job(t, 'renew').result.renewed; const mine = ren.filter((x) => (x.userId ?? x.user_id ?? x) === 7);
  eq(mine.length, 1, 'subscriptions ใหม่ของ U07 (ผล tick renew)');
  const s = JSON.stringify(mine[0]); ok(!/amount/i.test(s) || /199\.00/.test(s), `฿199.00 (${s})`);
  if (typeof mine[0] === 'object') { const ps = mine[0].periodStart ?? mine[0].period_start; if (ps) eq(ps, '2026-11-10', 'เริ่มรอบใหม่'); }
};
R.E65 = async () => {
  await reset(); const u = await login('nam'); await clock('2026-11-09 22:00'); eq((await u.get('/api/me')).json.user.tier, 'pro', 'ระดับ');
  // TEST-DATA E65 แก้หลัง LAB 6: นับ 10 ปีจากวันนี้ (9 พ.ย. 2569) → 2016-11-09 ได้ · 2016-11-08 ไม่ได้
  eq((await u.get('/api/stocks/AAPL/candles?from=2016-11-09&to=2016-12-31')).status, 200, '2016-11-09');
  eq((await u.get('/api/stocks/AAPL/candles?from=2016-11-08&to=2016-12-31')).status, 403, '2016-11-08');
  notes.push('ย้อนหลัง 2016-11-09=200 · 2016-11-08=403');
};
R.E66 = async () => {
  await reset(); const u = await login('nam'); await clock('2026-11-10 00:00:00'); const t = await tick();
  eq((await u.get('/api/me')).json.user.tier, 'free', 'ระดับ');
  const ren = job(t, 'renew').result.renewed; eq(ren.filter((x) => (x.userId ?? x.user_id ?? x) === 8).length, 0, 'ไม่มี subscriptions ใหม่ของ U08');
};
R.E67 = async () => { await reset(); const u = await login('nam'); await clock('2026-11-11 12:00'); eq((await u.get('/api/me')).json.user.tier, 'free', 'ระดับ'); };
R.E68 = async () => {
  await reset(); const u = await login('ploy');
  const a = await u.post('/api/backtest', { symbol: 'VOO', monthlyUsd: '100', fromMonth: '2016-11', toMonth: '2026-10' }); eq(a.status, 200, '120 เดือน'); eq(a.json.months, 120, 'months');
  const b = await u.post('/api/backtest', { symbol: 'VOO', monthlyUsd: '100', fromMonth: '2016-10', toMonth: '2026-10' }); eq(b.status, 400, '121 เดือน'); eq(b.json.error?.code, 'RANGE_TOO_LONG', 'code');
};
R.E69 = async () => { await reset(); const u = await login('jay'); const r = await u.post('/api/backtest', { symbol: 'VOO', monthlyUsd: '100', fromMonth: '2025-11', toMonth: '2026-10' }); eq(r.status, 403, 'status'); eq(r.json.error?.code, 'PRO_ONLY', 'code'); eq(r.json.error?.message, 'ฟีเจอร์นี้สำหรับสมาชิก Pro', 'ข้อความ'); };
R.E70 = async () => {
  await reset(); const b = await login('beam'); eq((await b.raw('/api/export?symbol=AAPL&from=2025-11-06')).status, 403, 'U01 ปฏิเสธ');
  const p = await login('ploy'); const r = await p.raw('/api/export?symbol=AAPL&from=2025-11-06'); eq(r.status, 200, 'U02 ได้ไฟล์');
  const lines = r.text.replace(/^﻿/, '').split(/\r?\n/);
  ok(lines[0].includes('Pordee Mock Feed'), `บรรทัดแรก "${lines[0]}" มีแหล่งที่มา`);
  ok(r.text.slice(0, 300).includes('ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน'), 'มีข้อความเตือน');
};

// 7.4 กราฟและตัวชี้วัด
const ind = (sym, who = anon, qs = '') => who.get(`/api/stocks/${sym}/indicators${qs}`);
R.E71 = async () => {
  await reset(); const r = (await ind('PDNW')).json;
  eq(r.notEnough.sma50, true, 'notEnough.sma50'); eq(r.notEnough.sma200, true, 'notEnough.sma200'); eq(r.sma50.length, 0, 'เส้น 50'); eq(r.sma200.length, 0, 'เส้น 200');
  const html = (await http('GET', '/th/stocks/PDNW', { raw: true })).text;
  ok(html.includes('ข้อมูลไม่พอ (ต้องมี 50 วันทำการ)'), 'หน้าเว็บมีข้อความ "ข้อมูลไม่พอ (ต้องมี 50 วันทำการ)"');
};
R.E72 = async () => { await reset(); await clock('2026-11-20 03:59:59'); const r = (await ind('PDNW')).json; eq(r.notEnough.sma50, true, 'notEnough.sma50'); eq(r.sma50.length, 0, 'ไม่มีเส้น 50'); };
R.E73 = async () => {
  await reset(); await clock('2026-11-20 04:00:00'); const r = (await ind('PDNW')).json;
  eq(r.notEnough.sma50, false, 'notEnough.sma50 (มีเส้น 50)'); const last = r.sma50[r.sma50.length - 1];
  eq(last?.date, '2026-11-19', 'วันล่าสุด'); eq(n2(last?.value), '19.94', 'ค่า 19 พ.ย.');
};
R.E75 = async () => { await reset(); const r = (await ind('AAPL')).json; eq(n2(r.latest.sma50), '238.80', 'SMA50'); eq(n2(r.latest.sma200), '235.22', 'SMA200'); };
R.E76 = async () => {
  await reset(); await clock('2026-11-30 22:00'); const r = (await anon.get('/api/stocks/AAPL/candles?from=2026-11-20')).json; const d = r.bars.map((b) => b.date);
  ok(!d.includes('2026-11-26'), 'ไม่มีแท่ง 26 พ.ย.'); ok(d.includes('2026-11-25') && d.includes('2026-11-27'), 'มีแท่ง 25 และ 27 พ.ย.');
};
R.E77 = async () => {
  await reset(); const u = await login('beam'); const r = (await u.get('/api/stocks/AAPL/candles?interval=week&from=2026-10-26&to=2026-10-30')).json;
  const b = r.bars.find((x) => x.date === '2026-10-26'); ok(!!b, 'มีแท่งสัปดาห์ 26 ต.ค.');
  eq(b.open, '238.3680', 'เปิด'); eq(b.close, '239.8080', 'ปิด'); eq(b.high, '243.3226', 'สูง'); eq(b.low, '237.1762', 'ต่ำ');
};
R.E79 = async () => { await reset(); eq(n2((await ind('PDNW')).json.latest.rsi14), '51.94', 'RSI'); };
R.E80 = async () => { await reset(); const r = (await ind('ZUP')).json; eq(n2(r.latest.rsi14), '100.00', 'RSI'); eq(r.latest.rsiLabel, 'overbought', 'ป้าย (ซื้อมากเกินไป)'); };
R.E81 = async () => { await reset(); const r = (await ind('AAPL')).json; eq(n2(r.latest.rsi14), '52.54', 'RSI'); eq(r.latest.rsiLabel, null, 'ไม่มีป้าย'); };
R.E83 = async () => { await reset(); const r = (await ind('ZDN')).json; eq(n2(r.latest.rsi14), '0.00', 'RSI'); eq(r.latest.rsiLabel, 'oversold', 'ป้าย (ขายมากเกินไป)'); };
R.E85 = async () => {
  await reset(); const r = (await ind('ZGC')).json; const c = r.crosses.find((x) => x.date === '2026-11-05'); eq(c?.kind, 'golden', 'ป้าย 5 พ.ย.');
  await tick(); const p = await login('ploy'); const inbox = (await p.get('/api/inbox')).json; eq(inbox.items.filter((x) => x.symbol === 'ZGC').length, 0, 'ไม่มีแจ้งเตือน ZGC');
};
R.E86 = async () => { await reset(); const r = (await ind('ZEQ')).json; eq(r.crosses.filter((x) => x.date === '2026-11-05').length, 0, 'ไม่มีป้าย 5 พ.ย.'); };
R.E87 = async () => { await reset(); const r = (await ind('ZDC')).json; eq(r.crosses.find((x) => x.date === '2026-11-05')?.kind, 'death', 'ป้าย 5 พ.ย.'); };
R.E88 = async () => {
  await reset(); const u = await login('ploy');
  const a = (await u.get('/api/stocks/NVDA/candles?from=2024-06-07&to=2024-06-07&adjusted=1')).json.bars[0];
  const b = (await u.get('/api/stocks/NVDA/candles?from=2024-06-07&to=2024-06-07&adjusted=0')).json.bars[0];
  eq(a?.close, '114.2960', 'ปรับแล้ว'); eq(n2(a?.close), '114.30', 'แสดงปรับแล้ว'); eq(n2(b?.close), '1142.96', 'ราคาจริง');
};
R.E89 = async () => {
  await reset(); const u = await login('ploy');
  const a = (await u.get('/api/stocks/NVDA/candles?from=2024-06-06&to=2024-06-10&adjusted=1')).json.bars;
  const b = (await u.get('/api/stocks/NVDA/candles?from=2024-06-10&to=2024-06-10&adjusted=0')).json.bars[0];
  const d = a.find((x) => x.date === '2024-06-10'); const prev = a.find((x) => x.date === '2024-06-07');
  eq(n2(d?.close), '113.67', 'ปรับแล้ว'); eq(n2(b?.close), '113.67', 'ราคาจริง');
  const drop = (Number(d.close) / Number(prev.close) - 1) * 100; const dropOpen = (Number(d.close) / Number(d.open) - 1) * 100;
  ok(drop > -1 && dropOpen > -1, `ไม่ลดลงเกิน 1% (${drop.toFixed(2)}% · ${dropOpen.toFixed(2)}%)`);
};
R.E90 = async () => {
  await reset(); const u = await login('ploy');
  for (const qs of ['?adjusted=1', '?adjusted=0']) {
    const r = await ind('NVDA', u, qs); const l = r.json?.latest;
    if (r.status !== 200) { // indicators ไม่มีพารามิเตอร์ adjusted → ตรวจแบบไม่ส่ง
      const r2_ = (await ind('NVDA', u)).json.latest; eq(`${n2(r2_.sma50)}/${n2(r2_.sma200)}/${n2(r2_.rsi14)}`, '129.35/127.41/52.54', `ตัวชี้วัด (${qs} → ${r.status})`); continue;
    }
    eq(`${n2(l.sma50)}/${n2(l.sma200)}/${n2(l.rsi14)}`, '129.35/127.41/52.54', `ตัวชี้วัด ${qs}`);
  }
};

// 7.5 แจ้งเตือน
async function priceTick(sym, price) { await feed(sym, 'price', price); await stock(sym); return tick(); }
const events = async (u, sym) => (await u.get('/api/inbox')).json.items.filter((x) => x.symbol === sym);
const mails = async (u, sym) => (await u.get('/api/outbox')).json.items.filter((x) => x.subject.includes(sym));
function zalr(price, fire, pctText) {
  return async () => {
    await reset(); await priceTick('ZALR', price); const p = await login('ploy'); const ev = await events(p, 'ZALR');
    eq(ev.length, fire ? 1 : 0, `แจ้งเตือน ZALR @${price}`);
    if (fire && pctText) { eq(r2(ev[0].changePct), pctText, '% ในกล่อง'); const m = await mails(p, 'ZALR'); eq(m.length, 1, 'อีเมล'); }
  };
}
R.E91 = zalr('209.98', false);
R.E92 = zalr('210.00', true, '5.00');
R.E93 = zalr('210.02', true);
R.E94 = zalr('209.99', false);
R.E95 = zalr('190.02', false);
R.E96 = zalr('190.00', true, '-5.00');
R.E97 = zalr('189.98', true);
async function e98Chain() {
  await reset(); await priceTick('ZALR', '210.00');
  await clock('2026-11-06 23:30'); await priceTick('ZALR', '216.00'); const p = await login('ploy'); const a = (await events(p, 'ZALR')).length;
  await clock('2026-11-07 01:00'); await tick(); const b = (await events(p, 'ZALR')).length;
  return { p, a, b };
}
R.E98 = async () => { const { a, b } = await e98Chain(); eq(a, 1, '23:30 จำนวน'); eq(b, 1, '01:00 จำนวน'); };
R.E99 = async () => { const { p } = await e98Chain(); await clock('2026-11-09 22:00'); await priceTick('ZALR', '210.00'); eq((await events(p, 'ZALR')).length, 2, 'แจ้งเตือนใหม่ 1 (รวม 2)'); };
R.E100 = async () => { await reset(); await priceTick('AAPL', '249.99'); const p = await login('ploy'); eq((await events(p, 'AAPL')).length, 0, 'U02 AAPL'); };
async function e101Chain() { await reset(); await priceTick('AAPL', '250.00'); return { p: await login('ploy'), b: await login('beam') }; }
R.E101 = async () => {
  const { p, b } = await e101Chain(); eq((await events(p, 'AAPL')).length, 1, 'U02 แจ้ง');
  const al = (await p.get('/api/alerts')).json.items.find((x) => x.symbol === 'AAPL'); eq(al.active, false, 'แจ้งเตือน AAPL U02 active');
  eq((await events(b, 'AAPL')).length, 0, 'U01 ไม่แจ้ง');
};
R.E102 = async () => { const { p } = await e101Chain(); await priceTick('AAPL', '251.00'); eq((await events(p, 'AAPL')).length, 1, 'ยัง 1'); };
R.E103 = async () => { await reset(); await clock('2026-11-07 01:59:00'); await priceTick('ZALR', '210.00'); const p = await login('ploy'); eq((await events(p, 'ZALR')).length, 1, 'กล่อง'); eq((await mails(p, 'ZALR')).length, 1, 'อีเมล'); };
R.E104 = async () => {
  await reset('2026-11-07 02:00:00'); await priceTick('ZALR', '210.00'); const p = await login('ploy');
  const ev = await events(p, 'ZALR'); eq(ev.length, 1, 'กล่อง'); eq(ev[0]?.inQuietHours, true, 'inQuietHours'); eq((await mails(p, 'ZALR')).length, 0, 'อีเมล');
  await clock('2026-11-07 03:00:00'); await priceTick('ZALR', '220.00'); eq((await events(p, 'ZALR')).length, 1, '03:00 ไม่มีรายการใหม่');
};

// 7.6 พอร์ตและเงิน
const buy = (u, symbol, shares, price, tradeDate = '2026-11-05') => u.post('/api/transactions', { symbol, side: 'buy', tradeDate, shares: String(shares), price: String(price) });
const sell = (u, symbol, shares, price = '130.00', tradeDate = '2026-11-06') => u.post('/api/transactions', { symbol, side: 'sell', tradeDate, shares: String(shares), price: String(price) });
function feeRow(cases) {
  return async () => {
    await reset(); const u = await login('fon');
    for (const [shares, price, fee] of cases) { const r = await buy(u, 'AAPL', shares, price); eq(r.status, 201, `${shares}@${price} status`); eq(n2(r.json.transaction.feeUsd), fee, `ค่าธรรมเนียม ${shares}@${price}`); }
  };
}
R.E106 = feeRow([[1, '666.00', '1.00']]);
R.E107 = feeRow([[1, '666.67', '1.00']]);
R.E108 = feeRow([[1, '700.00', '1.05']]);
R.E109 = feeRow([[10, '100.00', '1.50']]);
R.E110 = feeRow([[1, '669.00', '1.00'], [1, '670.00', '1.01'], [1, '671.00', '1.01']]);
R.E111 = async () => { await reset(); const u = await login('fon'); eq((await buy(u, 'ZA02', '0.123', '135.00')).status, 201, 'status'); };
R.E112 = async () => { await reset(); const u = await login('fon'); eq((await buy(u, 'ZA02', '0.1234', '135.00')).status, 201, 'status'); };
R.E113 = async () => { await reset(); const u = await login('fon'); const r = await buy(u, 'ZA02', '0.12345', '135.00'); eq(r.status, 400, 'status'); eq(r.json.error?.code, 'INVALID_SHARES', 'code'); };
R.E114 = async () => { await reset(); const u = await login('beam'); eq((await sell(u, 'ZA01', '19.9999')).status, 201, 'status'); };
R.E115 = async () => { await reset(); const u = await login('beam'); const r = await sell(u, 'ZA01', '20'); eq(r.status, 201, 'status'); eq(n4(r.json.holding?.shares), '0.0000', 'เหลือ'); };
R.E116 = async () => { await reset(); const u = await login('beam'); const r = await sell(u, 'ZA01', '20.0001'); eq(r.status, 409, 'status'); eq(r.json.error?.message, 'มีหุ้นไม่พอ', 'ข้อความ'); };
R.E117 = async () => {
  await reset(); const u = await login('beam'); const rs = await Promise.all([sell(u, 'ZA01', '20'), sell(u, 'ZA01', '20')]);
  eq(rs.map((r) => r.status).sort().join(','), '201,409', 'status 2 คำขอ');
  const tx = (await u.get('/api/transactions')).json.items.filter((x) => x.symbol === 'ZA01' && x.side === 'sell'); eq(tx.length, 1, 'รายการขาย');
  const h = (await u.get('/api/portfolio')).json.holdings.find((x) => x.symbol === 'ZA01'); ok(!h || n4(h.shares) === '0.0000', `เหลือ 0.0000 (${h ? h.shares : 'ไม่แสดงในพอร์ต'})`);
};
const holding = async (u, sym) => (await u.get('/api/portfolio')).json.holdings.find((x) => x.symbol === sym);
R.E118 = async () => { await reset(); const u = await login('beam'); eq(n2((await holding(u, 'ZA01')).avgCostUsd), '120.18', 'ต้นทุนเฉลี่ย'); };
async function e121Chain() { await reset(); const u = await login('beam'); const r = await sell(u, 'ZA01', '5', '130.00'); return { u, r }; }
R.E120 = async () => { const { u } = await e121Chain(); const h = await holding(u, 'ZA01'); eq(n4(h.shares), '15.0000', 'เหลือ'); eq(n2(h.avgCostUsd), '120.18', 'ต้นทุนเฉลี่ย'); };
R.E121 = async () => {
  const { u, r } = await e121Chain(); eq(r.status, 201, 'status'); eq(n2(r.json.transaction.feeUsd), '1.00', 'ค่าธรรมเนียม');
  const h = await holding(u, 'ZA01'); eq(n2(h.realizedUsd), '48.10', 'กำไรที่รับรู้');
};
const pending = async (u) => (await u.get('/api/dca/pending')).json.items;
async function e122Chain() { await reset(); const u = await login('beam'); await clock('2026-11-26 04:00:00'); await tick(); return u; }
R.E122 = async () => {
  const u = await e122Chain(); const p = (await pending(u)).find((x) => x.symbol === 'VOO' && x.tradeDate === '2026-11-25');
  ok(!!p, 'มีรายการรอยืนยัน VOO 25 พ.ย.');
  eq(n4(p.fxRate), '35.0000', 'อัตรา'); eq(n2(p.usdAmount), '142.86', 'USD'); eq(n2(p.feeUsd), '1.00', 'ค่าธรรมเนียม'); eq(n2(p.investUsd), '141.86', 'ลงทุน'); eq(n2(p.closePrice), '500.00', 'ราคาปิด'); eq(n4(p.shares), '0.2837', 'หุ้น');
};
R.E125 = async () => { await reset(); const u = await login('beam'); await clock('2026-11-26 03:59:59'); await tick(); eq((await pending(u)).filter((x) => x.tradeDate === '2026-11-25').length, 0, 'ยังไม่มีรายการรอบ 25 พ.ย.'); };
R.E126 = async () => { await reset(); await clock('2026-12-29 04:00:00'); await tick(); const u = await login('beam'); /* session 30 วันหมดอายุ → เข้าใหม่หลังเลื่อนนาฬิกา */ const d = (await pending(u)).map((x) => x.tradeDate); ok(d.includes('2026-12-28'), `มี trade_date 2026-12-28 (${d.join(',')})`); ok(!d.includes('2026-12-25'), 'ไม่มี 2026-12-25'); };
R.E128 = async () => {
  const u = await e122Chain(); const p = (await pending(u)).find((x) => x.tradeDate === '2026-11-25');
  await u.post('/api/dca/pending/999999999/confirm'); // อุ่น route (dev server คอมไพล์ครั้งแรกช้า ทำให้ลำดับสลับ)
  const a = u.post(`/api/dca/pending/${p.id}/confirm`); await sleep(50); const b = u.post(`/api/dca/pending/${p.id}/confirm`);
  const [ra, rb] = await Promise.all([a, b]); eq(`${ra.status},${rb.status}`, '200,409', 'status (กดครั้งแรก, ครั้งที่ 2)'); eq(rb.json?.error?.code, 'ALREADY_DONE', 'code ครั้งที่ 2');
  eq(n4((await holding(u, 'VOO')).shares), '2.2837', 'VOO เพิ่ม 0.2837 ครั้งเดียว');
};
async function fxAt(now) { await reset(); const u = await login('beam'); for (const t of [].concat(now)) { await clock(t); } return (await u.get('/api/portfolio')).json.fx.rate; }
R.E129 = async () => eq(n2(await fxAt('2026-11-06 17:59:59')), '33.50', 'อัตรา');
R.E130 = async () => eq(n2(await fxAt('2026-11-06 18:00:00')), '33.60', 'อัตรา');
R.E131 = async () => {
  await reset(); const u = await login('beam'); const got = [];
  for (const t of ['2026-11-07 12:00', '2026-11-09 17:59:59', '2026-11-09 18:00:00']) { await clock(t); got.push(n2((await u.get('/api/portfolio')).json.fx.rate)); }
  eq(got.join(' / '), '33.60 / 33.60 / 35.00', 'อัตรา');
};
R.E132 = async () => {
  await reset(); const u = await login('beam'); const h = await holding(u, 'ZA01');
  eq(n2(h.priceUsd), '130.00', 'ราคา'); eq(h.costThb, '83124.50', 'ต้นทุน ฿'); eq(h.valueThb, '87360.00', 'มูลค่า ฿'); eq(h.plThb, '4235.50', 'กำไร ฿'); eq(h.plUsd, '196.40', 'กำไร $');
};
R.E133 = async () => {
  await reset(); const u = await login('beam'); await clock('2026-11-06 17:59:59'); const h = await holding(u, 'ZA01');
  eq(n2(h.priceUsd), '130.00', 'ราคาปิด'); eq(h.valueThb, '87100.00', 'มูลค่า ฿'); eq(h.plThb, '3975.50', 'กำไร ฿'); eq(h.plUsd, '196.40', 'กำไร $');
};
R.E134 = async () => {
  await reset(); const u = await login('beam'); const h = await holding(u, 'VOO');
  eq(h.costUsd, '972.00', 'ต้นทุน $'); eq(n2(h.avgCostUsd), '486.00', 'เฉลี่ย'); eq(h.costThb, '33539.00', 'ต้นทุน ฿'); eq(h.valueThb, '33600.00', 'มูลค่า ฿'); eq(h.plThb, '61.00', 'กำไร ฿'); eq(h.plUsd, '28.00', 'กำไร $');
};

// 7.7 ปันผล
const received = async (u) => (await u.get('/api/dividends/received')).json;
function divRow(now, sym, net, thb) {
  return async () => { await reset(); await clock(now); await tick(); const u = await login('somchai'); const it = (await received(u)).items.find((x) => x.symbol === sym); ok(!!it, `มีปันผล ${sym}`); eq(it.netUsd, net, 'หลังภาษี $'); eq(it.netThb, thb, 'บาท'); eq(n4(it.fxRate), '35.0000', 'อัตรา'); };
}
R.E135 = divRow('2026-12-08 22:00', 'JNJ', '55.25', '1933.75');
R.E136 = divRow('2026-12-15 22:00', 'O', '45.90', '1606.50');
R.E137 = divRow('2026-12-15 22:00', 'KO', '43.35', '1517.25');
R.E138 = async () => {
  await reset(); await clock('2026-12-08 22:00'); await tick(); await clock('2026-12-15 22:00'); await tick(); const u = await login('somchai');
  const m = (await received(u)).monthly.find((x) => x.month === '2026-12'); ok(!!m, 'มีสรุปเดือน 2026-12'); eq(m.netUsd, '144.50', 'หลังภาษี $'); eq(m.netThb, '5057.50', 'บาท');
};
function xdRow(tradeDate, expectNet) {
  return async () => {
    await reset(); await clock(`${tradeDate} 22:00`); /* รอบแก้บั๊ก: ห้ามจดวันอนาคต → เลื่อนนาฬิกาเป็นวันซื้อก่อน */ const u = await login('fon'); const r = await buy(u, 'KO', '10', '68.00', tradeDate); eq(r.status, 201, 'ซื้อ');
    await clock('2026-12-15 22:00'); await tick(); const u2 = await login('fon'); const it = (await received(u2)).items.filter((x) => x.symbol === 'KO');
    if (expectNet) { eq(it.length, 1, 'ได้ปันผล'); eq(it[0].grossUsd, '5.10', 'ก่อนภาษี'); eq(it[0].netUsd, expectNet, 'หลังภาษี'); } else eq(it.length, 0, 'ไม่ได้ปันผล');
  };
}
R.E140 = xdRow('2026-11-30', '4.34');
R.E141 = xdRow('2026-12-01', null);
R.E142 = xdRow('2026-12-02', null);
R.E143 = async () => {
  await reset(); const u = await login('somchai'); const p = (await u.get('/api/portfolio')).json; const by = Object.fromEntries(p.holdings.map((h) => [h.symbol, h.plUsd]));
  eq(`${by.KO}/${by.JNJ}/${by.PG}/${by.O}/${by.VOO}`, '791.00/238.75/190.40/583.50/493.25', 'กำไรรายตัว');
  eq(p.totals.plUsd, '2296.90', 'กำไรจากราคา'); eq(p.totals.totalReturnUsd, '2296.90', 'รวมปันผล');
};
R.E144 = async () => {
  await reset(); await clock('2026-12-08 22:00'); await tick(); await clock('2026-12-16 22:00'); await tick(); const u = await login('somchai');
  const p = (await u.get('/api/portfolio')).json; eq(p.totals.plUsd, '2296.90', 'กำไรจากราคา'); eq(p.totals.dividendsNetUsd, '144.50', 'ปันผลสุทธิ'); eq(p.totals.totalReturnUsd, '2441.40', 'รวมปันผล');
};

// 7.8 คัดกรอง เทียบ ลองเทียบ ประวัติ AI บัญชี
const screen = async (b) => (await anon.post('/api/screener', b)).json.results.map((x) => x.symbol);
R.E145 = async () => { await reset(); eq((await screen({ peMax: 20 })).join(','), 'BRK.B,JNJ,PG', 'ผล'); };
R.E146 = async () => { await reset(); eq((await screen({ divMin: 3 })).join(','), 'JNJ,KO,O', 'ผล'); };
R.E147 = async () => { await reset(); eq((await screen({ peMax: 20, divMin: 3 })).join(','), 'JNJ', 'ผล'); };
R.E148 = async () => {
  await reset(); const s = await screen({}); const sorted = [...s].sort(); eq(s.join(','), sorted.join(','), 'เรียง A–Z');
  for (const lang of ['th', 'en']) {
    const html = (await http('GET', `/${lang}/study/screener`, { raw: true })).text;
    ok(!/เด่น|อันดับ/.test(html), `/${lang}/study/screener ไม่มี "เด่น" / "อันดับ"`);
    if (lang === 'en') ok(!/\b(top|rank|ranking|best)\b/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/data-[a-z-]+="[^"]*"/g, '')), '/en ไม่มี top/rank/best ในข้อความ');
  }
};
R.E149 = async () => {
  await reset(); const u = await login('jay'); const got = [];
  for (const s of [['AAPL'], ['AAPL', 'MSFT'], ['AAPL', 'MSFT', 'NVDA', 'TSLA'], ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'VOO']]) got.push((await u.post('/api/compare', { symbols: s })).status);
  eq(got.join('/'), '400/200/200/400', 'status 1/2/4/5 ตัว');
};
R.E150 = async () => {
  await reset(); const r = (await anon.post('/api/compare', { symbols: ['ZUP', 'AAPL'], from: '2026-10-30', to: '2026-11-05' })).json;
  const f = Object.fromEntries(r.final.map((x) => [x.symbol, x.pct])); eq(r2(f.ZUP), '0.10', 'ZUP %'); eq(r2(f.AAPL), '0.08', 'AAPL %');
};
R.E151 = async () => {
  await reset(); const u = await login('ploy'); const r = await u.post('/api/backtest', { symbol: 'VOO', monthlyUsd: '100', fromMonth: '2025-11', toMonth: '2026-10' });
  eq(r.status, 200, 'status'); eq(r.json.dca.valueUsd, '1236.07', 'DCA'); eq(r.json.lump.valueUsd, '1259.97', 'ก้อนเดียว'); eq(r.json.diffUsd, '-23.90', 'ส่วนต่าง');
};
R.E152 = async () => {
  await reset(); const u = await login('jay'); eq((await u.post('/api/compare', { symbols: ['AAPL', 'MSFT'] })).status, 200, 'เทียบ');
  const it = (await u.get('/api/history')).json.items; eq(it.length, 20, 'จำนวนประวัติ');
  const thDate = (iso) => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 10);
  eq(it.filter((x) => thDate(x.createdAt) === '2026-10-01').length, 0, 'รายการ 2026-10-01');
};
export const FORBIDDEN_TH = ['ควรซื้อ', 'ควรขาย', 'น่าซื้อ', 'น่าขาย', 'แนะนำให้ซื้อ', 'แนะนำให้ขาย'];
export const FORBIDDEN_EN = /should\s+buy|should\s+sell|recommend|strong\s+buy|top\s+pick/i;
R.E153 = async () => {
  await reset(); const syms = [...(await screen({})), 'OLDC']; const bad = [];
  for (const lang of ['th', 'en']) for (const s of syms) {
    const a = await anon.post(`/api/stocks/${s}/summary?lang=${lang}`); const b = await anon.post(`/api/stocks/${s}/summary?lang=${lang}`);
    if (a.status !== 200) { bad.push(`${s}/${lang} ${a.status}`); continue; }
    const lines = a.json.lines; const txt = lines.join('\n');
    if (lines.length > 3 || lines.some((l) => l.includes('\n'))) bad.push(`${s}/${lang} ${lines.length} บรรทัด`);
    if (FORBIDDEN_TH.some((w) => txt.includes(w)) || FORBIDDEN_EN.test(txt)) bad.push(`${s}/${lang} คำต้องห้าม`);
    if (JSON.stringify(a.json.lines) !== JSON.stringify(b.json?.lines)) bad.push(`${s}/${lang} ข้อความไม่เหมือนเดิม`);
  }
  ok(bad.length === 0, `${syms.length} ตัว × 2 ภาษา ≤3 บรรทัด ไม่มีคำต้องห้าม กด 2 ครั้งได้ข้อความเดิม${bad.length ? ' · ' + bad.join(', ') : ''}`);
  ok(syms.length === 60, `จำนวนหุ้น ${syms.length} = 60`);
};
R.E155 = async () => {
  await reset(); const r = await http('POST', '/api/auth/login', { body: { email: 'del1@pordee.test', password: PASSWORD } });
  eq(r.status, 403, 'เข้าสู่ระบบ'); eq(r.json.error?.code, 'ACCOUNT_DELETING', 'code');
  const s = await http('POST', '/api/auth/signup', { body: { email: 'del1@pordee.test', password: PASSWORD, displayName: 'x' } });
  eq(s.status, 409, 'ข้อมูลยังอยู่ (สมัครซ้ำได้ EMAIL_TAKEN)');
};
R.E156 = async () => {
  await reset(); const t = await tick(); ok(JSON.stringify(job(t, 'purge').result).includes('11'), `purge ${JSON.stringify(job(t, 'purge').result)} มี U11`);
  const l = await http('POST', '/api/auth/login', { body: { email: 'del2@pordee.test', password: PASSWORD } }); eq(l.status, 401, 'เข้าสู่ระบบด้วยบัญชีเดิม (ไม่มี users แล้ว)');
  const s = await http('POST', '/api/auth/signup', { body: { email: 'del2@pordee.test', password: PASSWORD, displayName: 'ใหม่' } }); eq(s.status, 201, 'สมัครใหม่');
  const u = await login('del2'); eq((await u.get('/api/watchlist')).json.items.length, 0, 'watchlist เก่าไม่เหลือ');
};

// ---------- รายการแถว "เว็บ" ทั้งหมด 141 แถว ----------
const UNIT = ['E41', 'E42', 'E43', 'E64', 'E74', 'E78', 'E82', 'E84', 'E105', 'E119', 'E123', 'E124', 'E127', 'E139', 'E154', 'E157'];
const ALL = Array.from({ length: 157 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`).filter((id) => !UNIT.includes(id));

async function main() {
  const out = [];
  let pass = 0, fail = 0, skip = 0;
  for (const id of ALL) {
    if (ONLY.size && !ONLY.has(id)) continue;
    notes.length = 0;
    let line;
    try {
      if (SKIP[id]) throw new Skip(SKIP[id]);
      if (!R[id]) throw new Skip('ยังไม่มีขั้นตอนทดสอบ');
      await R[id]();
      line = `${id} PASS ${notes.join(' · ')}`; pass++;
    } catch (e) {
      if (e instanceof Skip) { line = `${id} SKIP ${e.message}`; skip++; }
      else if (e instanceof Fail) { line = `${id} FAIL ${e.message}${notes.length ? ' (ผ่านแล้ว: ' + notes.join(' · ') + ')' : ''}`; fail++; }
      else { line = `${id} FAIL error: ${e.message}${e.res ? ' ' + e.res.text.slice(0, 200) : ''}`; fail++; }
    }
    console.log(line); out.push(line);
  }
  const total = pass + fail + skip;
  const unclear = out.filter((l) => / FAIL ยังไม่ชัด/.test(l)).length;
  const sum = `ผ่าน ${pass} / ${total} ข้อ (SKIP ${skip})${fail ? ` · FAIL ${fail}${unclear ? ` (ยังไม่ชัด ${unclear})` : ''}` : ''}`;
  console.log(sum); out.push(sum);
  try { await http('POST', '/api/test/reset', { body: {} }); } catch { /* ignore */ }
  if (!ONLY.size) writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'verify-edges.result.txt'), out.join('\n') + '\n');
  process.exitCode = fail ? 1 : 0;
}
main();
