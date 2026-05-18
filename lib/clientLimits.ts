/**
 * Human-readable upload/query limits for the UI (PRD §23).
 * Mirrors server defaults in lib/runtimeConfig.ts; override via NEXT_PUBLIC_* in .env.
 */

const BYTES_PER_MEGABYTE = 1024 * 1024;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / BYTES_PER_MEGABYTE)} MB`;
}

const DEFAULT_MAX_UPLOAD_BYTES = 50 * BYTES_PER_MEGABYTE;
const DEFAULT_MAX_TOTAL_UPLOAD_BYTES = 100 * BYTES_PER_MEGABYTE;
const DEFAULT_MAX_FILE_COUNT = 20;
const DEFAULT_MAX_RESULT_ROWS = 50_000;
const DEFAULT_QUERY_TIMEOUT_MS = 30_000;

const maxUploadBytes = parsePositiveInt(
  process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES,
  DEFAULT_MAX_UPLOAD_BYTES,
);
const maxTotalBytes = parsePositiveInt(
  process.env.NEXT_PUBLIC_MAX_TOTAL_UPLOAD_BYTES,
  DEFAULT_MAX_TOTAL_UPLOAD_BYTES,
);
const maxFileCount = parsePositiveInt(
  process.env.NEXT_PUBLIC_MAX_FILE_COUNT,
  DEFAULT_MAX_FILE_COUNT,
);
const maxResultRows = parsePositiveInt(
  process.env.NEXT_PUBLIC_MAX_RESULT_ROWS,
  DEFAULT_MAX_RESULT_ROWS,
);
const queryTimeoutSeconds = Math.round(
  parsePositiveInt(process.env.NEXT_PUBLIC_QUERY_TIMEOUT_MS, DEFAULT_QUERY_TIMEOUT_MS) /
    1000,
);

export const CLIENT_LIMITS = {
  maxFileCount,
  maxResultRows,
  maxTotalBytes,
  maxUploadBytes,
  queryTimeoutSeconds,
  uploadSummary: `Up to ${maxFileCount} files per request (${formatMegabytes(maxUploadBytes)} per file, ${formatMegabytes(maxTotalBytes)} combined).`,
  querySummary: `Queries time out after ${queryTimeoutSeconds}s. Results may truncate at ${maxResultRows.toLocaleString("en-US")} rows.`,
} as const;
