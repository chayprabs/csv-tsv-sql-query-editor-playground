import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: [["list"]],
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      process.env.CI === "true"
        ? "npm run start -- --hostname 127.0.0.1 --port 3000"
        : "npm run dev -- --hostname 127.0.0.1 --port 3000",
    env: {
      FLATFILE_INLINE_QUERY_WORKER: "1",
      MAX_HEAP_MB: "2048",
      RATE_LIMIT_BANDWIDTH_MB_PER_HOUR: "4096",
      RATE_LIMIT_MAX_CONCURRENT_GLOBAL: "100",
      RATE_LIMIT_MAX_CONCURRENT_PER_IP: "100",
      RATE_LIMIT_REQUESTS_PER_MINUTE: "10000",
    },
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
