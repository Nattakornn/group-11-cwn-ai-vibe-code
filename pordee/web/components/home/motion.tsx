'use client';
// F1 · เอฟเฟกต์เลื่อนแล้วค่อย ๆ ปรากฏ + ตัวเลขนับขึ้น · เคารพ prefers-reduced-motion
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import s from './home.module.css';

/** ไม่ทำแอนิเมชันเมื่อผู้ใช้ขอลดการเคลื่อนไหว หรือรันใต้เครื่องมือทดสอบอัตโนมัติ */
function motionOff(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  return typeof navigator !== 'undefined' && (navigator as Navigator & { webdriver?: boolean }).webdriver === true;
}

/**
 * ค่อย ๆ ปรากฏเมื่อเลื่อนมาถึง · ตอน SSR แสดงตามปกติเสมอ (ไม่มี JS ก็ยังเห็น)
 * ซ่อนเฉพาะกล่องที่ยังอยู่ใต้จอตอนโหลด แล้วเผยเมื่อเข้ามาในจอ
 */
export function Reveal({ children, className, delay = 0, style }: { children: ReactNode; className?: string; delay?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || motionOff() || typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) return;
    setPending(true);
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setPending(false); io.disconnect(); }
    }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`${s.reveal} ${pending ? s.revealPending : ''} ${className ?? ''}`} style={{ ...style, transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** ตัวเลขจำนวนเต็มนับขึ้นจาก 0 เมื่อเห็น · data-value = ค่าจริงตั้งแต่แรก */
export function CountUp({ value, testid, className }: { value: number | null; testid: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  // ค่าเริ่มเท่ากับค่าจริงทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ (ไม่ให้ hydrate ไม่ตรง)
  const [shown, setShown] = useState<number | null>(value);
  useEffect(() => {
    if (value === null) { setShown(null); return; }
    const el = ref.current;
    if (!el || motionOff() || typeof IntersectionObserver === 'undefined') { setShown(value); return; }
    // ระหว่างยังไม่เห็น แสดงค่าจริงไว้ (เครื่องมือทดสอบอ่านได้เลย) แล้วเริ่มนับจาก 0 เมื่อเลื่อนมาถึง
    let raf = 0;
    const run = () => {
      const start = performance.now();
      const dur = 1200;
      const step = (t: number) => {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(Math.round(value * eased));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run(); }
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value]);
  return (
    <span ref={ref} className={`num ${className ?? ''}`} data-testid={testid} data-value={value ?? ''}>
      {shown === null ? '—' : shown.toLocaleString('en-US')}
    </span>
  );
}
