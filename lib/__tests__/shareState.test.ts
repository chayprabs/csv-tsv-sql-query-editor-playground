import { describe, expect, it } from "vitest";

import { parseShareState, serializeShareState } from "@/lib/shareState";

describe("shareState", () => {
  it("serializes all supported query state fields into a URL-safe base64 payload", () => {
    const serialized = serializeShareState({
      includeHeader: false,
      inputEncoding: "latin1",
      outputDelimiter: "\t",
      query: "SELECT * FROM basic",
    });

    expect(serialized).not.toContain("query=");
    expect(parseShareState(serialized)).toEqual({
      includeHeader: false,
      inputEncoding: "latin1",
      outputDelimiter: "\t",
      query: "SELECT * FROM basic",
    });
  });

  it("parses a hash payload back into structured state", () => {
    expect(
      parseShareState(
        "#query=SELECT+*+FROM+basic&inputEncoding=utf-16le&outputDelimiter=%09&includeHeader=true",
      ),
    ).toEqual({
      includeHeader: true,
      inputEncoding: "utf-16le",
      outputDelimiter: "\t",
      query: "SELECT * FROM basic",
    });
  });
});
