import type { FormEvent, KeyboardEvent } from "react";
import { useState } from "react";

import { CLIENT_LIMITS } from "@/lib/clientLimits";
import type { InputEncoding } from "@/lib/textEncoding";

interface QueryEditorProps {
  canSubmit?: boolean;
  inputEncoding?: InputEncoding;
  isLoading: boolean;
  onCancel?: () => void;
  onInputEncodingChange?: (value: InputEncoding) => void;
  onCopyShareLink?: () => void;
  onRecentQuerySelect?: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onQueryChange: (value: string) => void;
  placeholder: string;
  query: string;
  recentQueries?: string[];
  tableNames?: string[];
}

export function QueryEditor({
  canSubmit = false,
  inputEncoding = "utf-8",
  isLoading,
  onCancel,
  onInputEncodingChange,
  onCopyShareLink,
  onRecentQuerySelect,
  onSubmit,
  onQueryChange,
  placeholder,
  query,
  recentQueries = [],
  tableNames = [],
}: QueryEditorProps) {
  const [showHelp, setShowHelp] = useState(false);
  const trimmedLength = query.trim().length;
  const isSubmitDisabled = isLoading || !canSubmit;
  const isOverLimit = trimmedLength > CLIENT_LIMITS.maxQueryLength;

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !isSubmitDisabled) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <section className="rounded-xl border border-line bg-panel p-6 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Query</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">SQL editor</h2>
        </div>
        <button
          className="text-sm font-medium text-accent underline-offset-4 hover:underline"
          onClick={() => setShowHelp((value) => !value)}
          type="button"
        >
          {showHelp ? "Hide SQL help" : "SQL help"}
        </button>
      </div>

      {showHelp ? (
        <div className="mt-4 rounded-xl border border-line bg-neutral-50 p-4 text-sm text-muted">
          <p>Read-only SQL only: SELECT, WITH … SELECT, VALUES, and EXPLAIN QUERY PLAN.</p>
          <p className="mt-2">
            Table names come from filenames
            {tableNames.length > 0
              ? `: ${tableNames.map((name) => `\`${name}\``).join(", ")}`
              : " after upload"}
            .
          </p>
          <p className="mt-2">Use LIMIT on large files. Share links save query text only — not files.</p>
        </div>
      ) : null}

      <form className="mt-6 space-y-5" onSubmit={onSubmit}>
        <label className="block rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted">
            Input encoding
          </span>
          <select
            aria-label="Input encoding"
            className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
            disabled={isLoading}
            onChange={(event) =>
              onInputEncodingChange?.(event.target.value as InputEncoding)
            }
            value={inputEncoding}
          >
            <option value="utf-8">UTF-8</option>
            <option value="latin1">Latin-1</option>
            <option value="utf-16le">UTF-16 LE</option>
          </select>
        </label>

        <div>
          <label
            className="block text-xs font-medium uppercase tracking-wide text-muted"
            htmlFor="sql-query"
          >
            SQL query
          </label>
          <textarea
            className="mt-2 min-h-[220px] w-full rounded-xl border border-line bg-white px-4 py-4 font-mono text-sm leading-6 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            disabled={isLoading}
            id="sql-query"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            value={query}
          />
          <p
            className={`mt-2 text-xs ${isOverLimit ? "text-red-700" : "text-muted"}`}
          >
            {trimmedLength.toLocaleString("en-US")} /{" "}
            {CLIENT_LIMITS.maxQueryLength.toLocaleString("en-US")} characters
          </p>
        </div>

        {recentQueries.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Recent queries
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {recentQueries.map((recentQuery) => (
                <button
                  aria-label={`Use query: ${recentQuery}`}
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs text-ink transition hover:border-accent hover:text-accent"
                  key={recentQuery}
                  onClick={() => onRecentQuerySelect?.(recentQuery)}
                  title={recentQuery}
                  type="button"
                >
                  {recentQuery.length > 48
                    ? `${recentQuery.slice(0, 45)}...`
                    : recentQuery}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-muted">
            Ctrl+Enter or Cmd+Enter to run. {CLIENT_LIMITS.querySummary}
          </p>
          <div className="flex flex-wrap gap-3">
            {onCopyShareLink ? (
              <button
                className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:border-accent"
                disabled={isLoading}
                onClick={onCopyShareLink}
                type="button"
              >
                Copy share link
              </button>
            ) : null}
            {isLoading && onCancel ? (
              <button
                className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink"
                onClick={onCancel}
                type="button"
              >
                Cancel
              </button>
            ) : null}
            <button
              className="rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitDisabled}
              type="submit"
            >
              {isLoading ? "Running…" : "Run query"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
