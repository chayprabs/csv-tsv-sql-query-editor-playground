import type { SupportedDelimiter } from "./delimiterDetection.ts";

export function downloadFilename(delimiter: SupportedDelimiter): string {
  if (delimiter === "\t") {
    return "results.tsv";
  }

  if (delimiter === ";") {
    return "results-semicolon.csv";
  }

  return "results.csv";
}

export function downloadMimeType(delimiter: SupportedDelimiter): string {
  if (delimiter === "\t") {
    return "text/tab-separated-values;charset=utf-8";
  }

  if (delimiter === ";") {
    return "text/csv;charset=utf-8";
  }

  return "text/csv;charset=utf-8";
}
