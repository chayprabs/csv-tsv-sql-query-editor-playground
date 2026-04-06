import { performance } from "node:perf_hooks";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseDelimitedText } from "../lib/delimitedData.ts";
import {
  buildMainTableCsv,
  createBenchmarkContext,
  median,
  writeJsonFile,
} from "./helpers";

export interface ParsingBenchmarkResult {
  scenarios: Array<{
    columnCount: number;
    error?: string;
    medianMs: number;
    rows: number;
    runsMs: number[];
  }>;
}

export async function runParsingBenchmark(): Promise<ParsingBenchmarkResult> {
  const scenarios = [1_000, 10_000, 100_000, 500_000];
  const results: ParsingBenchmarkResult["scenarios"] = [];

  for (const rowCount of scenarios) {
    const { csv } = buildMainTableCsv(rowCount);
    const runsMs: number[] = [];
    let columnCount = 0;
    let errorMessage: string | undefined;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const startedAt = performance.now();
        const parsed = parseDelimitedText(csv, {
          delimiter: "auto",
          headerMode: "auto",
          sourceName: `parsing-${rowCount}.csv`,
        });

        columnCount = parsed.columnNames.length;
        runsMs.push(Number((performance.now() - startedAt).toFixed(2)));
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : "Unknown parse error";
        break;
      }
    }

    results.push({
      columnCount,
      error: errorMessage,
      medianMs: runsMs.length > 0 ? median(runsMs) : 0,
      rows: rowCount,
      runsMs,
    });
  }

  return {
    scenarios: results,
  };
}

async function main() {
  const context = createBenchmarkContext();
  const result = await runParsingBenchmark();

  await writeJsonFile(
    path.join(context.cwd, "benchmarks", "parsing-baseline.json"),
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
