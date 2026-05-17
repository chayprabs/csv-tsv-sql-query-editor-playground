const BYTES_PER_MEGABYTE = 1024 * 1024;

const DEFAULT_AUTO_INDEX_MAX_COLUMNS = 1;
const DEFAULT_AUTO_INDEX_ROW_THRESHOLD = 75_000;
const DEFAULT_MAX_FILE_COUNT = 20;
const DEFAULT_MAX_HEAP_MB = 512;
const DEFAULT_MAX_QUERY_LENGTH = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 50 * BYTES_PER_MEGABYTE;
const DEFAULT_MAX_RESULT_ROWS = 50_000;
const DEFAULT_MAX_UPLOAD_BYTES = 50 * BYTES_PER_MEGABYTE;
const DEFAULT_MAX_TOTAL_UPLOAD_BYTES = 100 * BYTES_PER_MEGABYTE;
const DEFAULT_QUERY_TIMEOUT_MS = 30_000;
const DEFAULT_RATE_LIMIT_BANDWIDTH_MB_PER_HOUR = 200;
const DEFAULT_RATE_LIMIT_MAX_CONCURRENT_GLOBAL = 20;
const DEFAULT_RATE_LIMIT_MAX_CONCURRENT_PER_IP = 3;
const DEFAULT_RATE_LIMIT_REQUESTS_PER_MINUTE = 10;
const DEFAULT_MIN_FILE_BYTES = 2;
const DEFAULT_MAX_FILENAME_LENGTH = 255;

export interface RuntimeConfig {
  autoIndexMaxColumns: number;
  autoIndexRowThreshold: number;
  maxFileCount: number;
  maxFilenameLength: number;
  maxHeapMb: number;
  maxQueryLength: number;
  maxResponseBytes: number;
  maxResultRows: number;
  /** Per-file upload cap (bytes). */
  maxUploadBytes: number;
  /** Combined upload cap for one request (bytes). */
  maxTotalUploadBytes: number;
  minFileBytes: number;
  queryTimeoutMs: number;
  rateLimitBandwidthBytesPerHour: number;
  rateLimitMaxConcurrentGlobal: number;
  rateLimitMaxConcurrentPerIp: number;
  rateLimitRequestsPerMinute: number;
}

function firstDefinedEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];

    if (value !== undefined && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRuntimeConfig(): RuntimeConfig {
  const maxUploadBytes = parsePositiveIntegerEnv(
    firstDefinedEnv(
      "MAX_UPLOAD_BYTES",
      "NEXT_PUBLIC_MAX_UPLOAD_BYTES",
      "FLATFILE_SQL_STUDIO_MAX_UPLOAD_BYTES",
    ),
    DEFAULT_MAX_UPLOAD_BYTES,
  );
  const maxTotalUploadBytes = parsePositiveIntegerEnv(
    firstDefinedEnv(
      "MAX_TOTAL_UPLOAD_BYTES",
      "FLATFILE_SQL_STUDIO_MAX_TOTAL_UPLOAD_BYTES",
    ),
    DEFAULT_MAX_TOTAL_UPLOAD_BYTES,
  );

  return {
    autoIndexMaxColumns: parsePositiveIntegerEnv(
      firstDefinedEnv("FLATFILE_SQL_STUDIO_AUTO_INDEX_MAX_COLUMNS"),
      DEFAULT_AUTO_INDEX_MAX_COLUMNS,
    ),
    autoIndexRowThreshold: parsePositiveIntegerEnv(
      firstDefinedEnv("FLATFILE_SQL_STUDIO_AUTO_INDEX_ROW_THRESHOLD"),
      DEFAULT_AUTO_INDEX_ROW_THRESHOLD,
    ),
    maxFileCount: parsePositiveIntegerEnv(
      firstDefinedEnv("MAX_FILE_COUNT", "FLATFILE_SQL_STUDIO_MAX_FILES_PER_REQUEST"),
      DEFAULT_MAX_FILE_COUNT,
    ),
    maxFilenameLength: DEFAULT_MAX_FILENAME_LENGTH,
    maxHeapMb: parsePositiveIntegerEnv(
      firstDefinedEnv("MAX_HEAP_MB"),
      DEFAULT_MAX_HEAP_MB,
    ),
    maxQueryLength: DEFAULT_MAX_QUERY_LENGTH,
    maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
    maxResultRows: parsePositiveIntegerEnv(
      firstDefinedEnv("MAX_RESULT_ROWS", "FLATFILE_SQL_STUDIO_MAX_RESULT_ROWS"),
      DEFAULT_MAX_RESULT_ROWS,
    ),
    maxUploadBytes,
    maxTotalUploadBytes,
    minFileBytes: DEFAULT_MIN_FILE_BYTES,
    queryTimeoutMs: parsePositiveIntegerEnv(
      firstDefinedEnv("QUERY_TIMEOUT_MS", "FLATFILE_SQL_STUDIO_QUERY_TIMEOUT_MS"),
      DEFAULT_QUERY_TIMEOUT_MS,
    ),
    rateLimitBandwidthBytesPerHour:
      parsePositiveIntegerEnv(
        firstDefinedEnv("RATE_LIMIT_BANDWIDTH_MB_PER_HOUR"),
        DEFAULT_RATE_LIMIT_BANDWIDTH_MB_PER_HOUR,
      ) * BYTES_PER_MEGABYTE,
    rateLimitMaxConcurrentGlobal: parsePositiveIntegerEnv(
      firstDefinedEnv("RATE_LIMIT_MAX_CONCURRENT_GLOBAL"),
      DEFAULT_RATE_LIMIT_MAX_CONCURRENT_GLOBAL,
    ),
    rateLimitMaxConcurrentPerIp: parsePositiveIntegerEnv(
      firstDefinedEnv("RATE_LIMIT_MAX_CONCURRENT_PER_IP"),
      DEFAULT_RATE_LIMIT_MAX_CONCURRENT_PER_IP,
    ),
    rateLimitRequestsPerMinute: parsePositiveIntegerEnv(
      firstDefinedEnv("RATE_LIMIT_REQUESTS_PER_MINUTE"),
      DEFAULT_RATE_LIMIT_REQUESTS_PER_MINUTE,
    ),
  };
}
