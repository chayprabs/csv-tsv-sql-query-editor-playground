import { randomUUID } from "node:crypto";

import { MemoryPressureError } from "./memoryGuard.ts";
import { QueryTimeoutError } from "./queryTimeout.ts";

const NODE_INTERNAL_PATTERN =
  /\b(?:node:)?internal(?:\/|\\)[^\s"'`)]*|\bnode:[^\s"'`)]*/gi;
const STACK_TRACE_PATTERN = /^\s*at\s.+$/gm;
const UNIX_PATH_PATTERN = /\/(?:[^/\s"'`]+\/)+[^/\s"'`)]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\(?:[^\\\s"'`]+\\)*[^\\\s"'`)]+/g;

export interface ErrorResponseBody {
  error: string;
  requestId: string;
  returnedRows?: number;
  totalRows?: number;
  truncated?: boolean;
  warning?: string;
}

export interface ErrorResponseOptions {
  returnedRows?: number;
  totalRows?: number;
  truncated?: boolean;
  warning?: string;
}

export class ClientError extends Error {
  readonly code?: string;
  readonly retryAfterSeconds?: number;
  readonly status: number;

  constructor(
    status: number,
    message: string,
    options: {
      code?: string;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(message);
    this.name = "ClientError";
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.status = status;
  }
}

function stripSensitiveDetails(message: string): string {
  return message
    .replace(STACK_TRACE_PATTERN, " ")
    .replace(WINDOWS_PATH_PATTERN, "[path]")
    .replace(UNIX_PATH_PATTERN, "[path]")
    .replace(NODE_INTERNAL_PATTERN, "[internal]")
    .replace(/\s+/g, " ")
    .trim();
}

function isParseError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/parse/i.test(error.name) ||
      /failed to parse|malformed multipart|invalid multipart|could not parse/i.test(
        error.message,
      ))
  );
}

function isSqliteError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/sqlite/i.test(error.name) ||
      /sqlite|syntax error|no such table|no such column|ambiguous column|datatype mismatch|misuse of aggregate|interrupted|SELECTs to the left and right of UNION/i.test(
        error.message,
      ))
  );
}

export function createRequestId(): string {
  return randomUUID().split("-").slice(0, 2).join("-");
}

export function getErrorStatus(error: unknown): number {
  if (error instanceof ClientError) {
    return error.status;
  }

  if (error instanceof QueryTimeoutError) {
    return 408;
  }

  if (error instanceof MemoryPressureError) {
    return 503;
  }

  return 500;
}

function isKnownValidationMessage(message: string): boolean {
  return [
    "A SQL query is required.",
    "Query is required",
    "Query is required.",
    "At least one CSV or TSV file is required.",
    "No files uploaded",
    "Only read-only SELECT-style queries are supported.",
    "The file did not contain any data.",
    "The file did not contain any columns.",
  ].includes(message);
}

function isKnownValidationError(error: unknown): boolean {
  return error instanceof Error && isKnownValidationMessage(error.message);
}

export function getSerializableErrorStatus(error: unknown): number | undefined {
  if (error instanceof ClientError) {
    return error.status;
  }

  if (error instanceof QueryTimeoutError) {
    return 408;
  }

  if (error instanceof MemoryPressureError) {
    return 503;
  }

  if (isSqliteError(error) || isParseError(error) || isKnownValidationError(error)) {
    return 400;
  }

  return undefined;
}

export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof ClientError) {
    return stripSensitiveDetails(error.message);
  }

  if (error instanceof QueryTimeoutError) {
    return error.message;
  }

  if (error instanceof MemoryPressureError) {
    return error.message;
  }

  if (error instanceof Error && isKnownValidationMessage(error.message)) {
    if (
      error.message === "A SQL query is required." ||
      error.message === "Query is required" ||
      error.message === "Query is required."
    ) {
      return "Query is required";
    }

    if (
      error.message === "At least one CSV or TSV file is required." ||
      error.message === "No files uploaded"
    ) {
      return "No files uploaded";
    }

    if (
      error.message === "The file did not contain any data." ||
      error.message === "The file did not contain any columns."
    ) {
      return "One of the uploaded files was empty after parsing.";
    }

    return stripSensitiveDetails(error.message);
  }

  if (error instanceof Error && isSqliteError(error)) {
    const sanitizedMessage = stripSensitiveDetails(error.message);

    if (/^no such table:/i.test(sanitizedMessage)) {
      return "The query referenced a table that was not loaded.";
    }

    if (/^no such column:/i.test(sanitizedMessage)) {
      return "The query referenced a column that does not exist.";
    }

    return sanitizedMessage;
  }

  if (isParseError(error)) {
    return "Failed to parse one or more uploaded files. Check the selected encoding, delimiter, header mode, and quoting.";
  }

  if (error instanceof RangeError && /memory/i.test(error.message)) {
    return "File is too large to process.";
  }

  return "The query could not be completed.";
}

export function buildErrorResponseBody(
  error: unknown,
  requestId: string,
  options: ErrorResponseOptions = {},
): ErrorResponseBody {
  return {
    error: sanitizeErrorMessage(error),
    requestId,
    ...(options.returnedRows !== undefined
      ? { returnedRows: options.returnedRows }
      : {}),
    ...(options.totalRows !== undefined ? { totalRows: options.totalRows } : {}),
    ...(options.truncated !== undefined ? { truncated: options.truncated } : {}),
    ...(options.warning !== undefined ? { warning: options.warning } : {}),
  };
}

export function logServerError(
  requestId: string,
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  const timestamp = new Date().toISOString();
  const details =
    error instanceof Error
      ? {
          message: error.message,
          name: error.name,
          stack: error.stack,
        }
      : {
          value: error,
        };

  console.error(`[${timestamp}] requestId=${requestId}`, {
    ...context,
    error: details,
  });
}
