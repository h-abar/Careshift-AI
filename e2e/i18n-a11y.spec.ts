import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("i18n + a11y", () => {
  test("ar RTL → en LTR language switch", async ({ page }) => {
    await loginAs(page, "admin");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    // header toggle: "EN" when Arabic is active
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("axe: key pages have no serious/critical violations", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    for (const path of ["/", "/patients", "/users", "/insurance"]) {
      await page.goto(path);
      await page.waitForTimeout(800); // let data settle
      const res = await new AxeBuilder({ page })
        .disableRules(["color-contrast"]) // checked separately via palette
        .analyze();
      const bad = res.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        bad.map((v) => `${path}: ${v.id}`),
      ).toEqual([]);
    }
  });
});
