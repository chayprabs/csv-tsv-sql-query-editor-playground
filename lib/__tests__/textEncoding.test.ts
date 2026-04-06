import { describe, expect, it } from "vitest";

import { decodeTextBytes } from "@/lib/textEncoding";

describe("decodeTextBytes", () => {
  it("decodes latin1 input", () => {
    expect(
      decodeTextBytes(Buffer.from("Málaga", "latin1"), "latin1"),
    ).toBe("Málaga");
  });

  it("decodes utf-16le input", () => {
    expect(
      decodeTextBytes(Buffer.from("hello", "utf16le"), "utf-16le"),
    ).toBe("hello");
  });

  it("strips a leading UTF-8 byte order mark", () => {
    expect(decodeTextBytes(Buffer.from("\uFEFFhello", "utf8"), "utf-8")).toBe(
      "hello",
    );
  });
});
