import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { api, loginAs } from "./helpers";

/**
 * Phase 3 item 1 — WCAG 2.1 AA audit: every page × every role, with the
 * color-contrast rule ENABLED (0 serious/critical required).
 */

async function axePage(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await page.waitForTimeout(800); // let data settle
  const res = await new AxeBuilder({ page }).analyze();
  const bad = res.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    bad.map(
      (v) =>
        `${path}: ${v.id} (${v.impact}) — ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    ),
  ).toEqual([]);
}

/** First handoff id the role can see, or null. */
async function anyHandoffId(page: import("@playwright/test").Page) {
  const { status, json } = await api<{ handoffs?: { id: string }[] }>(
    page,
    "GET",
    "/api/handoffs",
  );
  return status === 200 ? (json.handoffs?.[0]?.id ?? null) : null;
}

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

  test("axe: login screen (unauthenticated, both dirs)", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator('input[autocomplete="username"]'),
    ).toBeVisible();
    await page.waitForTimeout(400);
    let res = await new AxeBuilder({ page }).analyze();
    let bad = res.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      bad.map((v) => `login(ar): ${v.id} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
    ).toEqual([]);
    // LTR variant — the login screen toggle reads "English" in ar mode
    await page
      .getByRole("button", { name: /English|العربية/ })
      .first()
      .click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    res = await new AxeBuilder({ page }).analyze();
    bad = res.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      bad.map((v) => `login(en): ${v.id} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
    ).toEqual([]);
  });

  test("axe: admin pages", async ({ page }) => {
    await loginAs(page, "admin");
    for (const path of [
      "/users",
      "/audit",
      "/settings",
      "/rules/general",
      "/references/scientific",
    ]) {
      await axePage(page, path);
    }
  });

  test("axe: doctor pages", async ({ page }) => {
    await loginAs(page, "doctor");
    for (const path of ["/", "/patients", "/patient/P-1042", "/interventions", "/handoffs", "/reports"]) {
      await axePage(page, path);
    }
  });

  for (const who of ["charge", "nurse"] as const) {
    test(`axe: ${who} pages`, async ({ page }) => {
      await loginAs(page, who);
      for (const path of ["/", "/patients", "/patient/P-1042", "/interventions", "/handoffs"]) {
        await axePage(page, path);
      }
      const hid = await anyHandoffId(page);
      if (hid) await axePage(page, `/handoffs/${hid}`);
    });
  }

  // E7 replaces this with the /payer portal — until then the payer's
  // reachable surface is the shared reference pages only.
  test("axe: payer pages", async ({ page }) => {
    await loginAs(page, "payer");
    for (const path of ["/terms", "/rules/general", "/references/scientific"]) {
      await axePage(page, path);
    }
  });

  test("axe: hospital admin pages", async ({ page }) => {
    await loginAs(page, "hospital_admin");
    for (const path of ["/reports", "/audit", "/claims"]) {
      await axePage(page, path);
    }
  });
});
