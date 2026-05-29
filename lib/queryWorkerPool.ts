import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { pathToFileURL } from "node:url";


import type { CsvToSqliteOptions, QueryResponse } from "./csvToSqlite.ts";
import { QueryTimeoutError } from "./queryTimeout.ts";
import {
  createQueryWorkerPayload,
  deserializeWorkerError,
  runQueryWorker,
  type QueryWorkerJob,
  type QueryWorkerJobResult,
} from "./queryWorker.ts";
import { QueryAbortedError } from "./errorSanitizer.ts";
import { getRuntimeConfig } from "./runtimeConfig.ts";

export { QueryTimeoutError } from "./queryTimeout.ts";

interface WorkerJobState {
  abortHandler: () => void;
  id: string;
  reject: (error: Error) => void;
  resolve: (result: QueryResponse) => void;
  signal: AbortSignal;
  timeoutHandle: NodeJS.Timeout;
}

interface WorkerSlot {
  busy: boolean;
  currentJob: WorkerJobState | null;
  worker: Worker;
}

const MAX_POOL_SIZE = Math.min(8, Math.max(1, os.availableParallelism() - 1));
const pendingQueue: Array<{
  options: CsvToSqliteOptions;
  reject: (error: Error) => void;
  resolve: (result: QueryResponse) => void;
  signal: AbortSignal;
}> = [];
let workerPool: WorkerSlot[] | null = null;

function createWorker(): Worker {
  const workerPath = pathToFileURL(
    path.join(process.cwd(), "lib", "queryWorker.ts"),
  );
  const worker = new Worker(workerPath, {
    // Package name only — require.resolve("tsx") pulls esbuild into the Next.js bundle.
    execArgv: ["--import", "tsx"],
    workerData: createQueryWorkerPayload(),
  });

  worker.unref();

  return worker;
}

function getWorkerPool(): WorkerSlot[] {
  if (!workerPool) {
    workerPool = [];
  }

  if (workerPool.length === 0) {
    const slot = {
      busy: false,
      currentJob: null,
      worker: createWorker(),
    };

    workerPool.push(slot);
    attachWorkerListeners(slot);
  }

  return workerPool;
}

function settleCurrentJob(
  slot: WorkerSlot,
  settle: (job: WorkerJobState) => void,
): void {
  const currentJob = slot.currentJob;

  if (!currentJob) {
    return;
  }

  clearTimeout(currentJob.timeoutHandle);
  currentJob.signal.removeEventListener("abort", currentJob.abortHandler);
  slot.currentJob = null;
  slot.busy = false;
  settle(currentJob);
  dispatchPendingJobs();
}

function replaceWorker(slot: WorkerSlot): void {
  slot.worker.removeAllListeners();
  slot.worker = createWorker();
  slot.currentJob = null;
  slot.busy = false;
  attachWorkerListeners(slot);
}

function attachWorkerListeners(slot: WorkerSlot): void {
  slot.worker.on("message", (message: QueryWorkerJobResult) => {
    if (!slot.currentJob || message.id !== slot.currentJob.id) {
      return;
    }

    settleCurrentJob(slot, (job) => {
      if (message.ok) {
        job.resolve(message.result);
        return;
      }

      job.reject(deserializeWorkerError(message.error));
    });
  });

  slot.worker.on("error", (error) => {
    const currentJob = slot.currentJob;

    replaceWorker(slot);

    if (currentJob) {
      clearTimeout(currentJob.timeoutHandle);
      currentJob.signal.removeEventListener("abort", currentJob.abortHandler);
      currentJob.reject(error instanceof Error ? error : new Error(String(error)));
      dispatchPendingJobs();
    }
  });

  slot.worker.on("exit", (code) => {
    const currentJob = slot.currentJob;

    if (!slot.busy && code === 0) {
      return;
    }

    replaceWorker(slot);

    if (currentJob) {
      clearTimeout(currentJob.timeoutHandle);
      currentJob.signal.removeEventListener("abort", currentJob.abortHandler);
      currentJob.reject(
        new Error(`Query worker exited unexpectedly with code ${code}.`),
      );
      dispatchPendingJobs();
    }
  });
}

function dispatchPendingJobs(): void {
  const pool = getWorkerPool();

  for (let slotIndex = 0; slotIndex < pool.length; slotIndex += 1) {
    const slot = pool[slotIndex];

    if (slot.busy) {
      continue;
    }

    const nextIndex = pendingQueue.findIndex((job) => !job.signal.aborted);

    if (nextIndex === -1) {
      return;
    }

    const nextJob = pendingQueue.splice(nextIndex, 1)[0];
    const jobId = randomUUID();
    const { queryTimeoutMs } = getRuntimeConfig();
    const abortHandler = () => {
      replaceWorker(slot);
      nextJob.reject(new QueryAbortedError());
      dispatchPendingJobs();
    };

    slot.busy = true;
    slot.currentJob = {
      abortHandler,
      id: jobId,
      reject: nextJob.reject,
      resolve: nextJob.resolve,
      signal: nextJob.signal,
      timeoutHandle: setTimeout(() => {
        replaceWorker(slot);
        nextJob.reject(new QueryTimeoutError(queryTimeoutMs));
        dispatchPendingJobs();
      }, queryTimeoutMs),
    };

    if (nextJob.signal.aborted) {
      abortHandler();
      continue;
    }

    nextJob.signal.addEventListener("abort", abortHandler, { once: true });

    const workerMessage: QueryWorkerJob = {
      id: jobId,
      options: nextJob.options,
    };

    slot.worker.postMessage(workerMessage);
  }

  const hasPendingJobs = pendingQueue.some((job) => !job.signal.aborted);
  const idleSlotCount = pool.filter((slot) => !slot.busy).length;

  if (hasPendingJobs && idleSlotCount === 0 && pool.length < MAX_POOL_SIZE) {
    const slot = {
      busy: false,
      currentJob: null,
      worker: createWorker(),
    };

    pool.push(slot);
    attachWorkerListeners(slot);
    dispatchPendingJobs();
  }
}

export function runQueryInWorkerPool(
  options: CsvToSqliteOptions,
  signal: AbortSignal,
): Promise<QueryResponse> {
  const useInlineWorker =
    process.env.FLATFILE_INLINE_QUERY_WORKER === "1" ||
    (process.env.VITEST && process.env.FLATFILE_FORCE_WORKER_POOL !== "1");

  if (useInlineWorker) {
    if (signal.aborted) {
      return Promise.reject(new QueryAbortedError());
    }

    const jobId = randomUUID();
    const result = runQueryWorker({ id: jobId, options });

    if (!result.ok) {
      return Promise.reject(deserializeWorkerError(result.error));
    }

    return Promise.resolve(result.result);
  }

  return new Promise<QueryResponse>((resolve, reject) => {
    if (signal.aborted) {
      reject(new QueryAbortedError());
      return;
    }

    pendingQueue.push({
      options,
      reject,
      resolve,
      signal,
    });

    dispatchPendingJobs();
  });
}

export async function shutdownQueryWorkerPool(): Promise<void> {
  pendingQueue.splice(0, pendingQueue.length);

  if (!workerPool) {
    return;
  }

  const pool = workerPool;
  workerPool = null;

  await Promise.all(
    pool.map(async (slot) => {
      slot.worker.removeAllListeners();
      await slot.worker.terminate();
    }),
  );
}
