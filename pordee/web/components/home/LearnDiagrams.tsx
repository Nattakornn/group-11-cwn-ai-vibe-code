// F1 · แผนภาพ SVG ของหน้าเริ่มต้นลงทุน (เขียนเอง · ข้อมูลสมมติ ไม่ใช่หุ้นตัวใด)
import s from './learn.module.css';

type L = Record<string, string>;
const r1 = (n: number) => Math.round(n * 10) / 10;

function Legend({ items }: { items: { cls: string; label: string }[] }) {
  return (
    <div className={s.legend}>
      {items.map((it) => (
        <span key={it.label}><i className={`${s.sw} ${it.cls}`} aria-hidden="true" />{it.label}</span>
      ))}
    </div>
  );
}

/** P/E: ราคา $50 = กำไรปีละ $2.50 ซ้อนกัน 20 ก้อน */
export function PeDiagram({ l }: { l: L }) {
  const blocks = Array.from({ length: 20 }, (_, i) => i);
  return (
    <figure className={s.fig} data-testid="learn-diagram-pe">
      <svg viewBox="0 0 320 200" role="img" aria-label={`${l.price} $50 ÷ ${l.eps} $2.50 = ${l.result} 20`}>
        {blocks.map((i) => (
          <rect key={i} x="40" y={r1(176 - (i + 1) * 8)} width="56" height="7" rx="1.5" className={i === 0 ? s.fMint : i % 2 ? s.fGold : s.fGoldSoft} />
        ))}
        <text x="68" y="10" textAnchor="middle" className={s.t}>$50</text>
        <text x="68" y="194" textAnchor="middle" className={s.tMuted}>{l.price}</text>
        <path d="M104 172 C132 172 130 108 156 108" className={s.arrow} />
        <rect x="164" y="104" width="56" height="7" rx="1.5" className={s.fMint} />
        <text x="192" y="96" textAnchor="middle" className={`num ${s.t}`}>$2.50</text>
        <text x="192" y="76" textAnchor="middle" className={s.tMuted}>{l.eps}</text>
        <text x="240" y="114" className={s.tMuted}>=</text>
        <circle cx="282" cy="110" r="30" className={s.fNavy} />
        <text x="282" y="106" textAnchor="middle" className={s.tOnDark}>{l.result}</text>
        <text x="282" y="124" textAnchor="middle" className={s.tOnDarkBig}>20</text>
      </svg>
      <Legend items={[{ cls: s.fMint, label: l.eps }, { cls: s.fGold, label: l.price }]} />
    </figure>
  );
}

