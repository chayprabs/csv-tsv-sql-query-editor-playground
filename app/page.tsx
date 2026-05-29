"use client";

import type { FormEvent } from "react";
import { startTransition, useEffect, useRef, useState } from "react";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { FileUploader, type FilePreview } from "@/components/FileUploader";
import { QueryEditor } from "@/components/QueryEditor";
import { ResultsTable } from "@/components/ResultsTable";
import { rowsToDelimitedText } from "@/lib/csvExport";
import { parseDelimitedText } from "@/lib/delimitedData";
import {
  resolveDelimiter,
  type SupportedDelimiter,
} from "@/lib/delimiterDetection";
import type { QueryResponse as ServerQueryResponse } from "@/lib/csvToSqlite";
import {
  DEFAULT_FILE_PARSE_OPTIONS,
  type FileParseOptions,
} from "@/lib/fileParsing";
import { resolveHasHeaders } from "@/lib/headerMode";
import {
  mergeQueryHistory,
  parseStoredQueryHistory,
  serializeQueryHistory,
} from "@/lib/queryHistory";
import { readQueryApiResponse } from "@/lib/readQueryApiResponse";
import { parseShareState, serializeShareState } from "@/lib/shareState";
import { deriveTableName } from "@/lib/tableNaming";
import {
  decodeTextBytes,
  type InputEncoding,
} from "@/lib/textEncoding";

const DEFAULT_INPUT_ENCODING: InputEncoding = "utf-8";
const DEFAULT_OUTPUT_DELIMITER: SupportedDelimiter = ",";
const QUERY_HISTORY_STORAGE_KEY = "flatfile-sql-studio.query-history";

const SAMPLE_FILES = [
  { filename: "students.csv", path: "/examples/students.csv" },
  { filename: "exams.csv", path: "/examples/exams.csv" },
] as const;

type QueryResponse = ServerQueryResponse;

interface UploadedFileState extends FileParseOptions {
  file: File;
  tableName: string;
}

function buildStarterQuery(files: FilePreview[]): string {
  if (files.length === 0) {
    return "";
  }

  if (files.length === 1) {
    return `SELECT * FROM ${files[0].tableName} LIMIT 10`;
  }

  return [
    `SELECT * FROM ${files[0].tableName} LIMIT 10;`,
    "",
    "SELECT a.*, b.*",
    `FROM ${files[0].tableName} a`,
    `JOIN ${files[1].tableName} b ON a.id = b.id`,
    "LIMIT 10",
  ].join("\n");
}

function formatServerError(
  payload: Pick<QueryResponse, "error" | "requestId">,
  httpStatus: number,
): string {
  if (!payload.error) {
    return "Unexpected query error.";
  }

  const base = payload.requestId
    ? `${payload.error} Request ID: ${payload.requestId}`
    : payload.error;

  const hints: Partial<Record<number, string>> = {
    408: "Tip: simplify the query, add LIMIT, or reduce expensive joins.",
    413: "Tip: upload fewer or smaller files.",
    429: "Tip: wait for the rate limit window to reset.",
    503: "Tip: wait a moment and try again.",
  };

  const hint = hints[httpStatus];

  return hint ? `${base}\n\n${hint}` : base;
}

function formatHeaderNotice(files: FilePreview[]): string | null {
  const autoFiles = files.filter((file) => file.headerMode === "auto");

  if (autoFiles.length < 2) {
    return null;
  }

  const everyFileHasHeaders = autoFiles.every((file) => file.suggestedHasHeaders);
  const everyFileHasNoHeaders = autoFiles.every(
    (file) => !file.suggestedHasHeaders,
  );

  if (everyFileHasHeaders || everyFileHasNoHeaders) {
    return null;
  }

  return "Header auto-detection disagreed across the uploaded files still using Auto. Review each file card before running the query.";
}

function downloadFilename(delimiter: SupportedDelimiter): string {
  if (delimiter === "\t") {
    return "results.tsv";
  }

  return "results.csv";
}

