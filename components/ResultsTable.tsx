import { useEffect, useState } from "react";

import type { SupportedDelimiter } from "@/lib/delimiterDetection";

interface ResultsTableProps {
  columns: string[];
  executionTimeMs: number;
  includeHeader?: boolean;
  onCopy?: () => void;
  onDownload: () => void;
  onIncludeHeaderChange?: (value: boolean) => void;
  onOutputDelimiterChange?: (value: SupportedDelimiter) => void;
  outputDelimiter?: SupportedDelimiter;
  returnedRows?: number;
  rowCount: number;
  rows: Record<string, unknown>[];
  totalRows?: number;
  truncated?: boolean;
  warning?: string;
}

function downloadButtonLabel(delimiter: SupportedDelimiter): string {
  if (delimiter === "\t") {
    return "Download TSV";
  }

  return "Download CSV";
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

export function ResultsTable({
  columns,
  executionTimeMs,
  includeHeader = true,
  onCopy,
  onDownload,
  onIncludeHeaderChange,
  onOutputDelimiterChange,
  outputDelimiter = ",",
  returnedRows,
  rowCount,
  rows,
  totalRows,
  truncated,
  warning,
}: ResultsTableProps) {
  const hasResults = columns.length > 0 && rows.length > 0;
  const shouldPaginate = rows.length > 1_000;
  const pageSize = shouldPaginate ? 25 : rows.length;
  const totalPages = shouldPaginate ? Math.ceil(rows.length / pageSize) : 1;
  const [currentPage, setCurrentPage] = useState(1);
  const pageStartIndex = (currentPage - 1) * pageSize;
  const visibleRows = shouldPaginate
    ? rows.slice(pageStartIndex, pageStartIndex + pageSize)
    : rows;

  useEffect(() => {
    setCurrentPage(1);
  }, [columns, rowCount, rows]);

  return (
    <section className="rounded-[2rem] border border-line/90 bg-panel/95 p-6 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
            Results
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            {rowCount} row{rowCount === 1 ? "" : "s"} returned
          </h2>
          <p className="mt-2 text-sm text-muted">
            Completed in {executionTimeMs} ms
          </p>
          {truncated &&
          totalRows !== undefined &&
          (returnedRows ?? rowCount) < totalRows ? (
            <p className="mt-1 text-sm text-amber-900">
              Showing {(returnedRows ?? rowCount).toLocaleString("en-US")} of{" "}
              {totalRows.toLocaleString("en-US")} matching rows (server cap applied).
            </p>
          ) : null}
        </div>

        {hasResults ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className="rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              <span className="mr-2">Export</span>
              <select
                aria-label="Output delimiter"
                className="bg-transparent text-xs text-ink outline-none"
                onChange={(event) =>
                  onOutputDelimiterChange?.(event.target.value as SupportedDelimiter)
                }
                value={outputDelimiter}
              >
                <option value=",">CSV</option>
                <option value={"\t"}>TSV</option>
                <option value=";">Semicolon</option>
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              <input
                aria-label="Include header in export"
                checked={includeHeader}
                className="h-4 w-4"
                onChange={(event) => onIncludeHeaderChange?.(event.target.checked)}
                type="checkbox"
              />
              Include Header
            </label>

            {onCopy ? (
              <button
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                onClick={onCopy}
                type="button"
              >
                Copy Results
              </button>
            ) : null}

            <button
              className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
              onClick={onDownload}
              type="button"
            >
              {downloadButtonLabel(outputDelimiter)}
            </button>
          </div>
        ) : null}
      </div>

      {warning ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warning}
        </p>
      ) : null}

      {columns.length === 0 ? (
        <p className="mt-6 rounded-[1.4rem] border border-line/70 bg-white/85 px-4 py-5 text-sm text-muted">
          The query completed without any result columns.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-[1.4rem] border border-line/70 bg-white/85 px-4 py-5 text-sm text-muted">
          No results.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[1.4rem] border border-line/70 bg-white/85">
          {shouldPaginate ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 bg-[#f8f2e8] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-[11px] text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-[11px] text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[#f2eadc] text-xs uppercase tracking-[0.16em] text-muted">
                <tr>
                  {columns.map((column) => (
                    <th
                      className="border-b border-line px-4 py-3 font-semibold"
                      key={column}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, rowIndex) => (
                  <tr
                    className="odd:bg-white even:bg-[#fcf8f1]"
                    key={`row-${pageStartIndex + rowIndex}`}
                  >
                    {columns.map((column) => (
                      <td
                        className="border-b border-line/50 px-4 py-3 align-top font-mono text-[13px] text-ink"
                        key={`${pageStartIndex + rowIndex}-${column}`}
                      >
                        {formatCellValue(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
