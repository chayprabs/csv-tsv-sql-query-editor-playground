import { describe, expect, it } from "vitest";

import {
  isAllowedUploadFile,
  summarizeUploadIssues,
  validateUploadBatch,
} from "@/lib/uploadValidation";

function makeFile(name: string, size = 100, type = "text/csv"): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("uploadValidation", () => {
  it("accepts csv, tsv, and txt extensions", () => {
    expect(isAllowedUploadFile(makeFile("a.csv"))).toBe(true);
    expect(isAllowedUploadFile(makeFile("b.tsv"))).toBe(true);
    expect(isAllowedUploadFile(makeFile("c.txt"))).toBe(true);
    expect(isAllowedUploadFile(makeFile("d.pdf", 100, ""))).toBe(false);
  });

  it("merges new files with existing uploads", () => {
    const existing = [makeFile("one.csv")];
    const incoming = [makeFile("two.csv")];

    const result = validateUploadBatch(incoming, existing);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.name).toBe("two.csv");
  });

  it("summarizes a single issue message", () => {
    const message = summarizeUploadIssues([
      { filename: "bad.pdf", message: "Unsupported file type." },
    ]);

    expect(message).toBe("Unsupported file type.");
  });
});
