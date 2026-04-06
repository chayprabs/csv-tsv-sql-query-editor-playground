function stringifyCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function escapeDelimitedCell(
  value: unknown,
  delimiter = ",",
): string {
  const raw = stringifyCellValue(value);
  const escapedDelimiter = delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (new RegExp(`[\"\\n\\r${delimiter === "\t" ? "\\t" : escapedDelimiter}]`).test(raw)) {
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