/** อัตราปันผล: วงโดนัท 3% */
export function DividendDiagram({ l }: { l: L }) {
  const R = 64;
  const circ = 2 * Math.PI * R;
  return (
    <figure className={s.fig} data-testid="learn-diagram-div">
      <svg viewBox="0 0 320 180" role="img" aria-label={`${l.yield} 3%`}>
        <g transform="translate(110 90) rotate(-90)">
          <circle r={R} className={s.donutRest} />
          <circle r={R} className={s.donutPart} strokeDasharray={`${r1(circ * 0.03)} ${r1(circ)}`} />
        </g>
        <text x="110" y="86" textAnchor="middle" className={s.tBig}>3%</text>
        <text x="110" y="108" textAnchor="middle" className={s.tMuted}>$1.50 / $50</text>
        <g className={s.coins}>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${236 + i * 6} ${118 - i * 22})`}>
              <ellipse rx="26" ry="9" cy="6" className={s.fGold} />
              <ellipse rx="26" ry="9" className={s.fGoldSoft} />
            </g>
          ))}
        </g>
      </svg>
      <Legend items={[{ cls: s.fMint, label: l.yield }, { cls: s.fLine, label: l.rest }]} />
    </figure>
  );
}

// เส้นราคาสมมติแบบตายตัวสำหรับแผนภาพค่าเฉลี่ย / การตัดกัน
const NP = 90;
const px = Array.from({ length: NP }, (_, i) => 60 + 22 * Math.sin(i / 14) + 6 * Math.sin(i / 2.3) + 3 * Math.cos(i * 1.3) + i * 0.15);
const avg = (arr: number[], n: number) => arr.map((_, i) => {
  const w = arr.slice(Math.max(0, i - n + 1), i + 1);
  return w.reduce((a, b) => a + b, 0) / w.length;
});
function path(vals: number[], w: number, h: number, lo: number, hi: number, pad = 8) {
  return vals.map((v, i) => `${i ? 'L' : 'M'}${r1(pad + (i / (vals.length - 1)) * (w - pad * 2))} ${r1(pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2))}`).join(' ');
}

/** ค่าเฉลี่ย 50 / 200 วัน (ย่อสเกลเป็นภาพ) */
export function SmaDiagram({ l }: { l: L }) {
  const fast = avg(px, 10);
  const slow = avg(px, 32);
  const lo = Math.min(...px) - 2;
  const hi = Math.max(...px) + 2;
  return (
    <figure className={s.fig} data-testid="learn-diagram-sma">
      <svg viewBox="0 0 320 170" role="img" aria-label={`${l.price}, ${l.s50}, ${l.s200}`}>
        <path d={path(px, 320, 170, lo, hi)} className={s.lPrice} />
        <path d={path(fast, 320, 170, lo, hi)} className={s.lFast} />
        <path d={path(slow, 320, 170, lo, hi)} className={s.lSlow} />
      </svg>
      <Legend items={[{ cls: s.swPrice, label: l.price }, { cls: s.swFast, label: l.s50 }, { cls: s.swSlow, label: l.s200 }]} />
    </figure>
  );
}

/** RSI: แถบ 0–100 แบ่งโซน ≤30 / ปกติ / ≥70 พร้อมเส้น RSI สมมติ */
export function RsiDiagram({ l }: { l: L }) {
  const W = 320;
  const H = 160;
  const y = (v: number) => r1(10 + (1 - v / 100) * (H - 20));
  const rsi = Array.from({ length: 60 }, (_, i) => 50 + 28 * Math.sin(i / 6) + 6 * Math.sin(i / 1.7));
  const line = rsi.map((v, i) => `${i ? 'L' : 'M'}${r1(30 + (i / 59) * (W - 40))} ${y(v)}`).join(' ');
  return (
    <figure className={s.fig} data-testid="learn-diagram-rsi">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${l.high}, ${l.mid}, ${l.low}`}>
        <rect x="30" y={y(100)} width={W - 40} height={y(70) - y(100)} className={s.zoneHigh} />
        <rect x="30" y={y(30)} width={W - 40} height={y(0) - y(30)} className={s.zoneLow} />
        <line x1="30" x2={W - 10} y1={y(70)} y2={y(70)} className={s.dash} />
        <line x1="30" x2={W - 10} y1={y(30)} y2={y(30)} className={s.dash} />
        <text x="24" y={y(70) + 4} textAnchor="end" className={s.tMuted}>70</text>
        <text x="24" y={y(30) + 4} textAnchor="end" className={s.tMuted}>30</text>
        <text x="24" y={y(100) + 8} textAnchor="end" className={s.tMuted}>100</text>
        <text x="24" y={y(0)} textAnchor="end" className={s.tMuted}>0</text>
        <path d={line} className={s.lRsi} />
      </svg>
      <Legend items={[{ cls: s.zoneHigh, label: l.high }, { cls: s.swRsi, label: l.mid }, { cls: s.zoneLow, label: l.low }]} />
    </figure>
  );
}

