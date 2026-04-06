import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildMainTableCsv,
  buildMultipartRequest,
  createBenchmarkContext,
  runAutocannon,
  startNextDevServer,
  startNextServer,
  stopProcess,
  summarizeLatency,
  writeJsonFile,
} from "./helpers";

export interface ApiBenchmarkResult {
  scenarios: Array<{
    connections: number;
    latency: {
      p50Ms: number;
      p95Ms: number;
      p99Ms: number;
    };
    requestsCompleted: number;
    scenario: string;
  }>;
}

function buildApiRequest(options: {
  csv: string;
  filename: string;
  query: string;
}) {
  return buildMultipartRequest({
    fields: {
      encoding: "utf-8",
      fileSettings: JSON.stringify([{ delimiter: "auto", headerMode: "auto" }]),
      query: options.query,
    },
    files: [
      {
        content: options.csv,
        fieldName: "files[]",
        filename: options.filename,
        type: "text/csv",
      },
    ],
  });
}

export async function runApiBenchmark(options: {
  port?: number;
  serverMode?: "dev" | "start";
} = {}): Promise<ApiBenchmarkResult> {
  const cwd = process.cwd();
  const port = options.port ?? 3100;
  const server =
    options.serverMode === "start"
      ? await startNextServer({ cwd, mode: "start", port })
      : await startNextDevServer({ cwd, port });
  
  try {
    return await runApiBenchmarkAgainstBaseUrl(`http://127.0.0.1:${port}`);
  } finally {
    await stopProcess(server);
  }
}

export async function runApiBenchmarkAgainstBaseUrl(
  baseUrl: string,
): Promise<ApiBenchmarkResult> {
  const smallData = buildMainTableCsv(100, "benchmark_main.csv");
  const mediumData = buildMainTableCsv(10_000, "benchmark_main.csv");
  const smallRequest = buildApiRequest({
    csv: smallData.csv,
    filename: smallData.filename,
    query: "SELECT * FROM benchmark_main LIMIT 25",
  });
  const mediumRequest = buildApiRequest({
    csv: mediumData.csv,
    filename: mediumData.filename,
    query:
      "SELECT category, COUNT(*) AS cnt, AVG(amount) AS avg_amount FROM benchmark_main GROUP BY category",
  });

  const scenarios = [
    {
      amount: 25,
      connections: 1,
      name: "small_file_simple_query",
      request: smallRequest,
    },
    {
      amount: 15,
      connections: 1,
      name: "medium_file_group_by",
      request: mediumRequest,
    },
    {
      amount: 40,
      connections: 10,
      name: "medium_file_group_by_concurrent_10",
      request: mediumRequest,
    },
  ];

  const results: ApiBenchmarkResult["scenarios"] = [];

  for (const scenario of scenarios) {
    const result = await runAutocannon({
      amount: scenario.amount,
      connections: scenario.connections,
      headers: {
        "content-type": scenario.request.contentType,
      },
      method: "POST",
      requests: [
        {
          body: scenario.request.body,
          headers: {
            "content-type": scenario.request.contentType,
          },
          method: "POST",
          path: "/api/query",
        },
      ],
      url: baseUrl,
    });

    results.push({
      connections: scenario.connections,
      latency: summarizeLatency(result.latency),
      requestsCompleted: result["2xx"],
      scenario: scenario.name,
    });
  }

  return {
    scenarios: results,
  };
}

async function main() {
  const context = createBenchmarkContext();
  const result = await runApiBenchmark();

  await writeJsonFile(
    path.join(context.cwd, "benchmarks", "api-baseline.json"),
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
