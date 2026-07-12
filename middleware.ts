import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE } from "@/lib/auth-constants";
import { isAuthDevBypassEnabled } from "@/lib/auth-mode";

export function middleware(request: NextRequest) {
  if (isAuthDevBypassEnabled()) {
    return NextResponse.next();
  }

  if (!request.cookies.get(AUTH_COOKIE)?.value) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};