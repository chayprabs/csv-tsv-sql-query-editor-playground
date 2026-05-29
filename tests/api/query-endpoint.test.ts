import { readFileSync } from "node:fs";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildMultipartRequest,
  startNextDevServer,
  stopProcess,
} from "@/benchmarks/helpers";
import {
  ensureGeneratedFixtures,
  generatedFixturePath,
} from "@/tests/helpers/generatedFixtures";

interface QueryApiResponse {
  columns: string[];
  error?: string;
  executionTimeMs: number;
  rowCount: number;
  rows: Record<string, unknown>[];
  warning?: string;
}

const PORT = 3101;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ENV_OVERRIDES = {
  MAX_FILE_COUNT: "20",
  MAX_HEAP_MB: "2048",
  MAX_TOTAL_UPLOAD_BYTES: "262144",
  MAX_UPLOAD_BYTES: "131072",
  QUERY_TIMEOUT_MS: "10000",
  RATE_LIMIT_BANDWIDTH_MB_PER_HOUR: "4096",
  RATE_LIMIT_MAX_CONCURRENT_GLOBAL: "100",
  RATE_LIMIT_MAX_CONCURRENT_PER_IP: "100",
  RATE_LIMIT_REQUESTS_PER_MINUTE: "1000",
};

let server: ChildProcessWithoutNullStreams | null = null;
const previousEnv = new Map<string, string | undefined>();
let liveRequestSequence = 0;

function fixtureFile(
  filename: string,
  type = "text/csv",
): File {
  const content = readFileSync(generatedFixturePath(filename));
  return new File([Uint8Array.from(content)], filename, { type });
}

function buildFormData(options: {
  encoding?: string;
  fileSettings?: Array<{ delimiter?: string; headerMode?: string }>;
  files?: File[];
  query?: string;
} = {}): FormData {
  const formData = new FormData();

  for (const file of options.files ?? []) {
    formData.append("files[]", file);
  }

  if (options.query !== undefined) {
    formData.append("query", options.query);
  }

  if (options.encoding !== undefined) {
    formData.append("encoding", options.encoding);
  }

  if (options.fileSettings) {
    formData.append("fileSettings", JSON.stringify(options.fileSettings));
  }

  return formData;
}

async function postFormData(formData: FormData): Promise<Response> {
  liveRequestSequence += 1;

  return fetch(`${BASE_URL}/api/query`, {
    body: formData,
    headers: {
      // Isolate in-memory rate limits across live-server integration cases.
      "x-forwarded-for": `203.0.113.${liveRequestSequence % 200}`,
    },
    method: "POST",
  });
}

async function readJson(response: Response): Promise<QueryApiResponse> {
  return (await response.json()) as QueryApiResponse;
}

function applyEnvOverrides() {
  for (const [key, value] of Object.entries(ENV_OVERRIDES)) {
    previousEnv.set(key, process.env[key]);
    process.env[key] = value;
  }
}

