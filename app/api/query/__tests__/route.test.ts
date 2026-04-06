import { afterEach, describe, expect, it } from "vitest";

import { POST } from "../route";
import { __unsafeResetRateLimitState } from "@/lib/ratelimit";
import { makeFixtureUpload } from "@/test-utils/fixtures";
import { createMultipartRequest } from "@/test-utils/multipart";

interface QueryApiResponse {
  columns: string[];
  error?: string;
  executionTimeMs: number;
  rowCount: number;
  rows: Record<string, unknown>[];
}

async function postQuery(formData: FormData) {
  return POST(await createMultipartRequest("http://localhost/api/query", formData));
}

async function readJson(response: Response): Promise<QueryApiResponse> {
  return (await response.json()) as QueryApiResponse;
}

afterEach(() => {
  __unsafeResetRateLimitState();
});

function buildFormData(options: {
  delimiter?: string;
  fileSettings?: Array<{
    delimiter?: string;
    headerMode?: string;
  }>;
  files?: File[];
  hasHeaders?: string;
  headerMode?: string;
  query?: string;
} = {}): FormData {
  const formData = new FormData();

  for (const file of options.files ?? []) {
    formData.append("files[]", file);
  }

  if (options.query !== undefined) {
    formData.append("query", options.query);
  }

  if (options.fileSettings) {
    formData.append("fileSettings", JSON.stringify(options.fileSettings));
  }

  if (options.headerMode !== undefined) {
    formData.append("headerMode", options.headerMode);
  }

  if (options.hasHeaders !== undefined) {
    formData.append("hasHeaders", options.hasHeaders);
  }

  if (options.delimiter !== undefined) {
    formData.append("delimiter", options.delimiter);
  }

  return formData;
}

describe("POST /api/query", () => {
  it("returns 200 and a valid JSON payload for a single-file query", async () => {
    const response = await postQuery(
      buildFormData({
        fileSettings: [{ delimiter: "auto", headerMode: "auto" }],
        files: [makeFixtureUpload("basic.csv")],
        query: "SELECT name FROM basic ORDER BY id LIMIT 2",
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.columns).toEqual(["name"]);
    expect(payload.rows).toEqual([{ name: "Alice" }, { name: "Bob" }]);
    expect(payload.rowCount).toBe(2);
    expect(typeof payload.executionTimeMs).toBe("number");
  });

  it('returns 400 when no files are provided', async () => {
    const response = await postQuery(
      buildFormData({
        files: [],
        query: "SELECT 1",
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("At least one CSV or TSV file is required.");
  });

  it('returns 400 when files are uploaded without a query', async () => {
    const response = await postQuery(
      buildFormData({
        files: [makeFixtureUpload("basic.csv")],
        query: "",
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Query is required.");
  });

  it("returns 413 when uploads exceed the configured 50MB request cap", async () => {
    const oversizedFile = new File(
      [new Uint8Array(50 * 1024 * 1024 + 1)],
      "too-large.csv",
      { type: "text/csv" },
    );

    const response = await postQuery(
      buildFormData({
        files: [oversizedFile],
        query: "SELECT 1",
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(413);
    expect(payload.error).toContain(
      "Upload too large. Maximum total upload size is 50MB.",
    );
  });

  it("rejects non-CSV uploads with a clear 400 error", async () => {
    const binaryFile = new File(
      [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])],
      "image.png",
      { type: "image/png" },
    );

    const response = await postQuery(
      buildFormData({
        files: [binaryFile],
        query: "SELECT 1",
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error?.toLowerCase()).toMatch(/csv|tsv|text|delimited/);
  });

  it("supports valid multi-file joins", async () => {
    const response = await postQuery(
      buildFormData({
        fileSettings: [
          { delimiter: "auto", headerMode: "auto" },
          { delimiter: "auto", headerMode: "auto" },
        ],
        files: [makeFixtureUpload("basic.csv"), makeFixtureUpload("departments.csv")],
        query:
          "SELECT b.name, d.budget FROM basic b JOIN departments d ON b.department = d.dept_name WHERE d.budget > 200000 ORDER BY b.id",
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.rows).toEqual([
      { budget: 500000, name: "Alice" },
      { budget: 500000, name: "Charlie" },
      { budget: 500000, name: "Eve" },
    ]);
  });

  it("supports per-file delimiter and header settings in the same request", async () => {
    const response = await postQuery(
      buildFormData({
        fileSettings: [
          { delimiter: ",", headerMode: "present" },
          { delimiter: ";", headerMode: "present" },
          { delimiter: ",", headerMode: "absent" },
        ],
        files: [
          makeFixtureUpload("basic.csv"),
          makeFixtureUpload("semicolon_delimited.csv"),
          makeFixtureUpload("no_header.csv"),
        ],
        query: [
          "SELECT",
          "  (SELECT COUNT(*) FROM basic) AS basic_rows,",
          "  (SELECT COUNT(*) FROM semicolon_delimited) AS semicolon_rows,",
          "  (SELECT MIN(c1) FROM no_header) AS first_no_header_id",
        ].join("\n"),
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.rows).toEqual([
      { basic_rows: 5, first_no_header_id: 100, semicolon_rows: 3 },
    ]);
  });

  it("still supports legacy global header settings when fileSettings are not sent", async () => {
    const response = await postQuery(
      buildFormData({
        files: [makeFixtureUpload("no_header.csv")],
        headerMode: "absent",
        query: "SELECT c1, c2 FROM no_header ORDER BY c1 LIMIT 1",
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.rows).toEqual([{ c1: 100, c2: "product_a" }]);
  });

  it("rejects malformed file settings payloads", async () => {
    const formData = buildFormData({
      files: [makeFixtureUpload("basic.csv")],
      query: "SELECT * FROM basic LIMIT 1",
    });

    formData.append("fileSettings", "{not-json}");

    const response = await postQuery(formData);
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid file settings payload");
  });

  it('returns 400 with "File is empty" for zero-byte uploads', async () => {
    const emptyFile = new File([], "empty.csv", { type: "text/csv" });

    const response = await postQuery(
      buildFormData({
        files: [emptyFile],
        query: "SELECT 1",
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("File empty.csv is empty.");
  });

  it("includes an executionTimeMs value greater than zero", async () => {
    const response = await postQuery(
      buildFormData({
        files: [makeFixtureUpload("basic.csv")],
        query: "SELECT COUNT(*) as cnt FROM basic",
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.executionTimeMs).toBeGreaterThan(0);
  });
});
