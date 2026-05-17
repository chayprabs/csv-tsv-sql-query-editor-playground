import { afterEach, describe, expect, it } from "vitest";

import { QueryAbortedError } from "@/lib/errorSanitizer";
import { runQueryInWorkerPool, shutdownQueryWorkerPool } from "@/lib/queryWorkerPool";

afterEach(async () => {
  await shutdownQueryWorkerPool();
});

describe("queryWorkerPool", () => {
  it("executes a query in the pooled worker and returns the response", async () => {
    const controller = new AbortController();
    const result = await runQueryInWorkerPool(
      {
        files: [
          {
            buffer: Buffer.from("value\n1\n2\n3\n", "utf8"),
            filename: "numbers.csv",
          },
        ],
        query: "SELECT COUNT(*) AS count FROM numbers",
      },
      controller.signal,
    );

    expect(result.rows).toEqual([{ count: 3 }]);
  });

  it("rejects immediately when the caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runQueryInWorkerPool(
        {
          files: [],
          query: "SELECT 1",
        },
        controller.signal,
      ),
    ).rejects.toBeInstanceOf(QueryAbortedError);
  });
});
