import { describe, expect, it } from "vitest";

import { escapeDelimitedCell, rowsToDelimitedText } from "@/lib/csvExport";

describe("unit/csvExport", () => {
  it("escapes objects, delimiters, and quotes correctly", () => {
    expect(escapeDelimitedCell({ ok: true })).toBe('"{""ok"":true}"');
    expect(escapeDelimitedCell('hello"world')).toBe('"hello""world"');
    expect(escapeDelimitedCell("hello;world", ";")).toBe('"hello;world"');
  });

  it("serializes nullish values as empty export cells", () => {
    expect(
      rowsToDelimitedText(["a", "b"], [{ a: null, b: undefined }], {
        includeHeader: false,
      }),
    ).toBe(",");
  });
});

