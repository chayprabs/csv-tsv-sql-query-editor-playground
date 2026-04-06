import { describe, expect, it } from "vitest";

import { getRuntimeConfig } from "@/lib/runtimeConfig";

describe("unit/runtimeConfig", () => {
  it("falls back when env vars are missing, invalid, or non-positive", () => {
    const previousFiles = process.env.FLATFILE_SQL_STUDIO_MAX_FILES_PER_REQUEST;
    const previousTotalBytes = process.env.FLATFILE_SQL_STUDIO_MAX_TOTAL_UPLOAD_BYTES;
    const previousBytes = process.env.FLATFILE_SQL_STUDIO_MAX_UPLOAD_BYTES;
    process.env.FLATFILE_SQL_STUDIO_MAX_FILES_PER_REQUEST = "-1";
    process.env.FLATFILE_SQL_STUDIO_MAX_TOTAL_UPLOAD_BYTES = "not-a-number";
    process.env.FLATFILE_SQL_STUDIO_MAX_UPLOAD_BYTES = "not-a-number";

    try {
      const config = getRuntimeConfig();

      expect(config.maxFileCount).toBe(20);
      expect(config.maxUploadBytes).toBe(50 * 1024 * 1024);
    } finally {
      if (previousFiles === undefined) {
        delete process.env.FLATFILE_SQL_STUDIO_MAX_FILES_PER_REQUEST;
      } else {
        process.env.FLATFILE_SQL_STUDIO_MAX_FILES_PER_REQUEST = previousFiles;
      }

      if (previousTotalBytes === undefined) {
        delete process.env.FLATFILE_SQL_STUDIO_MAX_TOTAL_UPLOAD_BYTES;
      } else {
        process.env.FLATFILE_SQL_STUDIO_MAX_TOTAL_UPLOAD_BYTES = previousTotalBytes;
      }

      if (previousBytes === undefined) {
        delete process.env.FLATFILE_SQL_STUDIO_MAX_UPLOAD_BYTES;
      } else {
        process.env.FLATFILE_SQL_STUDIO_MAX_UPLOAD_BYTES = previousBytes;
      }
    }
  });
});
