// งานตามเวลาของโมดูลพอร์ต (API-CONTRACT ส่วนที่ 3) · ลงทะเบียนอยู่แล้วใน lib/jobs.ts
import type { Job } from '../jobs';
import { runDcaJob } from './dca';
import { runDividendJob } from './dividends';

export const jobs: Job[] = [
  { name: 'dca', run: (now) => runDcaJob(now) },
  { name: 'dividends', run: (now) => runDividendJob(now) },
];
