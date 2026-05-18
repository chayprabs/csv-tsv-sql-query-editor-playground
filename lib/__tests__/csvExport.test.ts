import { describe, expect, it } from "vitest";

import {
  escapeDelimitedCell,
  rowsToDelimitedText,
  sanitizeSpreadsheetFormulaCell,
} from "@/lib/csvExport";

describe("rowsToDelimitedText", () => {
  it("supports omitting the header row", () => {
    expect(
      rowsToDelimitedText(
        ["name"],
        [{ name: "Alice" }],
        { includeHeader: false },
      ),
    ).toBe("Alice");
  });

  it("supports alternate output delimiters", () => {
    expect(
      rowsToDelimitedText(
        ["name", "note"],
        [{ name: "Alice", note: "hello,world" }],
        { delimiter: "\t" },
      ),
    ).toBe("name\tnote\r\nAlice\thello,world");
  });

  it("prefixes spreadsheet formula injection cells", () => {
    expect(sanitizeSpreadsheetFormulaCell("=1+1")).toBe("\t=1+1");
    expect(sanitizeSpreadsheetFormulaCell("+cmd")).toBe("\t+cmd");
    expect(escapeDelimitedCell("=SUM(A1:A2)")).toBe('"\t=SUM(A1:A2)"');
  });

  it("does not alter ordinary numeric text", () => {
    expect(sanitizeSpreadsheetFormulaCell("42")).toBe("42");
    expect(sanitizeSpreadsheetFormulaCell("hello")).toBe("hello");
  });
});
