export type InferredSqliteType = "INTEGER" | "REAL" | "TEXT";

const INTEGER_PATTERN = /^[+-]?\d+$/;
const FLOAT_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INTEGER = BigInt(Number.MIN_SAFE_INTEGER);

function isUnsignedIntegerString(value: string): boolean {
  return /^\d+$/.test(value);
}

function hasSignificantLeadingZero(value: string): boolean {
  return /^0\d+$/.test(value);
}

function isCompactDateString(value: string): boolean {
  if (!/^\d{8}$/.test(value)) {
    return false;
  }

  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(4, 6), 10);
  const day = Number.parseInt(value.slice(6, 8), 10);

  return year >= 1900 && year <= 2200 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function shouldPreserveDigitColumnAsText(values: string[]): boolean {
  const normalizedValues = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (normalizedValues.length === 0 || !normalizedValues.every(isUnsignedIntegerString)) {
    return false;
  }

  if (normalizedValues.some(hasSignificantLeadingZero)) {
    return true;
  }

  const lengths = new Set(normalizedValues.map((value) => value.length));
  const fixedWidthLength = lengths.size === 1 ? [...lengths][0] : 0;

  if (fixedWidthLength >= 7) {
    return true;
  }

  return normalizedValues.every(isCompactDateString);
}

export function isIntegerString(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && INTEGER_PATTERN.test(trimmed);
}

export function isSafeIntegerString(value: string): boolean {
  const trimmed = value.trim();

  if (!isIntegerString(trimmed)) {
    return false;
  }

  const integerValue = BigInt(trimmed);
  return integerValue <= MAX_SAFE_INTEGER && integerValue >= MIN_SAFE_INTEGER;
}

export function isFloatString(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return false;
  }

  return FLOAT_PATTERN.test(trimmed) && Number.isFinite(Number(trimmed));
}

export function isNumericString(value: string): boolean {
  return isIntegerString(value) || isFloatString(value);
}

export function inferColumnType(values: string[]): InferredSqliteType {
  const nonEmptyValues = values.filter((value) => value.trim().length > 0);

  if (nonEmptyValues.length === 0) {
    return "TEXT";
  }

  if (shouldPreserveDigitColumnAsText(nonEmptyValues)) {
    return "TEXT";
  }

  if (nonEmptyValues.every(isSafeIntegerString)) {
    return "INTEGER";
  }

  if (
    nonEmptyValues.every(
      (value) =>
        isSafeIntegerString(value) ||
        (isFloatString(value) && !isIntegerString(value)),
    )
  ) {
    return "REAL";
  }

  return "TEXT";
}

export function inferColumnTypes(
  rows: string[][],
  columnCount: number,
): InferredSqliteType[] {
  const columnValues = Array.from({ length: columnCount }, () => [] as string[]);

  for (const row of rows) {
    for (let index = 0; index < columnCount; index += 1) {
      columnValues[index].push(row[index] ?? "");
    }
  }

  return columnValues.map((values) => inferColumnType(values));
}

export function coerceValue(
  value: string | undefined,
  sqliteType: InferredSqliteType,
): number | string | null {
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (sqliteType === "INTEGER") {
    return Number.parseInt(trimmed, 10);
  }

  if (sqliteType === "REAL") {
    return Number.parseFloat(trimmed);
  }

  return value;
}
