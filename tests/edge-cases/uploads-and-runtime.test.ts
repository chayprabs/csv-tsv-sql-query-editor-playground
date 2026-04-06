import { afterEach, describe, expect, it } from "vitest";

import { POST } from "../../app/api/query/route";
import { __unsafeResetRateLimitState } from "@/lib/ratelimit";
import { makeFixtureUpload } from "@/test-utils/fixtures";
import { createMultipartRequest } from "@/test-utils/multipart";

function buildFormData(options: {
  encoding?: string;
  fileSettings?: Array<{ delimiter?: string; headerMode?: string }>;
  files?: File[];
  query?: string;
}): FormData {
  const formData = new FormData();

  for (const file of options.files ?? []) {
    formData.append("files[]", file);
  }

  formData.append("encoding", options.encoding ?? "utf-8");
  formData.append("query", options.query ?? "SELECT 1");

  if (options.fileSettings) {
    formData.append("fileSettings", JSON.stringify(options.fileSettings));
  }

  return formData;
}

async function postQuery(formData: FormData) {
  return POST(await createMultipartRequest("http://localhost/api/query", formData));
}

function withEnv(name: string, value: string, callback: () => Promise<void>) {
  const previousValue = process.env[name];
  process.env[name] = value;

  return callback().finally(() => {
    if (previousValue === undefined) {
      delete process.env[name];
      return;
    }

    process.env[name] = previousValue;
  });
}

afterEach(() => {
  delete process.env.FLATFILE_SQL_STUDIO_MAX_FILES_PER_REQUEST;
  delete process.env.FLATFILE_SQL_STUDIO_MAX_TOTAL_UPLOAD_BYTES;
  delete process.env.FLATFILE_SQL_STUDIO_QUERY_TIMEOUT_MS;
  __unsafeResetRateLimitState();
});

describe("EDGE_CASES uploads and runtime", () => {
  it("UP-03 returns a clear error for a BOM-only file", async () => {
    const response = await postQuery(
      buildFormData({
        files: [new File(["\uFEFF"], "bom.csv", { type: "text/csv" })],
        fileSettings: [{ delimiter: "auto", headerMode: "auto" }],
        query: "SELECT 1",
      }),
    );
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("One of the uploaded files was empty after parsing.");
  });

  it("UP-05 rejects a binary payload that is disguised as a CSV", async () => {
    const response = await postQuery(
      buildFormData({
        files: [
          new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], "fake.csv", {
            type: "text/csv",
          }),
        ],
        query: "SELECT 1",
      }),
    );
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Could not parse the uploaded file.");
  });

  it("UP-12 rejects requests that exceed the file-count limit", async () => {
    await withEnv("FLATFILE_SQL_STUDIO_MAX_FILES_PER_REQUEST", "1", async () => {
      const response = await postQuery(
        buildFormData({
          files: [makeFixtureUpload("basic.csv"), makeFixtureUpload("departments.csv")],
          query: "SELECT 1",
        }),
      );
      const payload = (await response.json()) as { error?: string };

      expect(response.status).toBe(400);
      expect(payload.error).toContain("Maximum is 1");
    });
  });

  it("UP-13 rejects requests whose total upload size exceeds the configured limit", async () => {
    await withEnv("FLATFILE_SQL_STUDIO_MAX_TOTAL_UPLOAD_BYTES", "20", async () => {
      const response = await postQuery(
        buildFormData({
          files: [
            new File(["1234567890"], "first.csv", { type: "text/csv" }),
            new File(["1234567890"], "second.csv", { type: "text/csv" }),
            new File(["1234567890"], "third.csv", { type: "text/csv" }),
          ],
          query: "SELECT 1",
        }),
      );
      const payload = (await response.json()) as { error?: string };

      expect(response.status).toBe(413);
      expect(payload.error).toContain("Upload too large.");
    });
  });

  it("SYS-04 times out runaway queries", async () => {
    await withEnv("FLATFILE_SQL_STUDIO_QUERY_TIMEOUT_MS", "50", async () => {
      const response = await postQuery(
        buildFormData({
          files: [makeFixtureUpload("basic.csv")],
          query:
            "WITH RECURSIVE t(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM t) SELECT * FROM t",
        }),
      );
      const payload = (await response.json()) as { error?: string };

      expect(response.status).toBe(408);
      expect(payload.error).toContain("Query timed out");
    });
  });
});
