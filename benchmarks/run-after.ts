import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runApiBenchmark } from "./benchmark-api";
import type { MemoryBenchmarkResult } from "./benchmark-memory";
import type { ParsingBenchmarkResult } from "./benchmark-parsing";
import type { QueryBenchmarkResult } from "./benchmark-query";
import {
  createBenchmarkContext,
  writeJsonFile,
} from "./helpers";

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

export async function runAfterBenchmarks() {
  const context = createBenchmarkContext();
  const query = await runIsolatedBenchmark<QueryBenchmarkResult>(
    "./benchmarks/benchmark-query.ts",
    "runQueryBenchmark",
  );
  const parsing = await runIsolatedBenchmark<ParsingBenchmarkResult>(
    "./benchmarks/benchmark-parsing.ts",
    "runParsingBenchmark",
  );
  const api = await runApiBenchmark({
    serverMode: "start",
  });
  const memory = await runIsolatedBenchmark<MemoryBenchmarkResult>(
    "./benchmarks/benchmark-memory.ts",
    "runMemoryBenchmark",
  );

  const result = {
    api,
    generatedAt: context.generatedAt,
    memory,
    parsing,
    query,
  };

  await writeJsonFile(
    path.join(context.cwd, "benchmarks", "after.json"),
    result,
  );
  await writeJsonFile(
    path.join(context.cwd, "BENCHMARK_AFTER.json"),
    result,
  );

  return result;
}

async function main() {
  const result = await runAfterBenchmarks();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
