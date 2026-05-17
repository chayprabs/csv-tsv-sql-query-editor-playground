import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/query/route";
import { executeCsvQuery } from "@/lib/csvToSqlite";
import {
  buildErrorResponseBody,
  createRequestId,
  sanitizeErrorMessage,
} from "@/lib/errorSanitizer";
import { middleware } from "@/middleware";
import {
  __unsafeResetRateLimitState,
  acquireConcurrencyLease,
  checkRateLimit,
  commitUploadBandwidth,
} from "@/lib/ratelimit";
import {
  buildDocumentContentSecurityPolicy,
  createSecurityHeaders,
} from "@/lib/securityHeaders";
import { shutdownQueryWorkerPool } from "@/lib/queryWorkerPool";

const DEFAULT_IP = "203.0.113.10";
const MEGABYTE = 1024 * 1024;

interface MultipartFileInput {
  content: Buffer | string;
  filename: string;
  mimeType?: string;
}

function buildMultipartBody(options: {
  fields?: Record<string, string>;
  files?: MultipartFileInput[];
}) {
  const boundary = `----flatfile-sql-studio-test-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];

  for (const [name, value] of Object.entries(options.fields ?? {})) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        "utf8",
      ),
    );
  }

  for (const file of options.files ?? []) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType ?? "text/csv"}\r\n\r\n`,
        "utf8",
      ),
    );
    chunks.push(
      typeof file.content === "string"
        ? Buffer.from(file.content, "utf8")
        : file.content,
    );
    chunks.push(Buffer.from("\r\n", "utf8"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function buildCsv(rows: number, valueSize = 8): string {
  const header = "id,value";
  const payload = "x".repeat(valueSize);
  const lines = [header];

  for (let index = 1; index <= rows; index += 1) {
    lines.push(`${index},${payload}_${index}`);
  }

  return `${lines.join("\n")}\n`;
}

async function postMultipart(options: {
  contentLength?: number;
  fields?: Record<string, string>;
  files?: MultipartFileInput[];
  headers?: Record<string, string>;
  ip?: string;
}) {
  const request = buildMultipartBody({
    fields: options.fields,
    files: options.files,
  });
  const headers = new Headers({
    "content-type": request.contentType,
    "x-forwarded-for": options.ip ?? DEFAULT_IP,
    ...(options.headers ?? {}),
  });

  if (options.contentLength !== undefined) {
    headers.set("content-length", String(options.contentLength));
  } else {
    headers.set("content-length", String(request.body.length));
  }

  return POST(
    new Request("http://localhost/api/query", {
      body: request.body,
      headers,
      method: "POST",
    }),
  );
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function withEnv(
  values: Record<string, string | undefined>,
  callback: () => Promise<void>,
) {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

beforeEach(() => {
  __unsafeResetRateLimitState();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  __unsafeResetRateLimitState();
  await shutdownQueryWorkerPool();
  delete process.env.MAX_TOTAL_UPLOAD_BYTES;
  delete process.env.MAX_UPLOAD_BYTES;
  delete process.env.MAX_FILE_COUNT;
  delete process.env.MAX_RESULT_ROWS;
  delete process.env.QUERY_TIMEOUT_MS;
  delete process.env.MAX_HEAP_MB;
  delete process.env.RATE_LIMIT_REQUESTS_PER_MINUTE;
  delete process.env.RATE_LIMIT_BANDWIDTH_MB_PER_HOUR;
  delete process.env.RATE_LIMIT_MAX_CONCURRENT_PER_IP;
  delete process.env.RATE_LIMIT_MAX_CONCURRENT_GLOBAL;
});

describe("Layer 1 - Request size hard limit", () => {
  it("allows a request exactly at the configured size limit", async () => {
    const request = buildMultipartBody({
      fields: { query: "SELECT 1" },
      files: [{ content: "id\n1\n", filename: "exact.csv" }],
    });

    await withEnv(
      {
        MAX_TOTAL_UPLOAD_BYTES: String(request.body.length),
        MAX_UPLOAD_BYTES: String(request.body.length),
      },
      async () => {
        const response = await POST(
          new Request("http://localhost/api/query", {
            body: request.body,
            headers: {
              "content-length": String(request.body.length),
              "content-type": request.contentType,
              "x-forwarded-for": DEFAULT_IP,
            },
            method: "POST",
          }),
        );

        expect(response.status).toBe(200);
      },
    );
  });

  it("rejects a request one byte over the configured size limit", async () => {
    const request = buildMultipartBody({
      fields: { query: "SELECT 1" },
      files: [{ content: "id\n1\n", filename: "too-big.csv" }],
    });

    await withEnv(
      {
        MAX_TOTAL_UPLOAD_BYTES: String(request.body.length - 1),
        MAX_UPLOAD_BYTES: String(request.body.length - 1),
      },
      async () => {
        const response = await POST(
          new Request("http://localhost/api/query", {
            body: request.body,
            headers: {
              "content-length": String(request.body.length),
              "content-type": request.contentType,
              "x-forwarded-for": DEFAULT_IP,
            },
            method: "POST",
          }),
        );
        const payload = await readJson<{ error: string }>(response);

        expect(response.status).toBe(413);
        expect(payload.error).toBe("Total upload size is too large");
      },
    );
  });

  it("rejects a body that exceeds the limit even when Content-Length is spoofed low", async () => {
    const request = buildMultipartBody({
      fields: { query: "SELECT 1" },
      files: [{ content: Buffer.alloc(256, 97), filename: "spoof.csv" }],
    });

    await withEnv(
      {
        MAX_TOTAL_UPLOAD_BYTES: "128",
        MAX_UPLOAD_BYTES: "128",
      },
      async () => {
        const response = await POST(
          new Request("http://localhost/api/query", {
            body: request.body,
            headers: {
              "content-length": "64",
              "content-type": request.contentType,
              "x-forwarded-for": DEFAULT_IP,
            },
            method: "POST",
          }),
        );

        expect(response.status).toBe(413);
      },
    );
  });

  it("rejects zero-byte and single-byte files as empty uploads", async () => {
    const response = await postMultipart({
      fields: { query: "SELECT 1" },
      files: [{ content: "\n", filename: "empty.csv" }],
    });
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("File is empty");
  });
});

describe("Layer 2 - Rate limiting and concurrency", () => {
  it("allows 10 requests in a minute and blocks the 11th", async () => {
    vi.useFakeTimers();

    for (let index = 0; index < 10; index += 1) {
      const result = await checkRateLimit(DEFAULT_IP);
      expect(result.allowed).toBe(true);
    }

    const blocked = await checkRateLimit(DEFAULT_IP);
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetInSeconds).toBeGreaterThan(0);
  });

  it("allows requests again after the window resets", async () => {
    vi.useFakeTimers();

    for (let index = 0; index < 11; index += 1) {
      await checkRateLimit(DEFAULT_IP);
    }

    vi.advanceTimersByTime(60_001);

    const result = await checkRateLimit(DEFAULT_IP);
    expect(result.allowed).toBe(true);
  });

  it("tracks hourly upload bandwidth cumulatively", async () => {
    const almostAll = await commitUploadBandwidth(DEFAULT_IP, 199 * MEGABYTE);
    const overLimit = await commitUploadBandwidth(DEFAULT_IP, 2 * MEGABYTE);

    expect(almostAll.allowed).toBe(true);
    expect(overLimit.allowed).toBe(false);
  });

  it("allows three in-flight requests per IP and blocks the fourth", async () => {
    const lease1 = await acquireConcurrencyLease(DEFAULT_IP);
    const lease2 = await acquireConcurrencyLease(DEFAULT_IP);
    const lease3 = await acquireConcurrencyLease(DEFAULT_IP);

    await expect(acquireConcurrencyLease(DEFAULT_IP)).rejects.toMatchObject({
      message: "Too many concurrent requests from your IP.",
      status: 429,
    });

    await Promise.all([lease1.release(), lease2.release(), lease3.release()]);
  });

  it("releases concurrency counters even when the request fails", async () => {
    const response = await postMultipart({
      fields: {
        fileSettings: "{not-json}",
        query: "SELECT 1",
      },
      files: [{ content: "id\n1\n", filename: "release.csv" }],
    });

    expect(response.status).toBe(400);

    const lease1 = await acquireConcurrencyLease(DEFAULT_IP);
    const lease2 = await acquireConcurrencyLease(DEFAULT_IP);
    const lease3 = await acquireConcurrencyLease(DEFAULT_IP);

    await Promise.all([lease1.release(), lease2.release(), lease3.release()]);
  });
});

describe("Layer 3 - Validation", () => {
  it("allows exactly 20 files and rejects 21", async () => {
    const twentyFiles = Array.from({ length: 20 }, (_, index) => ({
      content: "id\n1\n",
      filename: `allowed_${index + 1}.csv`,
    }));

    const okResponse = await postMultipart({
      fields: { query: "SELECT 1" },
      files: twentyFiles,
    });
    expect(okResponse.status).toBe(200);

    const tooManyFiles = Array.from({ length: 21 }, (_, index) => ({
      content: "id\n1\n",
      filename: `blocked_${index + 1}.csv`,
    }));

    const blockedResponse = await postMultipart({
      fields: { query: "SELECT 1" },
      files: tooManyFiles,
    });
    const payload = await readJson<{ error: string }>(blockedResponse);

    expect(blockedResponse.status).toBe(400);
    expect(payload.error).toBe("Too many files uploaded. Maximum is 20.");
  });

  it("rejects unsupported extensions and accepts uppercase CSV extensions", async () => {
    const blockedResponse = await postMultipart({
      fields: { query: "SELECT 1" },
      files: [{ content: "not,spreadsheet\n1,2\n", filename: "report.xlsx" }],
    });
    const blockedPayload = await readJson<{ error: string }>(blockedResponse);

    expect(blockedResponse.status).toBe(400);
    expect(blockedPayload.error).toBe("Only CSV, TSV, and TXT text files are supported.");

    const okResponse = await postMultipart({
      fields: { query: "SELECT 1" },
      files: [{ content: "id\n1\n", filename: "report.CSV" }],
    });

    expect(okResponse.status).toBe(200);
  });

  it("rejects filenames longer than 255 characters", async () => {
    const response = await postMultipart({
      fields: { query: "SELECT 1" },
      files: [
        {
          content: "id\n1\n",
          filename: `${"a".repeat(256)}.csv`,
        },
      ],
    });
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Filename is too long");
  });

  it("allows a 10,000-character query and rejects a 10,001-character query", async () => {
    const baseQuery = "SELECT 1";
    const allowedWrapperLength = " /*".length + "*/".length;
    const allowedComment = "x".repeat(10_000 - baseQuery.length - allowedWrapperLength);
    const blockedComment = "x".repeat(10_001 - baseQuery.length - allowedWrapperLength);

    const allowedResponse = await postMultipart({
      fields: {
        query: `${baseQuery} /*${allowedComment}*/`,
      },
      files: [{ content: "id\n1\n", filename: "allowed.csv" }],
    });
    expect(allowedResponse.status).toBe(200);

    const blockedResponse = await postMultipart({
      fields: {
        query: `${baseQuery} /*${blockedComment}*/`,
      },
      files: [{ content: "id\n1\n", filename: "blocked.csv" }],
    });
    const blockedPayload = await readJson<{ error: string }>(blockedResponse);

    expect(blockedResponse.status).toBe(400);
    expect(blockedPayload.error).toBe("Query too long. Maximum 10,000 characters.");
  });

  it("rejects empty, whitespace-only, and missing multipart content types", async () => {
    const emptyQueryResponse = await postMultipart({
      fields: { query: "" },
      files: [{ content: "id\n1\n", filename: "empty-query.csv" }],
    });
    const emptyQueryPayload = await readJson<{ error: string }>(emptyQueryResponse);
    expect(emptyQueryResponse.status).toBe(400);
    expect(emptyQueryPayload.error).toBe("Query is required");

    const whitespaceQueryResponse = await postMultipart({
      fields: { query: "    " },
      files: [{ content: "id\n1\n", filename: "whitespace-query.csv" }],
    });
    const whitespaceQueryPayload = await readJson<{ error: string }>(
      whitespaceQueryResponse,
    );
    expect(whitespaceQueryResponse.status).toBe(400);
    expect(whitespaceQueryPayload.error).toBe("Query is required");

    const response = await POST(
      new Request("http://localhost/api/query", {
        body: "query=SELECT+1",
        method: "POST",
      }),
    );
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Request must use multipart/form-data.");
  });
});

describe("Layer 4 - Query timeout", () => {
  it("returns results normally for fast queries", async () => {
    const result = executeCsvQuery({
      files: [
        {
          buffer: Buffer.from("id\n1\n2\n3\n", "utf8"),
          filename: "fast.csv",
        },
      ],
      query: "SELECT COUNT(*) AS count FROM fast",
    });

    expect(result.rows).toEqual([{ count: 3 }]);
  });

  it(
    "times out runaway recursive queries with a sanitized message",
    async () => {
      await withEnv(
        {
          QUERY_TIMEOUT_MS: "50",
        },
        async () => {
          const response = await postMultipart({
            fields: {
              query:
                "WITH RECURSIVE t(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM t) SELECT * FROM t",
            },
            files: [{ content: "id\n1\n", filename: "timeout.csv" }],
          });
          const payload = await readJson<{ error: string }>(response);

          expect(response.status).toBe(408);
          expect(payload.error).toBe("Query execution timed out");
          expect(payload.error).not.toMatch(/sqlite|better-sqlite3|internal/i);
        },
      );
    },
    10_000,
  );

  it("closes the SQLite database even when a timeout is raised", async () => {
    const closeSpy = vi.spyOn((Database as unknown as { prototype: Database.Database }).prototype, "close");

    await withEnv(
      {
        QUERY_TIMEOUT_MS: "50",
      },
      async () => {
        expect(() =>
          executeCsvQuery({
            files: [
              {
                buffer: Buffer.from("id\n1\n", "utf8"),
                filename: "timeout-close.csv",
              },
            ],
            query:
              "WITH RECURSIVE t(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM t) SELECT * FROM t",
          }),
        ).toThrow();
      },
    );

    expect(closeSpy).toHaveBeenCalled();
  });
});

describe("Layer 5 - Result size caps", () => {
  it("does not truncate small result sets", async () => {
    const result = executeCsvQuery({
      files: [
        {
          buffer: Buffer.from(buildCsv(100), "utf8"),
          filename: "small.csv",
        },
      ],
      query: "SELECT * FROM small ORDER BY id",
    });

    expect(result.truncated).toBeUndefined();
    expect(result.rowCount).toBe(100);
  });

  it("truncates results beyond 50,000 rows and includes warning metadata", async () => {
    const result = executeCsvQuery({
      files: [
        {
          buffer: Buffer.from(buildCsv(50_001), "utf8"),
          filename: "huge.csv",
        },
      ],
      query: "SELECT * FROM huge ORDER BY id",
    });

    expect(result.truncated).toBe(true);
    expect(result.returnedRows).toBe(50_000);
    expect(result.totalRows).toBe(50_001);
    expect(result.warning).toContain("50,000");
  });

  it("truncates oversized JSON responses even when row count is below the row cap", async () => {
    const giantValue = `"${"x".repeat(1024 * 1024)}"`;
    const rows = ["id,value"];

    for (let index = 1; index <= 80; index += 1) {
      rows.push(`${index},${giantValue}`);
    }

    const result = executeCsvQuery({
      files: [
        {
          buffer: Buffer.from(`${rows.join("\n")}\n`, "utf8"),
          filename: "wide-response.csv",
        },
      ],
      query: "SELECT * FROM wide_response ORDER BY id",
    });

    expect(result.truncated).toBe(true);
    expect(result.returnedRows).toBeLessThan(80);
    expect(result.warning).toContain("50MB response limit");
  });
});

describe("Layer 6 - Memory guard", () => {
  it("returns 503 when the server is under memory pressure", async () => {
    const actualUsage = process.memoryUsage();
    vi.spyOn(process, "memoryUsage").mockReturnValue({
      ...actualUsage,
      heapUsed: 500 * MEGABYTE,
    });

    await withEnv(
      {
        MAX_HEAP_MB: "512",
      },
      async () => {
        const response = await postMultipart({
          fields: { query: "SELECT 1" },
          files: [{ content: "id\n1\n", filename: "memory.csv" }],
        });
        const payload = await readJson<{ error: string }>(response);

        expect(response.status).toBe(503);
        expect(payload.error).toBe("Server is under memory pressure. Try again shortly.");
      },
    );
  });

  it("closes the SQLite database when the memory guard trips inside executeCsvQuery", async () => {
    const actualUsage = process.memoryUsage();
    const closeSpy = vi.spyOn((Database as unknown as { prototype: Database.Database }).prototype, "close");

    vi.spyOn(process, "memoryUsage").mockReturnValue({
      ...actualUsage,
      heapUsed: 500 * MEGABYTE,
    });

    await withEnv(
      {
        MAX_HEAP_MB: "512",
      },
      async () => {
        expect(() =>
          executeCsvQuery({
            files: [
              {
                buffer: Buffer.from("id\n1\n", "utf8"),
                filename: "memory-close.csv",
              },
            ],
            query: "SELECT 1",
          }),
        ).toThrow();
      },
    );

    expect(closeSpy).toHaveBeenCalled();
  });
});

describe("Layer 7 - Error sanitization", () => {
  it("never exposes stack traces or file paths in sanitized error payloads", () => {
    const requestId = createRequestId();
    const payload = buildErrorResponseBody(
      new Error(
        "Boom at C:\\secret\\server\\file.ts\n    at doThing (node:internal/modules/cjs/loader:1:1)",
      ),
      requestId,
    );

    expect(payload.error).not.toMatch(/C:\\|node:internal| at /);
    expect(payload.requestId).toBe(requestId);
  });

  it("passes through user-relevant SQLite errors cleanly", async () => {
    const response = await postMultipart({
      fields: {
        query: "SELECT * FROM missing_table",
      },
      files: [{ content: "id\n1\n", filename: "sqlite.csv" }],
    });
    const payload = await readJson<{ error: string; requestId: string }>(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("The query referenced a table that was not loaded.");
    expect(payload.requestId).toBeTruthy();
  });

  it("returns a generic message for unknown internal errors", () => {
    expect(sanitizeErrorMessage(new Error("totally unknown internal error"))).toBe(
      "The query could not be completed.",
    );
  });
});

describe("Layer 8 - Security headers", () => {
  it("adds the required security headers to API responses", async () => {
    const response = await postMultipart({
      fields: { query: "SELECT 1" },
      files: [{ content: "id\n1\n", filename: "headers.csv" }],
    });

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-xss-protection")).toBe("1; mode=block");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=()",
    );
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'");
  });

  it("keeps security headers on error responses", async () => {
    const response = await postMultipart({
      fields: { query: "" },
      files: [{ content: "id\n1\n", filename: "error-headers.csv" }],
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("applies middleware security headers to API routes", () => {
    const response = middleware(
      new Request("http://localhost/api/query") as unknown as Parameters<typeof middleware>[0],
    );

    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'");
  });

  it("applies document CSP to non-API routes via middleware", () => {
    const response = middleware(
      new Request("http://localhost/") as unknown as Parameters<typeof middleware>[0],
    );

    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBe(
      buildDocumentContentSecurityPolicy(),
    );
  });
});

describe("Default security headers helper", () => {
  it("creates API security headers for route handlers", () => {
    const headers = createSecurityHeaders("api");

    expect(headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(headers.get("content-security-policy")).toBe("default-src 'none'");
  });
});