function restoreEnvOverrides() {
  for (const [key, value] of previousEnv.entries()) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

beforeAll(async () => {
  await ensureGeneratedFixtures();
  applyEnvOverrides();
  server = await startNextDevServer({
    cwd: process.cwd(),
    port: PORT,
  });
}, 120_000);

afterAll(async () => {
  if (server) {
    await stopProcess(server);
    server = null;
  }

  restoreEnvOverrides();
});

describe("POST /api/query (live dev server)", () => {
  it("returns a structured JSON payload and stable headers for a valid request", async () => {
    const response = await postFormData(
      buildFormData({
        files: [fixtureFile("analyst_employees.csv")],
        query: "SELECT name FROM analyst_employees ORDER BY employee_id LIMIT 2",
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(payload).toEqual(
      expect.objectContaining({
        columns: ["name"],
        executionTimeMs: expect.any(Number),
        rowCount: 2,
        rows: [{ name: "Alice" }, { name: "Bob" }],
      }),
    );
  });

  it("rejects requests with no Content-Type header", async () => {
    const response = await fetch(`${BASE_URL}/api/query`, {
      body: "query=SELECT+1",
      method: "POST",
    });
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Request must use multipart/form-data.");
  });

  it("rejects requests with the wrong Content-Type header", async () => {
    const response = await fetch(`${BASE_URL}/api/query`, {
      body: JSON.stringify({ query: "SELECT 1" }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Request must use multipart/form-data.");
  });

  it("rejects corrupted multipart boundaries cleanly", async () => {
    const request = buildMultipartRequest({
      fields: {
        query: "SELECT 1",
      },
      files: [
        {
          content: "id\n1\n",
          fieldName: "files[]",
          filename: "broken.csv",
          type: "text/csv",
        },
      ],
    });

    const response = await fetch(`${BASE_URL}/api/query`, {
      body: request.body,
      headers: {
        "content-type": "multipart/form-data; boundary=totally-different-boundary",
      },
      method: "POST",
    });
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid multipart form data.");
  });

  it("rejects truncated multipart bodies cleanly", async () => {
    const request = buildMultipartRequest({
      fields: {
        query: "SELECT 1",
      },
      files: [
        {
          content: "id\n1\n",
          fieldName: "files[]",
          filename: "truncated.csv",
          type: "text/csv",
        },
      ],
    });

    const response = await fetch(`${BASE_URL}/api/query`, {
      body: request.body.slice(0, Math.max(0, request.body.length - 24)),
      headers: {
        "content-type": request.contentType,
      },
      method: "POST",
    });
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid multipart form data.");
  });

  it("returns clear validation errors for missing query or files", async () => {
    const missingQueryResponse = await postFormData(
      buildFormData({
        files: [fixtureFile("analyst_employees.csv")],
        query: "",
      }),
    );
    const missingQueryPayload = await readJson(missingQueryResponse);

    expect(missingQueryResponse.status).toBe(400);
    expect(missingQueryPayload.error).toBe("Query is required");

    const missingFileResponse = await postFormData(
      buildFormData({
        query: "SELECT 1",
      }),
    );
    const missingFilePayload = await readJson(missingFileResponse);

    expect(missingFileResponse.status).toBe(400);
    expect(missingFilePayload.error).toBe("No files uploaded");
  });

  it("keeps collided table names isolated after sanitization", async () => {
    const response = await postFormData(
      buildFormData({
        files: [
          new File(["id\n1\n"], "sales.csv", { type: "text/csv" }),
          new File(["id\n2\n"], "sales!.csv", { type: "text/csv" }),
        ],
        query: "SELECT (SELECT id FROM sales) AS first_id, (SELECT id FROM sales_1) AS second_id",
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.rows).toEqual([{ first_id: 1, second_id: 2 }]);
  });

  it("supports quoted reserved-word columns and very wide uploads", async () => {
    const reservedResponse = await postFormData(
      buildFormData({
        files: [fixtureFile("database_reserved_words.csv")],
        query:
          'SELECT "select", "from", "order" FROM database_reserved_words ORDER BY "select"',
      }),
    );
    const reservedPayload = await readJson(reservedResponse);

    expect(reservedResponse.status).toBe(200);
    expect(reservedPayload.rows).toEqual([
      { from: "north", order: 10, select: 1 },
      { from: "south", order: 20, select: 2 },
    ]);

    const wideResponse = await postFormData(
      buildFormData({
        files: [fixtureFile("many_columns_1000.csv")],
        query: "SELECT col_1, col_1000 FROM many_columns_1000 ORDER BY col_1",
      }),
    );
    const widePayload = await readJson(wideResponse);

    expect(wideResponse.status).toBe(200);
    expect(widePayload.rows[0]).toEqual({
      col_1: "r1_c1",
      col_1000: "r1_c1000",
    });
  });

  it("accepts a 10,000-character query without leaking an internal error", async () => {
    const baseQuery = "SELECT COUNT(*) AS cnt FROM long_query_seed /**/";
    const longComment = "x".repeat(10_000 - baseQuery.length);
    const response = await postFormData(
      buildFormData({
        files: [fixtureFile("long_query_seed.csv")],
        query: baseQuery.replace("/**/", `/*${longComment}*/`),
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.rows).toEqual([{ cnt: 200 }]);
  });

  it("enforces the configured upload size boundary for multipart requests", async () => {
    const belowLimit = new File([Buffer.alloc(60 * 1024, 97)], "below.csv", {
      type: "text/csv",
    });
    const withinLimit = new File([Buffer.alloc(100 * 1024, 97)], "within.csv", {
      type: "text/csv",
    });
    const aboveLimit = new File([Buffer.alloc(140 * 1024, 97)], "above.csv", {
      type: "text/csv",
    });

    const belowResponse = await postFormData(
      buildFormData({
        files: [belowLimit],
        query: "SELECT 1",
      }),
    );
    expect(belowResponse.status).toBe(200);

    const withinResponse = await postFormData(
      buildFormData({
        files: [withinLimit],
        query: "SELECT 1",
      }),
    );
    expect(withinResponse.status).toBe(200);

    const aboveResponse = await postFormData(
      buildFormData({
        files: [aboveLimit],
        query: "SELECT 1",
      }),
    );
    const abovePayload = await readJson(aboveResponse);

    expect(aboveResponse.status).toBe(413);
    expect(abovePayload.error).toBe("File too large");
  });

  it("returns a clean not-found error when the query references a different filename", async () => {
    const response = await postFormData(
      buildFormData({
        files: [fixtureFile("analyst_employees.csv")],
        query: "SELECT * FROM analyst_departments",
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("The query referenced a table that was not loaded.");
  });

  it("keeps twenty concurrent requests isolated from one another", async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, async (_, index) => {
        const requestId = index + 1;
        const response = await postFormData(
          buildFormData({
            files: [
              new File(
                [
                  `id,value\n${requestId},request_${requestId}\n`,
                ],
                `request_${requestId}.csv`,
                { type: "text/csv" },
              ),
            ],
            query: `SELECT value FROM request_${requestId}`,
          }),
        );

        return {
          payload: await readJson(response),
          requestId,
          status: response.status,
        };
      }),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: 20 }, () => 200),
    );
    expect(
      responses.map((response) => response.payload.rows[0]?.value),
    ).toEqual(Array.from({ length: 20 }, (_, index) => `request_${index + 1}`));
  });
});
