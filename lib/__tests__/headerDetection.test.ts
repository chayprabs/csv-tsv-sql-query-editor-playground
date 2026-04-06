import { describe, expect, it } from "vitest";

import { detectHasHeaders } from "@/lib/headerDetection";
import { readFixtureText } from "@/test-utils/fixtures";

describe("detectHasHeaders", () => {
  it("detects headers in a standard CSV", () => {
    expect(detectHasHeaders(readFixtureText("basic.csv"), ",")).toBe(true);
  });

  it("detects no-header datasets with numeric first rows", () => {
    expect(detectHasHeaders(readFixtureText("no_header.csv"), ",")).toBe(false);
  });

  it("treats an empty preview as header-friendly by default", () => {
    expect(detectHasHeaders("", ",")).toBe(true);
  });

  it("uses single-row heuristics when only one row is available", () => {
    expect(detectHasHeaders("name,score", ",")).toBe(true);
    expect(detectHasHeaders("10,20", ",")).toBe(false);
  });
});
