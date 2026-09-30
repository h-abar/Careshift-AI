import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "@/lib/server/session";
import { can, type PermKey } from "@/lib/permissions";
import type { RoleKey } from "@/lib/types";

/**
 * Server-side gate for every route (Next.js 16 "proxy", fka middleware):
 *  - /api/** (except /api/auth/*): requires a valid session JWT → 401.
 *    Fine-grained permission checks run per-handler via requirePerm().
 *  - Page routes: pages that need a role permission are redirected to "/"
 *    when the JWT role lacks it (menu-hiding alone is NOT enforcement).
 *
 * Defense in depth: this gate only inspects the *JWT role claim* (fast, no
 * DB hit). It is NOT the source of truth for page data — every API route a
 * page calls re-authorizes against the *live DB role* through getAuth() →
 * requirePerm(), so a stale JWT role can never leak server data.
 *
 * Phase 3 item 2 — security headers on every response:
 *  - nonce-based strict CSP on documents (no unsafe-inline for scripts),
 *    restrictive `default-src 'none'` CSP on API responses,
 *  - HSTS, X-Frame-Options DENY + frame-ancestors 'none', nosniff,
 *    Referrer-Policy, Permissions-Policy, COOP/CORP.
 */
const PAGE_PERMS: { prefix: string; perm: PermKey }[] = [
  { prefix: "/users", perm: "users_manage" },
  { prefix: "/audit", perm: "audit_view" },
  { prefix: "/settings", perm: "settings_manage" },
  { prefix: "/insurance", perm: "insurance_view" },
  { prefix: "/reports", perm: "reports_view" },
  { prefix: "/handoff", perm: "handoff_view" },
  { prefix: "/handoffs", perm: "handoff_view" },
  { prefix: "/patients", perm: "patients_view" },
  { prefix: "/patient", perm: "patients_view" },
  { prefix: "/interventions", perm: "patients_view" },
];

const PUBLIC_API = ["/api/auth/login", "/api/health", "/api/ready"];

/** Public GET-only endpoints — the route itself still re-validates. */
const PUBLIC_API_GET = ["/api/auth/session"];

function pageCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // strict-dynamic lets nonce'd bootstrap scripts load the bundles;
    // unsafe-eval only in dev (React debugging needs it).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // unsafe-inline is required for React style attributes; scripts stay strict.
    `style-src 'self' 'unsafe-inline'`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Baseline hardening headers applied to every response. */
function applySecurityHeaders(res: NextResponse, nonce: string, isApi: boolean) {
  res.headers.set("Content-Security-Policy", isApi ? API_CSP : pageCsp(nonce));
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  );
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api");
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Forward the nonce + CSP to the renderer so SSR can stamp script tags.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", isApi ? API_CSP : pageCsp(nonce));
  const next = () =>
    applySecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      nonce,
      isApi,
    );
  const redirectHome = () =>
    applySecurityHeaders(
      NextResponse.redirect(new URL("/", req.url)),
      nonce,
      isApi,
    );
  const deny401 = () =>
    applySecurityHeaders(
      NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
      nonce,
      isApi,
    );

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifyToken(token) : null;

  if (isApi) {
    if (PUBLIC_API.some((p) => pathname.startsWith(p))) return next();
    if (req.method === "GET" && PUBLIC_API_GET.some((p) => pathname.startsWith(p))) {
      return next();
    }
    if (!payload) return deny401();
    return next();
  }

  // Public demo route stays reachable without a session.
  if (pathname.startsWith("/demo")) return next();

  // Page routes: enforce the permission map against the JWT role claim.
  const rule = PAGE_PERMS.find((r) => pathname.startsWith(r.prefix));
  if (rule && (!payload || !can(payload.role as RoleKey, rule.perm))) {
    return redirectHome();
  }
  return next();
}

export const config = {
  matcher: [
    /*
     * Run on everything EXCEPT static assets — pages need the CSP nonce,
     * APIs need auth + security headers. Excluded:
     *  - _next/static, _next/image (hashed public assets)
     *  - files with an extension (favicon.ico, /logo.png, uploads…)
     */
    "/((?!_next/static|_next/image|.*\\..*).*)",
  ],
};
