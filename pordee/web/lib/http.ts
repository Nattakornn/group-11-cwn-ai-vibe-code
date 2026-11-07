// รูปแบบตอบกลับของ API ทุกเส้น · error = {"error":{"code","message"}} ภาษาตาม ?lang= (ค่าเริ่มต้น th)
import { NextResponse, type NextRequest } from 'next/server';
import { StockNotFound } from './feed';

export type Lang = 'th' | 'en';

export class ApiError extends Error {
  constructor(public status: number, public code: string, public th: string, public en: string,
    public extra?: Record<string, unknown>) { super(code); }
}

export const langOf = (req: NextRequest | Request): Lang => {
  const u = new URL(req.url);
  const l = u.searchParams.get('lang') ?? req.headers.get('x-lang');
  return l === 'en' ? 'en' : 'th';
};

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** ห่อ handler: จับ ApiError / หุ้นไม่พบ / error อื่น แล้วตอบรูปแบบเดียวกัน */
export function handle<C = unknown>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      const lang = langOf(req);
      if (e instanceof ApiError) {
        return json({ error: { code: e.code, message: lang === 'en' ? e.en : e.th, ...(e.extra ?? {}) } }, e.status);
      }
      if (e instanceof StockNotFound) {
        return json({ error: e.otc
          ? { code: 'OTC_NOT_SUPPORTED', message: lang === 'en' ? 'OTC stocks are not supported (NYSE / NASDAQ only)' : 'ไม่รองรับหุ้นนอกตลาด NYSE / NASDAQ' }
          : { code: 'NOT_FOUND', message: lang === 'en' ? 'Stock not found' : 'ไม่พบหุ้นนี้' } }, 404);
      }
      console.error(e);
      return json({ error: { code: 'INTERNAL', message: lang === 'en' ? 'Something went wrong' : 'เกิดข้อผิดพลาด กรุณาลองใหม่' } }, 500);
    }
  };
}

/** อ่าน body JSON (ไม่มี = {}) */
export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

export const E = {
  unauth: () => new ApiError(401, 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ', 'Please log in'),
  forbidden: () => new ApiError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึง', 'Access denied'),
  notFound: () => new ApiError(404, 'NOT_FOUND', 'ไม่พบข้อมูล', 'Not found'),
  bad: (th = 'ข้อมูลไม่ถูกต้อง', en = 'Invalid input') => new ApiError(400, 'INVALID_INPUT', th, en),
  proOnly: () => new ApiError(403, 'PRO_ONLY', 'ฟีเจอร์นี้สำหรับสมาชิก Pro', 'This feature is for Pro members'),
};
