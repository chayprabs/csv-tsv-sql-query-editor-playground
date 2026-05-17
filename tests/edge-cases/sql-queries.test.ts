import { describe, expect, it } from "vitest";

import { csvToSqlite } from "@/lib/csvToSqlite";
import { makeFixtureQueryFile } from "@/test-utils/fixtures";

function runFixtureQuery(query: string) {
  return csvToSqlite({
    files: [makeFixtureQueryFile("basic.csv")],
    query,
  });
}

describe("EDGE_CASES sql queries", () => {
  it("SQL-02 returns zero rows cleanly", () => {
    const result = runFixtureQuery(
      "SELECT name FROM basic WHERE department = 'DoesNotExist'",
    );

    expect(result.error).toBeUndefined();
    expect(result.columns).toEqual(["name"]);
    expect(result.rows).toEqual([]);
  });

  it("SQL-04 supports aggregate queries without GROUP BY", () => {
    const result = runFixtureQuery("SELECT COUNT(*) AS cnt, AVG(salary) AS avg_salary FROM basic");

    expect(result.rows).toEqual([
      {
        avg_salary: 72600.25,
        cnt: 5,
      },
    ]);
  });

  it("SQL-06 supports CTEs", () => {
    const result = runFixtureQuery(
      "WITH engineering AS (SELECT name FROM basic WHERE department = 'Engineering') SELECT COUNT(*) AS cnt FROM engineering",
    );

    expect(result.rows).toEqual([{ cnt: 3 }]);
  });

  it("SQL-07 supports window functions", () => {
    const result = runFixtureQuery(
      "SELECT name, ROW_NUMBER() OVER (ORDER BY salary DESC) AS rank FROM basic ORDER BY rank LIMIT 2",
    );

    expect(result.rows).toEqual([
      { name: "Charlie", rank: 1 },
      { name: "Eve", rank: 2 },
    ]);
  });

  it("SQL-08 supports compound queries", () => {
    const result = runFixtureQuery(
      "SELECT department FROM basic WHERE department = 'Engineering' UNION SELECT department FROM basic WHERE department = 'HR' ORDER BY department",
    );

    expect(result.rows).toEqual([
      { department: "Engineering" },
      { department: "HR" },
    ]);
  });

  it("SQL-12 rejects non-reader statements", () => {
    const result = runFixtureQuery("DELETE FROM basic");

    expect(result.error).toBe("Only SELECT queries are supported.");
  });

  it("SQL-13 rejects PRAGMA statements that return rows", () => {
    const result = runFixtureQuery("PRAGMA table_info(basic)");

    expect(result.error).toBe("Only SELECT queries are supported.");
  });

  it("SQL-21 rejects multiple statements", () => {
    const result = runFixtureQuery("SELECT 1; SELECT 2");

    expect(result.error).toBeTruthy();
  });
});
