import { describe, expect, it } from "vitest";

import { sanitizeErrorMessage } from "@/lib/csvToSqlite";

describe("unit/csvToSqlite", () => {
  it("maps known validation errors to friendly text", () => {
    expect(
      sanitizeErrorMessage(new Error('Failed to parse delimited data in "bad.csv": broken')),
    ).toBe("Could not parse the uploaded file.");
    expect(
      sanitizeErrorMessage(new Error("The file did not contain any columns.")),
    ).toBe("Could not parse the uploaded file.");
  });

  it("keeps supported sqlite planner errors verbatim and hides unknown ones", () => {
    expect(
      sanitizeErrorMessage(new Error("SELECTs to the left and right of UNION do not have the same number of result columns")),
    ).toContain("UNION");
    expect(sanitizeErrorMessage(new Error("totally unknown internal error"))).toBe(
      "The query could not be completed.",
    );
  });
});
