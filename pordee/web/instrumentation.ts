// เริ่มงานตามเวลาทุก 60 วินาทีตอนเซิร์ฟเวอร์เปิด (โค้ดฝั่ง Node อยู่ใน instrumentation-node.ts)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./instrumentation-node');
}
