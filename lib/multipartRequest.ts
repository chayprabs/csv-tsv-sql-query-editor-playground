import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import Busboy from "busboy";
import type { IncomingHttpHeaders } from "node:http";

import { ClientError } from "./errorSanitizer.ts";

export interface ParsedMultipartFile {
  buffer: Buffer | null;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ParsedMultipartRequest {
  bytesRead: number;
  fields: Map<string, string>;
  files: ParsedMultipartFile[];
  totalFileBytes: number;
}

interface ParseMultipartRequestOptions {
  maxFileCount: number;
  maxFileBytes: number;
  maxFilenameLength: number;
  maxTotalUploadBytes: number;
  minFileBytes: number;
  signal?: AbortSignal;
}

const SUPPORTED_FILE_EXTENSIONS = new Set([".csv", ".tsv", ".txt"]);

function isAllowedUploadMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();

  if (normalized.length === 0) {
    return true;
  }

  if (normalized === "application/csv" || normalized === "application/vnd.ms-excel") {
    return true;
  }

  return normalized.startsWith("text/");
}

function assertAllowedFileMimeType(mimeType: string): void {
  if (!isAllowedUploadMimeType(mimeType)) {
    throw new ClientError(400, "Only CSV, TSV, and TXT text files are supported.");
  }
}

function toIncomingHeaders(headers: Headers): IncomingHttpHeaders {
  const incomingHeaders: IncomingHttpHeaders = {};

  headers.forEach((value, key) => {
    incomingHeaders[key.toLowerCase()] = value;
  });

  return incomingHeaders;
}

function validateFilename(filename: string, maxFilenameLength: number): void {
  if (!filename.trim()) {
    throw new ClientError(400, "Uploaded files must include a filename.");
  }

  if (filename.length > maxFilenameLength) {
    throw new ClientError(
      400,
      `Filename is too long. Maximum length is ${maxFilenameLength} characters.`,
    );
  }

  if (/^[.\s]+$/.test(filename)) {
    throw new ClientError(400, "Uploaded filenames must contain letters or numbers.");
  }
}

function validateFileExtension(filename: string): void {
  const extension = path.extname(filename).toLowerCase();

  if (!SUPPORTED_FILE_EXTENSIONS.has(extension)) {
    throw new ClientError(400, "Only CSV, TSV, and TXT text files are supported.");
  }
}

