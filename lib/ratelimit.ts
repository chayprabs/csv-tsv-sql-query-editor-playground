import { isIP } from "node:net";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

import { ClientError } from "./errorSanitizer.ts";
import { getRuntimeConfig } from "./runtimeConfig.ts";

const BANDWIDTH_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_PREFIX = "flatfile-sql-studio";
const REQUEST_WINDOW_MS = 60 * 1000;

interface FixedWindowEntry {
  resetAt: number;
  used: number;
}

interface MemoryState {
  bandwidth: Map<string, FixedWindowEntry>;
  concurrency: Map<string, number>;
  globalConcurrency: number;
  requestWindows: Map<string, number[]>;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetInSeconds: number;
}

export interface ConcurrencyLease {
  release: () => Promise<void>;
}

const memoryState: MemoryState = {
  bandwidth: new Map<string, FixedWindowEntry>(),
  concurrency: new Map<string, number>(),
  globalConcurrency: 0,
  requestWindows: new Map<string, number[]>(),
};

let cachedRedisBackend:
  | {
      redis: Redis;
      requestLimiter: Ratelimit;
      signature: string;
    }
  | undefined;

function getRedisBackend() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    cachedRedisBackend = undefined;
    return undefined;
  }

  const signature = `${url}:${token}`;

  if (cachedRedisBackend?.signature === signature) {
    return cachedRedisBackend;
  }

  const redis = new Redis({
    token,
    url,
  });
  const { rateLimitRequestsPerMinute } = getRuntimeConfig();

  cachedRedisBackend = {
    redis,
    requestLimiter: new Ratelimit({
      limiter: Ratelimit.slidingWindow(rateLimitRequestsPerMinute, "1 m"),
      prefix: `${RATE_LIMIT_PREFIX}:requests`,
      redis,
    }),
    signature,
  };

  return cachedRedisBackend;
}

function normalizeIp(value: string | undefined | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  if (isIP(trimmed)) {
    return trimmed;
  }

  if (/^\[[^\]]+\]:\d+$/.test(trimmed)) {
    const bracketValue = trimmed.slice(1, trimmed.indexOf("]"));

    if (isIP(bracketValue)) {
      return bracketValue;
    }
  }

  const parts = trimmed.split(":");

  if (parts.length === 2 && isIP(parts[0]) === 4) {
    return parts[0];
  }

  return undefined;
}

function getRequestIpFallback(
  request: Request | NextRequest,
): string | undefined {
  const requestWithConnection = request as Request & {
    connection?: { remoteAddress?: string };
    ip?: string;
    socket?: { remoteAddress?: string };
  };

  return normalizeIp(
    requestWithConnection.ip ??
      requestWithConnection.socket?.remoteAddress ??
      requestWithConnection.connection?.remoteAddress,
  );
}

export function extractClientIp(request: Request | NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0];
    const normalized = normalizeIp(firstIp);

    if (normalized) {
      return normalized;
    }
  }

  const realIp = normalizeIp(request.headers.get("x-real-ip"));

  if (realIp) {
    return realIp;
  }

  return getRequestIpFallback(request) ?? "unknown";
}

function secondsUntil(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

function getMemoryFixedWindow(
  map: Map<string, FixedWindowEntry>,
  key: string,
  windowMs: number,
): FixedWindowEntry {
  const now = Date.now();
  const current = map.get(key);

  if (!current || current.resetAt <= now) {
    const nextEntry = {
      resetAt: now + windowMs,
      used: 0,
    };

    map.set(key, nextEntry);
    return nextEntry;
  }

  return current;
}

async function getRedisTtlSeconds(redis: Redis, key: string, fallback: number) {
  const ttl = await redis.ttl(key);

  return ttl > 0 ? ttl : fallback;
}

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const backend = getRedisBackend();
  const { rateLimitRequestsPerMinute } = getRuntimeConfig();

  if (backend) {
    const result = await backend.requestLimiter.limit(identifier);

    return {
      allowed: result.success,
      limit: result.limit,
      remaining: result.remaining,
      resetInSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    };
  }

  const now = Date.now();
  const windowStart = now - REQUEST_WINDOW_MS;
  const timestamps = (memoryState.requestWindows.get(identifier) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );

  timestamps.push(now);
  memoryState.requestWindows.set(identifier, timestamps);

  const oldestTimestamp = timestamps[0] ?? now;

  return {
    allowed: timestamps.length <= rateLimitRequestsPerMinute,
    limit: rateLimitRequestsPerMinute,
    remaining: Math.max(0, rateLimitRequestsPerMinute - timestamps.length),
    resetInSeconds: secondsUntil(oldestTimestamp + REQUEST_WINDOW_MS),
  };
}

