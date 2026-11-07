// เรียก API จากเบราว์เซอร์ · คืน {ok, status, data, error} ไม่ throw
export type ApiResult<T> = { ok: boolean; status: number; data: T | null; error: { code: string; message: string } | null };

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; lang?: 'th' | 'en' } = {}): Promise<ApiResult<T>> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${path}${opts.lang ? `${sep}lang=${opts.lang}` : ''}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers: opts.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: 'no-store',
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* ไม่ใช่ JSON */ }
  return { ok: res.ok, status: res.status, data: res.ok ? data : null, error: res.ok ? null : data?.error ?? { code: 'HTTP_' + res.status, message: String(res.status) } };
}
