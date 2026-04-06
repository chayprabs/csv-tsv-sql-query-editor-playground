import { afterEach, describe, expect, it } from "vitest";

import {
  createInMemoryDatabase,
  executeReaderQuery,
  loadFilesIntoDatabase,
} from "@/lib/queryEngine";

const databases: Array<ReturnType<typeof createInMemoryDatabase>> = [];

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.close();
  }
});

describe("unit/queryEngine", () => {
  it("returns zero-column results for explain queries and quotes unusual table names safely", () => {
    const database = createInMemoryDatabase();
    databases.push(database);

    loadFilesIntoDatabase(database, [
      {
        buffer: Buffer.from("id\n1\n", "utf8"),
        filename: 'weird "sales".csv',
      },
    ]);

    const explain = executeReaderQuery(
      database,
      'EXPLAIN QUERY PLAN SELECT * FROM "weird_sales"',
    );

    expect(explain.columns).toContain("detail");
  });
});
