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

  it("round-trips query and export preferences through URL-safe base64 JSON", () => {
    const serialized = serializeShareState({
      includeHeader: false,
      inputEncoding: "latin1",
      outputDelimiter: "\t",
      query: "SELECT * FROM sales LIMIT 5",
    });

    expect(serialized).not.toContain("query=");
    expect(parseShareState(serialized)).toEqual({
      includeHeader: false,
      inputEncoding: "latin1",
      outputDelimiter: "\t",
      query: "SELECT * FROM sales LIMIT 5",
    });
  });

  it("still parses legacy URLSearchParams share hashes", () => {
    expect(
      parseShareState(
        "query=SELECT+1&inputEncoding=utf-8&outputDelimiter=%2C&includeHeader=true",
      ),
    ).toEqual({
      includeHeader: true,
      inputEncoding: "utf-8",
      outputDelimiter: ",",
      query: "SELECT 1",
    });
  });
});
