import { describe, expect, it } from "vitest";

import { resolveHasHeaders } from "@/lib/headerMode";

describe("unit/headerMode", () => {
  it("respects explicit present and absent modes", () => {
    expect(resolveHasHeaders("1,2\n3,4\n", ",", "present")).toBe(true);
    expect(resolveHasHeaders("a,b\n1,2\n", ",", "absent")).toBe(false);
  });
});

