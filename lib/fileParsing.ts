import type { DelimiterOption } from "./delimiterDetection.ts";
import type { HeaderMode } from "./headerMode.ts";

export interface FileParseOptions {
  delimiter: DelimiterOption;
  headerMode: HeaderMode;
}

export const DEFAULT_FILE_PARSE_OPTIONS: FileParseOptions = {
  delimiter: "auto",
  headerMode: "auto",
};

export function normalizeDelimiterOption(value: unknown): DelimiterOption {
  if (value === "," || value === "\t" || value === ";") {
    return value;
  }

  return "auto";
}

export function normalizeHeaderMode(value: unknown): HeaderMode {
  if (value === "present" || value === "absent") {
    return value;
  }

  return "auto";
}

export function headerModeFromHasHeaders(value: unknown): HeaderMode | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return String(value).toLowerCase() === "true" ? "present" : "absent";
}
