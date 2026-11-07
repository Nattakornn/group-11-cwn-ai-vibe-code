// ทุก path ที่ไม่มีภาษา -> /th/...
import { NextResponse, type NextRequest } from 'next/server';
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (/^\/(th|en)(\/|$)/.test(pathname)) return NextResponse.next();
  return NextResponse.redirect(new URL(`/th${pathname === '/' ? '' : pathname}${search}`, req.url));
}
export const config = { matcher: ['/((?!api|_next|favicon.ico|.*\\..*).*)'] };
