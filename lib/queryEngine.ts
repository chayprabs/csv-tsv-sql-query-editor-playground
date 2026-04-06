import Database from "better-sqlite3";

import { assertHeapWithinLimit } from "./memoryGuard.ts";
import {
  parseDelimitedText,
  type ParsedDelimitedData,
} from "./delimitedData.ts";
import type { FileParseOptions } from "./fileParsing.ts";
import type { HeaderMode } from "./headerMode.ts";
import { executeWithTimeout, QueryTimeoutError } from "./queryTimeout.ts";
import { getRuntimeConfig } from "./runtimeConfig.ts";
import {
  coerceValue,
  type InferredSqliteType,
} from "./typeInference.ts";
import { deriveTableName } from "./tableNaming.ts";
import { decodeTextBytes, type InputEncoding } from "./textEncoding.ts";

export interface QueryFileInput extends Partial<FileParseOptions> {
  buffer: Buffer;
  filename: string;
}

export interface QueryLoadOptions {
  autoIndexMaxColumns?: number;
  autoIndexRowThreshold?: number;
  delimiter?: FileParseOptions["delimiter"];
  hasHeaders?: boolean;
  headerMode?: HeaderMode;
  inputEncoding?: InputEncoding;
}

export interface QueryExecutionResult {
  columns: string[];
  rowCount: number;
  rows: Record<string, unknown>[];
  returnedRows?: number;
  totalRows?: number;
  truncated?: boolean;
  warning?: string;
}

const INDEX_ANALYSIS_SAMPLE_SIZE = 5_000;

interface ParsedFile extends ParsedDelimitedData {
  delimiter: ParsedDelimitedData["delimiter"];
  sqliteTypes: InferredSqliteType[];
  tableName: string;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function normalizeParsedFile(
  file: QueryFileInput,
  delimiterPreference: FileParseOptions["delimiter"] | undefined,
  explicitHasHeaders: boolean | undefined,
  headerMode: HeaderMode | undefined,
  inputEncoding: InputEncoding,
  takenTableNames: Set<string>,
): ParsedFile {
  const text = decodeTextBytes(file.buffer, inputEncoding);
  const resolvedHeaderMode =
    file.headerMode ??
    (explicitHasHeaders === undefined
      ? headerMode
      : explicitHasHeaders
        ? "present"
        : "absent");
  const parsed = parseDelimitedText(text, {
    delimiter: file.delimiter ?? delimiterPreference ?? "auto",
    headerMode: resolvedHeaderMode,
    sourceName: file.filename,
  });

  return {
    ...parsed,
    tableName: deriveTableName(file.filename, takenTableNames),
  };
}

function createTable(
  database: Database.Database,
  parsedFile: ParsedFile,
): void {
  const tableSql = `
    CREATE TABLE ${quoteIdentifier(parsedFile.tableName)} (
      ${parsedFile.columnNames
        .map(
          (columnName, index) =>
            `${quoteIdentifier(columnName)} ${parsedFile.sqliteTypes[index]}`,
        )
        .join(", ")}
    )
  `;

  database.exec(tableSql);

  if (parsedFile.dataRows.length === 0) {
    return;
  }

  const insertSql = `
    INSERT INTO ${quoteIdentifier(parsedFile.tableName)} (
      ${parsedFile.columnNames.map(quoteIdentifier).join(", ")}
    ) VALUES (
      ${parsedFile.columnNames.map(() => "?").join(", ")}
    )
  `;

  const insertStatement = database.prepare(insertSql);
  const insertMany = database.transaction((rows: string[][]) => {
    for (const row of rows) {
      insertStatement.run(
        row.map((value, index) => coerceValue(value, parsedFile.sqliteTypes[index])),
      );
    }
  });

  insertMany(parsedFile.dataRows);
}

function buildIndexName(tableName: string, columnIndex: number): string {
  const normalizedTableName =
    tableName.replace(/[^a-z0-9_]+/gi, "_").replace(/^_+|_+$/g, "") || "table";

  return `idx_${normalizedTableName}_${columnIndex + 1}`;
}

function getAdaptiveIndexPriority(
  columnName: string,
  sqliteType: InferredSqliteType,
): number {
  const normalizedName = columnName.toLowerCase();

  if (/(sort|order)/i.test(normalizedName)) {
    return 0;
  }

  if (sqliteType === "TEXT") {
    return 1;
  }

  return 0;
}

function getIndexCandidateColumns(
  parsedFile: ParsedFile,
  maxColumns: number,
): number[] {
  if (parsedFile.dataRows.length === 0) {
    return [];
  }

  const sampleSize = Math.min(parsedFile.dataRows.length, INDEX_ANALYSIS_SAMPLE_SIZE);
  const candidates = parsedFile.columnNames
    .map((_, columnIndex) => {
      const distinctValues = new Set<string>();
      let observedValues = 0;

      for (let rowIndex = 0; rowIndex < sampleSize; rowIndex += 1) {
        const value = parsedFile.dataRows[rowIndex][columnIndex]?.trim() ?? "";

        if (!value) {
          continue;
        }

        observedValues += 1;
        distinctValues.add(value);
      }

      const distinctRatio =
        observedValues === 0 ? 0 : distinctValues.size / observedValues;
      const priority = getAdaptiveIndexPriority(
        parsedFile.columnNames[columnIndex],
        parsedFile.sqliteTypes[columnIndex],
      );

      return {
        columnIndex,
        distinctRatio,
        observedValues,
        priority,
      };
    })
    .filter(
      (candidate) =>
        candidate.priority > 0 &&
        candidate.observedValues >= Math.max(50, Math.floor(sampleSize * 0.5)) &&
        candidate.distinctRatio >= 0.85,
    )
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      return right.distinctRatio - left.distinctRatio;
    });

  return candidates.slice(0, maxColumns).map((candidate) => candidate.columnIndex);
}

