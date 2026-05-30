import { NextResponse } from "next/server";

import { createSecurityHeaders } from "@/lib/securityHeaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const headers = createSecurityHeaders("api");
  headers.set("Cache-Control", "no-store");

  return NextResponse.json(
    { status: "ok" },
    {
      headers,
      status: 200,
    },
  );
}
