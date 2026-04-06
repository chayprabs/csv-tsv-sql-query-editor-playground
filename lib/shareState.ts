import type { SupportedDelimiter } from "@/lib/delimiterDetection";
import type { InputEncoding } from "@/lib/textEncoding";

export interface ShareState {
  includeHeader: boolean;
  inputEncoding: InputEncoding;
  outputDelimiter: SupportedDelimiter;
  query: string;
}

export function serializeShareState(state: ShareState): string {
  const params = new URLSearchParams();

  params.set("query", state.query);
  params.set("inputEncoding", state.inputEncoding);
  params.set("outputDelimiter", state.outputDelimiter);
  params.set("includeHeader", String(state.includeHeader));

  return params.toString();
}

export function parseShareState(hash: string): Partial<ShareState> {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
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
