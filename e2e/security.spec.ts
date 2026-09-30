import { expect, test } from "@playwright/test";
import { api, loginAs } from "./helpers";

/**
 * Phase 3 item 2 — security headers asserted end-to-end on the real
 * production server: nonce CSP on documents, restrictive CSP on API,
 * HSTS/XFO/Referrer-Policy/Permissions-Policy/COOP/CORP/nosniff.
 */
test.describe("security headers", () => {
  test("document responses carry a nonce-based strict CSP + hardening headers", async ({
    page,
  }) => {
    const res = await page.request.get("/");
    expect(res.status()).toBe(200);
    const h = res.headers();

    const csp = h["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    // no unsafe-inline for scripts
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval"); // production build
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");

    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["cross-origin-resource-policy"]).toBe("same-origin");
    expect(h["strict-transport-security"]).toContain("max-age=63072000");
  });

  test("the rendered page stamps the nonce on framework scripts", async ({
    page,
  }) => {
    // Browsers strip the nonce attribute from the DOM — inspect raw HTML.
    const res = await page.request.get("/");
    const html = await res.text();
    const csp = res.headers()["content-security-policy"] ?? "";
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    // Framework scripts carry the same nonce → CSP-sanctioned.
    expect(html).toContain(`nonce="${nonce}"`);
    // Sanity: the app actually boots under the CSP in a real browser.
    await page.goto("/");
    await expect(
      page.locator('input[autocomplete="username"]'),
    ).toBeVisible();
    // and no CSP violations fired
    const violations: string[] = [];
    page.on("console", (m) => {
      if (m.text().toLowerCase().includes("content security policy"))
        violations.push(m.text());
    });
    await page.reload();
    await page.waitForTimeout(800);
    expect(violations).toEqual([]);
  });

  test("API responses get a restrictive CSP + nosniff", async ({ page }) => {
    await loginAs(page, "admin");
    const { status } = await api(page, "GET", "/api/patients");
    expect(status).toBe(200);
    // read the real response headers via a direct request replay
    const headers = await page.evaluate(async () => {
      const r = await fetch("/api/patients");
      return {
        csp: r.headers.get("content-security-policy"),
        nosniff: r.headers.get("x-content-type-options"),
        xfo: r.headers.get("x-frame-options"),
      };
    });
    expect(headers.csp).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(headers.nosniff).toBe("nosniff");
    expect(headers.xfo).toBe("DENY");
  });
});

test.describe("CSRF", () => {
  test("cross-origin POST with a session cookie → 403", async ({ page }) => {
    await loginAs(page, "nurse");
    const cookie = (await page.context().cookies()).find(
      (c) => c.name === "cs_session",
    );
    expect(cookie).toBeTruthy();
    const res = await page.request.post("/api/interventions/P-1042-s0", {
      headers: {
        cookie: `${cookie!.name}=${cookie!.value}`,
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      data: { action: "start" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("csrf");
    // same-origin control request → not 403
    const ok = await page.request.post("/api/interventions/P-1042-s0", {
      headers: {
        cookie: `${cookie!.name}=${cookie!.value}`,
        "content-type": "application/json",
      },
      data: { action: "start" },
    });
    expect(ok.status()).not.toBe(403);
  });
});
