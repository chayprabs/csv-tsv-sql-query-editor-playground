import { expect, test } from "@playwright/test";

import {
  expectHealthyPage,
  installPageHealthTracker,
  openHome,
} from "./helpers";

test.describe("share link", () => {
  test("URL hash restores query and export settings in a fresh visit", async ({
    page,
    context,
  }) => {
    const tracker = installPageHealthTracker(page);

    await openHome(page);
    await page.getByRole("textbox").fill("SELECT 1 AS one");

    await page.getByLabel("Input encoding").selectOption("latin1");

    await page.waitForFunction(() => window.location.hash.includes("query="));

    const sharedUrl = page.url();
    expect(sharedUrl).toContain("query=");

    const freshPage = await context.newPage();
    const freshTracker = installPageHealthTracker(freshPage);

    await freshPage.goto(sharedUrl);
    await expect(freshPage.getByRole("textbox")).toHaveValue("SELECT 1 AS one");
    await expect(freshPage.getByLabel("Input encoding")).toHaveValue("latin1");
    expect(freshPage.url()).toContain("inputEncoding=latin1");

    await expectHealthyPage(tracker);
    await expectHealthyPage(freshTracker);

    await freshPage.close();
  });
});