function createAdaptiveIndexes(
  database: Database.Database,
  parsedFile: ParsedFile,
  rowThreshold: number,
  maxColumns: number,
): void {
  if (parsedFile.dataRows.length < rowThreshold) {
    return;
  }

  const candidateColumns = getIndexCandidateColumns(parsedFile, maxColumns);

  for (const columnIndex of candidateColumns) {
    const indexName = buildIndexName(parsedFile.tableName, columnIndex);
    const columnName = parsedFile.columnNames[columnIndex];

    database.exec(
      `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(indexName)} ON ${quoteIdentifier(parsedFile.tableName)} (${quoteIdentifier(columnName)})`,
    );
  }
}

export function createInMemoryDatabase(): Database.Database {
  const database = new Database(":memory:");

  database.pragma("journal_mode = OFF");
  database.pragma("synchronous = OFF");
  database.pragma("temp_store = MEMORY");
  database.pragma("cache_size = -64000");

  return database;
}

export function normalizeQuery(query: string): string {
  return query.trim().replace(/;+$/, "");
}

function isAllowedReaderQuery(query: string): boolean {
  return /^(select|with|values)\b/i.test(query) || /^(explain\s+query\s+plan)\s+(select|with|values)\b/i.test(query);
}

export function loadFilesIntoDatabase(
  database: Database.Database,
  files: QueryFileInput[],
  {
    autoIndexMaxColumns = getRuntimeConfig().autoIndexMaxColumns,
    autoIndexRowThreshold = getRuntimeConfig().autoIndexRowThreshold,
    delimiter = "auto",
    hasHeaders,
    headerMode,
    inputEncoding = "utf-8",
  }: QueryLoadOptions = {},
): void {
  const takenTableNames = new Set<string>();

  for (const file of files) {
    assertHeapWithinLimit(getRuntimeConfig().maxHeapMb);

    const parsedFile = normalizeParsedFile(
      file,
      delimiter,
      hasHeaders,
      headerMode,
      inputEncoding,
      takenTableNames,
    );

    assertHeapWithinLimit(getRuntimeConfig().maxHeapMb);
    createTable(database, parsedFile);
    createAdaptiveIndexes(
      database,
      parsedFile,
      autoIndexRowThreshold,
      autoIndexMaxColumns,
    );
    file.buffer = Buffer.alloc(0);
  }
}

function estimateSerializedRowBytes(row: Record<string, unknown>): number {
  return Buffer.byteLength(JSON.stringify(row), "utf8") + 1;
}

