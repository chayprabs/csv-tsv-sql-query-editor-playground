import Papa from "papaparse";

import type { SupportedDelimiter } from "./delimiterDetection.ts";
import { stripByteOrderMark } from "./textEncoding.ts";
import { isNumericString } from "./typeInference.ts";

function countNumericCells(row: string[]): number {
  return row.filter((value) => isNumericString(value.trim())).length;
}

export function detectHasHeaders(
  text: string,
  delimiter: SupportedDelimiter,
): boolean {
  const preview = Papa.parse<string[]>(stripByteOrderMark(text), {
    dynamicTyping: false,
    delimiter,
    preview: 10,
    skipEmptyLines: "greedy",
  });

  const rows = preview.data
    .filter((row) => Array.isArray(row) && row.length > 0)
    .map((row) => row.map((value) => value.trim()));

  if (rows.length === 0) {
    return true;
  }

  if (rows.length === 1) {
    return countNumericCells(rows[0]) < Math.ceil(rows[0].length / 2);
  }

  const [firstRow, ...remainingRows] = rows;
  const comparableRows = remainingRows.filter((row) => row.length === firstRow.length);
  const firstRowNonEmpty = firstRow.filter(Boolean);
  const sampledRows = comparableRows.length > 0 ? comparableRows : remainingRows;
  const averageNumericCells =
    sampledRows.reduce((total, row) => total + countNumericCells(row), 0) /
    Math.max(sampledRows.length, 1);

  let score = 0;

  if (countNumericCells(firstRow) < averageNumericCells) {
    score += 2;
  }

  if (
    firstRowNonEmpty.length > 0 &&
    firstRowNonEmpty.every((value) => !isNumericString(value)) &&
    sampledRows.some((row) => row.some((value) => isNumericString(value)))
  ) {
    score += 2;
  }

  if (new Set(firstRowNonEmpty).size === firstRowNonEmpty.length) {
    score += 1;
  }

  if (sampledRows.every((row) => row.length === firstRow.length)) {
    score += 1;
  }

  const preservesTypeShapeAcrossRows = sampledRows.every((row) =>
    row.every(
      (value, index) =>
        isNumericString(value) === isNumericString(firstRow[index] ?? ""),
    ),
  );

  if (preservesTypeShapeAcrossRows) {
    score -= 2;
  }

  const numericShapeChange = firstRow.some((value, index) => {
    const numericMatches = sampledRows.filter((row) =>
      isNumericString(row[index] ?? ""),
    ).length;
    return !isNumericString(value) && numericMatches >= Math.ceil(sampledRows.length / 2);
  });

  if (numericShapeChange) {
    score += 1;
  }

  if (score >= 2) {
    return true;
  }

  return (
    firstRowNonEmpty.length === firstRow.length &&
    firstRowNonEmpty.length > 0 &&
    firstRowNonEmpty.every((value) => !isNumericString(value)) &&
    new Set(firstRowNonEmpty).size === firstRowNonEmpty.length
  );
}
