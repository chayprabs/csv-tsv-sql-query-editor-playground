import { describe, expect, it } from "vitest";

import {
  headerModeFromHasHeaders,
  normalizeDelimiterOption,
  normalizeHeaderMode,
} from "@/lib/fileParsing";

describe("unit/fileParsing", () => {
  it("normalizes supported and unsupported delimiter values", () => {
    expect(normalizeDelimiterOption(";")).toBe(";");
    expect(normalizeDelimiterOption("|")).toBe("auto");
  });

  it("normalizes supported and unsupported header modes", () => {
    expect(normalizeHeaderMode("present")).toBe("present");
    expect(normalizeHeaderMode("unexpected")).toBe("auto");
  });

  it("derives legacy header modes from boolean-like values", () => {
    expect(headerModeFromHasHeaders(undefined)).toBeUndefined();
    expect(headerModeFromHasHeaders(null)).toBeUndefined();
    expect(headerModeFromHasHeaders("true")).toBe("present");
    expect(headerModeFromHasHeaders("false")).toBe("absent");
  });
});

