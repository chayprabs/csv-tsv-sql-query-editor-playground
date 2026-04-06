import { describe, expect, it } from "vitest";

import { parseShareState } from "@/lib/shareState";

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
});