export async function peekUploadBandwidthLimit(
  identifier: string,
  bytes: number,
): Promise<RateLimitResult> {
  const backend = getRedisBackend();
  const { rateLimitBandwidthBytesPerHour } = getRuntimeConfig();

  if (backend) {
    const key = `${RATE_LIMIT_PREFIX}:bandwidth:${identifier}`;
    const used = (await backend.redis.get<number>(key)) ?? 0;
    const resetInSeconds = await getRedisTtlSeconds(
      backend.redis,
      key,
      Math.ceil(BANDWIDTH_WINDOW_MS / 1000),
    );
    const projected = used + bytes;

    return {
      allowed: projected <= rateLimitBandwidthBytesPerHour,
      limit: rateLimitBandwidthBytesPerHour,
      remaining: Math.max(0, rateLimitBandwidthBytesPerHour - projected),
      resetInSeconds,
    };
  }

  const entry = getMemoryFixedWindow(memoryState.bandwidth, identifier, BANDWIDTH_WINDOW_MS);
  const projected = entry.used + bytes;

  return {
    allowed: projected <= rateLimitBandwidthBytesPerHour,
    limit: rateLimitBandwidthBytesPerHour,
    remaining: Math.max(0, rateLimitBandwidthBytesPerHour - projected),
    resetInSeconds: secondsUntil(entry.resetAt),
  };
}

export async function commitUploadBandwidth(
  identifier: string,
  bytes: number,
): Promise<RateLimitResult> {
  const backend = getRedisBackend();
  const { rateLimitBandwidthBytesPerHour } = getRuntimeConfig();

  if (backend) {
    const key = `${RATE_LIMIT_PREFIX}:bandwidth:${identifier}`;
    const used = await backend.redis.incrby(key, bytes);
    let resetInSeconds = await getRedisTtlSeconds(
      backend.redis,
      key,
      Math.ceil(BANDWIDTH_WINDOW_MS / 1000),
    );

    if (resetInSeconds <= 0) {
      resetInSeconds = Math.ceil(BANDWIDTH_WINDOW_MS / 1000);
      await backend.redis.expire(key, resetInSeconds);
    }

    return {
      allowed: used <= rateLimitBandwidthBytesPerHour,
      limit: rateLimitBandwidthBytesPerHour,
      remaining: Math.max(0, rateLimitBandwidthBytesPerHour - used),
      resetInSeconds,
    };
  }

  const entry = getMemoryFixedWindow(memoryState.bandwidth, identifier, BANDWIDTH_WINDOW_MS);
  entry.used += bytes;

  return {
    allowed: entry.used <= rateLimitBandwidthBytesPerHour,
    limit: rateLimitBandwidthBytesPerHour,
    remaining: Math.max(0, rateLimitBandwidthBytesPerHour - entry.used),
    resetInSeconds: secondsUntil(entry.resetAt),
  };
}

async function acquireRedisCounter(
  key: string,
  limit: number,
  ttlSeconds: number,
): Promise<{
  allowed: boolean;
  release: () => Promise<void>;
}> {
  const backend = getRedisBackend();

  if (!backend) {
    throw new Error("Redis backend was not configured.");
  }

  const current = await backend.redis.incr(key);
  const ttl = await backend.redis.ttl(key);

  if (ttl <= 0) {
    await backend.redis.expire(key, ttlSeconds);
  }

  if (current > limit) {
    await backend.redis.decr(key);

    return {
      allowed: false,
      release: async () => undefined,
    };
  }

  let released = false;

  return {
    allowed: true,
    release: async () => {
      if (released) {
        return;
      }

      released = true;
      const next = await backend.redis.decr(key);

      if (next <= 0) {
        await backend.redis.del(key);
      }
    },
  };
}

