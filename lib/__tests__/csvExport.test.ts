import { describe, expect, it } from "vitest";

import { rowsToDelimitedText } from "@/lib/csvExport";

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
});
