import { describe, expect, it, vi } from "vitest";

import {
  buildErrorResponseBody,
  ClientError,
  createRequestId,
  getErrorStatus,
  getSerializableErrorStatus,
  logServerError,
  sanitizeErrorMessage,
} from "@/lib/errorSanitizer";
import { MemoryPressureError } from "@/lib/memoryGuard";
import { QueryTimeoutError } from "@/lib/queryTimeout";

describe("unit/errorSanitizer", () => {
  it("creates short request ids", () => {
    expect(createRequestId()).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}$/);
  });

  it("maps error statuses for client, timeout, memory, and unknown errors", () => {
    expect(getErrorStatus(new ClientError(418, "teapot"))).toBe(418);
    expect(getErrorStatus(new QueryTimeoutError(1_001))).toBe(408);
    expect(getErrorStatus(new MemoryPressureError())).toBe(503);
    expect(getErrorStatus(new Error("boom"))).toBe(500);
  });

  it("maps serializable statuses for friendly validation and sqlite-style errors", () => {
    expect(getSerializableErrorStatus(new ClientError(429, "slow down"))).toBe(429);
    expect(getSerializableErrorStatus(new QueryTimeoutError(100))).toBe(408);
    expect(getSerializableErrorStatus(new MemoryPressureError())).toBe(503);
    expect(getSerializableErrorStatus(new Error("A SQL query is required."))).toBe(400);
    expect(getSerializableErrorStatus(new Error("no such table: missing"))).toBe(400);
    expect(
      getSerializableErrorStatus(
        new Error('Failed to parse delimited data in "bad.csv": broken'),
      ),
    ).toBe(400);
    expect(getSerializableErrorStatus("boom")).toBeUndefined();
  });

  it("sanitizes client errors and strips paths, stacks, and node internals", () => {
    expect(
      sanitizeErrorMessage(
        new ClientError(
          400,
          "Boom at C:\\secret\\server\\file.ts\n    at doThing (node:internal/modules/cjs/loader:1:1)",
        ),
      ),
    ).toBe("Boom at [path]");
  });

  it("normalizes known validation messages to friendlier copy", () => {
    expect(sanitizeErrorMessage(new Error("A SQL query is required."))).toBe(
      "Query is required",
    );
    expect(
      sanitizeErrorMessage(new Error("At least one CSV or TSV file is required.")),
    ).toBe("No files uploaded");
    expect(sanitizeErrorMessage(new Error("The file did not contain any data."))).toBe(
      "One of the uploaded files was empty after parsing.",
    );
    expect(
      sanitizeErrorMessage(new Error("Only read-only SELECT-style queries are supported.")),
    ).toBe("Only read-only SELECT-style queries are supported.");
  });

  it("maps sqlite-style table and column errors while preserving helpful planner errors", () => {
    expect(sanitizeErrorMessage(new Error("no such table: missing_table"))).toBe(
      "The query referenced a table that was not loaded.",
    );
    expect(sanitizeErrorMessage(new Error("no such column: missing_column"))).toBe(
      "The query referenced a column that does not exist.",
    );
    expect(
      sanitizeErrorMessage(
        new Error(
          "SELECTs to the left and right of UNION do not have the same number of result columns",
        ),
      ),
    ).toContain("UNION");
  });

  it("maps parse, timeout, memory, and range errors to safe user-facing messages", () => {
    expect(
      sanitizeErrorMessage(new Error('Failed to parse delimited data in "bad.csv": broken')),
    ).toBe(
      "Failed to parse one or more uploaded files. Check the selected encoding, delimiter, header mode, and quoting.",
    );
    expect(sanitizeErrorMessage(new QueryTimeoutError(1_500))).toBe(
      "Query timed out after 2 seconds. Simplify your query.",
    );
    expect(sanitizeErrorMessage(new MemoryPressureError())).toBe(
      "Server is under memory pressure. Try again shortly.",
    );
    expect(sanitizeErrorMessage(new RangeError("memory allocation failed"))).toBe(
      "File is too large to process.",
    );
    expect(sanitizeErrorMessage(new Error("totally unknown internal error"))).toBe(
      "The query could not be completed.",
    );
  });

  it("builds structured error response bodies with optional truncation metadata", () => {
    expect(
      buildErrorResponseBody(new Error("no such table: missing"), "req-1", {
        returnedRows: 10,
        totalRows: 20,
        truncated: true,
        warning: "partial",
      }),
    ).toEqual({
      error: "The query referenced a table that was not loaded.",
      requestId: "req-1",
      returnedRows: 10,
      totalRows: 20,
      truncated: true,
      warning: "partial",
    });
  });

  it("logs both Error instances and non-error values with the request context", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logServerError("req-1", new Error("boom"), { path: "/api/query" });
    logServerError("req-2", { boom: true }, { path: "/api/query" });

    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy.mock.calls[0]?.[0]).toContain("requestId=req-1");
    expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({
      path: "/api/query",
      error: expect.objectContaining({
        message: "boom",
        name: "Error",
      }),
    });
    expect(errorSpy.mock.calls[1]?.[1]).toMatchObject({
      path: "/api/query",
      error: {
        value: { boom: true },
      },
    });
  });
});
