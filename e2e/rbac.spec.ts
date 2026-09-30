import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

const HOME = /\/$/;

test.describe("RBAC — nav visibility + direct URLs", () => {
  test("nurse: no admin/insurance nav, direct /users blocked", async ({
    page,
  }) => {
    await loginAs(page, "nurse");
    await expect(page.locator('a[href="/patients"]').first()).toBeVisible();
    await expect(page.locator('a[href="/users"]')).toHaveCount(0);
    await expect(page.locator('a[href="/audit"]')).toHaveCount(0);
    await expect(page.locator('a[href="/insurance"]')).toHaveCount(0);

    // proxy redirects unauthorized page visits back to "/"
    await page.goto("/users");
    await expect(page).toHaveURL(HOME);
    await page.goto("/insurance");
    await expect(page).toHaveURL(HOME);
  });

  test("insurance: claims visible, patients/admin denied", async ({ page }) => {
    await loginAs(page, "insurance");
    await expect(page.locator('a[href="/insurance"]').first()).toBeVisible();
    await expect(page.locator('a[href="/patients"]')).toHaveCount(0);
    await page.goto("/patients");
    await expect(page).toHaveURL(HOME);
    await page.goto("/audit");
    await expect(page).toHaveURL(HOME);
  });

  test("physician: clinical pages ok, no claims", async ({ page }) => {
    await loginAs(page, "physician");
    await expect(page.locator('a[href="/patients"]').first()).toBeVisible();
    await expect(page.locator('a[href="/handoffs"]').first()).toBeVisible();
    await expect(page.locator('a[href="/insurance"]')).toHaveCount(0);
    await page.goto("/insurance");
    await expect(page).toHaveURL(HOME);
  });

  test("unauthenticated /patients redirects to login", async ({ page }) => {
    await page.goto("/patients");
    await expect(
      page.locator('input[autocomplete="username"]'),
    ).toBeVisible();
  });
});
