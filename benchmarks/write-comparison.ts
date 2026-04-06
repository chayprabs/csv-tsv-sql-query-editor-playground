import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ApiBenchmarkResult } from "./benchmark-api";
import type { MemoryBenchmarkResult } from "./benchmark-memory";
import type { ParsingBenchmarkResult } from "./benchmark-parsing";
import type { QueryBenchmarkResult } from "./benchmark-query";

interface BenchmarkEnvelope {
  api: ApiBenchmarkResult;
  memory: MemoryBenchmarkResult;
  parsing: ParsingBenchmarkResult;
  query: QueryBenchmarkResult;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatDelta(before: number, after: number): string {
  if (before === 0) {
    return "n/a";
  }

  const delta = ((before - after) / before) * 100;
  const prefix = delta >= 0 ? "+" : "";
  return `${prefix}${formatNumber(delta)}%`;
}

function comparisonEmoji(before: number, after: number): string {
  if (after < before) {
    return "improved";
  }

  if (after > before) {
    return "regressed";
  }

  return "flat";
}

async function readBenchmarkEnvelope(filePath: string): Promise<BenchmarkEnvelope> {
  return JSON.parse(await readFile(filePath, "utf8")) as BenchmarkEnvelope;
}

export async function writeComparisonReport() {
  const cwd = process.cwd();
  const baseline = await readBenchmarkEnvelope(path.join(cwd, "BENCHMARK_BASELINE.json"));
  const after = await readBenchmarkEnvelope(path.join(cwd, "BENCHMARK_AFTER.json"));

  const lines: string[] = [
    "# BENCHMARK_COMPARISON",
    "",
    "## Parsing",
    "",
    "| Scenario | Before (ms) | After (ms) | Delta | Outcome |",
    "| --- | ---: | ---: | ---: | --- |",
  ];

  for (const beforeScenario of baseline.parsing.scenarios) {
    const afterScenario = after.parsing.scenarios.find(
      (scenario) => scenario.rows === beforeScenario.rows,
    );

    if (!afterScenario) {
      continue;
    }

    lines.push(
      `| ${beforeScenario.rows}_rows | ${formatNumber(beforeScenario.medianMs)} | ${formatNumber(afterScenario.medianMs)} | ${formatDelta(beforeScenario.medianMs, afterScenario.medianMs)} | ${comparisonEmoji(beforeScenario.medianMs, afterScenario.medianMs)} |`,
    );
  }

  lines.push(
    "",
    "## Query",
    "",
    "| Scenario | Before (ms) | After (ms) | Delta | Outcome |",
    "| --- | ---: | ---: | ---: | --- |",
  );

  for (const beforeScenario of baseline.query.scenarios) {
    const afterScenario = after.query.scenarios.find(
      (scenario) => scenario.scenario === beforeScenario.scenario,
    );

    if (!afterScenario) {
      continue;
    }

    lines.push(
      `| ${beforeScenario.scenario} | ${formatNumber(beforeScenario.medianMs)} | ${formatNumber(afterScenario.medianMs)} | ${formatDelta(beforeScenario.medianMs, afterScenario.medianMs)} | ${comparisonEmoji(beforeScenario.medianMs, afterScenario.medianMs)} |`,
    );
  }

  lines.push(
    "",
    "## API",
    "",
    "| Scenario | Metric | Before (ms) | After (ms) | Delta | Outcome |",
    "| --- | --- | ---: | ---: | ---: | --- |",
  );

  for (const beforeScenario of baseline.api.scenarios) {
    const afterScenario = after.api.scenarios.find(
      (scenario) => scenario.scenario === beforeScenario.scenario,
    );

    if (!afterScenario) {
      continue;
    }

    const metrics: Array<keyof typeof beforeScenario.latency> = [
      "p50Ms",
      "p95Ms",
      "p99Ms",
    ];

    for (const metric of metrics) {
      lines.push(
        `| ${beforeScenario.scenario} | ${metric} | ${formatNumber(beforeScenario.latency[metric])} | ${formatNumber(afterScenario.latency[metric])} | ${formatDelta(beforeScenario.latency[metric], afterScenario.latency[metric])} | ${comparisonEmoji(beforeScenario.latency[metric], afterScenario.latency[metric])} |`,
      );
    }
  }

  lines.push(
    "",
    "## Memory",
    "",
    "| Metric | Before | After | Delta | Outcome |",
    "| --- | ---: | ---: | ---: | --- |",
    `| peakHeapUsedMb | ${formatNumber(baseline.memory.peakHeapUsedMb)} | ${formatNumber(after.memory.peakHeapUsedMb)} | ${formatDelta(baseline.memory.peakHeapUsedMb, after.memory.peakHeapUsedMb)} | ${comparisonEmoji(baseline.memory.peakHeapUsedMb, after.memory.peakHeapUsedMb)} |`,
  );

  const biggestWins = [
    ...baseline.parsing.scenarios.map((beforeScenario) => {
      const afterScenario = after.parsing.scenarios.find(
        (scenario) => scenario.rows === beforeScenario.rows,
      );

      return {
        delta: afterScenario
          ? ((beforeScenario.medianMs - afterScenario.medianMs) / beforeScenario.medianMs) * 100
          : Number.NEGATIVE_INFINITY,
        label: `Parsing ${beforeScenario.rows}_rows`,
      };
    }),
    ...baseline.query.scenarios.map((beforeScenario) => {
      const afterScenario = after.query.scenarios.find(
        (scenario) => scenario.scenario === beforeScenario.scenario,
      );

      return {
        delta: afterScenario
          ? ((beforeScenario.medianMs - afterScenario.medianMs) / beforeScenario.medianMs) * 100
          : Number.NEGATIVE_INFINITY,
        label: `Query ${beforeScenario.scenario}`,
      };
    }),
    ...baseline.api.scenarios.map((beforeScenario) => {
      const afterScenario = after.api.scenarios.find(
        (scenario) => scenario.scenario === beforeScenario.scenario,
      );

      return {
        delta: afterScenario
          ? ((beforeScenario.latency.p50Ms - afterScenario.latency.p50Ms) /
              beforeScenario.latency.p50Ms) *
            100
          : Number.NEGATIVE_INFINITY,
        label: `API ${beforeScenario.scenario} p50`,
      };
    }),
    {
      delta:
        ((baseline.memory.peakHeapUsedMb - after.memory.peakHeapUsedMb) /
          baseline.memory.peakHeapUsedMb) *
        100,
      label: "Memory peakHeapUsedMb",
    },
  ]
    .filter((entry) => Number.isFinite(entry.delta))
    .sort((left, right) => right.delta - left.delta)
    .slice(0, 5);

  lines.push(
    "",
    "## Biggest Wins",
    "",
    ...biggestWins.map(
      (entry) => `- ${entry.label}: ${formatNumber(entry.delta)}% improvement`,
    ),
  );

  await writeFile(
    path.join(cwd, "BENCHMARK_COMPARISON.md"),
    `${lines.join("\n")}\n`,
    "utf8",
  );
}

async function main() {
  await writeComparisonReport();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
