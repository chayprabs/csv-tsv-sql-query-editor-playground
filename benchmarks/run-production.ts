import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { QueryResponse } from "../lib/csvToSqlite";
import {
  runApiBenchmarkAgainstBaseUrl,
  type ApiBenchmarkResult,
} from "./benchmark-api";
import type { MemoryBenchmarkResult } from "./benchmark-memory";
import type { ParsingBenchmarkResult } from "./benchmark-parsing";
import type { QueryBenchmarkResult } from "./benchmark-query";
import {
  buildMainTableCsv,
  buildMultipartRequest,
  createBenchmarkContext,
  startNextServer,
  stopProcess,
  writeJsonFile,
} from "./helpers";

export interface ProductionSmokeResult {
  executionTimeMs: number;
  responseTimeMs: number;
  rowCount: number;
  rows: Array<Record<string, unknown>>;
}

async function runIsolatedBenchmark<T>(
  importPath: string,
  exportName: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--eval",
        [
          `import { ${exportName} } from ${JSON.stringify(importPath)};`,
          `const result = await ${exportName}();`,
          "console.log(JSON.stringify(result));",
        ].join("\n"),
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Benchmark process exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()) as T);
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to parse benchmark output."),
        );
      }
    });
  });
}

function buildSmokeRequest() {
  const dataset = buildMainTableCsv(100_000, "benchmark_main.csv");

  return buildMultipartRequest({
    fields: {
      encoding: "utf-8",
      fileSettings: JSON.stringify([{ delimiter: "auto", headerMode: "auto" }]),
      query: [
        "SELECT category, COUNT(*) AS cnt, AVG(amount) AS avg_amount",
        "FROM benchmark_main",
        "GROUP BY category",
        "ORDER BY category",
      ].join(" "),
    },
    files: [
      {
        content: dataset.csv,
        fieldName: "files[]",
        filename: dataset.filename,
        type: "text/csv",
      },
    ],
  });
}

async function runProductionSmoke(
  baseUrl: string,
): Promise<ProductionSmokeResult> {
  const request = buildSmokeRequest();
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/query`, {
    body: request.body,
    headers: {
      "content-type": request.contentType,
    },
    method: "POST",
  });
  const responseTimeMs = Number((performance.now() - startedAt).toFixed(2));
  const payload = (await response.json()) as QueryResponse;

  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? `Production smoke request failed with ${response.status}.`);
  }

  const categories = ["alpha", "beta", "delta", "epsilon", "gamma"];

  if (payload.rowCount !== 5) {
    throw new Error(`Expected 5 grouped rows but received ${payload.rowCount}.`);
  }

  if (
    JSON.stringify(payload.rows.map((row) => row.category)) !==
    JSON.stringify(categories)
  ) {
    throw new Error("Production smoke query returned unexpected categories.");
  }

  if (!payload.rows.every((row) => row.cnt === 20_000)) {
    throw new Error("Production smoke query returned unexpected group counts.");
  }

  return {
    executionTimeMs: payload.executionTimeMs,
    responseTimeMs,
    rowCount: payload.rowCount,
    rows: payload.rows,
  };
}

export async function runProductionBenchmarks(): Promise<{
  api: ApiBenchmarkResult;
  generatedAt: string;
  memory: MemoryBenchmarkResult;
  parsing: ParsingBenchmarkResult;
  query: QueryBenchmarkResult;
  smoke: ProductionSmokeResult;
}> {
  const context = createBenchmarkContext();
  const query = await runIsolatedBenchmark<QueryBenchmarkResult>(
    "./benchmarks/benchmark-query.ts",
    "runQueryBenchmark",
  );
  const parsing = await runIsolatedBenchmark<ParsingBenchmarkResult>(
    "./benchmarks/benchmark-parsing.ts",
    "runParsingBenchmark",
  );
  const memory = await runIsolatedBenchmark<MemoryBenchmarkResult>(
    "./benchmarks/benchmark-memory.ts",
    "runMemoryBenchmark",
  );
  const port = 3200;
  const server = await startNextServer({
    cwd: context.cwd,
    mode: "start",
    port,
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const api = await runApiBenchmarkAgainstBaseUrl(baseUrl);
    const smoke = await runProductionSmoke(baseUrl);
    const result = {
      api,
      generatedAt: context.generatedAt,
      memory,
      parsing,
      query,
      smoke,
    };

    await writeJsonFile(
      path.join(context.cwd, "benchmarks", "production.json"),
      result,
    );
    await writeJsonFile(
      path.join(context.cwd, "BENCHMARK_PRODUCTION.json"),
      result,
    );

    return result;
  } finally {
    await stopProcess(server);
  }
}

async function main() {
  const result = await runProductionBenchmarks();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
