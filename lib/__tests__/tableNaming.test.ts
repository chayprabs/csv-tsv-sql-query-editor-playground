import { describe, expect, it } from "vitest";

import { deriveTableName } from "@/lib/tableNaming";

describe("deriveTableName", () => {
  it('sanitizes spaces as underscores for "sales data.csv"', () => {
    expect(deriveTableName("sales data.csv", new Set())).toBe("sales_data");
  });

  it('sanitizes hyphens as underscores for "my-file.csv"', () => {
    expect(deriveTableName("my-file.csv", new Set())).toBe("my_file");
  });

  it('prefixes table names that start with a digit for "123numbers.csv"', () => {
    expect(deriveTableName("123numbers.csv", new Set())).toBe("t_123numbers");
  });

  it('guards SQL reserved words for "SELECT.csv"', () => {
    expect(deriveTableName("SELECT.csv", new Set())).toBe("t_select");
  });

  it('keeps simple names intact for "normal.csv"', () => {
    expect(deriveTableName("normal.csv", new Set())).toBe("normal");
  });

  it('drops path traversal segments for "../../../etc/passwd.csv"', () => {
    expect(deriveTableName("../../../etc/passwd.csv", new Set())).toBe("passwd");
  });

  it('creates an ASCII-safe fallback for "файл.csv"', () => {
    expect(deriveTableName("файл.csv", new Set())).toBe("table_1");
  });

  it("deduplicates repeated sanitized names with a _1 suffix", () => {
    const takenNames = new Set<string>();

    expect(deriveTableName("table.csv", takenNames)).toBe("table");
    expect(deriveTableName("table!.csv", takenNames)).toBe("table_1");
  });
});
