import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createInMemoryDatabase,
  executeReaderQuery,
  loadFilesIntoDatabase,
} from "../lib/queryEngine.ts";
import {
  buildMainTableCsv,
  createBenchmarkContext,
  createQueryFileInput,
  writeJsonFile,
} from "./helpers";

interface MemorySample {
  heapUsedBytes: number;
  rssBytes: number;
  stage: string;
}

export interface MemoryBenchmarkResult {
  peakHeapUsedBytes: number;
  peakHeapUsedMb: number;
  samples: MemorySample[];
}

function sampleMemory(stage: string): MemorySample {
  const usage = process.memoryUsage();

  return {
    heapUsedBytes: usage.heapUsed,
    rssBytes: usage.rss,
    stage,
  };
}

function maybeRunGc() {
  const globalWithGc = globalThis as typeof globalThis & { gc?: () => void };
  globalWithGc.gc?.();
}

export async function runMemoryBenchmark(): Promise<MemoryBenchmarkResult> {
  const samples: MemorySample[] = [];

  maybeRunGc();
  samples.push(sampleMemory("start"));

  const dataset = buildMainTableCsv(100_000, "benchmark_main.csv");
  samples.push(sampleMemory("after_csv_generation"));

  const queryFile = createQueryFileInput(dataset.csv, dataset.filename);
  samples.push(sampleMemory("after_buffer_creation"));

  const database = createInMemoryDatabase();
  samples.push(sampleMemory("after_database_creation"));

  try {
    loadFilesIntoDatabase(database, [queryFile], {
      inputEncoding: "utf-8",
    });
    samples.push(sampleMemory("after_file_load"));

    executeReaderQuery(
      database,
      "SELECT category, COUNT(*) AS cnt, AVG(amount) AS avg_amount FROM benchmark_main GROUP BY category ORDER BY category",
      50_000,
    );
    samples.push(sampleMemory("after_query_execution"));

    const peakHeapUsedBytes = Math.max(...samples.map((sample) => sample.heapUsedBytes));

    return {
      peakHeapUsedBytes,
      peakHeapUsedMb: Number((peakHeapUsedBytes / (1024 * 1024)).toFixed(2)),
      samples,
    };
  } finally {
    database.close();
  }
}

async function main() {
  const context = createBenchmarkContext();
  const result = await runMemoryBenchmark();

  await writeJsonFile(
    path.join(context.cwd, "benchmarks", "memory-baseline.json"),
    result,
  );

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
