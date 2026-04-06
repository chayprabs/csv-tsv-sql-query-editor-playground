import { expect, test } from "@playwright/test";

import {
  expectHealthyPage,
  expectRowCount,
  installPageHealthTracker,
  openHome,
  runQuery,
  takeNamedScreenshot,
  uploadFiles,
} from "./helpers";

test.describe("unhappy paths", () => {
  test("clearing files removes prior state and a stale table name fails cleanly", async ({
    page,
  }) => {
    const tracker = installPageHealthTracker(page);

    await openHome(page);
    await uploadFiles(page, ["analyst_employees.csv"]);
    await runQuery(page);
    await expectRowCount(page, 4);

    await page.getByRole("button", { name: /clear files/i }).click();
    await expect(page.getByText("Ready for the first query")).toBeVisible();

    await uploadFiles(page, ["join_orders.csv"]);
    await runQuery(page, "SELECT * FROM analyst_employees");
    await expect(
      page.getByText(/The query referenced a table that was not loaded\./),
    ).toBeVisible();

    await runQuery(page, "SELECT COUNT(*) AS cnt FROM join_orders");
    await expect(page.getByRole("cell", { name: "4" })).toBeVisible();

    await takeNamedScreenshot(page, "unhappy-clear-and-recover");
    await expectHealthyPage(tracker);
  });

  test("rapid repeated clicks only submit one in-flight query", async ({ page }) => {
    const tracker = installPageHealthTracker(page);
    let requestCount = 0;

    await page.route("**/api/query", async (route) => {
      requestCount += 1;
      await route.continue();
    });

    await openHome(page);
    await uploadFiles(page, ["analyst_employees.csv"]);

    await page.locator("button[type='submit']").evaluate((button) => {
      const htmlButton = button as HTMLButtonElement;

      for (let index = 0; index < 5; index += 1) {
        htmlButton.click();
      }
    });

    await expectRowCount(page, 4);
    expect(requestCount).toBe(1);

    await takeNamedScreenshot(page, "unhappy-rapid-submit");
    await expectHealthyPage(tracker);
  });

  test("network failure during query submission shows a user-visible error", async ({
    page,
  }) => {
    const tracker = installPageHealthTracker(page);

    await openHome(page);
    await uploadFiles(page, ["analyst_employees.csv"]);

    await page.route("**/api/query", async (route) => {
      await route.abort();
    });

    await runQuery(page);

    await expect(page.getByText(/failed to fetch|network/i)).toBeVisible();

    await takeNamedScreenshot(page, "unhappy-network-failure");
    await expectHealthyPage(tracker, {
      ignoredFailedRequestPatterns: [/POST .*\/api\/query :: /],
    });
  });

  test("two tabs can query different files without contaminating each other", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const firstPage = await context.newPage();
    const secondPage = await context.newPage();
    const firstTracker = installPageHealthTracker(firstPage);
    const secondTracker = installPageHealthTracker(secondPage);

    await openHome(firstPage);
    await openHome(secondPage);

    await uploadFiles(firstPage, ["analyst_employees.csv"]);
    await uploadFiles(secondPage, ["join_orders.csv"]);

    await runQuery(firstPage, "SELECT name FROM analyst_employees ORDER BY employee_id");
    await runQuery(secondPage, "SELECT status, COUNT(*) AS cnt FROM join_orders GROUP BY status ORDER BY status");

    await expect(firstPage.getByRole("cell", { name: "Alice" })).toBeVisible();
    await expect(secondPage.getByRole("cell", { name: "paid" })).toBeVisible();
    await expect(secondPage.getByText("analyst_employees")).toHaveCount(0);

    await takeNamedScreenshot(firstPage, "unhappy-two-tabs-first");
    await takeNamedScreenshot(secondPage, "unhappy-two-tabs-second");
    await expectHealthyPage(firstTracker);
    await expectHealthyPage(secondTracker);

    await context.close();
  });
});
