import { describe, expect, it } from "vitest";

import { parseShareState, serializeShareState } from "@/lib/shareState";

describe("unit/shareState", () => {
  it("ignores invalid state values while preserving valid query text", () => {
    expect(
      parseShareState(
        "query=SELECT+1&inputEncoding=utf-32&outputDelimiter=%7C&includeHeader=maybe",
      ),
    ).toEqual({
      includeHeader: false,
      inputEncoding: undefined,
      outputDelimiter: undefined,
      query: "SELECT 1",
    });
  });

  it("round-trips query and export preferences through the URL hash", () => {
    const serialized = serializeShareState({
      includeHeader: false,
      inputEncoding: "latin1",
      outputDelimiter: "\t",
      query: "SELECT * FROM sales LIMIT 5",
    });

    expect(parseShareState(serialized)).toEqual({
      includeHeader: false,
      inputEncoding: "latin1",
      outputDelimiter: "\t",
      query: "SELECT * FROM sales LIMIT 5",
    });
  });
});
