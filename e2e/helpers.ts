import { expect, type Page } from "@playwright/test";

export const CREDS = {
  admin: { u: "o.khalil", p: "Demo@8895" },
  physician: { u: "a.salem", p: "Demo@1021" },
  charge: { u: "k.mohammed", p: "Demo@3310" },
  nurse: { u: "s.ahmed", p: "Demo@2088" },
  nurse2: { u: "r.yousef", p: "Demo@7704" },
  insurance: { u: "m.alotaibi", p: "Demo@5542" },
  hosp: { u: "f.shammari", p: "Demo@6613" },
  suspended: { u: "r.farouk", p: "Demo@9012" },
};

export async function login(page: Page, u: string, p: string) {
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(u);
  await page.locator('input[autocomplete="current-password"]').fill(p);
  await page.locator('button[type="submit"]').click();
}

export async function loginAs(page: Page, who: keyof typeof CREDS) {
  await login(page, CREDS[who].u, CREDS[who].p);
  // signed-in shell = the user menu button appears
  await expect(page.getByLabel("user menu")).toBeVisible({ timeout: 15_000 });
}

/** Same-origin API call in the page context (sends the httpOnly session cookie). */
export function api<T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: T }> {
  return page.evaluate(
    async ([m, p, b]) => {
      const r = await fetch(p as string, {
        method: m as string,
        headers: b !== undefined ? { "Content-Type": "application/json" } : {},
        body: b !== undefined ? JSON.stringify(b) : undefined,
      });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    },
    [method, path, body] as const,
  ) as Promise<{ status: number; json: T }>;
}

export async function logout(page: Page) {
  await page.getByLabel("user menu").click();
  await page
    .getByRole("button", { name: /sign out|تسجيل الخروج/i })
    .click();
  await expect(page.locator('input[autocomplete="username"]')).toBeVisible();
}
