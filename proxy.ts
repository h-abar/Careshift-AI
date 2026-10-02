import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "@/lib/server/session";
import { can, roleHome, PAGE_PERMS } from "@/lib/permissions";
import { audit } from "@/lib/server/audit";
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
 *
 * E1 — PAGE_PERMS lives in lib/permissions.ts (the single source of
 * truth); denied page requests get a real 403 Arabic page AND an
 * access_denied audit row (user, route, IP, time).
 */

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

/**
 * Phase 3 item 3 — CSRF guard for cookie-authenticated mutations.
 * The session cookie is SameSite=Lax (kept for top-level navigation UX);
 * the real anti-CSRF control is origin verification here. A state-changing
 * request that carries a session cookie must prove it is same-origin:
 *  - `Sec-Fetch-Site: cross-site` → reject outright.
 *  - `Origin` header present → its host must equal the request host
 *    (x-forwarded-host honoured only under TRUSTED_PROXY).
 *  - No Origin/Sec-Fetch headers → non-browser client (curl, mobile shell):
 *    allowed — browsers ALWAYS send at least one of these on cross-site
 *    form/fetch POSTs, so a forged cross-origin request cannot sneak past.
 * GET/HEAD/OPTIONS are not state-changing and are exempt.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function csrfOk(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const u = new URL(origin);
      // Native WebViews (Capacitor) use capacitor:// / app:// origins —
      // not forgeable by a web attacker → allowed.
      if (u.protocol !== "http:" && u.protocol !== "https:") return true;
      const expected = req.headers.get("host") ?? req.nextUrl.host;
      return u.host === expected;
    } catch {
      return false; // e.g. Origin: null — a stripped/privacy-mode cross-site POST
    }
  }
  // No Origin: browsers always send one on a cross-site POST, so an
  // origin-less mutation is a non-browser client or same-origin POST.
  // Belt-and-braces: honour an explicit cross-site marker anyway.
  return req.headers.get("sec-fetch-site") !== "cross-site";
}

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
  /**
   * E1 — real 403 (not a redirect) with an Arabic page, plus an
   * access_denied audit row (user, route, IP — audit() reads the IP
   * from req headers under the same trusted-proxy rules as login).
   */
  const deny403Page = async (userId: string) => {
    await audit(
      {
        userId,
        action: "access_denied",
        entityType: "route",
        entityId: pathname,
      },
      req,
    ).catch(() => {});
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>403 — غير مصرّح</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f7fb;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;color:#1e2a3a}.card{background:#fff;border:1px solid #e2e9f2;border-radius:16px;padding:40px 48px;max-width:420px;text-align:center;box-shadow:0 2px 12px rgba(15,42,72,.06)}.code{font-size:44px;font-weight:800;color:#1b5fad;margin:0}h1{font-size:20px;margin:12px 0 8px}p{color:#5b6b7f;font-size:14px;line-height:1.7;margin:0 0 20px}a{display:inline-block;background:#1b5fad;color:#fff;text-decoration:none;padding:10px 24px;border-radius:10px;font-size:14px}.sim{display:inline-block;margin-top:18px;font-size:11px;color:#8a97a8;border:1px dashed #c4cfdd;border-radius:8px;padding:3px 10px}</style></head><body><div class="card"><p class="code">403</p><h1>غير مصرّح بالوصول</h1><p>ليس لديك صلاحية لعرض هذه الصفحة. تم تسجيل محاولة الوصول في سجل التدقيق.</p><a href="/">العودة إلى الرئيسية</a><br><span class="sim">Simulated — بيانات افتراضية</span></div></body></html>`;
    return applySecurityHeaders(
      new NextResponse(html, {
        status: 403,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
      nonce,
      isApi,
    );
  };
  const deny401 = () =>
    applySecurityHeaders(
      NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
      nonce,
      isApi,
    );
  const deny403 = () =>
    applySecurityHeaders(
      NextResponse.json(
        { error: "forbidden", code: "csrf" },
        { status: 403 },
      ),
      nonce,
      isApi,
    );

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifyToken(token) : null;

  if (isApi) {
    // CSRF: cookie-authed mutations must be verifiably same-origin.
    if (token && !csrfOk(req)) return deny403();
    if (PUBLIC_API.some((p) => pathname.startsWith(p))) return next();
    if (req.method === "GET" && PUBLIC_API_GET.some((p) => pathname.startsWith(p))) {
      return next();
    }
    if (!payload) return deny401();
    return next();
  }

  // Public demo route stays reachable without a session.
  if (pathname.startsWith("/demo")) return next();

  // E2 — role landing: a signed-in user on "/" goes to their role home.
  if (pathname === "/" && payload) {
    const home = roleHome(payload.role as RoleKey);
    if (home !== "/") {
      return applySecurityHeaders(
        NextResponse.redirect(new URL(home, req.url)),
        nonce,
        isApi,
      );
    }
  }

  // Page routes: enforce the permission map against the JWT role claim.
  const rule = PAGE_PERMS.find((r) => pathname.startsWith(r.prefix));
  if (rule) {
    if (!payload) return redirectHome();
    if (!can(payload.role as RoleKey, rule.perm)) {
      return deny403Page(payload.sub);
    }
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
