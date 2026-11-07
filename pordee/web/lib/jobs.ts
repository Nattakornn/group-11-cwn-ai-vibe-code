// งานตามเวลา (DESIGN lib/jobs) · ทุก 60 วินาที เมื่อนาฬิกาไม่ถูกล็อก · หรือ POST /api/test/tick
// แต่ละโมดูลส่งงานผ่าน lib/<โมดูล>/jobs.ts ที่ export `jobs: Job[]`
export type Job = { name: string; run: (now: Date) => Promise<unknown> };

export async function allJobs(): Promise<Job[]> {
  const mods = await Promise.all([
    import('./account/jobs'),   // A3: ต่ออายุ Pro · ลบบัญชี
    import('./alerts/jobs'),    // A4: ประเมินแจ้งเตือน
    import('./portfolio/jobs'), // A2: DCA · ปันผล
  ]);
  return mods.flatMap((m) => m.jobs);
}

/** รันทุกงานตามลำดับ คืนผลของแต่ละงาน */
export async function runJobs(now: Date): Promise<{ name: string; ok: boolean; result?: unknown; error?: string }[]> {
  const out = [];
  for (const j of await allJobs()) {
    try { out.push({ name: j.name, ok: true, result: await j.run(now) }); }
    catch (e) { console.error(`job ${j.name}`, e); out.push({ name: j.name, ok: false, error: String(e) }); }
  }
  return out;
}
