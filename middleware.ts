import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { applySecurityHeaders } from "@/lib/securityHeaders";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname =
    "nextUrl" in request && request.nextUrl
      ? request.nextUrl.pathname
      : new URL(request.url).pathname;
  const isApiRequest = pathname.startsWith("/api/");

  applySecurityHeaders(response.headers, isApiRequest);

  return response;
}
