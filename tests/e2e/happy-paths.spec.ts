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

test.describe("happy paths", () => {
  test("landing surface shows privacy notice and bundled samples run a join query", async ({
    page,
  }) => {
    const tracker = installPageHealthTracker(page);

    await openHome(page);

    await expect(page.getByRole("note")).toContainText("never stored");

    const waitStudents = page.waitForResponse(
      (response) =>
        response.url().includes("/examples/students.csv") && response.ok(),
    );
    const waitExams = page.waitForResponse(
      (response) =>
        response.url().includes("/examples/exams.csv") && response.ok(),
    );

    await page.getByRole("button", { name: /load sample files/i }).click();

    await Promise.all([waitStudents, waitExams]);

    await expect(page.getByText("students.csv")).toBeVisible();
    await expect(page.getByText("exams.csv")).toBeVisible();

    await runQuery(page);
    await expectRowCount(page, 5);

    await takeNamedScreenshot(page, "happy-sample-join");
    await expectHealthyPage(tracker);
  });

  test("first-day analyst can upload a file, run a query, and download results", async ({
    page,
  }) => {
    const tracker = installPageHealthTracker(page);

    await openHome(page);
    await uploadFiles(page, ["analyst_employees.csv"]);

    await expect(page.getByText("analyst_employees.csv")).toBeVisible();
    await expect(page.getByText("employee_id: INTEGER")).toBeVisible();

    await runQuery(page);
    await expectRowCount(page, 4);
    await expect(page.getByRole("cell", { name: "Alice" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "salary" })).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /^download$/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("results.csv");

    await takeNamedScreenshot(page, "happy-analyst-single-file");
    await expectHealthyPage(tracker);
  });

  test("power user can join two uploads and aggregate by department", async ({
    page,
  }) => {
    const tracker = installPageHealthTracker(page);

    await openHome(page);
    await uploadFiles(page, ["analyst_employees.csv", "analyst_departments.csv"]);

    await runQuery(
      page,
      [
        "SELECT d.department_name, COUNT(*) AS headcount, ROUND(AVG(e.salary), 2) AS avg_salary",
        "FROM analyst_employees e",
        "JOIN analyst_departments d ON e.department_id = d.department_id",
        "GROUP BY d.department_name",
        "ORDER BY d.department_name",
      ].join("\n"),
    );

    await expectRowCount(page, 3);
    await expect(page.getByRole("cell", { name: "Engineering" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "2" }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "98250.13" })).toBeVisible();

    await takeNamedScreenshot(page, "happy-power-user-join");
    await expectHealthyPage(tracker);
  });

  test("mixed-format uploads can be queried with manual delimiter controls", async ({
    page,
  }) => {
    const tracker = installPageHealthTracker(page);

    await openHome(page);
    await uploadFiles(page, ["excel_semicolon.csv", "utf16_inventory.tsv"]);

    await page.getByLabel("Delimiter for excel_semicolon.csv").selectOption(";");

    await runQuery(
      page,
      [
        "SELECT",
        "  (SELECT COUNT(*) FROM excel_semicolon) AS semicolon_rows,",
        "  (SELECT COUNT(*) FROM utf16_inventory) AS inventory_rows",
      ].join("\n"),
    );

    await expectRowCount(page, 1);
    await expect(page.getByRole("cell", { name: "3" }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "2" }).first()).toBeVisible();

    await takeNamedScreenshot(page, "happy-mixed-format");
    await expectHealthyPage(tracker);
  });
});