/** Golden / Death Cross: เส้นเร็วตัดเส้นช้า */
export function CrossDiagram({ l }: { l: L }) {
  const W = 320;
  const H = 170;
  const fast = Array.from({ length: 100 }, (_, i) => 50 + 30 * Math.sin((i - 17.5) / 16));
  const slow = Array.from({ length: 100 }, () => 50);
  const xs = (i: number) => r1(10 + (i / 99) * (W - 20));
  const ys = (v: number) => r1(14 + (1 - (v - 15) / 70) * (H - 28));
  const toD = (a: number[]) => a.map((v, i) => `${i ? 'L' : 'M'}${xs(i)} ${ys(v)}`).join(' ');
  const crosses: { i: number; kind: 'golden' | 'death' }[] = [];
  for (let i = 1; i < 100; i++) {
    if (fast[i - 1] < slow[i - 1] && fast[i] > slow[i]) crosses.push({ i, kind: 'golden' });
    if (fast[i - 1] > slow[i - 1] && fast[i] < slow[i]) crosses.push({ i, kind: 'death' });
  }
  return (
    <figure className={s.fig} data-testid="learn-diagram-cross">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${l.golden}, ${l.death}`}>
        <path d={toD(slow)} className={s.lSlow} />
        <path d={toD(fast)} className={s.lFast} />
        {crosses.map((c) => (
          <g key={c.i}>
            <circle cx={xs(c.i)} cy={ys(slow[c.i])} r="9" className={c.kind === 'golden' ? s.mGolden : s.mDeath} />
            <circle cx={xs(c.i)} cy={ys(slow[c.i])} r="3" className={s.mCore} />
          </g>
        ))}
      </svg>
      <Legend items={[
        { cls: s.swFast, label: l.s50 }, { cls: s.swSlow, label: l.s200 },
        { cls: s.mGolden, label: l.golden }, { cls: s.mDeath, label: l.death },
      ]} />
    </figure>
  );
}

/** ราคาล่าช้า 15 นาที: เส้นเวลา 2 เส้น */
export function DelayDiagram({ l }: { l: L }) {
  const times = ['21:30', '21:45', '22:00', '22:15', '22:30'];
  return (
    <figure className={s.fig} data-testid="learn-diagram-delay">
      <svg viewBox="0 0 320 150" role="img" aria-label={`${l.real} 22:00 · ${l.shown} 22:15`}>
        {times.map((tm, i) => (
          <g key={tm}>
            <line x1={30 + i * 65} x2={30 + i * 65} y1="30" y2="112" className={s.grid} />
            <text x={30 + i * 65} y="140" textAnchor="middle" className={`num ${s.tMuted}`}>{tm}</text>
          </g>
        ))}
        <line x1="20" x2="300" y1="44" y2="44" className={s.track} />
        <line x1="20" x2="300" y1="98" y2="98" className={s.track} />
        <circle cx="160" cy="44" r="10" className={s.fMint} />
        <circle cx="225" cy="98" r="10" className={s.fGold} />
        <path d="M166 54 L219 89" className={s.arrow} />
        <text x="160" y="22" textAnchor="middle" className={`num ${s.t}`}>$100.00</text>
        <text x="238" y="84" textAnchor="start" className={`num ${s.t}`}>$100.00</text>
      </svg>
      <Legend items={[{ cls: s.fMint, label: l.real }, { cls: s.fGold, label: l.shown }]} />
    </figure>
  );
}

/** ตัวคัดกรอง: กรวยกรอง 3 ชั้น */
export function ScreenerDiagram({ l }: { l: L }) {
  const rows = [
    { w: 280, label: l.all, cls: s.fLine },
    { w: 220, label: l.pe, cls: s.fGoldSoft },
    { w: 160, label: l.div, cls: s.fGoldSoft },
    { w: 100, label: l.result, cls: s.fMint },
  ];
  return (
    <figure className={s.fig} data-testid="learn-diagram-screener">
      <div className={s.funnel} role="img" aria-label={rows.map((r) => r.label).join(' → ')}>
        {rows.map((r, i) => (
          <div key={i} className={`${s.funnelRow} ${r.cls}`} style={{ width: `${(r.w / 280) * 100}%` }}>
            <span>{r.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
