import { describe, expect, it } from "vitest";

import { csvToSqlite } from "@/lib/csvToSqlite";
import { inferColumnType } from "@/lib/typeInference";

describe("EDGE_CASES type inference", () => {
  it("TI-03 infers scientific notation as REAL", () => {
    expect(inferColumnType(["1e5", "2.5e-3"])).toBe("REAL");
  });

  it("TI-04 keeps Infinity and NaN as TEXT", () => {
    expect(inferColumnType(["Infinity", "-Infinity", "NaN"])).toBe("TEXT");
  });

  it("TI-08 keeps leading-zero digit columns as TEXT", () => {
    expect(inferColumnType(["007", "01234", "00001"])).toBe("TEXT");
  });

  it("TI-09 keeps fixed-width identifier columns as TEXT", () => {
    expect(inferColumnType(["1234567", "2345678", "3456789"])).toBe("TEXT");
  });

  it("TI-12 keeps compact date columns as TEXT", () => {
    expect(inferColumnType(["20260406", "20251231"])).toBe("TEXT");
  });

  it("TI-06 stores whitespace-only values as NULL after coercion", () => {
    const result = csvToSqlite({
      files: [
        {
          buffer: Buffer.from("value,marker\n   ,keep\n42,keep\n", "utf8"),
          filename: "whitespace.csv",
        },
      ],
      query: "SELECT typeof(value) AS value_type FROM whitespace ORDER BY rowid",
    });

    expect(result.rows).toEqual([
      { value_type: "null" },
      { value_type: "integer" },
    ]);
  });
});
