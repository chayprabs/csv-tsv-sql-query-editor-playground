import path from "node:path";
import { pathToFileURL } from "node:url";

import { runApiBenchmark } from "./benchmark-api";
import { runMemoryBenchmark } from "./benchmark-memory";
import { runParsingBenchmark } from "./benchmark-parsing";
import { runQueryBenchmark } from "./benchmark-query";
import {
  createBenchmarkContext,
  writeJsonFile,
} from "./helpers";

export async function runBaseline() {
  const context = createBenchmarkContext();
  const parsing = await runParsingBenchmark();
  const query = await runQueryBenchmark();
  const api = await runApiBenchmark();
  const memory = await runMemoryBenchmark();

  const result = {
    api,
    generatedAt: context.generatedAt,
    memory,
    parsing,
    query,
  };

  await writeJsonFile(
    path.join(context.cwd, "benchmarks", "baseline.json"),
    result,
  );
  await writeJsonFile(
    path.join(context.cwd, "BENCHMARK_BASELINE.json"),
    result,
  );

  return result;
}

async function main() {
  const result = await runBaseline();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
