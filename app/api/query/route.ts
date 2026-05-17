import { NextResponse } from "next/server";

import type { QueryFileInput } from "@/lib/csvToSqlite";
import {
  buildErrorResponseBody,
  ClientError,
  createRequestId,
  getErrorStatus,
  logServerError,
  QueryAbortedError,
} from "@/lib/errorSanitizer";
import type { FileParseOptions } from "@/lib/fileParsing";
import {
  headerModeFromHasHeaders,
  normalizeDelimiterOption,
  normalizeHeaderMode,
} from "@/lib/fileParsing";
import { assertHeapWithinLimit } from "@/lib/memoryGuard";
import { parseMultipartRequest } from "@/lib/multipartRequest";
import {
  acquireConcurrencyLease,
  buildBandwidthLimitError,
  buildRequestRateLimitError,
  checkRateLimit,
  commitUploadBandwidth,
  extractClientIp,
  peekUploadBandwidthLimit,
} from "@/lib/ratelimit";
import { createSecurityHeaders } from "@/lib/securityHeaders";
import {
  SUPPORTED_INPUT_ENCODINGS,
  type InputEncoding,
} from "@/lib/textEncoding";
import { getRuntimeConfig } from "@/lib/runtimeConfig";
import { runQueryInWorkerPool } from "@/lib/queryWorkerPool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createApiHeaders(requestId: string): Headers {
  const headers = createSecurityHeaders(true);
  headers.set("X-Request-Id", requestId);
  return headers;
}

function errorResponse(
  error: unknown,
  requestId: string,
): NextResponse<ReturnType<typeof buildErrorResponseBody>> {
  const status = getErrorStatus(error);
  const headers = createApiHeaders(requestId);

  if (error instanceof ClientError && error.retryAfterSeconds) {
    headers.set("Retry-After", String(error.retryAfterSeconds));
  }

  return NextResponse.json(buildErrorResponseBody(error, requestId), {
    headers,
    status,
  });
}

function parseInputEncoding(rawValue: string | undefined): InputEncoding {
  const normalized = String(rawValue ?? "utf-8").toLowerCase();

  if (SUPPORTED_INPUT_ENCODINGS.includes(normalized as InputEncoding)) {
    return normalized as InputEncoding;
  }

  return "utf-8";
}

function validateMultipartContentType(request: Request): void {
  const contentType = request.headers.get("content-type");

  if (!contentType || !/^multipart\/form-data\b/i.test(contentType)) {
    throw new ClientError(400, "Request must use multipart/form-data.");
  }
}

function parseContentLength(headerValue: string | null): number | undefined {
  if (!headerValue) {
    return undefined;
  }

  const parsed = Number.parseInt(headerValue, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function isLikelyBinaryContent(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return false;
  }

  const hasUtf8Bom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf;
  const hasUtf16Bom =
    bytes.length >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));

  if (hasUtf8Bom || hasUtf16Bom) {
    return false;
  }

  const inspectedLength = Math.min(bytes.length, 2048);
  let suspiciousBytes = 0;
  let nullBytes = 0;

  for (let index = 0; index < inspectedLength; index += 1) {
    const value = bytes[index];

    if (value === 0) {
      nullBytes += 1;
      continue;
    }

    if ((value < 7 || (value > 13 && value < 32)) && value !== 9) {
      suspiciousBytes += 1;
    }
  }

  if (nullBytes > 0 && nullBytes !== Math.floor(inspectedLength / 2)) {
    return true;
  }

  return suspiciousBytes / inspectedLength > 0.1;
}

function buildFallbackFileSettings(
  fields: Map<string, string>,
  fileCount: number,
): FileParseOptions[] {
  const globalHeaderMode = normalizeHeaderMode(fields.get("headerMode"));
  const hasHeadersHeaderMode = headerModeFromHasHeaders(fields.get("hasHeaders"));

  return Array.from({ length: fileCount }, () => ({
    delimiter: normalizeDelimiterOption(fields.get("delimiter")),
    headerMode:
      globalHeaderMode !== "auto"
        ? globalHeaderMode
        : hasHeadersHeaderMode ?? "auto",
  }));
}

function parseFileSettings(
  fields: Map<string, string>,
  fileCount: number,
): {
  error?: string;
  settings: FileParseOptions[];
} {
  const rawValue = fields.get("fileSettings");

  if (rawValue === undefined) {
    return {
      settings: buildFallbackFileSettings(fields, fileCount),
    };
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      return {
        error: "Invalid file settings payload",
        settings: [],
      };
    }

    if (parsedValue.length !== fileCount) {
      return {
        error: "File settings did not match the uploaded file count",
        settings: [],
      };
    }

    return {
      settings: parsedValue.map((entry) => {
        const normalizedEntry =
          typeof entry === "object" && entry !== null
            ? (entry as Partial<Record<keyof FileParseOptions, unknown>>)
            : {};

        return {
          delimiter: normalizeDelimiterOption(normalizedEntry.delimiter),
          headerMode: normalizeHeaderMode(normalizedEntry.headerMode),
        };
      }),
    };
  } catch {
    return {
      error: "Invalid file settings payload",
      settings: [],
    };
  }
}

