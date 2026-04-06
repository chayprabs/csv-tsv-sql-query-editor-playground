import Papa from "papaparse";

import {
  resolveDelimiter,
  type DelimiterOption,
  type SupportedDelimiter,
} from "./delimiterDetection.ts";
import { resolveHasHeaders, type HeaderMode } from "./headerMode.ts";
import { stripByteOrderMark } from "./textEncoding.ts";
import {
  inferColumnTypes,
  type InferredSqliteType,
} from "./typeInference.ts";

export interface ParsedDelimitedData {
  columnNames: string[];
  dataRows: string[][];
  delimiter: SupportedDelimiter;
  hasHeaders: boolean;
  sqliteTypes: InferredSqliteType[];
}

function getColumnCount(headerRow: string[], dataRows: string[][]): number {
  let maxColumns = headerRow.length;

  for (const row of dataRows) {
    if (row.length > maxColumns) {
      maxColumns = row.length;
    }
  }

  return maxColumns;
}

export function makeUniqueColumnNames(
  rawNames: string[],
  columnCount: number,
): string[] {
  const usedNames = new Map<string, number>();

  return Array.from({ length: columnCount }, (_, index) => {
    const rawName = rawNames[index]?.trim();
    const fallbackName = `c${index + 1}`;
    const baseName = rawName && rawName.length > 0 ? rawName : fallbackName;
    const normalizedKey = baseName.toLowerCase();
    const currentCount = usedNames.get(normalizedKey) ?? 0;

    usedNames.set(normalizedKey, currentCount + 1);

    return currentCount === 0 ? baseName : `${baseName}_${currentCount + 1}`;
  });
}

export function parseRows(
  text: string,
  delimiter: SupportedDelimiter,
  sourceName?: string,
): string[][] {
  const result = Papa.parse<string[]>(stripByteOrderMark(text), {
    dynamicTyping: false,
    delimiter,
    skipEmptyLines: true,
  });

  const blockingErrors = result.errors.filter(
    (error) => error.code !== "UndetectableDelimiter",
  );

  if (blockingErrors.length > 0) {
    const details = blockingErrors
      .slice(0, 3)
      .map((error) => {
        const rowLabel =
          typeof error.row === "number" ? ` at row ${error.row + 1}` : "";

        return `${error.message}${rowLabel}`;
      })
      .join("; ");
    const sourceLabel = sourceName ? ` in "${sourceName}"` : "";

    throw new Error(`Failed to parse delimited data${sourceLabel}: ${details}`);
  }

  return result.data
    .filter(
      (row) =>
        !(
          row.length <= 1 &&
          row.every((value) => !value || value.trim().length === 0)
        ),
    )
    .map((row) => row.map((value) => value ?? ""));
}

export function parseDelimitedText(
  text: string,
  options: {
    delimiter?: DelimiterOption;
    headerMode?: HeaderMode;
    sourceName?: string;
  } = {},
): ParsedDelimitedData {
  const delimiter = resolveDelimiter(text, options.delimiter ?? "auto");
  const rows = parseRows(text, delimiter, options.sourceName);
  const hasHeaders = resolveHasHeaders(text, delimiter, options.headerMode);

  if (rows.length === 0) {
    throw new Error("The file did not contain any data.");
  }

  const headerRow = hasHeaders ? rows[0] : [];
  const dataRows = hasHeaders ? rows.slice(1) : rows;
  const columnCount = getColumnCount(headerRow, dataRows);

  if (columnCount === 0) {
    throw new Error("The file did not contain any columns.");
  }

  const columnNames = hasHeaders
    ? makeUniqueColumnNames(headerRow, columnCount)
    : makeUniqueColumnNames([], columnCount);

  const normalizedRows = dataRows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  );

  return {
    columnNames,
    dataRows: normalizedRows,
    delimiter,
    hasHeaders,
    sqliteTypes: inferColumnTypes(normalizedRows, columnCount),
  };
}
