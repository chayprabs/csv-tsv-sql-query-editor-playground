import Papa from "papaparse";
import { describe, expect, it } from "vitest";

import { rowsToDelimitedText } from "@/lib/csvExport";
import {
  csvToSqlite,
  type CsvToSqliteOptions,
  type QueryFileInput,
  sanitizeErrorMessage,
} from "@/lib/csvToSqlite";
import { makeFixtureQueryFile } from "@/test-utils/fixtures";

function runQuery(
  files: QueryFileInput[],
  query: string,
  options: Partial<
    Pick<CsvToSqliteOptions, "delimiter" | "hasHeaders" | "headerMode">
  > = {},
) {
  return csvToSqlite({
    delimiter: options.delimiter ?? "auto",
    files,
    hasHeaders: options.hasHeaders,
    headerMode: options.headerMode,
    query,
  });
}

function runFixtureQuery(
  filenames: string[],
  query: string,
  options: Partial<
    Pick<CsvToSqliteOptions, "delimiter" | "hasHeaders" | "headerMode">
  > = {},
) {
  return runQuery(
    filenames.map((filename) => makeFixtureQueryFile(filename)),
    query,
    options,
  );
}

function expectSuccessfulQuery(
  result: ReturnType<typeof csvToSqlite>,
): asserts result is ReturnType<typeof csvToSqlite> & { error?: undefined } {
  expect(result.error).toBeUndefined();
}

