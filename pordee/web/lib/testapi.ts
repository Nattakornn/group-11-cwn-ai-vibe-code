// เปิดใช้ API ทดสอบเมื่อ ALLOW_TEST_API=1 เท่านั้น (ปิด = 404)
import { ApiError } from './http';
import { testApiEnabled } from './clock';
export function assertTestApi() {
  if (!testApiEnabled()) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบข้อมูล', 'Not found');
}
export function parseNow(v: unknown): Date {
  const d = new Date(String(v));
  if (typeof v !== 'string' || Number.isNaN(d.getTime())) throw new ApiError(400, 'INVALID_INPUT', 'now ต้องเป็นวันเวลา ISO', 'now must be an ISO datetime');
  return d;
}
