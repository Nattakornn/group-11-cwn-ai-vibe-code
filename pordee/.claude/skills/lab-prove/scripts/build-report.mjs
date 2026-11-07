// รวมผลทุกชุด → GIF + ภาพตอนตรวจ + e2e/index.html (เปิดด้วยดับเบิลคลิกได้ ไม่ต้องมี server)
// ใช้: node scripts/build-report.mjs [--tag normal] [--compare report-normal/data.json] [--no-gif]
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const tag = arg('tag', 'normal');
const compareFile = arg('compare', null);
const makeGif = !process.argv.includes('--no-gif');
const RAW = `test-report/raw/${tag}`;
const OUT = 'test-report';
mkdirSync(`${OUT}/gifs`, { recursive: true });
rmSync(`${OUT}/shots`, { recursive: true, force: true });
mkdirSync(`${OUT}/shots`, { recursive: true });

const strip = (s) => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const planText = readFileSync('../TEST-PLAN.md', 'utf8');

// ---------- อ่านผล ----------
function readRun(dir) {
  const f = join(RAW, dir, 'results.json');
  if (!existsSync(f)) return [];
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const out = [];
  const walk = (s) => {
    for (const c of s.suites ?? []) walk(c);
    for (const sp of s.specs ?? []) for (const t of sp.tests) {
      const r = t.results.at(-1);
      if (!r) continue;
      out.push({ title: sp.title, file: sp.file, project: t.projectName, r, annotations: t.annotations ?? [] });
    }
  };
  walk(j);
  return out;
}
function steps(list, depth = 0) {
  const res = [];
  for (const s of list ?? []) {
    if (s.category && s.category !== 'test.step') { res.push(...steps(s.steps, depth)); continue; }
    if (!s.title) continue;
    res.push({ title: s.title, depth, error: s.error ? strip(s.error.message).split('\n').slice(0, 6).join('\n') : null, ms: s.duration });
    res.push(...steps(s.steps, depth + 1));
  }
  return res;
}

const dirs = existsSync(RAW) ? readdirSync(RAW).filter((d) => existsSync(join(RAW, d, 'results.json'))) : [];
const byKey = new Map();
for (const d of dirs.filter((d) => !d.endsWith('-retry')).sort()) for (const e of readRun(d)) byKey.set(`${e.project}|${e.title.split(' ')[0]}`, { ...e, dir: d, retried: false });
for (const d of dirs.filter((d) => d.endsWith('-retry'))) for (const e of readRun(d)) {
  const k = `${e.project}|${e.title.split(' ')[0]}`;
  const prev = byKey.get(k);
  byKey.set(k, { ...e, dir: d, retried: true, firstStatus: prev?.r.status });
}

const triage = existsSync('triage.json') ? JSON.parse(readFileSync('triage.json', 'utf8')) : {};
const compare = compareFile && existsSync(compareFile) ? JSON.parse(readFileSync(compareFile, 'utf8')) : null;

