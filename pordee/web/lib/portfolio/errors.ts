// ข้อความ error ของโมดูลพอร์ต (API-CONTRACT ส่วนที่ 3) · 2 ภาษาคำต่อคำ
import { ApiError } from '@/lib/http';

export const PE = {
  invalidShares: () => new ApiError(400, 'INVALID_SHARES',
    'จำนวนหุ้นต้องมากกว่า 0 และมีทศนิยมไม่เกิน 4 ตำแหน่ง', 'Shares must be greater than 0 with at most 4 decimal places'),
  invalidPrice: () => new ApiError(400, 'INVALID_PRICE', 'ราคาต้องมากกว่า 0', 'Price must be greater than 0'),
  priceDecimals: () => new ApiError(400, 'INVALID_PRICE',
    'ราคามีทศนิยมได้ไม่เกิน 4 ตำแหน่ง', 'Price can have at most 4 decimal places'),
  futureDate: () => new ApiError(400, 'FUTURE_DATE',
    'วันที่ซื้อขายอยู่ในอนาคต จดได้เฉพาะวันนี้หรือก่อนหน้า', 'Trade date is in the future. Only today or earlier is allowed'),
  invalidFeeRate: () => new ApiError(400, 'INVALID_FEE_RATE',
    'อัตราค่าธรรมเนียมต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป ทศนิยมไม่เกิน 4 ตำแหน่ง', 'Fee rate must be a number of 0 or more with at most 4 decimal places'),
  invalidFeeMin: () => new ApiError(400, 'INVALID_FEE_MIN',
    'ค่าธรรมเนียมขั้นต่ำต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป ทศนิยมไม่เกิน 2 ตำแหน่ง', 'Minimum fee must be a number of 0 or more with at most 2 decimal places'),
  insufficient: () => new ApiError(409, 'INSUFFICIENT_SHARES', 'มีหุ้นไม่พอ', 'Not enough shares'),
  dayOutOfRange: () => new ApiError(400, 'DAY_OUT_OF_RANGE', 'เลือกวันที่ 1–28', 'Choose a day from 1 to 28'),
  planExists: () => new ApiError(409, 'PLAN_EXISTS', 'มีแผนของหุ้นนี้แล้ว', 'A plan for this stock already exists'),
  alreadyConfirmed: () => new ApiError(409, 'ALREADY_DONE', 'รายการนี้ยืนยันแล้ว', 'This item has already been confirmed'),
  alreadySkipped: () => new ApiError(409, 'ALREADY_DONE', 'รายการนี้ข้ามไปแล้ว', 'This item was skipped'),
};
