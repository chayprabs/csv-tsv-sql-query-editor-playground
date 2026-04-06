import { describe, expect, it } from "vitest";

import { deriveTableName } from "@/lib/tableNaming";

describe("unit/tableNaming", () => {
  it("falls back when a filename contains no ascii-safe name", () => {
    expect(deriveTableName("***.csv", new Set())).toBe("table_1");
  });
});

