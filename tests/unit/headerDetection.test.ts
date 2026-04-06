import { describe, expect, it } from "vitest";

import { detectHasHeaders } from "@/lib/headerDetection";

describe("unit/headerDetection", () => {
  it("returns false when the first row preserves the same numeric shape as later rows", () => {
    expect(detectHasHeaders("101,202\n303,404\n505,606\n", ",")).toBe(false);
  });

  it("returns true when the first row changes numeric shape compared with later rows", () => {
    expect(detectHasHeaders("name,score\nAda,10\nGrace,20\n", ",")).toBe(true);
  });
});