export async function parseMultipartRequest(
  request: Request,
  options: ParseMultipartRequestOptions,
): Promise<ParsedMultipartRequest> {
  if (!request.body) {
    throw new ClientError(400, "Request body is required.");
  }

  const parser = Busboy({
    headers: toIncomingHeaders(request.headers),
    limits: {
      fieldSize: 128 * 1024,
      fields: 16,
      fileSize: options.maxFileBytes + 1,
      files: options.maxFileCount,
      parts: options.maxFileCount + 16,
    },
  });

  const fields = new Map<string, string>();
  const files: ParsedMultipartFile[] = [];
  const filePromises: Array<Promise<void>> = [];
  const source = Readable.fromWeb(
    request.body as unknown as import("node:stream/web").ReadableStream,
  );
  let bytesRead = 0;
  let fatalError: Error | null = null;
  let totalFileBytes = 0;
  let settled = false;

  const sizeGuard = new Transform({
    transform(chunk, _encoding, callback) {
      bytesRead += chunk.length;

      if (bytesRead > options.maxTotalUploadBytes) {
        callback(
          new ClientError(
            413,
            "Total upload size is too large",
          ),
        );
        return;
      }

      callback(null, chunk);
    },
  });

  source.on("error", () => undefined);
  sizeGuard.on("error", () => undefined);
  parser.on("error", () => undefined);

  const cleanupAbortListener = () => {
    options.signal?.removeEventListener("abort", handleAbort);
  };

  const destroyIfOpen = (
    stream: { destroy: (error?: Error) => void; destroyed?: boolean },
    error: Error,
  ) => {
    if (stream.destroyed) {
      return;
    }

    stream.destroy(error);
  };

  const failParsing = (error: Error) => {
    if (!fatalError) {
      fatalError = error;
    }

    destroyIfOpen(sizeGuard, error);
    destroyIfOpen(parser, error);
  };

  const handleAbort = () => {
    if (settled) {
      return;
    }

    const abortError = new ClientError(
      499,
      "The request was cancelled before the query completed.",
    );

    failParsing(abortError);
  };

  if (options.signal) {
    if (options.signal.aborted) {
      handleAbort();
    } else {
      options.signal.addEventListener("abort", handleAbort, { once: true });
    }
  }

  const settle = <T>(action: () => T): T => {
    settled = true;
    cleanupAbortListener();
    return action();
  };

  parser.on("field", (name, value, info) => {
    if (info.nameTruncated || info.valueTruncated) {
      failParsing(
        new ClientError(400, "One or more form fields were too large to process."),
      );
      return;
    }

    fields.set(name, value);
  });

  parser.on("filesLimit", () => {
    failParsing(
      new ClientError(
        400,
        `Too many files uploaded. Maximum is ${options.maxFileCount}.`,
      ),
    );
  });

  parser.on("partsLimit", () => {
    failParsing(new ClientError(400, "The multipart request contained too many parts."));
  });

  parser.on("fieldsLimit", () => {
    failParsing(new ClientError(400, "The multipart request contained too many fields."));
  });

  parser.on("error", () => undefined);

  parser.on("file", (fieldName, stream, info) => {
    stream.on("error", () => undefined);

    if (fieldName !== "files" && fieldName !== "files[]") {
      stream.resume();
      failParsing(new ClientError(400, "Unexpected file field in multipart payload."));
      return;
    }

    try {
      validateFilename(info.filename, options.maxFilenameLength);
      validateFileExtension(info.filename);
    } catch (error) {
      stream.resume();
      failParsing(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const filePromise = new Promise<void>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let completed = false;
      let fileSize = 0;

      const finish = (error?: Error) => {
        if (completed) {
          return;
        }

        completed = true;

        if (error) {
          reject(error);
          return;
        }

        resolve();
      };

      stream.on("limit", () => {
        finish(
          new ClientError(
            413,
            "File too large",
          ),
        );
      });

      stream.on("data", (chunk: Buffer) => {
        if (completed) {
          return;
        }

        fileSize += chunk.length;
        totalFileBytes += chunk.length;

        if (fileSize > options.maxFileBytes) {
          finish(
            new ClientError(
              413,
              "File too large",
            ),
          );
          return;
        }

        if (totalFileBytes > options.maxTotalUploadBytes) {
          finish(
            new ClientError(
              413,
              "Total upload size is too large",
            ),
          );
          return;
        }

        chunks.push(chunk);
      });

      stream.on("error", (error) => {
        finish(error instanceof Error ? error : new Error(String(error)));
      });

      stream.on("end", () => {
        if (completed) {
          return;
        }

        if (fileSize < options.minFileBytes) {
          finish(new ClientError(400, "File is empty"));
          return;
        }

        try {
          assertAllowedFileMimeType(info.mimeType);
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        let buffer: Buffer | null = Buffer.concat(chunks);
        chunks.length = 0;

        files.push({
          buffer,
          filename: info.filename,
          mimeType: info.mimeType,
          size: fileSize,
        });

        buffer = null;
        finish();
      });
    }).catch((error) => {
      const nextError = error instanceof Error ? error : new Error(String(error));

      failParsing(nextError);
      throw error;
    });

    void filePromise.catch(() => undefined);
    filePromises.push(filePromise);
  });

  try {
    await pipeline(source, sizeGuard, parser);
    await Promise.all(filePromises);

    return settle(() => ({
      bytesRead,
      fields,
      files,
      totalFileBytes,
    }));
  } catch (error) {
    if (!settled) {
      settle(() => undefined);
    }

    await Promise.allSettled(filePromises);

    const nextError = fatalError ?? (error instanceof Error ? error : null);

    if (nextError instanceof ClientError) {
      throw nextError;
    }

    throw new ClientError(400, "Invalid multipart form data.");
  }
}