function downloadMimeType(delimiter: SupportedDelimiter): string {
  if (delimiter === "\t") {
    return "text/tab-separated-values;charset=utf-8";
  }

  return "text/csv;charset=utf-8";
}

function stringifyClipboardUrl(): string {
  return window.location.href;
}

async function readDecodedFile(
  file: File,
  inputEncoding: InputEncoding,
  cache: Map<string, string>,
): Promise<{
  file: File;
  text: string;
}> {
  const cacheKey = `${file.name}:${file.size}:${file.lastModified}:${inputEncoding}`;
  const cachedText = cache.get(cacheKey);

  if (cachedText !== undefined) {
    return {
      file,
      text: cachedText,
    };
  }

  const text = decodeTextBytes(await file.arrayBuffer(), inputEncoding);
  cache.set(cacheKey, text);

  return {
    file,
    text,
  };
}

function buildUploadedFiles(fileList: FileList | null): UploadedFileState[] {
  const takenTableNames = new Set<string>();

  return Array.from(fileList ?? []).map((file) => ({
    ...DEFAULT_FILE_PARSE_OPTIONS,
    file,
    tableName: deriveTableName(file.name, takenTableNames),
  }));
}

function buildFilePreview(
  decodedFile: {
    file: File;
    text: string;
  },
  uploadedFile: UploadedFileState,
): FilePreview {
  const suggestedDelimiter = resolveDelimiter(decodedFile.text, "auto");
  const suggestedHasHeaders = resolveHasHeaders(
    decodedFile.text,
    suggestedDelimiter,
    "auto",
  );

  try {
    const parsed = parseDelimitedText(decodedFile.text, {
      delimiter: uploadedFile.delimiter,
      headerMode: uploadedFile.headerMode,
      sourceName: uploadedFile.file.name,
    });

    return {
      delimiter: uploadedFile.delimiter,
      effectiveDelimiter: parsed.delimiter,
      effectiveHasHeaders: parsed.hasHeaders,
      headerMode: uploadedFile.headerMode,
      name: uploadedFile.file.name,
      schema: parsed.columnNames.map((name, index) => ({
        name,
        type: parsed.sqliteTypes[index],
      })),
      size: uploadedFile.file.size,
      suggestedDelimiter,
      suggestedHasHeaders,
      tableName: uploadedFile.tableName,
    };
  } catch (error) {
    return {
      delimiter: uploadedFile.delimiter,
      effectiveDelimiter:
        uploadedFile.delimiter === "auto"
          ? suggestedDelimiter
          : uploadedFile.delimiter,
      effectiveHasHeaders:
        uploadedFile.headerMode === "auto"
          ? suggestedHasHeaders
          : uploadedFile.headerMode === "present",
      headerMode: uploadedFile.headerMode,
      name: uploadedFile.file.name,
      parseError:
        error instanceof Error
          ? error.message
          : `Unable to preview "${uploadedFile.file.name}".`,
      size: uploadedFile.file.size,
      suggestedDelimiter,
      suggestedHasHeaders,
      tableName: uploadedFile.tableName,
    };
  }
}

