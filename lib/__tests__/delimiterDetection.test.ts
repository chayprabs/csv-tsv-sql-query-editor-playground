import { describe, expect, it } from "vitest";

import { detectDelimiter } from "@/lib/delimiterDetection";
import { readFixtureText } from "@/test-utils/fixtures";

describe("detectDelimiter", () => {
  it("detects comma-delimited CSV files", () => {
    expect(detectDelimiter(readFixtureText("basic.csv"))).toBe(",");
  });

  it("detects tab-delimited TSV files", () => {
    expect(detectDelimiter(readFixtureText("tsv_file.tsv"))).toBe("\t");
  });

  it("detects semicolon-delimited files", () => {
    expect(detectDelimiter(readFixtureText("semicolon_delimited.csv"))).toBe(
      ";",
    );
  });

  it("defaults to comma for single-column files", () => {
    expect(detectDelimiter(readFixtureText("single_column.csv"))).toBe(",");
  });

  it("breaks comma/tab ties in favor of comma", () => {
    const ambiguousText = ["name,score\tlabel", "Alice,10\talpha"].join("\n");

    expect(detectDelimiter(ambiguousText)).toBe(",");
  });
});