function interruptDatabase(database: Database.Database): void {
  const interruptibleDatabase = database as Database.Database & {
    interrupt?: () => void;
  };

  interruptibleDatabase.interrupt?.();
}

function buildTruncationWarning(options: {
  maxResultRows: number;
  responseSizeTruncated: boolean;
  returnedRows: number;
  rowLimitTruncated: boolean;
  totalRows: number;
}): string {
  if (options.rowLimitTruncated && options.responseSizeTruncated) {
    return `Results truncated to ${options.maxResultRows.toLocaleString()} rows and capped to stay under the 50MB response limit. Showing ${options.returnedRows.toLocaleString()} of ${options.totalRows.toLocaleString()} rows.`;
  }

  if (options.rowLimitTruncated) {
    return `Results truncated to ${options.maxResultRows.toLocaleString()} rows. Showing ${options.returnedRows.toLocaleString()} of ${options.totalRows.toLocaleString()} rows.`;
  }

  return `Results truncated to stay under the 50MB response limit. Showing ${options.returnedRows.toLocaleString()} of ${options.totalRows.toLocaleString()} rows.`;
}

export function executeReaderQuery(
  database: Database.Database,
  query: string,
  options:
    | number
    | {
        maxResponseBytes?: number;
        maxResultRows?: number;
        timeoutMs?: number;
      } = {},
): QueryExecutionResult {
  const normalizedOptions =
    typeof options === "number" ? { maxResultRows: options } : options;
  const runtimeConfig = getRuntimeConfig();
  const maxResponseBytes =
    normalizedOptions.maxResponseBytes ?? runtimeConfig.maxResponseBytes;
  const maxResultRows =
    normalizedOptions.maxResultRows ?? runtimeConfig.maxResultRows;
  const timeoutMs = normalizedOptions.timeoutMs ?? runtimeConfig.queryTimeoutMs;
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    throw new Error("A SQL query is required.");
  }

  if (!isAllowedReaderQuery(normalizedQuery)) {
    throw new Error("Only read-only SELECT-style queries are supported.");
  }

  const statement = database.prepare(normalizedQuery);

  if (!statement.reader) {
    throw new Error("Only read-only SELECT-style queries are supported.");
  }

  const columns = statement.columns().map((column) => column.name);
  const rows: Record<string, unknown>[] = [];
  const deadline = Date.now() + timeoutMs;
  let totalRows = 0;
  let estimatedResponseBytes = Buffer.byteLength(JSON.stringify(columns), "utf8") + 256;
  let responseSizeTruncated = false;
  let rowLimitTruncated = false;

  try {
    executeWithTimeout(
      () => {
        for (const row of statement.iterate() as Iterable<Record<string, unknown>>) {
          totalRows += 1;

          if ((totalRows & 0xff) === 0 && Date.now() >= deadline) {
            interruptDatabase(database);
            throw new QueryTimeoutError(timeoutMs);
          }

          if (rows.length >= maxResultRows) {
            rowLimitTruncated = true;
            continue;
          }

          const estimatedRowBytes = estimateSerializedRowBytes(row);

          if (estimatedResponseBytes + estimatedRowBytes > maxResponseBytes) {
            responseSizeTruncated = true;
            continue;
          }

          rows.push(row);
          estimatedResponseBytes += estimatedRowBytes;
        }
      },
      timeoutMs,
      () => interruptDatabase(database),
    );
  } catch (error) {
    if (error instanceof QueryTimeoutError) {
      const truncatedQuery = normalizedQuery.slice(0, 200);

      console.error(
        `[${new Date().toISOString()}] Query timeout after ${timeoutMs}ms: ${truncatedQuery}`,
      );
    }

    throw error;
  }

  const truncated = rowLimitTruncated || responseSizeTruncated;

  return {
    columns,
    returnedRows: rows.length,
    rowCount: rows.length,
    rows,
    totalRows,
    truncated: truncated || undefined,
    warning: truncated
      ? buildTruncationWarning({
          maxResultRows,
          responseSizeTruncated,
          returnedRows: rows.length,
          rowLimitTruncated,
          totalRows,
        })
      : undefined,
  };
}
