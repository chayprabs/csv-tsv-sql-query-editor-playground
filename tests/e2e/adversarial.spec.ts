import { expect, test } from "@playwright/test";

import {
  expectHealthyPage,
  installPageHealthTracker,
  openHome,
  runQuery,
  takeNamedScreenshot,
  uploadFiles,
} from "./helpers";

test.describe("adversarial inputs", () => {
  test("binary content disguised as csv is rejected without crashing the app", async ({
    page,
  }) => {
    const tracker = installPageHealthTracker(page);

    await openHome(page);
    await uploadFiles(page, ["binary_masquerade.csv"]);
    await runQuery(page);

    await expect(
      page.getByText(/Only text-based CSV and TSV files are supported/),
    ).toBeVisible();

    await takeNamedScreenshot(page, "adversarial-binary-upload");
    await expectHealthyPage(tracker);
  });

  test("malformed quoted csv surfaces a parse error instead of a crash", async ({ page }) => {
    const tracker = installPageHealthTracker(page);

    await openHome(page);
    await uploadFiles(page, ["broken_quotes.csv"]);

    await expect(page.getByText(/Failed to parse delimited data/)).toBeVisible();
    await runQuery(page);

    await expect(
      page.getByText(/Failed to parse one or more uploaded files\./),
    ).toBeVisible();

    await takeNamedScreenshot(page, "adversarial-broken-quotes");
    await expectHealthyPage(tracker);
  });

  test("reserved-word columns remain queryable when quoted", async ({ page }) => {
    const tracker = installPageHealthTracker(page);

    await openHome(page);
    await uploadFiles(page, ["database_reserved_words.csv"]);
    await runQuery(
      page,
      'SELECT "select", "from", "order" FROM database_reserved_words ORDER BY "select"',
    );

    await expect(page.getByRole("cell", { name: "north" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "20" })).toBeVisible();

    await takeNamedScreenshot(page, "adversarial-reserved-columns");
    await expectHealthyPage(tracker);
  });

  test("latin1 input and export-like formula cells remain stable through querying", async ({
    page,
  }) => {
    const tracker = installPageHealthTracker(page);

    await openHome(page);
    await page.getByLabel("Input encoding").selectOption("latin1");
    await uploadFiles(page, ["latin1_customers.csv", "formula_cells.csv"]);

    await runQuery(
      page,
      [
        "SELECT c.name, c.city, f.formula_like_value",
        "FROM latin1_customers c",
        'JOIN formula_cells f ON c.customer_id = f.id',
        "ORDER BY c.customer_id",
      ].join("\n"),
    );

    await expect(page.getByRole("cell", { name: "Pe�a" })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "Peña" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "=SUM(A1:A2)" })).toBeVisible();

    await takeNamedScreenshot(page, "adversarial-latin1-and-formulas");
    await expectHealthyPage(tracker);
  });

  test("uploading more than twenty files returns a clear limit error", async ({ page }) => {
    const tracker = installPageHealthTracker(page);

    await openHome(page);
    await uploadFiles(
      page,
      Array.from({ length: 21 }, (_, index) =>
        `boundary_file_${String(index + 1).padStart(2, "0")}.csv`,
      ),
    );

    await runQuery(page, "SELECT 1");

    await expect(
      page.getByText(/Too many files uploaded\. Maximum is 20\./),
    ).toBeVisible();

    await takeNamedScreenshot(page, "adversarial-too-many-files");
    await expectHealthyPage(tracker);
  });
});
