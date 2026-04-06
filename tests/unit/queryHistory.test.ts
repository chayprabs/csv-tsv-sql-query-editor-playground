import { describe, expect, it } from "vitest";

import { mergeQueryHistory } from "@/lib/queryHistory";

describe("unit/queryHistory", () => {
  it("trims incoming queries before storing them", () => {
    expect(mergeQueryHistory([], "  SELECT 1  ")).toEqual(["SELECT 1"]);
  });
});

