import type { ChangeEvent, DragEvent } from "react";
import { useRef, useState } from "react";

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
  onLoadSamples?: () => void;
  samplesLoading?: boolean;
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

function isAllowedUploadFile(file: File): boolean {
  const lower = file.name.toLowerCase();

  if (
    lower.endsWith(".csv") ||
    lower.endsWith(".tsv") ||
    lower.endsWith(".txt")
  ) {
    return true;
  }

  const mime = file.type.toLowerCase();

  if (!mime) {
    return false;
  }

  if (mime.startsWith("text/")) {
    return true;
  }

  return mime === "application/csv" || mime === "application/vnd.ms-excel";
}

function buildFileListFromFiles(files: File[]): FileList | null {
  if (files.length === 0) {
    return null;
  }

  if (typeof DataTransfer !== "undefined") {
    const dataTransfer = new DataTransfer();

    for (const file of files) {
      dataTransfer.items.add(file);
    }

    return dataTransfer.files;
  }

  const arrayLike = [...files];

  return Object.assign(arrayLike, {
    length: files.length,
    item(index: number): File | null {
      return files[index] ?? null;
    },
    *[Symbol.iterator]() {
      for (const file of files) {
        yield file;
      }
    },
  }) as unknown as FileList;
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
  onLoadSamples,
  samplesLoading = false,
}: FileUploaderProps) {
  const dragDepthRef = useRef(0);
  const [dropActive, setDropActive] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onFilesSelected(event.target.files);
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setDropActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current -= 1;

    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setDropActive(false);
    }
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDropActive(false);

    if (isLoading) {
      return;
    }

    const incoming = event.dataTransfer?.files;

    if (!incoming?.length) {
      return;
    }

    const allowed = Array.from(incoming).filter(isAllowedUploadFile);
    onFilesSelected(buildFileListFromFiles(allowed));
  }

  return (
    <section className="rounded-[2rem] border border-line/90 bg-panel/95 p-6 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
            Upload Sources
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            Drop in one or more CSV, TSV, or text files
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

      <label
        className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[1.6rem] border border-dashed px-6 py-10 text-center transition hover:border-accent hover:bg-accent/10 ${
          dropActive
            ? "border-accent bg-accent/15 shadow-inner"
            : "border-accent/40 bg-accent/5"
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <span className="rounded-full bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white">
          Choose Files
        </span>
        <span className="mt-4 text-sm font-medium text-ink">
          Drag and drop files here, or click to choose. Multiple files keep separate parse
          settings.
        </span>
        <span className="mt-1 text-xs text-muted">
          Accepted: `.csv`, `.tsv`, `.txt`
        </span>
        <input
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,application/csv"
          className="hidden"
          disabled={isLoading}
          key={inputResetKey}
          multiple
          onChange={handleChange}
          type="file"
        />
      </label>

      {onLoadSamples ? (
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading || samplesLoading}
            onClick={onLoadSamples}
            type="button"
          >
            {samplesLoading ? "Loading samples…" : "Load sample files"}
          </button>
        </div>
      ) : null}

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
                    <option value="auto">Auto</option>
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
                    <option value="auto">Auto</option>
                    <option value="present">Present (first row is a header)</option>
                    <option value="absent">Absent (no header row)</option>
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
