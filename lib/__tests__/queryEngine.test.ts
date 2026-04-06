import { afterEach, describe, expect, it } from "vitest";

import {
  createInMemoryDatabase,
  executeReaderQuery,
  loadFilesIntoDatabase,
  normalizeQuery,
} from "@/lib/queryEngine";
import { buildMainTableCsv } from "@/benchmarks/helpers";

const openDatabases: Array<ReturnType<typeof createInMemoryDatabase>> = [];

function createTrackedDatabase() {
  const database = createInMemoryDatabase();
  openDatabases.push(database);
  return database;
}

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.close();
  }
});

describe("queryEngine", () => {
  it("configures the in-memory SQLite pragmas for this workload", () => {
    const database = createTrackedDatabase();

    expect(database.pragma("journal_mode", { simple: true })).toBe("memory");
    expect(database.pragma("synchronous", { simple: true })).toBe(0);
    expect(database.pragma("temp_store", { simple: true })).toBe(2);
    expect(database.pragma("cache_size", { simple: true })).toBe(-64_000);
  });

  it("normalizes trailing semicolons from submitted queries", () => {
    expect(normalizeQuery("SELECT 1;;;  ")).toBe("SELECT 1");
  });

  it("loads files with explicit no-header mode and generates c1/c2 columns", () => {
    const database = createTrackedDatabase();

    loadFilesIntoDatabase(
      database,
      [
        {
          buffer: Buffer.from("1,Ada\n2,Grace\n", "utf8"),
          filename: "people.csv",
        },
      ],
      {
        hasHeaders: false,
      },
    );

    const result = executeReaderQuery(
      database,
      "SELECT c1, c2 FROM people ORDER BY c1",
    );

    expect(result.rows).toEqual([
      { c1: 1, c2: "Ada" },
      { c1: 2, c2: "Grace" },
    ]);
  });

  it("derives unique table names when filenames collide", () => {
    const database = createTrackedDatabase();

    loadFilesIntoDatabase(database, [
      {
        buffer: Buffer.from("id\n1\n", "utf8"),
        filename: "sales.csv",
      },
      {
        buffer: Buffer.from("id\n2\n", "utf8"),
        filename: "sales!.csv",
      },
    ]);

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(tables.map((table) => table.name)).toEqual(["sales", "sales_1"]);
  });

  it("creates at most one adaptive index on high-cardinality text columns for large tables", () => {
    const database = createTrackedDatabase();
    const dataset = buildMainTableCsv(100_000, "benchmark_main.csv");

    loadFilesIntoDatabase(database, [
      {
        buffer: Buffer.from(dataset.csv, "utf8"),
        filename: dataset.filename,
      },
    ]);

    const indexes = database
      .prepare("PRAGMA index_list('benchmark_main')")
      .all() as Array<{ name: string }>;

    expect(indexes).toHaveLength(1);
    expect(indexes[0].name).toContain("idx_benchmark_main");

    const columns = database
      .prepare(`PRAGMA index_info('${indexes[0].name}')`)
      .all() as Array<{ name: string }>;

    expect(columns.map((column) => column.name)).toEqual(["customer_code"]);
  });

  it("skips adaptive indexes for smaller tables below the threshold", () => {
    const database = createTrackedDatabase();
    const dataset = buildMainTableCsv(100, "benchmark_main.csv");

    loadFilesIntoDatabase(database, [
      {
        buffer: Buffer.from(dataset.csv, "utf8"),
        filename: dataset.filename,
      },
    ]);

    const indexes = database
      .prepare("PRAGMA index_list('benchmark_main')")
      .all() as Array<{ name: string }>;

    expect(indexes).toEqual([]);
  });

  it("decodes non-UTF8 input when an explicit encoding is provided", () => {
    const database = createTrackedDatabase();

    loadFilesIntoDatabase(
      database,
      [
        {
          buffer: Buffer.from("name\nM\xfcller\n", "latin1"),
          filename: "latin1.csv",
        },
      ],
      {
        inputEncoding: "latin1",
      },
    );

    const result = executeReaderQuery(database, "SELECT name FROM latin1");

    expect(result.rows).toEqual([{ name: "Müller" }]);
  });

  it("allows VALUES and EXPLAIN QUERY PLAN reader statements", () => {
    const database = createTrackedDatabase();

    const valuesResult = executeReaderQuery(database, "VALUES (1, 'Ada')");
    const explainResult = executeReaderQuery(
      database,
      "EXPLAIN QUERY PLAN SELECT 1",
    );

    expect(valuesResult.rows).toEqual([{ column1: 1, column2: "Ada" }]);
    expect(explainResult.columns).toContain("detail");
  });

  it("rejects empty or mutating queries before execution", () => {
    const database = createTrackedDatabase();

    expect(() => executeReaderQuery(database, "   ")).toThrow(
      "A SQL query is required.",
    );
    expect(() => executeReaderQuery(database, "DELETE FROM sqlite_master")).toThrow(
      "Only read-only SELECT-style queries are supported.",
    );
  });

  it("truncates oversized result sets and returns a warning", () => {
    const database = createTrackedDatabase();

    loadFilesIntoDatabase(database, [
      {
        buffer: Buffer.from("id\n1\n2\n3\n", "utf8"),
        filename: "numbers.csv",
      },
    ]);

    const result = executeReaderQuery(
      database,
      "SELECT id FROM numbers ORDER BY id",
      2,
    );

    expect(result.rowCount).toBe(2);
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.warning).toContain("2");
  });
});
