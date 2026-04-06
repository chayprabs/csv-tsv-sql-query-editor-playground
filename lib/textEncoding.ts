export const SUPPORTED_INPUT_ENCODINGS = ["utf-8", "latin1", "utf-16le"] as const;

export type InputEncoding = (typeof SUPPORTED_INPUT_ENCODINGS)[number];
type DecodingEncoding = InputEncoding | "utf-16be";

export function stripByteOrderMark(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

function normalizeEncodingLabel(encoding: DecodingEncoding): string {
  if (encoding === "utf-8") {
    return "utf-8";
  }

  if (encoding === "latin1") {
    return "latin1";
  }

  return encoding === "utf-16le" ? "utf-16le" : "utf-16be";
}

function detectByteOrderMarkEncoding(
  view: Uint8Array,
): DecodingEncoding | undefined {
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
    return "utf-8";
  }

  if (view.length >= 2 && view[0] === 0xff && view[1] === 0xfe) {
    return "utf-16le";
  }

  if (view.length >= 2 && view[0] === 0xfe && view[1] === 0xff) {
    return "utf-16be";
  }

  return undefined;
}

function stripByteOrderMarkBytes(
  view: Uint8Array,
  encoding: DecodingEncoding | undefined,
): Uint8Array {
  if (encoding === "utf-8" && view.length >= 3) {
    return view.subarray(3);
  }

  if ((encoding === "utf-16le" || encoding === "utf-16be") && view.length >= 2) {
    return view.subarray(2);
  }

  return view;
}

export function decodeTextBytes(
  bytes: ArrayBuffer | ArrayBufferView,
  encoding: InputEncoding = "utf-8",
): string {
  const view =
    bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const detectedEncoding = detectByteOrderMarkEncoding(view);
  const effectiveEncoding = detectedEncoding ?? encoding;
  const contentBytes = stripByteOrderMarkBytes(view, detectedEncoding);

  return stripByteOrderMark(
    new TextDecoder(normalizeEncodingLabel(effectiveEncoding)).decode(contentBytes),
  );
}
