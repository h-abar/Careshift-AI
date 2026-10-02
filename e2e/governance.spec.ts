import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { api, login, loginAs, CREDS } from "./helpers";

/**
 * B6 — governance pages: render ar+en, axe 0 serious/critical,
 * terms acceptance flow, and rule thresholds identical to the KB seed
 * the engines execute.
 */

const PAGES = [
  "/rules/calculation",
  "/rules/general",
  "/terms",
  "/references/scientific",
  "/references/technical",
];

async function axeClean(page: import("@playwright/test").Page, tag: string) {
  const res = await new AxeBuilder({ page }).analyze();
  const bad = res.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    bad.map((v) => `${tag}: ${v.id} (${v.impact})`),
  ).toEqual([]);
}

test.describe("B6 governance pages", () => {
  for (const p of PAGES) {
    test(`${p} renders ar (RTL) + en (LTR), axe clean`, async ({ page }) => {
      await loginAs(page, "admin");
      // default locale is Arabic
      await page.goto(p);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("body")).toContainText(/\S/);
      await page.waitForTimeout(600);
      await axeClean(page, `${p} ar`);

      await page.evaluate(() =>
        localStorage.setItem("careshift-lang", "en"),
      );
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
      await page.waitForTimeout(600);
      await axeClean(page, `${p} en`);
    });
  }

  test("terms acceptance flow: gate → accept → session records version", async ({
    page,
  }) => {
    // login WITHOUT the auto-accept helper so the gate is exercised
    await login(page, CREDS.insurance.u, CREDS.insurance.p);
    const consent = page.getByRole("dialog", {
      name: /simulated data|بيانات محاكاة/i,
    });
    if (await consent.isVisible().catch(() => false)) {
      await consent
        .getByRole("button", { name: /understand|متابعة/i })
        .click();
    }
    const gate = page.getByRole("dialog", {
      name: /terms of use|شروط الاستخدام/i,
    });
    await expect(gate).toBeVisible({ timeout: 10_000 });
    await gate.getByRole("button", { name: /accept|أوافق/i }).click();
    await expect(gate).not.toBeVisible();

    const { json } = await api<{ user: { termsVersion: string } }>(
      page, "GET", "/api/auth/session",
    );
    expect(json.user.termsVersion.length).toBeGreaterThan(0);
    const { json: tj } = await api<{ version: string }>(
      page, "GET", "/api/terms",
    );
    expect(json.user.termsVersion).toBe(tj.version);
  });

  test("calculation page serves the exact seeded rule logic the engine runs", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    const { status, json } = await api<{
      rules: { key: string; versions: { logic: unknown }[] }[];
    }>(page, "GET", "/api/rules/calculation");
    expect(status).toBe(200);

    const seed = JSON.parse(
      readFileSync("knowledge/seed/rules.json", "utf-8"),
    ) as { rules: { key: string; logic: unknown }[] };
    for (const sr of seed.rules) {
      const served = json.rules.find((r) => r.key === sr.key);
      expect(served, `missing rule ${sr.key}`).toBeTruthy();
      expect(served!.versions[0].logic).toEqual(sr.logic);
    }
  });
});
