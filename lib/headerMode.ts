import type { SupportedDelimiter } from "./delimiterDetection.ts";
import { detectHasHeaders } from "./headerDetection.ts";

export const HEADER_MODES = ["auto", "present", "absent"] as const;

export type HeaderMode = (typeof HEADER_MODES)[number];

export function resolveHasHeaders(
  text: string,
  delimiter: SupportedDelimiter,
  headerMode: HeaderMode = "auto",
): boolean {
  if (headerMode === "present") {
    return true;
  }

  if (headerMode === "absent") {
    return false;
  }

  return detectHasHeaders(text, delimiter);
}
