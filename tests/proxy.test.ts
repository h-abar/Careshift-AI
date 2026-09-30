/**
 * proxy.ts (Next.js 16 middleware) — page redirects by JWT role + API 401.
 * Pure function tests: NextRequest in, NextResponse out — no server needed.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { signSession, SESSION_COOKIE } from "@/lib/server/session";
import type { RoleKey } from "@/lib/types";

const req = (path: string, method = "GET", token?: string) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });

const jwt = (role: RoleKey) =>
  signSession({ sub: "U-X", sid: "sx", role });

// NextResponse.next() has no redirect Location; redirects have one.
const isRedirect = (r: { status: number; headers: Headers }) =>
  r.status === 307 || r.headers.get("location") !== null;

describe("proxy — API gate", () => {
  it("GET /api/patients without a session → 401 JSON", async () => {
    const r = await proxy(req("/api/patients"));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "unauthenticated" });
  });

  it("GET /api/patients with a valid session → passes through", async () => {
    const r = await proxy(req("/api/patients", "GET", await jwt("nurse")));
    expect(r.status).not.toBe(401);
  });

  it("GET /api/auth/session is public → not 401", async () => {
    const r = await proxy(req("/api/auth/session"));
    expect(r.status).not.toBe(401);
  });

  it("POST /api/auth/login is public → not 401", async () => {
    const r = await proxy(req("/api/auth/login", "POST"));
    expect(r.status).not.toBe(401);
  });

  it("POST /api/auth/session (non-GET) still requires a session → 401", async () => {
    const r = await proxy(req("/api/auth/session", "POST"));
    expect(r.status).toBe(401);
  });
});

describe("proxy — page gates by role", () => {
  it("no session → redirect /users to /", async () => {
    const r = await proxy(req("/users"));
    expect(isRedirect(r)).toBe(true);
    expect(r.headers.get("location")).toContain("/");
  });

  it("/demo is public → no redirect, no 401", async () => {
    const r = await proxy(req("/demo"));
    expect(isRedirect(r)).toBe(false);
  });

  it("insurance role → /patients redirects (no patients_view)", async () => {
    const r = await proxy(req("/patients", "GET", await jwt("insurance")));
    expect(isRedirect(r)).toBe(true);
  });

  it("insurance role → /insurance passes", async () => {
    const r = await proxy(req("/insurance", "GET", await jwt("insurance")));
    expect(isRedirect(r)).toBe(false);
  });

  it("nurse → /users redirects; admin → /users passes", async () => {
    const nurse = await proxy(req("/users", "GET", await jwt("nurse")));
    expect(isRedirect(nurse)).toBe(true);
    const admin = await proxy(req("/users", "GET", await jwt("admin")));
    expect(isRedirect(admin)).toBe(false);
  });

  it("nurse → /audit redirects; hospital_admin → /audit passes", async () => {
    const nurse = await proxy(req("/audit", "GET", await jwt("nurse")));
    expect(isRedirect(nurse)).toBe(true);
    const hosp = await proxy(req("/audit", "GET", await jwt("hospital_admin")));
    expect(isRedirect(hosp)).toBe(false);
  });
});

/* ── 3. CSRF: cookie-authed mutations must be same-origin ── */
describe("proxy — CSRF origin check", () => {
  const reqH = (
    path: string,
    method: string,
    token: string,
    headers: Record<string, string> = {},
  ) =>
    new NextRequest(`http://localhost${path}`, {
      method,
      headers: {
        cookie: `${SESSION_COOKIE}=${token}`,
        host: "localhost",
        ...headers,
      },
    });

  it("cross-site Origin on a cookie POST → 403 csrf", async () => {
    const t = await jwt("nurse");
    const r = await proxy(
      reqH("/api/interventions/x", "PATCH", t, {
        origin: "https://evil.example",
      }),
    );
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe("csrf");
  });

  it("Sec-Fetch-Site: cross-site without Origin → 403", async () => {
    const t = await jwt("nurse");
    const r = await proxy(
      reqH("/api/interventions/x", "PATCH", t, {
        "sec-fetch-site": "cross-site",
      }),
    );
    expect(r.status).toBe(403);
  });

  it("same-origin Origin → passes through", async () => {
    const t = await jwt("nurse");
    const r = await proxy(
      reqH("/api/interventions/x", "PATCH", t, {
        origin: "http://localhost",
        "sec-fetch-site": "same-origin",
      }),
    );
    expect(r.status).not.toBe(403);
  });

  it("native shell origin (capacitor://) → allowed", async () => {
    const t = await jwt("nurse");
    const r = await proxy(
      reqH("/api/interventions/x", "PATCH", t, {
        origin: "capacitor://localhost",
      }),
    );
    expect(r.status).not.toBe(403);
  });

  it("GET is exempt even cross-site", async () => {
    const t = await jwt("nurse");
    const r = await proxy(
      reqH("/api/patients", "GET", t, {
        origin: "https://evil.example",
      }),
    );
    expect(r.status).not.toBe(403);
  });

  it("no session cookie → CSRF check skipped (401 path still applies)", async () => {
    const r = await proxy(
      new NextRequest("http://localhost/api/patients", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(r.status).toBe(401);
  });
});
