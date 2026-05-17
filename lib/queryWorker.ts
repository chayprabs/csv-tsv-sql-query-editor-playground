import { parentPort, workerData } from "node:worker_threads";

import {
  executeCsvQuery,
  type CsvToSqliteOptions,
  type QueryResponse,
} from "./csvToSqlite.ts";
import {
  ClientError,
  getSerializableErrorStatus,
  QueryAbortedError,
  sanitizeErrorMessage,
} from "./errorSanitizer.ts";
import { MemoryPressureError } from "./memoryGuard.ts";
import { QueryTimeoutError } from "./queryTimeout.ts";

type QueryWorkerPort = {
  on: (event: string, listener: (message: unknown) => void) => unknown;
  postMessage: (message: QueryWorkerJobResult) => unknown;
  removeAllListeners: (event?: string) => unknown;
};
const QUERY_WORKER_BOOTSTRAP_FLAG = "__flatfileQueryWorker";

interface QueryWorkerPayload {
  __flatfileQueryWorker: true;
}

export interface QueryWorkerJob {
  id: string;
  options: CsvToSqliteOptions;
}

export interface SerializedWorkerError {
  code?: string;
  message: string;
  name: string;
  retryAfterSeconds?: number;
  stack?: string;
  status?: number;
}

export type QueryWorkerJobResult =
  | {
      id: string;
      ok: true;
      result: QueryResponse;
    }
  | {
      error: SerializedWorkerError;
      id: string;
      ok: false;
    };

function serializeError(error: unknown): SerializedWorkerError {
  if (error instanceof ClientError) {
    return {
      code: error.code,
      message: error.message,
      name: error.name,
      retryAfterSeconds: error.retryAfterSeconds,
      stack: error.stack,
      status: error.status,
    };
  }

  if (error instanceof QueryAbortedError) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      status: 499,
    };
  }

  if (error instanceof QueryTimeoutError) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      status: 408,
    };
  }

  if (error instanceof MemoryPressureError) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      status: 503,
    };
  }

  if (error instanceof Error) {
    const sanitizedMessage = sanitizeErrorMessage(error);
    const status = getSerializableErrorStatus(error);

    return {
      message: sanitizedMessage,
      name: error.name,
      stack: error.stack,
      status,
    };
  }

  return {
    message: String(error),
    name: "Error",
  };
}

export function deserializeWorkerError(error: SerializedWorkerError): Error {
  if (typeof error.status === "number") {
    return new ClientError(error.status, error.message, {
      code: error.code,
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }

  const nextError = new Error(error.message);
  nextError.name = error.name;
  nextError.stack = error.stack;

  return nextError;
}

function isQueryWorkerPayload(value: unknown): value is QueryWorkerPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    QUERY_WORKER_BOOTSTRAP_FLAG in value &&
    (value as Partial<QueryWorkerPayload>).__flatfileQueryWorker === true
  );
}

function isQueryWorkerJob(value: unknown): value is QueryWorkerJob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<QueryWorkerJob>).id === "string" &&
    "options" in value
  );
}

export function createQueryWorkerPayload(
): QueryWorkerPayload {
  return {
    __flatfileQueryWorker: true,
  };
}

export function runQueryWorker(
  job: QueryWorkerJob,
  port?: QueryWorkerPort,
): QueryWorkerJobResult {
  try {
    const result = executeCsvQuery(job.options);
    const response = {
      id: job.id,
      ok: true,
      result,
    } satisfies QueryWorkerJobResult;

    if (port) {
      port.postMessage(response);
    }

    return response;
  } catch (error) {
    const response = {
      error: serializeError(error),
      id: job.id,
      ok: false,
    } satisfies QueryWorkerJobResult;

    if (port) {
      port.postMessage(response);
    }

    return response;
  }
}

export function handleQueryWorkerMessage(
  message: QueryWorkerJob,
  port: QueryWorkerPort,
): QueryWorkerJobResult {
  return runQueryWorker(message, port);
}

export function startQueryWorker(
  port: QueryWorkerPort | null = parentPort,
  payload: QueryWorkerPayload | unknown = workerData,
): void {
  if (!port) {
    throw new Error("Query worker must run inside a worker thread.");
  }

  if (!isQueryWorkerPayload(payload)) {
    throw new Error("Query worker payload was invalid.");
  }

  const messageHandler = (message: unknown) => {
    if (!isQueryWorkerJob(message)) {
      return;
    }

    handleQueryWorkerMessage(message, port);
  };

  port.removeAllListeners("message");
  port.on("message", messageHandler);
}

if (parentPort && isQueryWorkerPayload(workerData)) {
  startQueryWorker();
}
