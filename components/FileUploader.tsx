import type { ChangeEvent } from "react";

import type { DelimiterOption, SupportedDelimiter } from "@/lib/delimiterDetection";
import type { HeaderMode } from "@/lib/headerMode";
import type { InferredSqliteType } from "@/lib/typeInference";

export interface FilePreview {
  delimiter: DelimiterOption;
  effectiveDelimiter: SupportedDelimiter;
  effectiveHasHeaders: boolean;
  headerMode: HeaderMode;
  name: string;
  parseError?: string;
  schema?: Array<{
    name: string;
    type: InferredSqliteType;
  }>;
  size: number;
  suggestedDelimiter: SupportedDelimiter;
  suggestedHasHeaders: boolean;
  tableName: string;
}

interface FileUploaderProps {
  files: FilePreview[];
  headerNotice: string | null;
  inputResetKey?: number;
  isLoading: boolean;
  onClear: () => void;
  onDelimiterChange: (tableName: string, delimiter: DelimiterOption) => void;
  onFilesSelected: (files: FileList | null) => void;
  onHeaderModeChange: (tableName: string, headerMode: HeaderMode) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDelimiterLabel(delimiter: SupportedDelimiter): string {
  if (delimiter === "\t") {
    return "tab";
  }

  if (delimiter === ";") {
    return "semicolon";
  }

  return "comma";
}

export function FileUploader({
  files,
  headerNotice,
  inputResetKey,
  isLoading,
  onClear,
  onDelimiterChange,
  onFilesSelected,
  onHeaderModeChange,
}: FileUploaderProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onFilesSelected(event.target.files);
  }

  return (
    <section className="rounded-[2rem] border border-line/90 bg-panel/95 p-6 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
            Upload Sources
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            Drop in one or more CSV or TSV files
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Each upload becomes a SQLite table named after its filename without
            the extension. Delimiter and header handling can be adjusted per file.
          </p>
        </div>

        {files.length > 0 ? (
          <button
            className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
            onClick={onClear}
            type="button"
          >
            Clear Files
          </button>
        ) : null}
      </div>

      <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-accent/40 bg-accent/5 px-6 py-10 text-center transition hover:border-accent hover:bg-accent/10">
        <span className="rounded-full bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white">
          Choose Files
        </span>
        <span className="mt-4 text-sm font-medium text-ink">
          Supports multiple files. Each upload keeps its own parse settings.
        </span>
        <span className="mt-1 text-xs text-muted">
          Accepted: `.csv`, `.tsv`
        </span>
        <input
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          className="hidden"
          disabled={isLoading}
          key={inputResetKey}
          multiple
          onChange={handleChange}
          type="file"
        />
      </label>

      {headerNotice ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {headerNotice}
        </p>
      ) : null}

      {files.length > 0 ? (
        <div className="mt-6 space-y-4">
          {files.map((file) => (
            <div
              className="rounded-[1.4rem] border border-line/70 bg-white/85 px-4 py-4"
              key={`${file.name}-${file.tableName}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-ink">{file.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted">
                    table =&nbsp;
                    <span className="text-accent">{file.tableName}</span>
                  </p>
                </div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted">
                  {formatBytes(file.size)}
                </p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="rounded-2xl border border-line/70 bg-[#fffaf1] px-4 py-3 text-sm text-ink">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Delimiter
                  </span>
                  <select
                    aria-label={`Delimiter for ${file.name}`}
                    className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent"
                    disabled={isLoading}
                    onChange={(event) =>
                      onDelimiterChange(
                        file.tableName,
                        event.target.value as DelimiterOption,
                      )
                    }
                    value={file.delimiter}
                  >
                    <option value="auto">Auto-detect</option>
                    <option value=",">Comma (,)</option>
                    <option value={"\t"}>Tab (\t)</option>
                    <option value=";">Semicolon (;)</option>
                  </select>
                </label>

                <label className="rounded-2xl border border-line/70 bg-[#fffaf1] px-4 py-3 text-sm text-ink">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Header Row
                  </span>
                  <select
                    aria-label={`Header mode for ${file.name}`}
                    className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent"
                    disabled={isLoading}
                    onChange={(event) =>
                      onHeaderModeChange(
                        file.tableName,
                        event.target.value as HeaderMode,
                      )
                    }
                    value={file.headerMode}
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="present">First row is header</option>
                    <option value="absent">No header row</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                  using: {formatDelimiterLabel(file.effectiveDelimiter)}
                </span>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                  auto-suggested: {formatDelimiterLabel(file.suggestedDelimiter)}
                </span>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                  headers: {file.effectiveHasHeaders ? "yes" : "no"}
                </span>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                  auto-suggested headers: {file.suggestedHasHeaders ? "yes" : "no"}
                </span>
              </div>

              {file.parseError ? (
                <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                  {file.parseError}
                </p>
              ) : null}

              {file.schema && file.schema.length > 0 ? (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Schema Preview
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {file.schema.map((column) => (
                      <span
                        className="rounded-full bg-accentSoft px-3 py-1 font-mono text-[11px] text-ink"
                        key={`${file.tableName}-${column.name}`}
                      >
                        {column.name}: {column.type}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
