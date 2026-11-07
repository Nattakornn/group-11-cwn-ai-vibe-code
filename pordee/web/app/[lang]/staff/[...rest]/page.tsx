// path ย่อยที่ไม่มีจริงใต้ /staff → หน้า 404 ของเว็บ (app/[lang]/not-found.tsx)
import { notFound } from 'next/navigation';

export default function StaffUnknown() { notFound(); }
