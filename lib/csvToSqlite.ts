import { performance } from "node:perf_hooks";

import type { DelimiterOption } from "./delimiterDetection.ts";
import { sanitizeErrorMessage as sanitizeClientErrorMessage } from "./errorSanitizer.ts";
import type { HeaderMode } from "./headerMode.ts";
import { assertHeapWithinLimit } from "./memoryGuard.ts";
import {
  createInMemoryDatabase,
  executeReaderQuery,
  loadFilesIntoDatabase,
  type QueryFileInput,
} from "./queryEngine.ts";
import { getRuntimeConfig } from "./runtimeConfig.ts";
import type { InputEncoding } from "./textEncoding.ts";

export type { QueryFileInput } from "./queryEngine.ts";
export { sanitizeErrorMessage } from "./errorSanitizer.ts";

export interface CsvToSqliteOptions {
  delimiter?: DelimiterOption;
  files: QueryFileInput[];
  hasHeaders?: boolean;
  headerMode?: HeaderMode;
  inputEncoding?: InputEncoding;
  maxResultRows?: number;
  query: string;
}

export interface QueryResponse {
  columns: string[];
  error?: string;
  executionTimeMs: number;
  requestId?: string;
  returnedRows?: number;
  rowCount: number;
  rows: Record<string, unknown>[];
  totalRows?: number;
  truncated?: boolean;
  warning?: string;
}

export function executeCsvQuery({
  delimiter = "auto",
  files,
  hasHeaders,
  headerMode,
  inputEncoding = "utf-8",
  maxResultRows = getRuntimeConfig().maxResultRows,
  query,
}: CsvToSqliteOptions): QueryResponse {
  const startTime = performance.now();
  const runtimeConfig = getRuntimeConfig();
  const database = createInMemoryDatabase();

  try {
    if (files.length === 0) {
      throw new Error("At least one CSV or TSV file is required.");
    }

    assertHeapWithinLimit(runtimeConfig.maxHeapMb);
    loadFilesIntoDatabase(database, files, {
      delimiter,
      hasHeaders,
      headerMode,
      inputEncoding,
    });

    const result = executeReaderQuery(database, query, {
      maxResponseBytes: runtimeConfig.maxResponseBytes,
      maxResultRows,
      timeoutMs: runtimeConfig.queryTimeoutMs,
    });

    return {
      ...result,
      executionTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
    };
  } finally {
    database.close();
    for (const file of files) {
      file.buffer = Buffer.alloc(0);
    }
  }
}

export function csvToSqlite(options: CsvToSqliteOptions): QueryResponse {
  const startTime = performance.now();

  try {
    return executeCsvQuery(options);
  } catch (error) {
    return {
      columns: [],
      error: sanitizeClientErrorMessage(error),
      executionTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
      rowCount: 0,
      rows: [],
    };
  }
}
