import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

// E1 — forbidden pages return a real Arabic 403 (not a redirect).
const DENIED = /غير مصرّح|403/;

test.describe("RBAC — nav visibility + direct URLs", () => {
  test("nurse: no admin/claims nav, direct /users is 403", async ({
    page,
  }) => {
    await loginAs(page, "nurse");
    await expect(page.locator('a[href="/patients"]').first()).toBeVisible();
    await expect(page.locator('a[href="/users"]')).toHaveCount(0);
    await expect(page.locator('a[href="/audit"]')).toHaveCount(0);
    await expect(page.locator('a[href="/claims"]')).toHaveCount(0);

    const r1 = await page.goto("/users");
    expect(r1?.status()).toBe(403);
    await expect(page.locator("body")).toContainText(DENIED);
    const r2 = await page.goto("/claims");
    expect(r2?.status()).toBe(403);
  });

  test("payer: claims portal only — no patients, no audit", async ({
    page,
  }) => {
    await loginAs(page, "payer");
    // Payer never sees clinical navigation.
    await expect(page.locator('a[href="/patients"]')).toHaveCount(0);
    await expect(page.locator('a[href="/handoffs"]')).toHaveCount(0);
    await expect(page.locator('a[href="/users"]')).toHaveCount(0);

    const r1 = await page.goto("/patients");
    expect(r1?.status()).toBe(403);
    const r2 = await page.goto("/audit");
    expect(r2?.status()).toBe(403);
  });

  test("doctor: clinical pages ok, claims monitor denied", async ({
    page,
  }) => {
    await loginAs(page, "doctor");
    await expect(page.locator('a[href="/patients"]').first()).toBeVisible();
    await expect(page.locator('a[href="/handoffs"]').first()).toBeVisible();
    await expect(page.locator('a[href="/claims"]')).toHaveCount(0);
    const r = await page.goto("/claims");
    expect(r?.status()).toBe(403);
  });

  test("unauthenticated /patients redirects to login", async ({ page }) => {
    await page.goto("/patients");
    await expect(
      page.locator('input[autocomplete="username"]'),
    ).toBeVisible();
  });
});