function gif(video, id, project) {
  const name = project === 'chromium' ? `${id}.gif` : `${id}-${project}.gif`;
  const dest = `${OUT}/gifs/${name}`;
  if (!makeGif) return existsSync(dest) ? `gifs/${name}` : null;
  try {
    const d = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' })) || 6;
    const k = Math.min(2.2, 6.5 / d); // เล่น ~6.5 วินาที + ค้างภาพท้าย 3 วินาที = ~9.5 วินาที
    const w = project === 'chromium' ? 760 : 300;
    const vf = `setpts=${k.toFixed(4)}*PTS,tpad=stop_mode=clone:stop_duration=3,fps=8,scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-vf', vf, '-loop', '0', dest]);
    return `gifs/${name}`;
  } catch (e) { console.log('gif failed', id, e.message.slice(0, 200)); return null; }
}

const tests = [];
for (const e of [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }))) {
  const id = e.title.split(' ')[0];
  const tags = (e.title.match(/@[\w.]+/g) ?? []);
  const level = tags.find((t) => /^@P\d$/.test(t))?.slice(1) ?? '?';
  const section = tags.find((t) => /^@5\.\d$/.test(t))?.slice(1) ?? e.file.match(/5\.\d/)?.[0] ?? '?';
  const ann = {};
  for (const a of e.annotations) (ann[a.type] ??= []).push(a.description);
  const shots = [];
  for (const a of e.r.attachments ?? []) {
    if (a.contentType === 'image/png' && a.path && existsSync(a.path)) {
      const rel = `shots/${e.project}/${id}`;
      mkdirSync(`${OUT}/${rel}`, { recursive: true });
      const fn = `${String(shots.length + 1).padStart(2, '0')}.png`;
      copyFileSync(a.path, `${OUT}/${rel}/${fn}`);
      shots.push({ name: a.name.replace(/^check-\d+ /, ''), src: `test-report/${rel}/${fn}` });
    }
  }
  const video = (e.r.attachments ?? []).find((a) => a.name === 'video' && a.path && existsSync(a.path));
  const g = video ? gif(video.path, id, e.project) : null;
  let status = e.r.status === 'passed' ? (e.retried ? 'flaky' : 'passed') : (e.r.status === 'timedOut' ? 'timedOut' : 'failed');
  const errors = (e.r.errors ?? []).map((x) => strip(x.message).split('\n').slice(0, 14).join('\n'));
  const cmp = compare?.tests.find((t) => t.id === id && t.project === e.project);
  tests.push({
    id, title: e.title.replace(/\s*@[\w.]+/g, '').replace(/^\S+\s*·?\s*/, ''), project: e.project, level, section, tags, status,
    ms: e.r.duration, expected: ann.expected?.join('\n') ?? '', source: ann.source?.join('\n') ?? '', frbr: ann.frbr?.join(' ') ?? '',
    rules: ann.rules?.join(' ') ?? '', pending: ann.pending ?? [], notAutomated: ann['not-automated'] ?? [],
    steps: steps(e.r.steps), errors, shots, gif: g ? `test-report/${g}` : null,
    triage: triage[id] ?? triage[`${id}|${e.project}`] ?? null,
    normal: cmp ? { status: cmp.status, errors: cmp.errors } : null,
  });
}

// ---------- ตัดสินตามหัวข้อ 6 ----------
function verdict(project) {
  const ts = tests.filter((t) => t.project === project);
  const ok = (t) => t.status === 'passed' || t.status === 'flaky';
  const p1 = ts.filter((t) => t.level === 'P1');
  const need = Math.ceil(ts.length * 0.9);
  const pass = ts.filter(ok).length;
  const sections = {};
  for (const t of ts) { const s = (sections[t.section] ??= { n: 0, pass: 0 }); s.n++; if (ok(t)) s.pass++; }
  return { project, total: ts.length, pass, need, p1: p1.length, p1pass: p1.filter(ok).length, flaky: ts.filter((t) => t.status === 'flaky').length,
    ok: ts.length > 0 && p1.every(ok) && pass >= need, sections };
}
const projects = [...new Set(tests.map((t) => t.project))];
const verdicts = projects.map(verdict);
let bugMode = '?';
try { bugMode = existsSync(`${RAW}/bug-mode.txt`) ? readFileSync(`${RAW}/bug-mode.txt`, 'utf8').trim() : '?'; } catch {}
const stats = existsSync(`${RAW}/docker-stats.json`) ? JSON.parse(readFileSync(`${RAW}/docker-stats.json`, 'utf8')).map(({ raw, ...r }) => r) : [];
const data = { tag, bugMode, generatedAt: new Date().toISOString(), verdicts, tests, stats, planP1Note: /P1 ผ่านทั้งหมด \| \*\*50\/50\*\*/.test(planText) ? 'แผนหัวข้อ 6.2 เขียน P1 50/50 แต่การ์ดติด P1 จริง 52 ข้อ · รายงานนี้ใช้จำนวนจริงจากแท็ก' : '' };
writeFileSync(`${OUT}/data.json`, JSON.stringify(data, null, 1));

// ---------- HTML ----------
const html = readFileSync('scripts/report-template.html', 'utf8').replace('/*__DATA__*/null', JSON.stringify(data).replace(/</g, '\\u003c'));
writeFileSync('index.html', html);
for (const v of verdicts) console.log(`${v.project}: ${v.ok ? 'ผ่านเกณฑ์' : 'ไม่ผ่านเกณฑ์'} · P1 ${v.p1pass}/${v.p1} · รวม ${v.pass}/${v.total} (ต้อง ≥ ${v.need}) · flaky ${v.flaky}`);
console.log(`tests ${tests.length} · GIF ${tests.filter((t) => t.gif).length} · bug-mode ${bugMode}`);
