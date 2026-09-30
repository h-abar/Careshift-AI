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

const PUBLIC_API = ["/api/auth/login"];

/** Public GET-only endpoints — the route itself still re-validates. */
const PUBLIC_API_GET = ["/api/auth/session"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifyToken(token) : null;

  if (pathname.startsWith("/api")) {
    if (PUBLIC_API.some((p) => pathname.startsWith(p))) return NextResponse.next();
    if (
      req.method === "GET" &&
      PUBLIC_API_GET.some((p) => pathname.startsWith(p))
    ) {
      return NextResponse.next();
    }
    if (!payload) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Public demo route stays reachable without a session.
  if (pathname.startsWith("/demo")) return NextResponse.next();

  // Page routes: enforce the permission map against the JWT role claim.
  const rule = PAGE_PERMS.find((r) => pathname.startsWith(r.prefix));
  if (rule) {
    if (!payload) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    if (!can(payload.role as RoleKey, rule.perm)) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/users/:path*",
    "/audit/:path*",
    "/settings/:path*",
    "/insurance/:path*",
    "/reports/:path*",
    "/handoff/:path*",
    "/handoffs/:path*",
    "/patients/:path*",
    "/patient/:path*",
    "/interventions/:path*",
    "/demo/:path*",
  ],
};
