import { NextResponse } from "next/server";

import { createSecurityHeaders } from "@/lib/securityHeaders";

export const runtime = "nodejs";

export async function GET() {
  const redisConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );

  return NextResponse.json(
    {
      redis: redisConfigured ? "configured" : "not_configured",
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    {
      headers: createSecurityHeaders("api"),
      status: 200,
    },
  );
}
