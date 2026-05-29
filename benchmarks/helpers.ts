import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import autocannon, { type Result as AutocannonResult } from "autocannon";

export interface BenchmarkRunContext {
  cwd: string;
  generatedAt: string;
}

export interface LatencySummary {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

export function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return round((sorted[middle - 1] + sorted[middle]) / 2);
  }

  return round(sorted[middle]);
}

export function buildMainTableCsv(
  rowCount: number,
  tableName = "benchmark_main.csv",
): {
  csv: string;
  filename: string;
} {
  const categories = ["alpha", "beta", "gamma", "delta", "epsilon"];
  const rows = [
    "id,category,customer_code,amount,join_key,score,sort_key,created_at",
  ];

  for (let index = 1; index <= rowCount; index += 1) {
    const category = categories[(index - 1) % categories.length];
    const customerCode = `customer_${String(((index - 1) % 5000) + 1).padStart(5, "0")}`;
    const amount = (((index * 17) % 10_000) / 10).toFixed(2);
    const joinKey = ((index - 1) % 50_000) + 1;
    const score = (((index * 23) % 1_000) / 10).toFixed(1);
    const sortKey = `label_${String(rowCount - index).padStart(6, "0")}`;
    const month = String(((index - 1) % 12) + 1).padStart(2, "0");
    const day = String(((index - 1) % 28) + 1).padStart(2, "0");

    rows.push(
      [
        index,
        category,
        customerCode,
        amount,
        joinKey,
        score,
        sortKey,
        `2026-${month}-${day}`,
      ].join(","),
    );
  }

  return {
    csv: `${rows.join("\n")}\n`,
    filename: tableName,
  };
}

export function buildJoinTableCsv(
  rowCount: number,
  tableName = "benchmark_lookup.csv",
): {
  csv: string;
  filename: string;
} {
  const segments = ["enterprise", "midmarket", "smb", "public"];
  const regions = ["north", "south", "east", "west", "central"];
  const rows = ["join_key,segment,region,priority"];

  for (let index = 1; index <= rowCount; index += 1) {
    rows.push(
      [
        index,
        segments[(index - 1) % segments.length],
        regions[(index - 1) % regions.length],
        (index % 10) + 1,
      ].join(","),
    );
  }

  return {
    csv: `${rows.join("\n")}\n`,
    filename: tableName,
  };
}

export function createQueryFileInput(csv: string, filename: string) {
  return {
    buffer: Buffer.from(csv, "utf8"),
    filename,
  };
}

export function buildMultipartRequest(options: {
  fields: Record<string, string>;
  files: Array<{
    content: string;
    fieldName: string;
    filename: string;
    type: string;
  }>;
}): {
  body: string;
  contentType: string;
} {
  const boundary = `----flatfile-sql-studio-benchmark-${Date.now()}`;
  const chunks: Buffer[] = [];

  for (const [name, value] of Object.entries(options.fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        "utf8",
      ),
    );
  }

  for (const file of options.files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`,
        "utf8",
      ),
    );
    chunks.push(Buffer.from(file.content, "utf8"));
    chunks.push(Buffer.from("\r\n", "utf8"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));

  return {
    body: Buffer.concat(chunks).toString("utf8"),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function interpolatePercentile(histogram: AutocannonResult["latency"]): number {
  const lower = histogram.p90;
  const upper = histogram.p97_5;
  const normalized = (95 - 90) / (97.5 - 90);

  return round(lower + (upper - lower) * normalized);
}

export function summarizeLatency(latency: AutocannonResult["latency"]): LatencySummary {
  return {
    p50Ms: round(latency.p50),
    p95Ms: interpolatePercentile(latency),
    p99Ms: round(latency.p99),
  };
}

export async function runAutocannon(
  options: Parameters<typeof autocannon>[0],
): Promise<AutocannonResult> {
  return new Promise<AutocannonResult>((resolve, reject) => {
    const instance = autocannon(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });

    instance.on("error", reject);
  });
}

export async function ensureDirectory(directoryPath: string): Promise<void> {
  await mkdir(directoryPath, { recursive: true });
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function waitForHttpReady(
  url: string,
  timeoutMs = 90_000,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });

      if (response.status < 500) {
        return;
      }
    } catch {
      // Ignore transient startup failures.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

export async function startNextDevServer(options: {
  cwd: string;
  port: number;
}): Promise<ChildProcessWithoutNullStreams> {
  return startNextServer({
    ...options,
    mode: "dev",
  });
}

export async function startNextServer(options: {
  cwd: string;
  mode: "dev" | "start";
  port: number;
}): Promise<ChildProcessWithoutNullStreams> {
  const nextCliPath = path.join(
    options.cwd,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: options.mode === "dev" ? "development" : "production",
  };
  delete childEnv.VITEST;
  delete childEnv.VITEST_WORKER_ID;
  delete childEnv.VITEST_POOL_ID;

  const child = spawn(
    process.execPath,
    [
      nextCliPath,
      options.mode,
      "--hostname",
      "127.0.0.1",
      "--port",
      String(options.port),
    ],
    {
      cwd: options.cwd,
      env: childEnv,
      stdio: "pipe",
    },
  );

  child.stdout.on("data", () => undefined);
  child.stderr.on("data", () => undefined);

  await waitForHttpReady(`http://127.0.0.1:${options.port}`);

  return child;
}

export async function stopProcess(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (child.killed) {
    return;
  }

  child.kill("SIGTERM");

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 10_000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export function createBenchmarkContext(cwd = process.cwd()): BenchmarkRunContext {
  return {
    cwd,
    generatedAt: new Date().toISOString(),
  };
}
