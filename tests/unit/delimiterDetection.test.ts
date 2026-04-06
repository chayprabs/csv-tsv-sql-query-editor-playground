import { describe, expect, it } from "vitest";

import { resolveDelimiter } from "@/lib/delimiterDetection";

describe("unit/delimiterDetection", () => {
  it("honors explicit delimiter overrides", () => {
    expect(resolveDelimiter("a\tb\n1\t2\n", ";")).toBe(";");
    expect(resolveDelimiter("a,b\n1,2\n", ",")).toBe(",");
  });
});

