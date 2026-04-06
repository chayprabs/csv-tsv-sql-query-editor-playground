import { describe, expect, it } from "vitest";

import {
  mergeQueryHistory,
  parseStoredQueryHistory,
  serializeQueryHistory,
} from "@/lib/queryHistory";

describe("queryHistory", () => {
  it("returns an empty array when no stored history exists", () => {
    expect(parseStoredQueryHistory(null)).toEqual([]);
  });

  it("parses stored history arrays safely", () => {
    expect(parseStoredQueryHistory('["SELECT 1","SELECT 2"]')).toEqual([
      "SELECT 1",
      "SELECT 2",
    ]);
  });

  it("filters non-string entries from stored history", () => {
    expect(parseStoredQueryHistory('["SELECT 1",42,null,{"sql":"SELECT 2"}]')).toEqual([
      "SELECT 1",
    ]);
  });

  it("returns an empty array for non-array JSON", () => {
    expect(parseStoredQueryHistory('{"sql":"SELECT 1"}')).toEqual([]);
  });

  it("returns an empty array for malformed history", () => {
    expect(parseStoredQueryHistory("{")).toEqual([]);
  });

  it("deduplicates and prepends the latest query", () => {
    expect(
      mergeQueryHistory(["SELECT 2", "SELECT 1"], "SELECT 1"),
    ).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("caps stored history at ten queries", () => {
    const history = Array.from({ length: 10 }, (_, index) => `SELECT ${index + 1}`);

    expect(mergeQueryHistory(history, "SELECT 99")).toHaveLength(10);
  });

  it("ignores blank queries when merging history", () => {
    expect(mergeQueryHistory(["SELECT 1"], "   ")).toEqual(["SELECT 1"]);
  });

  it("serializes history back to JSON", () => {
    expect(serializeQueryHistory(["SELECT 1"])).toBe('["SELECT 1"]');
  });
});
