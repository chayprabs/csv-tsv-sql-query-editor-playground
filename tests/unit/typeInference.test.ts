import { describe, expect, it } from "vitest";

import {
  coerceValue,
  inferColumnTypes,
  isSafeIntegerString,
} from "@/lib/typeInference";

describe("unit/typeInference", () => {
  it("handles integer safety boundaries and column inference", () => {
    expect(isSafeIntegerString(String(Number.MAX_SAFE_INTEGER))).toBe(true);
    expect(
      isSafeIntegerString(String(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1))),
    ).toBe(false);
    expect(
      inferColumnTypes(
        [
          ["1", "1.5", "Ada"],
          ["2", "2.5", "Grace"],
        ],
        3,
      ),
    ).toEqual(["INTEGER", "REAL", "TEXT"]);
  });

  it("coerces values to null, integers, reals, and text", () => {
    expect(coerceValue(undefined, "TEXT")).toBeNull();
    expect(coerceValue("   ", "TEXT")).toBeNull();
    expect(coerceValue("42", "INTEGER")).toBe(42);
    expect(coerceValue("3.14", "REAL")).toBeCloseTo(3.14);
    expect(coerceValue("0007", "TEXT")).toBe("0007");
  });
});
