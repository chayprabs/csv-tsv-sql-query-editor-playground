import { describe, expect, it } from "vitest";

import { csvToSqlite } from "@/lib/csvToSqlite";
import { parseDelimitedText } from "@/lib/delimitedData";
import { decodeTextBytes } from "@/lib/textEncoding";

function runInlineQuery(csv: string, filename: string, query: string) {
  return csvToSqlite({
    files: [
      {
        buffer: Buffer.from(csv, "utf8"),
        filename,
      },
    ],
    query,
  });
}

function buildLargeCsv(rowCount: number): string {
  const rows = ["id,name"];

  for (let index = 1; index <= rowCount; index += 1) {
    rows.push(`${index},row_${index}`);
  }

  return `${rows.join("\n")}\n`;
}

describe("EDGE_CASES input data", () => {
  it("IN-01 strips a UTF-8 BOM before parsing headers", () => {
    const parsed = parseDelimitedText("\uFEFFid,name\n1,Alice\n", {
      delimiter: "auto",
      headerMode: "present",
    });

    expect(parsed.columnNames).toEqual(["id", "name"]);
    expect(parsed.dataRows).toEqual([["1", "Alice"]]);
  });

  it("IN-02 auto-detects UTF-16LE BOMs when decoding bytes", () => {
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("id,name\n1,Alice\n", "utf16le"),
    ]);

    expect(decodeTextBytes(bytes, "utf-8")).toBe("id,name\n1,Alice\n");
  });

  it("IN-03 decodes latin1 content when the selected encoding is latin1", () => {
    const bytes = Buffer.from("Málaga", "latin1");

    expect(decodeTextBytes(bytes, "latin1")).toBe("Málaga");
  });

  it("IN-10 preserves quoted multiline fields", () => {
    const result = runInlineQuery(
      'id,note\n1,"line one\nline two"\n',
      "multiline.csv",
      "SELECT note FROM multiline",
    );

    expect(result.rows).toEqual([{ note: "line one\nline two" }]);
  });

  it("IN-16 allows header-only files with zero data rows", () => {
    const result = runInlineQuery("id,name\n", "header_only.csv", "SELECT * FROM header_only");

    expect(result.error).toBeUndefined();
    expect(result.columns).toEqual(["id", "name"]);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it("IN-21 and IN-22 normalize rows with fewer or more cells than the header", () => {
    const parsed = parseDelimitedText("a,b\n1\n2,3,4\n", {
      delimiter: "auto",
      headerMode: "present",
    });

    expect(parsed.columnNames).toEqual(["a", "b", "c3"]);
    expect(parsed.dataRows).toEqual([
      ["1", "", ""],
      ["2", "3", "4"],
    ]);
  });

  it("IN-24 and IN-25 deduplicates duplicate headers and fills blank names", () => {
    const parsed = parseDelimitedText("name,name,\nAlice,Bob,1\n", {
      delimiter: "auto",
      headerMode: "present",
    });

    expect(parsed.columnNames).toEqual(["name", "name_2", "c3"]);
  });

  it("IN-28 and IN-30 skips whitespace-only lines but preserves delimiter-only rows", () => {
    const parsed = parseDelimitedText("a,b\n1,2\n   \n,\n", {
      delimiter: "auto",
      headerMode: "present",
    });

    expect(parsed.dataRows).toEqual([
      ["1", "2"],
      ["", ""],
    ]);
  });

  it("IN-20 parses 500k rows without a stack overflow", () => {
    const parsed = parseDelimitedText(buildLargeCsv(500_000), {
      delimiter: "auto",
      headerMode: "present",
      sourceName: "five-hundred-thousand.csv",
    });

    expect(parsed.dataRows).toHaveLength(500_000);
    expect(parsed.columnNames).toEqual(["id", "name"]);
  }, 90_000);
});
