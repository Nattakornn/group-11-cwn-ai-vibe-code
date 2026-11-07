// F1 · กราฟเส้นภาพประกอบใน hero วาดด้วย SVG เอง (ข้อมูลสมมติแบบคงที่ ไม่ใช่ราคาจริง)
// เส้นค่อย ๆ วาดขึ้นด้วย CSS (stroke-dashoffset) · ปิดเองเมื่อ prefers-reduced-motion
import s from './home.module.css';

const W = 640;
const H = 340;
const PAD = { l: 8, r: 28, t: 28, b: 64 };
const N = 72;

// ข้อมูลสมมติแบบกำหนดตายตัว (ได้ค่าเดิมทุกครั้ง ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์)
const raw = Array.from({ length: N }, (_, i) =>
  100 + i * 0.62 + 7 * Math.sin(i / 3.4) + 3.2 * Math.sin(i / 1.25 + 1) + 1.6 * Math.cos(i / 0.66) - (i > 40 && i < 50 ? (i - 40) * 1.1 : 0) + (i >= 50 ? 11 - (i - 50) * 0.2 : 0),
);
const sma = raw.map((_, i) => {
  const from = Math.max(0, i - 9);
  const win = raw.slice(from, i + 1);
  return win.reduce((a, b) => a + b, 0) / win.length;
});
const vol = Array.from({ length: N }, (_, i) => 0.35 + 0.3 * Math.abs(Math.sin(i * 1.7)) + 0.25 * Math.abs(Math.cos(i / 2.3)));

const lo = Math.min(...raw, ...sma) - 4;
const hi = Math.max(...raw, ...sma) + 4;
const x = (i: number) => PAD.l + (i / (N - 1)) * (W - PAD.l - PAD.r);
const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** เส้นโค้งนุ่มผ่านทุกจุด (Catmull-Rom → Bézier) */
function smooth(vals: number[]): string {
  const pts = vals.map((v, i) => [x(i), y(v)] as const);
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}

const LINE = smooth(raw);
const SMA = smooth(sma);
const AREA = `${LINE} L${r1(x(N - 1))} ${H - PAD.b} L${r1(x(0))} ${H - PAD.b} Z`;
const END = { x: r1(x(N - 1)), y: r1(y(raw[N - 1])) };
const GRID = [0.2, 0.4, 0.6, 0.8].map((f) => r1(PAD.t + f * (H - PAD.t - PAD.b)));

export function HeroChart({ caption, lineLabel, smaLabel, alt }: { caption: string; lineLabel: string; smaLabel: string; alt: string }) {
  return (
    <figure className={s.heroChart} data-testid="home-hero-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="hcArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3fd1a6" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#3fd1a6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hcLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7fe3c4" />
            <stop offset="100%" stopColor="#3fd1a6" />
          </linearGradient>
          <filter id="hcGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {GRID.map((gy) => (
          <line key={gy} x1={PAD.l} x2={W - PAD.r} y1={gy} y2={gy} stroke="#ffffff" strokeOpacity="0.08" strokeDasharray="2 6" />
        ))}
        <g className={s.hcVol}>
          {vol.map((v, i) => (
            <rect key={i} x={r1(x(i) - 2.4)} width="4.8" y={r1(H - 18 - v * 36)} height={r1(v * 36)} rx="1.5"
              fill={raw[i] >= (raw[i - 1] ?? raw[i]) ? '#3fd1a6' : '#ef7a62'} fillOpacity="0.32" />
          ))}
        </g>
        <path d={AREA} fill="url(#hcArea)" className={s.hcArea} />
        <path d={SMA} fill="none" stroke="#d8b25a" strokeWidth="2" strokeDasharray="6 6" strokeLinecap="round" className={s.hcSma} />
        <path d={LINE} fill="none" stroke="url(#hcLine)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
          pathLength={1} className={s.hcLine} filter="url(#hcGlow)" />
        <g className={s.hcEnd}>
          <circle cx={END.x} cy={END.y} r="14" fill="#3fd1a6" className={s.hcPulse} />
          <circle cx={END.x} cy={END.y} r="6" fill="#ffffff" stroke="#3fd1a6" strokeWidth="3" />
        </g>
      </svg>
      <figcaption className={s.heroLegend}>
        <span><i className={s.legLine} aria-hidden="true" />{lineLabel}</span>
        <span><i className={s.legSma} aria-hidden="true" />{smaLabel}</span>
        <span className={s.heroCaption}>{caption}</span>
      </figcaption>
    </figure>
  );
}

/** ลายไทยร่วมสมัยแบบเรขาคณิต (ดอกสี่กลีบ) วางเป็นพื้นหลังจาง ๆ */
export function ThaiPattern() {
  return (
    <svg className={s.heroPattern} aria-hidden="true" focusable="false">
      <defs>
        <pattern id="thaiFlower" width="56" height="56" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#d8b25a" strokeWidth="1">
            <path d="M28 14 C33 20 33 24 28 28 C23 24 23 20 28 14 Z" />
            <path d="M28 42 C33 36 33 32 28 28 C23 32 23 36 28 42 Z" />
            <path d="M14 28 C20 23 24 23 28 28 C24 33 20 33 14 28 Z" />
            <path d="M42 28 C36 23 32 23 28 28 C32 33 36 33 42 28 Z" />
            <path d="M0 0 L6 0 M0 0 L0 6 M56 56 L50 56 M56 56 L56 50 M56 0 L50 0 M56 0 L56 6 M0 56 L6 56 M0 56 L0 50" />
          </g>
          <circle cx="28" cy="28" r="1.6" fill="#d8b25a" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#thaiFlower)" />
    </svg>
  );
}
