import { isFrozen } from './lib/clock';
import { runJobs } from './lib/jobs';
const g = globalThis as unknown as { __pordeeJobs?: NodeJS.Timeout };
if (!g.__pordeeJobs) {
  g.__pordeeJobs = setInterval(async () => {
    try { if (!(await isFrozen())) await runJobs(new Date()); } catch (e) { console.error('jobs loop', e); }
  }, 60_000);
}
