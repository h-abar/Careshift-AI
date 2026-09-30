import { expect, test } from "@playwright/test";
import { api, loginAs } from "./helpers";

test.describe("clinical workflows", () => {
  test("handoff: create → review → sign-off → accept", async ({ page }) => {
    await loginAs(page, "charge");
    await page.goto("/handoffs");
    await page
      .getByRole("button", { name: /New handoff|تسليم جديد/ })
      .click();

    // step 0: dept/shift defaults → next
    await page.getByRole("button", { name: /Next|التالي/ }).click();
    // step 1: outgoing = U-002 (nurse), incoming = U-007 (nurse2)
    const dialog = page.locator('[role="dialog"]');
    await dialog.locator("select").nth(0).selectOption("U-002");
    await dialog.locator("select").nth(1).selectOption("U-007");
    await page.getByRole("button", { name: /Next|التالي/ }).click();
    // step 2: pick P-1042
    await page.getByLabel("P-1042").check();
    await page
      .getByRole("button", { name: /Create handoff|إنشاء التسليم/ })
      .click();
    await expect(
      dialog.locator("text=/تم إنشاء التسليم|handoff created/i"),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "✓" }).click();

    // open the handoff we just created (list order is by id, not recency)
    const list = await api<{
      handoffs: { id: string; outgoingId: string; incomingId: string; status: string }[];
    }>(page, "GET", "/api/handoffs");
    const { handoffs } = list.json;
    const mine = handoffs.find(
      (h: { outgoingId: string; incomingId: string; status: string }) =>
        h.outgoingId === "U-002" && h.incomingId === "U-007" &&
        h.status === "pending",
    );
    if (!mine) throw new Error("created handoff not found in /api/handoffs");
    await page.goto(`/handoffs/${mine.id}`);
    // mark every patient reviewed (labelled "Completed/مكتمل") — each check
    // PATCHes + refetches, so re-query with .nth each iteration
    const reviewed = page.getByLabel(/^(مكتمل|Completed)$/);
    await reviewed.first().waitFor({ state: "visible", timeout: 15_000 });
    const n = await reviewed.count();
    for (let i = 0; i < n; i++) {
      const b = reviewed.nth(i);
      if (!(await b.isChecked())) {
        await b.click(); // PATCH+refetch races check() — poll instead
        await expect(b).toBeChecked({ timeout: 10_000 });
      }
    }
    // required checklist items (labels start with "Reviewed/راجعتُ")
    const checklist = page.getByLabel(/^(راجعتُ|Reviewed )/);
    const m = await checklist.count();
    for (let i = 0; i < m; i++) {
      const b = checklist.nth(i);
      if (!(await b.isChecked())) {
        await b.click();
        await expect(b).toBeChecked({ timeout: 10_000 });
      }
    }
    await page
      .getByRole("button", { name: /Sign off|توقيع التسليم/ })
      .click();
    await expect(
      page.locator("text=/signed_off|تم التوقيع/i"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("handoff accept by the incoming nurse", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, "nurse2");
    await page.goto("/handoffs");
    const list = await api<{
      handoffs: { id: string; incomingId: string; status: string }[];
    }>(page, "GET", "/api/handoffs");
    const mine = list.json.handoffs.find(
      (h) => h.incomingId === "U-007" && h.status === "signed_off",
    );
    if (!mine) throw new Error("no signed_off handoff for U-007");
    await page.goto(`/handoffs/${mine.id}`);
    await page
      .getByRole("button", { name: /Accept|قبول التسليم/ })
      .click();
    await expect(
      page.locator("text=/accepted|مقبول|مكتمل|completed/i"),
    ).toBeVisible({ timeout: 10_000 });
    await ctx.close();
  });

  test("risk: reassess P-1042 → notification for assignee → acknowledge", async ({
    page,
    browser,
  }) => {
    await loginAs(page, "physician");
    await page.goto("/patient/P-1042");
    await page
      .getByRole("button", { name: /Reassess|إعادة تقييم/ })
      .click();
    await page.waitForTimeout(1000);

    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await loginAs(p2, "nurse"); // U-002 is assigned to P-1042
    // notification bell → dropdown has items
    await p2
      .getByRole("button", { name: /Notifications|الإشعارات/ })
      .click();
    await expect(
      p2.locator("ul li").first(),
    ).toBeVisible({ timeout: 10_000 });
    // mark all read
    await p2
      .getByRole("button", { name: /Mark all read|تحديد الكل/ })
      .click();
    await ctx.close();
  });

  test("interventions: nurse sees no escalate control", async ({ page }) => {
    await loginAs(page, "nurse");
    await page.goto("/interventions");
    await expect(
      page.getByRole("button", { name: /Escalate|تصعيد/ }),
    ).toHaveCount(0);
  });
});
