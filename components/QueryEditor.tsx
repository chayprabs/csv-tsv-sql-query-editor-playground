import type { FormEvent, KeyboardEvent } from "react";

import { CLIENT_LIMITS } from "@/lib/clientLimits";
import type { InputEncoding } from "@/lib/textEncoding";

interface QueryEditorProps {
  hasFiles?: boolean;
  inputEncoding?: InputEncoding;
  isLoading: boolean;
  onInputEncodingChange?: (value: InputEncoding) => void;
  onCopyShareLink?: () => void;
  onRecentQuerySelect?: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onQueryChange: (value: string) => void;
  placeholder: string;
  query: string;
  recentQueries?: string[];
}

export function QueryEditor({
  hasFiles = true,
  inputEncoding = "utf-8",
  isLoading,
  onInputEncodingChange,
  onCopyShareLink,
  onRecentQuerySelect,
  onSubmit,
  onQueryChange,
  placeholder,
  query,
  recentQueries = [],
}: QueryEditorProps) {
  const isSubmitDisabled = isLoading || !hasFiles || query.trim().length === 0;

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !isSubmitDisabled) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <section className="rounded-xl border border-line bg-panel p-6 shadow-panel">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Query</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">SQL editor</h2>
      </div>

      <form className="mt-6 space-y-5" onSubmit={onSubmit}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="rounded-[1.4rem] border border-line/70 bg-white/85 px-4 py-4 text-sm text-ink">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Parsing Settings
            </span>
            <p className="mt-2 leading-6 text-muted">
              Delimiter and header handling now live on each uploaded file card,
              so mixed CSV and TSV sources can be configured independently.
            </p>
          </div>

          <label className="rounded-[1.4rem] border border-line/70 bg-white/85 px-4 py-4 text-sm text-ink">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Input Encoding
            </span>
            <select
              aria-label="Input encoding"
              className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent"
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
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            SQL Query
          </label>
          <textarea
            className="mt-2 min-h-[220px] w-full rounded-[1.5rem] border border-line bg-[#fffdf8] px-4 py-4 font-mono text-sm leading-6 text-ink outline-none transition focus:border-accent"
            disabled={isLoading}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            value={query}
          />
        </div>

        {recentQueries.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Recent Queries
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {recentQueries.map((recentQuery) => (
                <button
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs text-ink transition hover:border-accent hover:text-accent"
                  key={recentQuery}
                  onClick={() => onRecentQuerySelect?.(recentQuery)}
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
          <div className="space-y-1">
            <p className="text-sm text-muted">
              Example: <span className="font-mono">SELECT * FROM sales LIMIT 10</span>
            </p>
            <p className="text-xs text-muted">Use Ctrl+Enter or Cmd+Enter to run.</p>
            <p className="text-xs text-muted">{CLIENT_LIMITS.querySummary}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {onCopyShareLink ? (
              <button
                className="rounded-full border border-line bg-white px-4 py-3 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                disabled={isLoading}
                onClick={onCopyShareLink}
                type="button"
              >
                Copy Share Link
              </button>
            ) : null}
            <button
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitDisabled}
              type="submit"
            >
              {isLoading ? "Running..." : "Run Query"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
