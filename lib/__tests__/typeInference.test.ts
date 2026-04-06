import { describe, expect, it } from "vitest";

import { inferColumnType } from "@/lib/typeInference";

describe("inferColumnType", () => {
  it("returns INTEGER for all integers", () => {
    expect(inferColumnType(["1", "2", "3"])).toBe("INTEGER");
  });

  it("returns REAL for all floats", () => {
    expect(inferColumnType(["1.1", "2.2", "3.3"])).toBe("REAL");
  });

  it("returns REAL for mixed integers and floats", () => {
    expect(inferColumnType(["1", "2.5", "3"])).toBe("REAL");
  });

  it("returns TEXT when any text value is present", () => {
    expect(inferColumnType(["1", "hello", "3.5"])).toBe("TEXT");
  });

  it("returns TEXT when the entire column is empty", () => {
    expect(inferColumnType(["", "   ", "\t"])).toBe("TEXT");
  });

  it("returns INTEGER when one non-empty integer is surrounded by empty cells", () => {
    expect(inferColumnType(["", "42", "   "])).toBe("INTEGER");
  });

  it('treats "1.0" as REAL rather than INTEGER', () => {
    expect(inferColumnType(["1.0", "2.0"])).toBe("REAL");
  });

  it("treats integers beyond the JS safe range as TEXT", () => {
    expect(inferColumnType(["9007199254740993", "9007199254740995"])).toBe(
      "TEXT",
    );
  });

  it("handles negative numeric values correctly", () => {
    expect(inferColumnType(["-1", "-2", "-3"])).toBe("INTEGER");
    expect(inferColumnType(["-1", "-2.5", "-3"])).toBe("REAL");
  });

  it('treats "true" and "false" as TEXT', () => {
    expect(inferColumnType(["true", "false"])).toBe("TEXT");
  });
});