function validateQuery(query: string, maxQueryLength: number): string {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    throw new ClientError(400, "Query is required");
  }

  if (trimmedQuery.length > maxQueryLength) {
    throw new ClientError(400, "Query too long. Maximum 10,000 characters.");
  }

  return trimmedQuery;
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = createRequestId();
  const runtimeConfig = getRuntimeConfig();
  const clientIp = extractClientIp(request);
  const headers = createApiHeaders(requestId);
  const contentLength = parseContentLength(request.headers.get("content-length"));
  let concurrencyLease: Awaited<ReturnType<typeof acquireConcurrencyLease>> | null = null;
  let parsedRequest: Awaited<ReturnType<typeof parseMultipartRequest>> | null = null;
  let queryFiles: QueryFileInput[] = [];
  let reservedBandwidthBytes = 0;

  try {
    validateMultipartContentType(request);

    if (
      contentLength !== undefined &&
      contentLength > runtimeConfig.maxTotalUploadBytes
    ) {
      throw new ClientError(413, "Total upload size is too large");
    }

    const requestRate = await checkRateLimit(clientIp);

    if (!requestRate.allowed) {
      throw buildRequestRateLimitError(requestRate);
    }

    if (contentLength !== undefined && contentLength > 0) {
      const bandwidthPreview = await peekUploadBandwidthLimit(
        clientIp,
        contentLength,
      );

      if (!bandwidthPreview.allowed) {
        throw buildBandwidthLimitError(bandwidthPreview);
      }

      const reservedBandwidth = await commitUploadBandwidth(clientIp, contentLength);

      if (!reservedBandwidth.allowed) {
        throw buildBandwidthLimitError(reservedBandwidth);
      }

      reservedBandwidthBytes = contentLength;
    }

    concurrencyLease = await acquireConcurrencyLease(clientIp);
    assertHeapWithinLimit(runtimeConfig.maxHeapMb);

    parsedRequest = await parseMultipartRequest(request, {
      maxFileCount: runtimeConfig.maxFileCount,
      maxFilenameLength: runtimeConfig.maxFilenameLength,
      maxFileBytes: runtimeConfig.maxUploadBytes,
      maxTotalUploadBytes: runtimeConfig.maxTotalUploadBytes,
      minFileBytes: runtimeConfig.minFileBytes,
      signal: request.signal,
    });

    const additionalBandwidthBytes = Math.max(
      0,
      parsedRequest.bytesRead - reservedBandwidthBytes,
    );

    if (reservedBandwidthBytes === 0 || additionalBandwidthBytes > 0) {
      const bandwidthResult = await commitUploadBandwidth(
        clientIp,
        reservedBandwidthBytes === 0
          ? parsedRequest.bytesRead
          : additionalBandwidthBytes,
      );

      if (!bandwidthResult.allowed) {
        throw buildBandwidthLimitError(bandwidthResult);
      }
    }

    if (parsedRequest.files.length === 0) {
      throw new ClientError(400, "No files uploaded");
    }

    if (parsedRequest.totalFileBytes > runtimeConfig.maxTotalUploadBytes) {
      throw new ClientError(413, "Total upload size is too large");
    }

    const query = validateQuery(
      parsedRequest.fields.get("query") ?? "",
      runtimeConfig.maxQueryLength,
    );
    const parsedFileSettings = parseFileSettings(
      parsedRequest.fields,
      parsedRequest.files.length,
    );

    if (parsedFileSettings.error) {
      throw new ClientError(400, parsedFileSettings.error);
    }

    queryFiles = parsedRequest.files.map((file, index) => ({
      buffer: file.buffer ?? Buffer.alloc(0),
      delimiter: parsedFileSettings.settings[index].delimiter,
      filename: file.filename,
      headerMode: parsedFileSettings.settings[index].headerMode,
    }));

    const binaryFile = queryFiles.find((file) => isLikelyBinaryContent(file.buffer));

    if (binaryFile) {
      throw new ClientError(
        400,
        "Only text-based CSV, TSV, and TXT files are supported.",
      );
    }

    assertHeapWithinLimit(runtimeConfig.maxHeapMb);

    const result = await runQueryInWorkerPool(
      {
        files: queryFiles,
        inputEncoding: parseInputEncoding(parsedRequest.fields.get("encoding")),
        maxResultRows: runtimeConfig.maxResultRows,
        query,
      },
      request.signal,
    );

    return NextResponse.json(result, {
      headers,
      status: 200,
    });
  } catch (error) {
    const status = getErrorStatus(error);

    if (status >= 500 || (!(error instanceof ClientError) && !(error instanceof QueryAbortedError))) {
      logServerError(requestId, error, {
        contentLength,
        ip: clientIp,
        pathname: new URL(request.url).pathname,
      });
    }

    return errorResponse(error, requestId);
  } finally {
    await concurrencyLease?.release();

    for (const file of queryFiles) {
      file.buffer = Buffer.alloc(0);
    }

    if (parsedRequest) {
      for (const file of parsedRequest.files) {
        file.buffer = null;
      }
    }

    parsedRequest = null;
    queryFiles = [];
  }
}
