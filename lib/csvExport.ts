function stringifyCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** Prefix cells that could execute as formulas when opened in Excel/Sheets. */
export function sanitizeSpreadsheetFormulaCell(raw: string): string {
  if (/^[=+\-@]/.test(raw)) {
    return `\t${raw}`;
  }

  return raw;
}

export function escapeDelimitedCell(
  value: unknown,
  delimiter = ",",
): string {
  const raw = sanitizeSpreadsheetFormulaCell(stringifyCellValue(value));
  const escapedDelimiter = delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (
    new RegExp(`[\"\\n\\r\\t${delimiter === "\t" ? "" : escapedDelimiter}]`).test(
      raw,
    )
  ) {
    return `"${raw.replace(/"/g, '""')}"`;
  }

  return raw;
}

export function rowsToDelimitedText(
  columns: string[],
  rows: Record<string, unknown>[],
  options: {
    delimiter?: string;
    includeHeader?: boolean;
  } = {},
): string {
  const delimiter = options.delimiter ?? ",";
  const lines = rows.map((row) =>
    columns
      .map((column) => escapeDelimitedCell(row[column], delimiter))
      .join(delimiter),
  );

  if (options.includeHeader ?? true) {
    lines.unshift(
      columns.map((column) => escapeDelimitedCell(column, delimiter)).join(delimiter),
    );
  }

  return lines.join("\r\n");
}