describe("csvToSqlite", () => {
  it("runs a basic SELECT against basic.csv", () => {
    const result = runFixtureQuery(["basic.csv"], "SELECT * FROM basic LIMIT 3");

    expectSuccessfulQuery(result);
    expect(result.columns).toEqual([
      "id",
      "name",
      "age",
      "salary",
      "department",
    ]);
    expect(result.rowCount).toBe(3);
    expect(result.rows[0]).toEqual({
      age: 30,
      department: "Engineering",
      id: 1,
      name: "Alice",
      salary: 75000.5,
    });
  });

  it("supports WHERE clauses with string filtering", () => {
    const result = runFixtureQuery(
      ["basic.csv"],
      "SELECT name, salary FROM basic WHERE department = 'Engineering' ORDER BY id",
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([
      { name: "Alice", salary: 75000.5 },
      { name: "Charlie", salary: 90000 },
      { name: "Eve", salary: 85000 },
    ]);
  });

  it("supports GROUP BY with aggregates", () => {
    const result = runFixtureQuery(
      ["basic.csv"],
      "SELECT department, COUNT(*) as cnt, AVG(salary) as avg_sal FROM basic GROUP BY department ORDER BY cnt DESC, department",
    );

    expectSuccessfulQuery(result);
    expect(result.rows[0]).toMatchObject({
      cnt: 3,
      department: "Engineering",
    });
    expect(result.rowCount).toBe(3);
    expect(Number((result.rows[0] as { avg_sal: number }).avg_sal)).toBeCloseTo(
      83333.5,
      5,
    );
  });

  it("stores inferred types and nulls correctly for types.csv", () => {
    const result = runFixtureQuery(
      ["types.csv"],
      "SELECT typeof(int_col) AS int_type, typeof(float_col) AS float_type, typeof(text_col) AS text_type, typeof(mixed_col) AS mixed_type, typeof(empty_col) AS empty_type FROM types ORDER BY int_col",
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([
      {
        empty_type: "null",
        float_type: "real",
        int_type: "integer",
        mixed_type: "text",
        text_type: "text",
      },
      {
        empty_type: "null",
        float_type: "real",
        int_type: "integer",
        mixed_type: "text",
        text_type: "text",
      },
      {
        empty_type: "null",
        float_type: "real",
        int_type: "integer",
        mixed_type: "text",
        text_type: "text",
      },
    ]);
  });

  it("supports no-header mode with generated c1/c2/c3 columns", () => {
    const result = runFixtureQuery(
      ["no_header.csv"],
      "SELECT c1, c3 FROM no_header WHERE c3 < 10 ORDER BY c1",
      { hasHeaders: false },
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([
      { c1: 100, c3: 9.99 },
      { c1: 300, c3: 4.49 },
    ]);
  });

  it("parses quoted fields containing embedded commas", () => {
    const result = runFixtureQuery(
      ["quoted_fields.csv"],
      "SELECT name, address FROM quoted_fields WHERE name = 'Alice'",
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([
      { address: "123 Main St, Apt 4", name: "Alice" },
    ]);
  });

  it("supports multi-file joins", () => {
    const result = runFixtureQuery(
      ["basic.csv", "departments.csv"],
      "SELECT b.name, b.salary, d.budget FROM basic b JOIN departments d ON b.department = d.dept_name WHERE d.budget > 200000 ORDER BY b.id",
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([
      { budget: 500000, name: "Alice", salary: 75000.5 },
      { budget: 500000, name: "Charlie", salary: 90000 },
      { budget: 500000, name: "Eve", salary: 85000 },
    ]);
  });

  it("supports per-file delimiter and header settings in the same query", () => {
    const result = runQuery(
      [
        {
          ...makeFixtureQueryFile("basic.csv"),
          delimiter: ",",
          headerMode: "present",
        },
        {
          ...makeFixtureQueryFile("semicolon_delimited.csv"),
          delimiter: ";",
          headerMode: "present",
        },
        {
          ...makeFixtureQueryFile("no_header.csv"),
          delimiter: ",",
          headerMode: "absent",
        },
      ],
      [
        "SELECT",
        "  (SELECT COUNT(*) FROM basic) AS basic_rows,",
        "  (SELECT COUNT(*) FROM semicolon_delimited) AS semicolon_rows,",
        "  (SELECT MAX(c1) FROM no_header) AS no_header_max_id",
      ].join("\n"),
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([
      { basic_rows: 5, no_header_max_id: 300, semicolon_rows: 3 },
    ]);
  });

  it("queries tab-delimited files", () => {
    const result = runFixtureQuery(
      ["tsv_file.tsv"],
      "SELECT product, quantity * price as revenue FROM tsv_file ORDER BY revenue DESC",
    );

    expectSuccessfulQuery(result);
    expect(result.rows[0]).toEqual({ product: "Gadget", revenue: 1249.5 });
  });

  it("preserves unicode content", () => {
    const result = runFixtureQuery(
      ["unicode.csv"],
      "SELECT name, city FROM unicode WHERE city = 'München'",
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([{ city: "München", name: "Müller" }]);
  });

  it("ignores blank rows in the middle of a CSV", () => {
    const result = runFixtureQuery(
      ["empty_rows.csv"],
      "SELECT COUNT(*) as cnt FROM empty_rows",
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([{ cnt: 3 }]);
  });

  it("returns a structured SQL syntax error", () => {
    const result = runFixtureQuery(["basic.csv"], "SELEKT * FORM basic");

    expect(result.error).toBeTruthy();
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it("sanitizes CSV parsing failures into a user-facing validation message", () => {
    const result = runQuery(
      [
        {
          buffer: Buffer.from('name,quote\nAlice,"unterminated', "utf8"),
          filename: "broken.csv",
        },
      ],
      "SELECT * FROM broken",
    );

    expect(result.error).toBe(
      "Failed to parse one or more uploaded files. Check the selected encoding, delimiter, header mode, and quoting.",
    );
  });

  it("returns a structured table-not-found error", () => {
    const result = runFixtureQuery(["basic.csv"], "SELECT * FROM nonexistent");

    expect(result.error).toBe("The query referenced a table that was not loaded.");
  });

  it("returns a structured column-not-found error", () => {
    const result = runFixtureQuery(["basic.csv"], "SELECT missing_column FROM basic");

    expect(result.error).toBe("The query referenced a column that does not exist.");
  });

  it("returns a friendly validation error for parsed-empty files", () => {
    const result = runQuery(
      [
        {
          buffer: Buffer.from("\uFEFF", "utf8"),
          filename: "empty.csv",
        },
      ],
      "SELECT * FROM empty",
    );

    expect(result.error).toBe("One of the uploaded files was empty after parsing.");
  });

  it("returns a friendly validation error when no files are provided", () => {
    const result = runQuery([], "SELECT 1");

    expect(result.error).toBe("No files uploaded");
  });

  it("handles the 50,000-row fixture within a reasonable test budget", () => {
    const result = runFixtureQuery(
      ["large.csv"],
      "SELECT category, COUNT(*) as cnt, AVG(value) as avg_val FROM large GROUP BY category ORDER BY category",
    );

    expectSuccessfulQuery(result);
    expect(result.executionTimeMs).toBeLessThan(15_000);
    expect(result.rowCount).toBe(5);
  });

  it("caps wide result sets at 50,000 rows and reports a warning", () => {
    const rows = ["id,value"];

    for (let index = 1; index <= 50_001; index += 1) {
      rows.push(`${index},value_${index}`);
    }

    const result = runQuery(
      [
        {
          buffer: Buffer.from(`${rows.join("\n")}\n`, "utf8"),
          filename: "wide.csv",
        },
      ],
      "SELECT * FROM wide ORDER BY id",
    );

    expectSuccessfulQuery(result);
    expect(result.rowCount).toBe(50_000);
    expect(result.warning).toContain("50,000");
  });

  it("queries single-column CSV files", () => {
    const result = runFixtureQuery(
      ["single_column.csv"],
      "SELECT word FROM single_column WHERE word LIKE 'b%'",
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([{ word: "banana" }]);
  });

  it("treats all-empty cells as NULL", () => {
    const result = runFixtureQuery(
      ["all_nulls.csv"],
      "SELECT COUNT(*) as cnt FROM all_nulls WHERE a IS NULL",
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([{ cnt: 3 }]);
  });

  it("supports explicit semicolon delimiters", () => {
    const result = runFixtureQuery(
      ["semicolon_delimited.csv"],
      "SELECT name, city FROM semicolon_delimited WHERE age > 28 ORDER BY age",
      { delimiter: ";" },
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([
      { city: "London", name: "Alice" },
      { city: "Berlin", name: "Charlie" },
    ]);
  });

  it("strips a UTF-8 BOM before parsing headers and data", () => {
    const result = runQuery(
      [
        {
          buffer: Buffer.from("\uFEFFid,name\n1,Ada\n2,Grace\n", "utf8"),
          filename: "bom.csv",
        },
      ],
      "SELECT name FROM bom ORDER BY id",
      {
        headerMode: "present",
      },
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([{ name: "Ada" }, { name: "Grace" }]);
  });

  it("supports ORDER BY, LIMIT, and OFFSET for pagination-style queries", () => {
    const result = runFixtureQuery(
      ["basic.csv"],
      "SELECT * FROM basic ORDER BY salary DESC LIMIT 2 OFFSET 1",
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([
      {
        age: 32,
        department: "Engineering",
        id: 5,
        name: "Eve",
        salary: 85000,
      },
      {
        age: 30,
        department: "Engineering",
        id: 1,
        name: "Alice",
        salary: 75000.5,
      },
    ]);
  });

  it("supports CASE WHEN expressions", () => {
    const result = runFixtureQuery(
      ["basic.csv"],
      "SELECT name, CASE WHEN salary > 80000 THEN 'senior' ELSE 'junior' END as level FROM basic ORDER BY id",
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([
      { level: "junior", name: "Alice" },
      { level: "junior", name: "Bob" },
      { level: "senior", name: "Charlie" },
      { level: "junior", name: "Diana" },
      { level: "senior", name: "Eve" },
    ]);
  });

  it("supports scalar subqueries", () => {
    const result = runFixtureQuery(
      ["basic.csv"],
      "SELECT name FROM basic WHERE salary > (SELECT AVG(salary) FROM basic) ORDER BY name",
    );

    expectSuccessfulQuery(result);
    expect(result.rows).toEqual([
      { name: "Alice" },
      { name: "Charlie" },
      { name: "Eve" },
    ]);
  });

  it("exports result rows back to CSV without losing structure", () => {
    const result = runFixtureQuery(
      ["quoted_fields.csv"],
      "SELECT name, note FROM quoted_fields ORDER BY name",
    );

    expectSuccessfulQuery(result);

    const csvText = rowsToDelimitedText(result.columns, result.rows);
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    expect(parsed.meta.fields).toEqual(result.columns);
    expect(parsed.data).toHaveLength(result.rowCount);
    expect(csvText).toContain('"loves commas, hates tabs"');
    expect(csvText).toContain('"another, complex, note"');
  });

  it("sanitizes unknown thrown values into a generic message", () => {
    expect(sanitizeErrorMessage("boom")).toBe("The query could not be completed.");
  });

  it("passes through supported SQL syntax errors verbatim", () => {
    expect(sanitizeErrorMessage(new Error("near FROM: syntax error"))).toBe(
      "near FROM: syntax error",
    );
  });
});
