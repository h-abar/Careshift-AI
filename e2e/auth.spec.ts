import { expect, test } from "@playwright/test";
import { CREDS, login, loginAs, logout } from "./helpers";

test.describe("auth", () => {
  test("admin logs in and sees the shell", async ({ page }) => {
    await loginAs(page, "admin");
    await expect(page.locator('a[href="/patients"]').first()).toBeVisible();
    await expect(page.locator('a[href="/audit"]').first()).toBeVisible();
  });

  test("logout returns to the login screen", async ({ page }) => {
    await loginAs(page, "nurse");
    await logout(page);
  });

  test("wrong password shows an error", async ({ page }) => {
    await login(page, CREDS.nurse.u, "wrong-password");
    await expect(page.locator("text=/⚠/")).toBeVisible();
  });

  test("suspended user is blocked", async ({ page }) => {
    await login(page, CREDS.suspended.u, CREDS.suspended.p);
    await expect(page.locator("text=/⚠/")).toBeVisible();
    await expect(page.getByLabel("user menu")).not.toBeVisible();
  });

  test("5 failed logins lock the username (429 → locked message)", async ({
    page,
  }) => {
    const victim = "lockout.e2e";
    for (let i = 0; i < 5; i++)
      await login(page, victim, `bad-${i}`);
    await login(page, victim, "bad-6");
    // locked message contains the lockout text (ar or en)
    await expect(
      page.locator("text=/locked|قفل/i"),
    ).toBeVisible();
  });
});
