// หน้าหุ้น: ข้อมูลพื้นฐาน + ราคาปัจจุบัน (FR-03, FR-07, FR-08) · หุ้นถูกถอดเปิดได้ (ราคาสุดท้ายค้างไว้)
import { getQuote, type Quote } from '@/lib/feed';
import { findStock, stockInfo } from './search';

export async function getStockDetail(symbol: string): Promise<{ stock: ReturnType<typeof stockInfo>; quote: Quote }> {
  const s = await findStock(symbol);
  const quote = await getQuote(s.symbol);
  return { stock: stockInfo(s), quote };
}