export default function Home() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileState[]>([]);
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([]);
  const [query, setQuery] = useState("");
  const [inputEncoding, setInputEncoding] = useState<InputEncoding>(
    DEFAULT_INPUT_ENCODING,
  );
  const [outputDelimiter, setOutputDelimiter] = useState<SupportedDelimiter>(
    DEFAULT_OUTPUT_DELIMITER,
  );
  const [includeOutputHeader, setIncludeOutputHeader] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [headerNotice, setHeaderNotice] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [inputResetKey, setInputResetKey] = useState(0);
  const [hasLoadedShareState, setHasLoadedShareState] = useState(false);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const decodedFileCacheRef = useRef(new Map<string, string>());
  const submitLockRef = useRef(false);

  useEffect(() => {
    let nextHistory: string[] = [];

    try {
      nextHistory = parseStoredQueryHistory(
        window.localStorage.getItem(QUERY_HISTORY_STORAGE_KEY),
      );
    } catch {
      nextHistory = [];
    }
    const sharedState = parseShareState(window.location.hash);

    setQueryHistory(nextHistory);

    if (sharedState.query) {
      setQuery(sharedState.query);
    }

    if (sharedState.inputEncoding) {
      setInputEncoding(sharedState.inputEncoding);
    }

    if (sharedState.outputDelimiter) {
      setOutputDelimiter(sharedState.outputDelimiter);
    }

    if (sharedState.includeHeader !== undefined) {
      setIncludeOutputHeader(sharedState.includeHeader);
    }

    setHasLoadedShareState(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedShareState) {
      return;
    }

    const nextHash = serializeShareState({
      includeHeader: includeOutputHeader,
      inputEncoding,
      outputDelimiter,
      query,
    });

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ""}`,
    );
  }, [
    hasLoadedShareState,
    includeOutputHeader,
    inputEncoding,
    outputDelimiter,
    query,
  ]);

  useEffect(() => {
    let didCancel = false;

    async function preparePreviews() {
      if (uploadedFiles.length === 0) {
        startTransition(() => {
          setFilePreviews([]);
          setHeaderNotice(null);
        });
        return;
      }

      try {
        const decodedFiles = await Promise.all(
          uploadedFiles.map((uploadedFile) =>
            readDecodedFile(
              uploadedFile.file,
              inputEncoding,
              decodedFileCacheRef.current,
            ),
          ),
        );
        const nextPreviews = decodedFiles.map((decodedFile, index) =>
          buildFilePreview(decodedFile, uploadedFiles[index]),
        );

        if (didCancel) {
          return;
        }

        startTransition(() => {
          setFilePreviews(nextPreviews);
          setHeaderNotice(formatHeaderNotice(nextPreviews));
        });

        setQuery((currentQuery) =>
          currentQuery.trim() ? currentQuery : buildStarterQuery(nextPreviews),
        );
      } catch (error) {
        if (didCancel) {
          return;
        }

        setFilePreviews([]);
        setHeaderNotice(null);
        setErrorMessage(
          error instanceof Error
            ? `Could not decode files using "${inputEncoding}" encoding. Try another encoding from the dropdown, or confirm each file is plain text. (${error.message})`
            : "Unexpected client error while reading the selected files.",
        );
      }
    }

    preparePreviews();

    return () => {
      didCancel = true;
    };
  }, [inputEncoding, uploadedFiles]);

  function persistQueryHistory(nextQuery: string) {
    setQueryHistory((currentHistory) => {
      const nextHistory = mergeQueryHistory(currentHistory, nextQuery);

      try {
        window.localStorage.setItem(
          QUERY_HISTORY_STORAGE_KEY,
          serializeQueryHistory(nextHistory),
        );
      } catch {
        // Ignore storage failures and keep the in-memory history.
      }

      return nextHistory;
    });
  }

  function resetDerivedResults() {
    setResult(null);
    setNoticeMessage(null);
    setErrorMessage(null);
  }

  function handleFilesSelected(fileList: FileList | null) {
    setUploadedFiles(buildUploadedFiles(fileList));
    resetDerivedResults();
  }

  function handleClearFiles() {
    setUploadedFiles([]);
    setFilePreviews([]);
    setHeaderNotice(null);
    setInputResetKey((currentKey) => currentKey + 1);
    decodedFileCacheRef.current.clear();
    resetDerivedResults();
  }

  function handleFileDelimiterChange(
    tableName: string,
    delimiter: UploadedFileState["delimiter"],
  ) {
    setUploadedFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.tableName === tableName ? { ...file, delimiter } : file,
      ),
    );
    resetDerivedResults();
  }

  function handleFileHeaderModeChange(
    tableName: string,
    headerMode: UploadedFileState["headerMode"],
  ) {
    setUploadedFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.tableName === tableName ? { ...file, headerMode } : file,
      ),
    );
    resetDerivedResults();
  }

  function handleInputEncodingChange(nextEncoding: InputEncoding) {
    setInputEncoding(nextEncoding);
    setResult(null);
  }

  async function handleLoadSamples() {
    setSamplesLoading(true);
    setNoticeMessage(null);
    setErrorMessage(null);

    try {
      const takenTableNames = new Set<string>();
      const loaded: UploadedFileState[] = [];

      for (const sample of SAMPLE_FILES) {
        const response = await fetch(sample.path);

        if (!response.ok) {
          throw new Error(
            `Could not load sample "${sample.filename}" (HTTP ${response.status}).`,
          );
        }

        const blob = await response.blob();
        const file = new File([blob], sample.filename, { type: "text/csv" });

        loaded.push({
          ...DEFAULT_FILE_PARSE_OPTIONS,
          file,
          tableName: deriveTableName(sample.filename, takenTableNames),
        });
      }

      decodedFileCacheRef.current.clear();
      setInputResetKey((key) => key + 1);

      const studentsTable = loaded[0]?.tableName;
      const examsTable = loaded[1]?.tableName;

      setUploadedFiles(loaded);

      if (studentsTable && examsTable) {
        setQuery(
          [
            "SELECT s.name, e.subject, e.score",
            `FROM ${studentsTable} s`,
            `JOIN ${examsTable} e ON s.student_id = e.student_id`,
            "ORDER BY e.score DESC",
            "LIMIT 20",
          ].join("\n"),
        );
      }

      resetDerivedResults();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not load sample files. Upload your own CSV files instead.",
      );
    } finally {
      setSamplesLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitLockRef.current) {
      return;
    }

    if (uploadedFiles.length === 0) {
      setNoticeMessage(
        "Upload at least one CSV or TSV file to get started.",
      );
      setErrorMessage(null);
      return;
    }

    if (!query.trim()) {
      setNoticeMessage("Enter a SQL query to run.");
      setErrorMessage(null);
      return;
    }

    submitLockRef.current = true;
    setIsLoading(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const formData = new FormData();

      for (const uploadedFile of uploadedFiles) {
        formData.append("files[]", uploadedFile.file);
      }

      formData.append(
        "fileSettings",
        JSON.stringify(
          uploadedFiles.map(({ delimiter, headerMode }) => ({
            delimiter,
            headerMode,
          })),
        ),
      );
      formData.append("query", query);
      formData.append("encoding", inputEncoding);

      const response = await fetch("/api/query", {
        body: formData,
        cache: "no-store",
        method: "POST",
      });

      const payload = await readQueryApiResponse(response);

      if (!response.ok || payload.error) {
        setResult(null);
        setErrorMessage(formatServerError(payload, response.status));
        return;
      }

      setResult(payload);
      persistQueryHistory(query);
    } catch (error) {
      setResult(null);
      const messageLooksLikeNetworkFailure =
        error instanceof TypeError &&
        /fetch|network|failed to fetch/i.test(String(error.message));

      setErrorMessage(
        messageLooksLikeNetworkFailure
          ? "Network error: check your connection and that the server is running."
          : error instanceof Error
            ? error.message
            : "Unexpected client error while running the query.",
      );
    } finally {
      submitLockRef.current = false;
      setIsLoading(false);
    }
  }

  function handleDownloadResults() {
    if (!result || result.columns.length === 0 || result.rows.length === 0) {
      return;
    }

    const blob = new Blob(
      [
        rowsToDelimitedText(result.columns, result.rows, {
          delimiter: outputDelimiter,
          includeHeader: includeOutputHeader,
        }),
      ],
      {
        type: downloadMimeType(outputDelimiter),
      },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = downloadFilename(outputDelimiter);
    link.click();

    URL.revokeObjectURL(url);
  }

  async function handleCopyResults() {
    if (!result || result.columns.length === 0 || result.rows.length === 0) {
      return;
    }

    const content = rowsToDelimitedText(result.columns, result.rows, {
      delimiter: outputDelimiter,
      includeHeader: includeOutputHeader,
    });

    try {
      await navigator.clipboard.writeText(content);
      setNoticeMessage("Results copied to the clipboard.");
    } catch {
      // Clipboard failures are ignored (no user-facing error).
    }
  }

  async function handleCopyShareLink() {
    try {
      await navigator.clipboard.writeText(stringifyClipboardUrl());
      setNoticeMessage("Share link copied to the clipboard.");
    } catch {
      // Clipboard failures are ignored (no user-facing error).
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-[2.4rem] border border-line/80 bg-[#fffaf1]/80 px-6 py-8 shadow-panel md:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent">
            Quarry
          </p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-ink md:text-6xl">
                Run SQL on CSV and TSV files — server-side, nothing stored.
              </h1>
            </div>
            <p className="max-w-xl text-sm leading-7 text-muted md:text-base">
              Upload one or more delimited files, confirm the inferred schema, and run
              read-only SQLite queries including joins. Each request uses a fresh in-memory
              database on the server; files are not written to disk.
            </p>
          </div>

          <p
            className="mt-6 rounded-2xl border border-accent/25 bg-white/70 px-4 py-3 text-sm leading-relaxed text-ink shadow-sm md:text-[15px]"
            role="note"
          >
            Your files are never stored. Each query runs against an in-memory database that
            is destroyed when the request ends.
          </p>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="space-y-6">
            <FileUploader
              files={filePreviews}
              headerNotice={headerNotice}
              inputResetKey={inputResetKey}
              isLoading={isLoading}
              onClear={handleClearFiles}
              onDelimiterChange={handleFileDelimiterChange}
              onFilesSelected={handleFilesSelected}
              onHeaderModeChange={handleFileHeaderModeChange}
              onLoadSamples={handleLoadSamples}
              samplesLoading={samplesLoading}
            />

            <QueryEditor
              hasFiles={uploadedFiles.length > 0}
              inputEncoding={inputEncoding}
              isLoading={isLoading}
              onCopyShareLink={handleCopyShareLink}
              onInputEncodingChange={handleInputEncodingChange}
              onQueryChange={setQuery}
              onRecentQuerySelect={setQuery}
              onSubmit={handleSubmit}
              placeholder="SELECT * FROM sales LIMIT 10"
              query={query}
              recentQueries={queryHistory}
            />
          </div>

          <div className="space-y-6">
            <ErrorDisplay message={errorMessage} />

            {noticeMessage ? (
              <section className="rounded-3xl border border-emerald-200 bg-emerald-50/90 p-5 text-sm text-emerald-900 shadow-panel">
                {noticeMessage}
              </section>
            ) : null}

            {result ? (
              <ResultsTable
                columns={result.columns}
                executionTimeMs={result.executionTimeMs}
                includeHeader={includeOutputHeader}
                onCopy={handleCopyResults}
                onDownload={handleDownloadResults}
                onIncludeHeaderChange={setIncludeOutputHeader}
                onOutputDelimiterChange={setOutputDelimiter}
                outputDelimiter={outputDelimiter}
                returnedRows={result.returnedRows}
                rowCount={result.rowCount}
                rows={result.rows}
                totalRows={result.totalRows}
                truncated={result.truncated}
                warning={result.warning}
              />
            ) : (
              <section className="rounded-xl border border-line bg-panel p-6 shadow-panel">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Results
                </p>
                <h2 className="mt-2 text-xl font-semibold text-ink">
                  Ready for the first query
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted">
                  Upload at least one file, review delimiter and header settings, then
                  run a query to see results here.
                </p>
              </section>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
