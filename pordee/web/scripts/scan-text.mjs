#!/usr/bin/env node
// V2 · สแกนข้อความทุกหน้า 2 ภาษา (SPEC ส่วน B) ทั้งไม่เข้าสู่ระบบ และเข้าเป็น beam / ploy / kan
// (ก) คำต้องห้าม NFR-06 ต้อง 0  (ข) ข้อความเตือน NFR-07 ตรงตัวอักษรทุกหน้า  (ค) สรุป AI ทุกตัวจาก /api/screener 2 ภาษา
// ใช้: BASE_URL=http://localhost:3302 node scripts/scan-text.mjs
const BASE = (process.env.BASE_URL || 'http://localhost:3302').replace(/\/$/, '');
const PASSWORD = 'Pordee#2569';

const FORBIDDEN_TH = ['ควรซื้อ', 'ควรขาย', 'น่าซื้อ', 'น่าขาย', 'แนะนำให้ซื้อ', 'แนะนำให้ขาย'];
const FORBIDDEN_EN = /should\s+buy|should\s+sell|recommend|strong\s+buy|top\s+pick/gi;
const DISCLAIMER = { th: 'ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน', en: 'For educational purposes only. Not investment advice.' };

// SPEC ส่วน B (path ที่มีส่วนเปลี่ยนได้ใส่ตัวอย่าง)
const PAGES = [
  '', '/account', '/alerts', '/dividends', '/inbox', '/learn', '/login', '/outbox', '/portfolio', '/search', '/search?q=AAPL',
  '/signup', '/staff', '/staff/does-not-exist', '/stocks/AAPL', '/stocks/OLDC', '/stocks/PDNW', '/study', '/study/backtest',
  '/study/compare', '/study/history', '/study/screener', '/watchlist', '/no-such-page',
];
const USERS = [null, 'beam', 'ploy', 'kan'];
const API_GET = ['/api/me', '/api/watchlist', '/api/alerts', '/api/inbox', '/api/outbox', '/api/portfolio', '/api/transactions', '/api/dca/plans',
  '/api/dca/pending', '/api/dividends/calendar?month=2026-12', '/api/dividends/received', '/api/history', '/api/stocks?q=a', '/api/stocks/AAPL',
  '/api/stocks/AAPL/indicators', '/api/market/status'];

async function get(path, cookie) {
  let url = BASE + path;
  for (let hop = 0; hop < 4; hop++) {
    const r = await fetch(url, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), url).href; continue; }
    return { status: r.status, text: await r.text(), url };
  }
  throw new Error('redirect loop ' + path);
}
async function login(user) {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${user}@pordee.test`, password: PASSWORD }) });
  if (r.status !== 200) throw new Error(`login ${user} ${r.status}`);
  return (r.headers.get('set-cookie') || '').split(';')[0];
}
function forbiddenHits(text) {
  const hits = [];
  for (const w of FORBIDDEN_TH) { let i = text.indexOf(w); while (i >= 0) { hits.push(ctx(text, i, w.length)); i = text.indexOf(w, i + 1); } }
  for (const m of text.matchAll(FORBIDDEN_EN)) hits.push(ctx(text, m.index, m[0].length));
  return hits;
}
const ctx = (t, i, n) => JSON.stringify(t.slice(Math.max(0, i - 40), i + n + 40));
// ข้อความที่มองเห็นจาก HTML ฝั่งเซิร์ฟเวอร์ (ตัด script/style/แท็ก) ใช้ตรวจข้อความเตือน
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

async function main() {
  await fetch(BASE + '/api/test/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const problems = [];
  const notes = [];
  let pages = 0, apis = 0;
  for (const user of USERS) {
    const cookie = user ? await login(user) : null;
    for (const lang of ['th', 'en']) {
      for (const p of PAGES) {
        const path = `/${lang}${p}`; const r = await get(path, cookie); pages++;
        const who = user || 'guest';
        // (ก) ทั้ง HTML รวม payload ของ client component (ข้อความทุกตัวที่หน้านั้นอาจแสดง)
        for (const h of forbiddenHits(r.text)) problems.push(`(ก) ${who} ${path}: ${h}`);
        // (ข) ข้อความเตือนตรงตัวอักษรในส่วนที่มองเห็น
        if (!visible(r.text).includes(DISCLAIMER[lang])) {
          // next dev ส่งหน้า 404 เป็น error shell (<html id="__next_error__">) แล้วให้ client วาดจาก RSC payload
          // → ข้อความเตือนอยู่ใน payload ของ footer (core-disclaimer) แทน HTML ฝั่งเซิร์ฟเวอร์
          const inPayload = r.text.includes('__next_error__') && r.text.includes(`core-disclaimer\\",\\"children\\":\\"${DISCLAIMER[lang]}`);
          if (inPayload) notes.push(`(ข) ${who} ${path} (${r.status}): ข้อความเตือนอยู่ใน RSC payload ของ footer (next dev วาด 404 ฝั่ง client)`);
          else problems.push(`(ข) ${who} ${path} (${r.status}): ไม่มีข้อความเตือน "${DISCLAIMER[lang]}"`);
        }
        if (r.status >= 500) problems.push(`${who} ${path}: HTTP ${r.status}`);
      }
      // เสริม: ข้อความจาก API ที่หน้าเว็บดึงมาแสดงฝั่ง client
      for (const a of API_GET) {
        const r = await get(`${a}${a.includes('?') ? '&' : '?'}lang=${lang}`, cookie); apis++;
        for (const h of forbiddenHits(r.text)) problems.push(`(ก) API ${user || 'guest'} ${a} ${lang}: ${h}`);
      }
    }
  }
  // (ค) สรุป AI
  const sr = await (await fetch(BASE + '/api/screener', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  const syms = sr.results.map((x) => x.symbol); let sums = 0;
  for (const lang of ['th', 'en']) for (const s of syms) {
    const r = await fetch(`${BASE}/api/stocks/${encodeURIComponent(s)}/summary?lang=${lang}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    sums++;
    if (r.status !== 200) { problems.push(`(ค) ${s} ${lang}: HTTP ${r.status}`); continue; }
    const j = await r.json(); const lines = j.lines || []; const txt = lines.join('\n');
    if (lines.length > 3 || lines.some((l) => /\n/.test(l))) problems.push(`(ค) ${s} ${lang}: ${lines.length} บรรทัด`);
    for (const h of forbiddenHits(txt)) problems.push(`(ค) ${s} ${lang}: ${h}`);
    if (lang === 'en' && /[฀-๿]/.test(txt)) problems.push(`(ค) ${s} en: มีอักษรไทย`);
  }
  for (const p of problems) console.log('FAIL ' + p);
  for (const n of notes) console.log('NOTE ' + n);
  const a = problems.filter((p) => p.startsWith('(ก)')).length, b = problems.filter((p) => p.startsWith('(ข)')).length, c = problems.filter((p) => p.startsWith('(ค)')).length;
  console.log(`หน้า ${pages} ครั้ง (${PAGES.length} path × 2 ภาษา × ${USERS.length} ผู้ใช้) · API ${apis} ครั้ง · สรุป AI ${sums} (${syms.length} ตัว × 2 ภาษา)`);
  console.log(`(ก) คำต้องห้าม: ${a} · (ข) หน้าที่ไม่มีข้อความเตือน: ${b} · (ค) สรุป AI ผิด: ${c} · อื่น ๆ: ${problems.length - a - b - c} · หมายเหตุ: ${notes.length}`);
  process.exitCode = problems.length ? 1 : 0;
}
main();
