import { afterEach, describe, expect, it } from "vitest";

import {
  runQueryInWorkerPool,
  shutdownQueryWorkerPool,
} from "@/lib/queryWorkerPool";
import { QueryTimeoutError } from "@/lib/queryTimeout";

afterEach(async () => {
  delete process.env.FLATFILE_SQL_STUDIO_QUERY_TIMEOUT_MS;
  await shutdownQueryWorkerPool();
});

describe("unit/queryWorkerPool", () => {
  it("times out runaway queries", async () => {
    process.env.FLATFILE_SQL_STUDIO_QUERY_TIMEOUT_MS = "25";

    await expect(
      runQueryInWorkerPool(
        {
          files: [
            {
              buffer: Buffer.from("id\n1\n", "utf8"),
              filename: "numbers.csv",
            },
          ],
          query:
            "WITH RECURSIVE t(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM t) SELECT * FROM t",
        },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(QueryTimeoutError);
  });
});
