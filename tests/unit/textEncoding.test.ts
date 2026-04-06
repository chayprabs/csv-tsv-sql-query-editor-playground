import { describe, expect, it } from "vitest";

import { decodeTextBytes } from "@/lib/textEncoding";

describe("unit/textEncoding", () => {
  it("decodes UTF-16BE BOM payloads and ArrayBuffer views", () => {
    const bytes = Uint8Array.from([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]);

    expect(decodeTextBytes(bytes, "utf-8")).toBe("AB");
  });
});

