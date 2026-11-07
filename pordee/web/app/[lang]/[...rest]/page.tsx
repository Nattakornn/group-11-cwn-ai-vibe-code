// ทุก path ที่ไม่มีจริงใต้ /{lang} ไปหน้า 404 ของเรา (F8 not-found.tsx)
import { notFound } from 'next/navigation';
export default function CatchAll() { notFound(); }
