import Papa from "papaparse";

import { stripByteOrderMark } from "./textEncoding.ts";

export const SUPPORTED_DELIMITERS = [",", "\t", ";"] as const;

export type SupportedDelimiter = (typeof SUPPORTED_DELIMITERS)[number];
export type DelimiterOption = "auto" | SupportedDelimiter;

export function detectDelimiter(text: string): SupportedDelimiter {
  const preview = Papa.parse<string[]>(stripByteOrderMark(text), {
    delimiter: "",
    delimitersToGuess: [...SUPPORTED_DELIMITERS],
    preview: 10,
    skipEmptyLines: "greedy",
  });

  if (preview.meta.delimiter === "\t") {
    return "\t";
  }

  if (preview.meta.delimiter === ";") {
    return ";";
  }

  return ",";
}

export function resolveDelimiter(
  text: string,
  delimiter: DelimiterOption = "auto",
): SupportedDelimiter {
  return delimiter === "auto" ? detectDelimiter(text) : delimiter;
}
