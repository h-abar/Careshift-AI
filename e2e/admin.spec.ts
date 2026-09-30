import { expect, test } from "@playwright/test";
import { api, loginAs } from "./helpers";

test.describe("admin workflows", () => {
  test("create user → view-as → suspend kills session → reset password → audit", async ({
    page,
    browser,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/users");

    // create user
    await page
      .getByRole("button", { name: /Add user|إضافة مستخدم/ })
      .click();
    const dlg = page.locator('[role="dialog"]');
    await dlg.locator("input").nth(0).fill("e2e.user");
    await dlg.locator("input").nth(1).fill("E2E User");
    await dlg.locator("input").nth(2).fill("مستخدم تجريبي");
    await dlg.locator("input").nth(3).fill("EMP-9999");
    await dlg.locator("input").nth(4).fill("e2e@hospital.sa");
    await dlg.locator("input").nth(5).fill("+966500000000");
    await dlg.locator("input").nth(6).fill("E2e@Pass1");
    await dlg
      .getByRole("button", { name: /save|حفظ/i })
      .click();
    await expect(dlg).not.toBeVisible({ timeout: 10_000 });

    // user appears in the list (row shows name + employeeId, not username)
    await page.getByLabel(/Search for a user|ابحث عن مستخدم/).fill("e2e.user");
    await expect(page.locator("text=EMP-9999")).toBeVisible({ timeout: 15_000 });

    // view-as (U-007 is still active here): start → banner → stop
    await page.getByLabel("user menu").click();
    await page.locator("text=/رانيا يوسف|Rania Yousef/").first().click();
    await expect(
      page.locator("text=/Viewing as|تعرض الآن/"),
    ).toBeVisible({ timeout: 10_000 });
    await page
      .getByRole("button", { name: /Return to admin|العودة لحساب المدير/ })
      .click();
    await expect(
      page.locator("text=/Viewing as|تعرض الآن/"),
    ).not.toBeVisible();

    // suspend→reactivate guarded by finally so U-007 is always restored
    // for the clinical spec (nurse2 login + handoff incoming).
    try {
      // log in nurse2 in a second context BEFORE suspending them
      const ctx = await browser.newContext();
      const p2 = await ctx.newPage();
      await loginAs(p2, "nurse2");

      const resp = await api(page, "PATCH", "/api/users/U-007", {
        status: "suspended",
      });
      expect(resp.status).toBe(200);

      // suspended user's live session dies on next navigation
      await p2.goto("/patients");
      await expect(
        p2.locator('input[autocomplete="username"]'),
      ).toBeVisible({ timeout: 15_000 });
      await ctx.close();

      // reset password on the TEST user (not U-007 — its creds are used
      // by the clinical spec) → temp password returned once
      const users = await api<{ users: { id: string; username: string }[] }>(
        page, "GET", "/api/users?q=e2e.user",
      );
      const newId = users.json.users.find((u) => u.username === "e2e.user")?.id;
      expect(newId).toBeTruthy();
      const r = await api<{ tempPassword?: string }>(
        page,
        "POST",
        `/api/users/${newId}/reset-password`,
        {},
      );
      expect(r.status).toBe(200);
      expect(r.json.tempPassword).toBeTruthy();
    } finally {
      const re = await api(page, "PATCH", "/api/users/U-007", {
        status: "active",
      });
      expect(re.status).toBe(200);
    }

    // audit page lists the actions (localized labels)
    await page.goto("/audit");
    await expect(
      page.locator("tbody").locator("text=/Updated user|تعديل مستخدم/").first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page
        .locator("tbody")
        .locator("text=/Viewed as|عرض بصلاحية/")
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
