import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  runAutocannon,
  stopProcess,
  summarizeLatency,
  waitForHttpReady,
} from "../benchmarks/helpers.ts";

const ARTIFACTS_DIR = path.resolve(process.cwd(), "artifacts");
const BASE_URL = "http://127.0.0.1:3201";
const MEGABYTE = 1024 * 1024;
const PORT = 3201;

interface MultipartFile {
  content: Buffer | string;
  contentType?: string;
  fieldName?: string;
  filename: string;
}

interface MultipartRequest {
  body: Buffer;
  contentType: string;
}

interface PostedRequestResult {
  durationMs: number;
  payload: unknown;
  status: number;
}

interface ScenarioSummary {
  details: Record<string, unknown>;
  name: string;
  passed: boolean;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );

  return sorted[index];
}

function nextCliPath(): string {
  return path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
}

async function ensureProductionBuild(): Promise<void> {
  const buildMarkerPath = path.join(
    process.cwd(),
    ".next",
    "build-manifest.json",
  );

  try {
    await access(buildMarkerPath, fsConstants.F_OK);
    return;
  } catch {
    if (process.platform === "win32") {
      execFileSync("cmd.exe", ["/c", "npm run build"], {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      });
      return;
    }

    execFileSync("npm", ["run", "build"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
  }
}

async function startProductionServer(): Promise<ChildProcessWithoutNullStreams> {
  const child = spawn(
    process.execPath,
    [
      nextCliPath(),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(PORT),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      stdio: "pipe",
    },
  );

  child.stdout.on("data", () => undefined);
  child.stderr.on("data", () => undefined);

  await waitForHttpReady(BASE_URL);

  return child;
}

function buildMultipartRequest(options: {
  fields: Record<string, string>;
  files: MultipartFile[];
}): MultipartRequest {
  const boundary = `----flatfile-sql-studio-load-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName ?? "files[]"}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType ?? "text/csv"}\r\n\r\n`,
        "utf8",
      ),
    );
    chunks.push(typeof file.content === "string" ? Buffer.from(file.content, "utf8") : file.content);
    chunks.push(Buffer.from("\r\n", "utf8"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function buildCsvOfSize(options: {
  filename: string;
  payloadSize: number;
  targetBytes: number;
}): {
  csv: string;
  filename: string;
} {
  const header = "category,amount,payload\n";
  const payload = "x".repeat(options.payloadSize);
  const rows: string[] = [header];
  let byteLength = Buffer.byteLength(header, "utf8");
  let rowIndex = 0;

  while (byteLength < options.targetBytes) {
    const category = ["alpha", "beta", "gamma", "delta", "epsilon"][rowIndex % 5];
    const amount = ((rowIndex % 1_000) + 1).toString();
    const row = `${category},${amount},${payload}_${rowIndex}\n`;

    rows.push(row);
    byteLength += Buffer.byteLength(row, "utf8");
    rowIndex += 1;
  }

  return {
    csv: rows.join(""),
    filename: options.filename,
  };
}

function buildSmallQueryRequest(): MultipartRequest {
  return buildMultipartRequest({
    fields: {
      query: "SELECT COUNT(*) AS count FROM ping",
    },
    files: [
      {
        content: "id,value\n1,ok\n2,still_ok\n",
        filename: "ping.csv",
      },
    ],
  });
}

async function readPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

async function postMultipartRequest(options: {
  body: Buffer;
  contentType: string;
  ip: string;
  timeoutMs?: number;
}): Promise<PostedRequestResult> {
  const startedAt = performance.now();
  const response = await fetch(`${BASE_URL}/api/query`, {
    body: new Uint8Array(options.body),
    headers: {
      "content-length": String(options.body.length),
      "content-type": options.contentType,
      "x-forwarded-for": options.ip,
    },
    method: "POST",
    signal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
  });
  const payload = await readPayload(response);

  return {
    durationMs: Math.round(performance.now() - startedAt),
    payload,
    status: response.status,
  };
}

function rotateIp(index: number): string {
  const thirdOctet = 100 + Math.floor(index / 200);
  const fourthOctet = (index % 200) + 1;

  return `198.51.${thirdOctet}.${fourthOctet}`;
}

async function sampleProcessRssMb(pid: number): Promise<number> {
  if (process.platform === "win32") {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-Process -Id ${pid}).WorkingSet64`,
      ],
      {
        encoding: "utf8",
      },
    ).trim();

    return Number.parseInt(output, 10) / MEGABYTE;
  }

  const output = execFileSync(
    "ps",
    ["-o", "rss=", "-p", String(pid)],
    {
      encoding: "utf8",
    },
  ).trim();

  return Number.parseInt(output, 10) / 1024;
}

function startMemoryMonitor(pid: number) {
  let peakRssMb = 0;
  let sampling = true;

  const sample = async () => {
    if (!sampling) {
      return;
    }

    try {
      peakRssMb = Math.max(peakRssMb, await sampleProcessRssMb(pid));
    } catch {
      sampling = false;
      return;
    }

    setTimeout(() => {
      void sample();
    }, 500);
  };

  void sample();

  return {
    async stop(): Promise<number> {
      sampling = false;

      try {
        peakRssMb = Math.max(peakRssMb, await sampleProcessRssMb(pid));
      } catch {
        // Ignore shutdown races.
      }

      return Number(peakRssMb.toFixed(2));
    },
  };
}

async function verifyServerStillHealthy(ip: string): Promise<boolean> {
  const request = buildSmallQueryRequest();
  const response = await postMultipartRequest({
    body: request.body,
    contentType: request.contentType,
    ip,
  });

  return response.status === 200;
}

async function runScenarioNormalLoad(): Promise<ScenarioSummary> {
  const dataset = buildCsvOfSize({
    filename: "normal_load.csv",
    payloadSize: 64,
    targetBytes: MEGABYTE,
  });
  const request = buildMultipartRequest({
    fields: {
      query: [
        "SELECT category, COUNT(*) AS total_rows, AVG(amount) AS avg_amount",
        "FROM normal_load",
        "GROUP BY category",
        "ORDER BY category",
      ].join(" "),
    },
    files: [
      {
        content: dataset.csv,
        filename: dataset.filename,
      },
    ],
  });
  const results: PostedRequestResult[] = [];
  const deadline = Date.now() + 60_000;
  let requestIndex = 0;

  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (Date.now() < deadline) {
        requestIndex += 1;
        results.push(
          await postMultipartRequest({
            body: request.body,
            contentType: request.contentType,
            ip: rotateIp(requestIndex),
            timeoutMs: 60_000,
          }),
        );
      }
    }),
  );

  const successDurations = results
    .filter((result) => result.status === 200)
    .map((result) => result.durationMs);
  const latency = {
    p50Ms: percentile(successDurations, 50),
    p95Ms: percentile(successDurations, 95),
    p99Ms: percentile(successDurations, 99),
  };
  const statusCounts = results.reduce<Record<number, number>>((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    return counts;
  }, {});
  const healthyAfterRun = await verifyServerStillHealthy("198.51.200.1");
  const autocannonSmoke = await runAutocannon({
    connections: 5,
    duration: 3,
    title: "scenario-1-autocannon-smoke",
    url: BASE_URL,
  });
  const passed =
    results.length > 0 &&
    results.every((result) => result.status === 200) &&
    latency.p99Ms < 5_000 &&
    healthyAfterRun;

  return {
    details: {
      autocannonSmoke: {
        errors: autocannonSmoke.errors,
        latency: summarizeLatency(autocannonSmoke.latency),
        timeouts: autocannonSmoke.timeouts,
      },
      latency,
      requestCount: results.length,
      requestsPerSecondAverage: Number((results.length / 60).toFixed(2)),
      serverHealthyAfterRun: healthyAfterRun,
      statusCounts,
    },
    name: "Scenario 1: Normal load",
    passed,
  };
}

async function runScenarioRateLimitStorm(): Promise<ScenarioSummary> {
  const request = buildSmallQueryRequest();
  const stormIp = "203.0.113.200";
  const acceptedStatuses: number[] = [];

  for (let index = 0; index < 10; index += 1) {
    const response = await postMultipartRequest({
      body: request.body,
      contentType: request.contentType,
      ip: stormIp,
    });

    acceptedStatuses.push(response.status);
  }

  const stormResults: PostedRequestResult[] = [];
  const deadline = Date.now() + 10_000;
  await Promise.all(
    Array.from({ length: 20 }, async () => {
      while (Date.now() < deadline) {
        stormResults.push(
          await postMultipartRequest({
            body: request.body,
            contentType: request.contentType,
            ip: stormIp,
          }),
        );
      }
    }),
  );

  const statusCounts = stormResults.reduce<Record<number, number>>((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    return counts;
  }, {});
  const legitimateRequestStillWorks = await verifyServerStillHealthy("198.51.200.2");
  const passed =
    acceptedStatuses.every((status) => status === 200) &&
    stormResults.length > 0 &&
    Object.keys(statusCounts).every((status) => Number(status) === 429) &&
    legitimateRequestStillWorks;

  return {
    details: {
      firstTenStatuses: acceptedStatuses,
      legitimateRequestStillWorks,
      stormRequestCount: stormResults.length,
      stormStatusCounts: statusCounts,
    },
    name: "Scenario 2: Rate limit storm",
    passed,
  };
}

async function runScenarioLargeUpload(serverPid: number): Promise<ScenarioSummary> {
  const dataset = buildCsvOfSize({
    filename: "large_attack.csv",
    payloadSize: 2_048,
    targetBytes: 48 * MEGABYTE,
  });
  const request = buildMultipartRequest({
    fields: {
      query: "SELECT COUNT(*) AS count FROM large_attack",
    },
    files: [
      {
        content: dataset.csv,
        filename: dataset.filename,
      },
    ],
  });
  const monitor = startMemoryMonitor(serverPid);
  const results = await Promise.all(
    Array.from({ length: 3 }, (_, index) =>
      postMultipartRequest({
        body: request.body,
        contentType: request.contentType,
        ip: `198.51.210.${index + 1}`,
        timeoutMs: 300_000,
      }),
    ),
  );
  const peakRssMb = await monitor.stop();
  const statuses = results.map((result) => result.status);
  const allAcceptedOrRejectedCleanly = results.every(
    (result) => result.status === 200 || result.status === 413,
  );
  const healthyAfterRun = await verifyServerStillHealthy("198.51.210.250");
  const passed =
    allAcceptedOrRejectedCleanly &&
    healthyAfterRun &&
    peakRssMb < 1_280;

  return {
    details: {
      durationsMs: results.map((result) => result.durationMs),
      peakRssMb,
      serverHealthyAfterRun: healthyAfterRun,
      statuses,
    },
    name: "Scenario 3: Large file attack",
    passed,
  };
}

async function runScenarioSlowQueryAttack(): Promise<ScenarioSummary> {
  const attackRequest = buildMultipartRequest({
    fields: {
      query:
        "WITH RECURSIVE t(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM t) SELECT * FROM t",
    },
    files: [
      {
        content: "id\n1\n",
        filename: "attack.csv",
      },
    ],
  });
  const attackPromises = Array.from({ length: 5 }, (_, index) =>
    postMultipartRequest({
      body: attackRequest.body,
      contentType: attackRequest.contentType,
      ip: `198.51.220.${index + 1}`,
    }),
  );

  await new Promise((resolve) => setTimeout(resolve, 1_000));

  const legitimateRequest = buildSmallQueryRequest();
  const legitimateDuringAttack = await postMultipartRequest({
    body: legitimateRequest.body,
    contentType: legitimateRequest.contentType,
    ip: "198.51.221.1",
  });
  const attackResults = await Promise.all(attackPromises);
  const maxAttackDurationMs = Math.max(
    ...attackResults.map((result) => result.durationMs),
  );
  const timeoutWindowMs = 35_000;
  const passed =
    attackResults.every((result) => result.status === 408) &&
    maxAttackDurationMs <= timeoutWindowMs &&
    legitimateDuringAttack.status === 200 &&
    legitimateDuringAttack.durationMs < 10_000;

  return {
    details: {
      attackDurationsMs: attackResults.map((result) => result.durationMs),
      attackStatuses: attackResults.map((result) => result.status),
      legitimateDuringAttackDurationMs: legitimateDuringAttack.durationMs,
      legitimateDuringAttackStatus: legitimateDuringAttack.status,
      timeoutWindowMs,
    },
    name: "Scenario 4: Slow query attack",
    passed,
  };
}

async function main(): Promise<void> {
  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await ensureProductionBuild();

  let server: ChildProcessWithoutNullStreams | null = null;

  try {
    server = await startProductionServer();
    ensure(server.pid, "The production server did not expose a PID.");

    const summaries: ScenarioSummary[] = [];

    console.log("Starting Scenario 1: Normal load");
    summaries.push(await runScenarioNormalLoad());
    console.log("Completed Scenario 1");

    console.log("Starting Scenario 2: Rate limit storm");
    summaries.push(await runScenarioRateLimitStorm());
    console.log("Completed Scenario 2");

    console.log("Starting Scenario 3: Large file attack");
    summaries.push(await runScenarioLargeUpload(server.pid));
    console.log("Completed Scenario 3");

    console.log("Starting Scenario 4: Slow query attack");
    summaries.push(await runScenarioSlowQueryAttack());
    console.log("Completed Scenario 4");

    const output = {
      baseUrl: BASE_URL,
      generatedAt: new Date().toISOString(),
      scenarios: summaries,
    };

    await writeFile(
      path.join(ARTIFACTS_DIR, "load-test-results.json"),
      `${JSON.stringify(output, null, 2)}\n`,
      "utf8",
    );

    console.log(JSON.stringify(output, null, 2));

    if (!summaries.every((summary) => summary.passed)) {
      process.exitCode = 1;
    }
  } finally {
    if (server) {
      await stopProcess(server);
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
