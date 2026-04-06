import { performance } from "node:perf_hooks";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createInMemoryDatabase,
  loadFilesIntoDatabase,
} from "../lib/queryEngine.ts";
import {
  buildJoinTableCsv,
  buildMainTableCsv,
  createBenchmarkContext,
  createQueryFileInput,
  median,
  writeJsonFile,
} from "./helpers";

export interface QueryBenchmarkResult {
  scenarios: Array<{
    medianMs: number;
    query: string;
    runsMs: number[];
    scenario: string;
  }>;
}

function timeQuery(
  database: ReturnType<typeof createInMemoryDatabase>,
  query: string,
  consumption: "all" | "iterate",
): number {
  const startedAt = performance.now();
  const statement = database.prepare(query);

  if (consumption === "all") {
    statement.all();
  } else {
    let rowCount = 0;
    for (const row of statement.iterate() as Iterable<Record<string, unknown>>) {
      void row;
      rowCount += 1;
    }

    if (rowCount === 0) {
      throw new Error(`Expected rows for query: ${query}`);
    }
  }

  return Number((performance.now() - startedAt).toFixed(2));
}

export async function runQueryBenchmark(): Promise<QueryBenchmarkResult> {
  const mainData = buildMainTableCsv(100_000, "benchmark_main.csv");
  const leftJoinData = buildMainTableCsv(50_000, "benchmark_join_left.csv");
  const rightJoinData = buildJoinTableCsv(50_000, "benchmark_join_right.csv");

  const scenarios: Array<{
    consumption: "all" | "iterate";
    query: string;
    scenario: string;
  }> = [
    {
      consumption: "iterate",
      query: "SELECT * FROM benchmark_main",
      scenario: "select_all_full_scan",
    },
    {
      consumption: "all",
      query:
        "SELECT * FROM benchmark_main WHERE customer_code = 'customer_00042'",
      scenario: "select_where_text",
    },
    {
      consumption: "all",
      query: "SELECT * FROM benchmark_main WHERE amount > 900",
      scenario: "select_where_numeric",
    },
    {
      consumption: "all",
      query:
        "SELECT category, COUNT(*) AS cnt, AVG(amount) AS avg_amount FROM benchmark_main GROUP BY category ORDER BY category",
      scenario: "group_by_count_avg",
    },
    {
      consumption: "all",
      query: [
        "SELECT left_table.id, right_table.region, left_table.amount",
        "FROM benchmark_join_left left_table",
        "JOIN benchmark_join_right right_table ON left_table.join_key = right_table.join_key",
        "WHERE right_table.priority > 5",
      ].join(" "),
      scenario: "join_two_50k_tables",
    },
    {
      consumption: "all",
      query:
        "SELECT id, amount FROM benchmark_main WHERE amount > (SELECT AVG(amount) FROM benchmark_main)",
      scenario: "subquery_with_aggregate_where",
    },
    {
      consumption: "iterate",
      query:
        "SELECT id, customer_code, sort_key FROM benchmark_main ORDER BY sort_key DESC",
      scenario: "order_by_non_indexed_column",
    },
    {
      consumption: "all",
      query: [
        "SELECT category, COUNT(*) AS cnt, AVG(score) AS avg_score",
        "FROM benchmark_main",
        "GROUP BY category",
        "HAVING COUNT(*) > 100",
        "ORDER BY avg_score DESC",
        "LIMIT 3",
      ].join(" "),
      scenario: "complex_group_having_order_limit",
    },
  ];

  const results = scenarios.map((scenario) => {
    const database = createInMemoryDatabase();

    try {
      loadFilesIntoDatabase(database, [
        createQueryFileInput(mainData.csv, mainData.filename),
        createQueryFileInput(leftJoinData.csv, leftJoinData.filename),
        createQueryFileInput(rightJoinData.csv, rightJoinData.filename),
      ]);

      const runsMs: number[] = [];

      for (let iteration = 0; iteration < 10; iteration += 1) {
        runsMs.push(timeQuery(database, scenario.query, scenario.consumption));
      }

      return {
        medianMs: median(runsMs),
        query: scenario.query,
        runsMs,
        scenario: scenario.scenario,
      };
    } finally {
      database.close();
    }
  });

  return {
    scenarios: results,
  };
}

async function main() {
  const context = createBenchmarkContext();
  const result = await runQueryBenchmark();

  await writeJsonFile(
    path.join(context.cwd, "benchmarks", "query-baseline.json"),
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