function acquireMemoryCounter(
  map: Map<string, number>,
  key: string,
  limit: number,
): {
  allowed: boolean;
  release: () => Promise<void>;
} {
  const current = (map.get(key) ?? 0) + 1;

  if (current > limit) {
    return {
      allowed: false,
      release: async () => undefined,
    };
  }

  map.set(key, current);
  let released = false;

  return {
    allowed: true,
    release: async () => {
      if (released) {
        return;
      }

      released = true;
      const next = (map.get(key) ?? 1) - 1;

      if (next <= 0) {
        map.delete(key);
        return;
      }

      map.set(key, next);
    },
  };
}

async function acquireGlobalConcurrency(
  limit: number,
  ttlSeconds: number,
): Promise<{
  allowed: boolean;
  release: () => Promise<void>;
}> {
  const backend = getRedisBackend();
  const key = `${RATE_LIMIT_PREFIX}:concurrency:global`;

  if (backend) {
    return acquireRedisCounter(key, limit, ttlSeconds);
  }

  const current = memoryState.globalConcurrency + 1;

  if (current > limit) {
    return {
      allowed: false,
      release: async () => undefined,
    };
  }

  memoryState.globalConcurrency = current;
  let released = false;

  return {
    allowed: true,
    release: async () => {
      if (released) {
        return;
      }

      released = true;
      memoryState.globalConcurrency = Math.max(0, memoryState.globalConcurrency - 1);
    },
  };
}

export async function acquireConcurrencyLease(
  identifier: string,
): Promise<ConcurrencyLease> {
  const {
    queryTimeoutMs,
    rateLimitMaxConcurrentGlobal,
    rateLimitMaxConcurrentPerIp,
  } = getRuntimeConfig();
  const ttlSeconds = Math.max(120, Math.ceil(queryTimeoutMs / 1000) + 60);
  const backend = getRedisBackend();

  const perIpLease = backend
    ? await acquireRedisCounter(
        `${RATE_LIMIT_PREFIX}:concurrency:ip:${identifier}`,
        rateLimitMaxConcurrentPerIp,
        ttlSeconds,
      )
    : acquireMemoryCounter(
        memoryState.concurrency,
        identifier,
        rateLimitMaxConcurrentPerIp,
      );

  if (!perIpLease.allowed) {
    throw new ClientError(
      429,
      "Too many concurrent requests from your IP.",
      { code: "CONCURRENT_IP_LIMIT" },
    );
  }

  const globalLease = await acquireGlobalConcurrency(
    rateLimitMaxConcurrentGlobal,
    ttlSeconds,
  );

  if (!globalLease.allowed) {
    await perIpLease.release();
    throw new ClientError(503, "Server is busy. Try again in a moment.", {
      code: "CONCURRENT_GLOBAL_LIMIT",
    });
  }

  let released = false;

  return {
    release: async () => {
      if (released) {
        return;
      }

      released = true;
      await Promise.all([globalLease.release(), perIpLease.release()]);
    },
  };
}

export function buildRequestRateLimitError(result: RateLimitResult): ClientError {
  return new ClientError(
    429,
    `Too many requests. Try again in ${result.resetInSeconds} seconds.`,
    {
      code: "REQUEST_RATE_LIMIT",
      retryAfterSeconds: result.resetInSeconds,
    },
  );
}

export function buildBandwidthLimitError(result: RateLimitResult): ClientError {
  const resetInMinutes = Math.max(1, Math.ceil(result.resetInSeconds / 60));

  return new ClientError(
    429,
    `Upload limit reached. Resets in ${resetInMinutes} minutes.`,
    {
      code: "UPLOAD_BANDWIDTH_LIMIT",
      retryAfterSeconds: result.resetInSeconds,
    },
  );
}

export function __unsafeResetRateLimitState(): void {
  memoryState.bandwidth.clear();
  memoryState.concurrency.clear();
  memoryState.requestWindows.clear();
  memoryState.globalConcurrency = 0;
  cachedRedisBackend = undefined;
}
