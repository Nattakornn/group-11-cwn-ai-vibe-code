// รันชุดทดสอบแบบขนาน: 1 ชุด = 1 หัวข้อย่อย + เว็บของตัวเอง (pordee-web-N :31N0 · pordee-db-N :31N1)
// ใช้: node scripts/run-shards.mjs --sections 1,2,3,4 [--project chromium|mobile-chrome|both] [--tag normal]
// ผล: test-report/raw/<tag>/5.N[-mobile]/results.json · ข้อที่ timeout รันซ้ำ 1 ครั้ง → 5.N-retry
import { spawn, execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const sections = arg('sections', '1,2,3,4,5,6,7,8').split(',').map(Number);
const project = arg('project', 'both');
const tag = arg('tag', 'normal');
const root = `test-report/raw/${tag}`;
mkdirSync(root, { recursive: true });

const specOf = (n) => readdirSync('tests').filter((f) => f.startsWith(`5.${n}-`)).map((f) => `tests/${f}`);
const env = (n, out) => ({ ...process.env, BASE_URL: `http://localhost:31${n}0`, DB_URL: `postgres://pordee:pordee@localhost:31${n}1/pordee`, PW_OUT: out });

function run(n, proj, out, extra = []) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn('npx', ['playwright', 'test', ...specOf(n), `--project=${proj}`, ...extra], { env: env(n, out), stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    p.stdout.on('data', (d) => { log += d; });
    p.stderr.on('data', (d) => { log += d; });
    p.on('close', (code) => {
      writeFileSync(`${out}.log`, log);
      console.log(`[5.${n} ${proj}] exit ${code} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      resolve(code);
    });
  });
}

function timeouts(out) {
  const f = `${out}/results.json`;
  if (!existsSync(f)) return [];
  const ids = [];
  const walk = (s) => { for (const c of s.suites ?? []) walk(c); for (const sp of s.specs ?? []) for (const t of sp.tests) {
    const r = t.results.at(-1);
    if (r && r.status !== 'passed' && /timeout|Timeout/.test(JSON.stringify(r.errors ?? r.error ?? ''))) ids.push(sp.title.split(' ')[0]);
  } };
  walk(JSON.parse(readFileSync(f, 'utf8')));
  return ids;
}

function stats(label) {
  try {
    const s = execSync(`docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' | grep pordee`, { encoding: 'utf8' });
    let cpu = 0, mem = 0;
    for (const line of s.trim().split('\n')) {
      const [, c, m] = line.split('\t');
      cpu += parseFloat(c);
      const v = parseFloat(m); mem += /GiB/.test(m.split('/')[0]) ? v * 1024 : v;
    }
    const rec = { label, at: new Date().toISOString(), containers: s.trim().split('\n').length, cpuPct: +cpu.toFixed(1), memMiB: +mem.toFixed(0), raw: s.trim() };
    const f = `${root}/docker-stats.json`;
    const all = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [];
    all.push(rec); writeFileSync(f, JSON.stringify(all, null, 2));
    console.log(`[stats ${label}] containers ${rec.containers} · CPU ${rec.cpuPct}% · RAM ${rec.memMiB} MiB`);
  } catch (e) { console.log('stats failed', e.message); }
}

// ป้ายโหมดของเว็บทุกชุด (ต้องตรงกันทุกชุด)
const modes = new Set();
for (const n of sections) {
  try { const h = await (await fetch(`http://localhost:31${n}0/th`)).text(); modes.add(h.match(/data-bug-mode="(\d)"/)?.[1] ?? '?'); } catch { modes.add('?'); }
}
writeFileSync(`${root}/bug-mode.txt`, [...modes].join(','));
console.log(`data-bug-mode ของทุกชุด: ${[...modes].join(',')}`);

const t0 = Date.now();
const timer = setTimeout(() => stats(`${sections.length} ชุดพร้อมกัน`), 45_000);
await Promise.all(sections.map(async (n) => {
  if (!specOf(n).length) { console.log(`5.${n}: ไม่มีไฟล์ spec`); return; }
  if (project !== 'mobile-chrome') {
    const out = `${root}/5.${n}`;
    await run(n, 'chromium', out);
    const again = timeouts(out);
    if (again.length) { console.log(`[5.${n}] รันซ้ำข้อที่ timeout: ${again.join(' ')}`); await run(n, 'chromium', `${root}/5.${n}-retry`, ['--grep', again.join('|')]); }
  }
  if (project !== 'chromium') {
    const mob = specOf(n).some((f) => /@mobile/.test(readFileSync(f, 'utf8')));
    if (mob) await run(n, 'mobile-chrome', `${root}/5.${n}-mobile`);
  }
}));
clearTimeout(timer);
console.log(`เสร็จ ${((Date.now() - t0) / 1000).toFixed(0)} s`);
