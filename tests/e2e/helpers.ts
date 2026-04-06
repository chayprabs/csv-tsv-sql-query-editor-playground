import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";

import { generatedFixturePath } from "../helpers/generatedFixtures.ts";

export interface PageHealthTracker {
  consoleErrors: string[];
  failedRequests: string[];
}

export function fixturePath(filename: string): string {
  return generatedFixturePath(filename);
}

export function installPageHealthTracker(page: Page): PageHealthTracker {
  const tracker: PageHealthTracker = {
    consoleErrors: [],
    failedRequests: [],
  };

  page.on("console", (message) => {
    if (message.type() === "error") {
      tracker.consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    tracker.consoleErrors.push(String(error));
  });

  page.on("requestfailed", (request) => {
    tracker.failedRequests.push(
      `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "failed"}`,
    );
  });

  return tracker;
}

export async function expectHealthyPage(
  tracker: PageHealthTracker,
  options: {
    ignoredFailedRequestPatterns?: RegExp[];
  } = {},
): Promise<void> {
  expect(tracker.consoleErrors).toEqual([]);

  const ignoredPatterns = options.ignoredFailedRequestPatterns ?? [];
  const unexpectedFailures = tracker.failedRequests.filter(
    (failure) => !ignoredPatterns.some((pattern) => pattern.test(failure)),
  );

  expect(unexpectedFailures).toEqual([]);
}

export async function openHome(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Query raw CSV and TSV files with SQLite",
  );
}

export async function uploadFiles(page: Page, filenames: string[]): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(
    filenames.map((filename) => fixturePath(filename)),
  );
}

export async function fillQuery(page: Page, query: string): Promise<void> {
  await page.getByRole("textbox").fill(query);
}

export async function runQuery(page: Page, query?: string): Promise<void> {
  if (query !== undefined) {
    await fillQuery(page, query);
  }

  await page.getByRole("button", { name: /run query/i }).click();
}

export async function expectRowCount(page: Page, count: number): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 2 }).filter({
      hasText: `${count} row${count === 1 ? "" : "s"} returned`,
    }),
  ).toBeVisible();
}

export function resultsRegion(page: Page): Locator {
  return page.locator("section").filter({ has: page.getByText(/^Results$/) }).first();
}

export async function takeNamedScreenshot(page: Page, name: string): Promise<void> {
  const directory = path.join(process.cwd(), "artifacts", "playwright");
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, `${name}.png`);
  await page.screenshot({
    fullPage: true,
    path: outputPath,
  });
}
