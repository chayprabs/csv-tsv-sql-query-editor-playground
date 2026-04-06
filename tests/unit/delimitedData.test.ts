import { describe, expect, it } from "vitest";

import {
  makeUniqueColumnNames,
  parseDelimitedText,
  parseRows,
} from "@/lib/delimitedData";

describe("unit/delimitedData", () => {
  it("de-duplicates case-insensitive header names and fills blanks", () => {
    expect(makeUniqueColumnNames(["Name", "name", ""], 3)).toEqual([
      "Name",
      "name_2",
      "c3",
    ]);
  });

  it("includes the source filename in parse errors", () => {
    expect(() =>
      parseRows('id,name\n1,"unterminated', ",", "broken.csv"),
    ).toThrow(/broken\.csv/);
  });

  it("throws when parsing yields no data rows at all", () => {
    expect(() =>
      parseDelimitedText("", {
        delimiter: ",",
        headerMode: "absent",
      }),
    ).toThrow("The file did not contain any data.");
  });
});
