import type { SupportedDelimiter } from "@/lib/delimiterDetection";
import type { InputEncoding } from "@/lib/textEncoding";

export interface ShareState {
  includeHeader: boolean;
  inputEncoding: InputEncoding;
  outputDelimiter: SupportedDelimiter;
  query: string;
}

function base64UrlEncode(text: string): string {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(encoded: string): string {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;

  return Buffer.from(`${normalized}${"=".repeat(padLength)}`, "base64").toString("utf8");
}

function parseLegacyShareState(normalizedHash: string): Partial<ShareState> {
  const params = new URLSearchParams(normalizedHash);
  const query = params.get("query") ?? "";
  const inputEncoding = params.get("inputEncoding");
  const outputDelimiter = params.get("outputDelimiter");
  const includeHeader = params.get("includeHeader");

  return {
    includeHeader:
      includeHeader === null ? undefined : includeHeader.toLowerCase() === "true",
    inputEncoding:
      inputEncoding === "utf-8" ||
      inputEncoding === "latin1" ||
      inputEncoding === "utf-16le"
        ? inputEncoding
        : undefined,
    outputDelimiter:
      outputDelimiter === "," || outputDelimiter === "\t" || outputDelimiter === ";"
        ? outputDelimiter
        : undefined,
    query: query || undefined,
  };
}

function normalizeParsedShareState(value: unknown): Partial<ShareState> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const record = value as Record<string, unknown>;
  const query = typeof record.query === "string" ? record.query : "";
  const inputEncoding = record.inputEncoding;
  const outputDelimiter = record.outputDelimiter;
  const includeHeader = record.includeHeader;

  return {
    includeHeader:
      typeof includeHeader === "boolean" ? includeHeader : undefined,
    inputEncoding:
      inputEncoding === "utf-8" ||
      inputEncoding === "latin1" ||
      inputEncoding === "utf-16le"
        ? inputEncoding
        : undefined,
    outputDelimiter:
      outputDelimiter === "," || outputDelimiter === "\t" || outputDelimiter === ";"
        ? outputDelimiter
        : undefined,
    query: query || undefined,
  };
}

export function serializeShareState(state: ShareState): string {
  return base64UrlEncode(JSON.stringify(state));
}

export function parseShareState(hash: string): Partial<ShareState> {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

  if (!normalizedHash) {
    return {};
  }

  if (normalizedHash.includes("=")) {
    return parseLegacyShareState(normalizedHash);
  }

  try {
    return normalizeParsedShareState(
      JSON.parse(base64UrlDecode(normalizedHash)) as unknown,
    );
  } catch {
    return parseLegacyShareState(normalizedHash);
  }
}
