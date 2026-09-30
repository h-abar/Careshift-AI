import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("claims lifecycle", () => {
  test("insurance: view claims, open detail, change status", async ({
    page,
  }) => {
    await loginAs(page, "insurance");
    await page.goto("/insurance");
    // claims table renders rows
    await expect(page.locator("tbody tr").first()).toBeVisible({
      timeout: 15_000,
    });
    // open first claim detail
    await page
      .getByRole("button", { name: /detail|تفاصيل|claim/i })
      .first()
      .click();
    await expect(
      page.locator("text=/history|سجل|السجل/i").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("insurance: upload a document to a claim", async ({ page }) => {
    await loginAs(page, "insurance");
    await page.goto("/insurance");
    await page
      .getByRole("button", { name: /detail|تفاصيل|claim/i })
      .first()
      .click();
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count()) {
      // minimal valid PNG (1x1)
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      await fileInput.setInputFiles({
        name: "evidence.png",
        mimeType: "image/png",
        buffer: png,
      });
      await expect(
        page.locator("text=/evidence\\.png/i"),
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});
