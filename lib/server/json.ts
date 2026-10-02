import { NextResponse } from "next/server";
import { ApiError, verifyToken, SESSION_COOKIE } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { logger, requestId, routeLabel } from "@/lib/server/log";
import { recordRequest } from "@/lib/server/metrics";
import { captureError } from "@/lib/server/errors";
import type { ZodType } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Consistent validation error shape: {error, code, fields?}. */
export function validationError(fields: Record<string, string>) {
  return NextResponse.json(
    { error: "validation failed", code: "validation", fields },
    { status: 400 },
  );
}

type ParseResult<T> =
  | { data: T; error?: never }
  | { data?: never; error: Response };

/**
 * Parse + validate a JSON body against a shared Zod schema.
 * Returns the typed data or a ready-to-return 400 response that rejects
 * unknown fields and reports per-field errors.
 */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      error: NextResponse.json(
        { error: "invalid JSON body", code: "bad_json" },
        { status: 400 },
      ),
    };
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const iss of r.error.issues) {
      fields[iss.path.join(".") || "_"] = iss.message;
    }
    return { error: validationError(fields) };
  }
  return { data: r.data };
}

/**
 * Wrap a handler: turns ApiError into proper status, everything else 500.
 * Also the single instrumentation point (item 8): request id, latency,
 * structured log line, in-process metrics, error reporting. Logged fields
 * are method/route/status/ms only — no PHI, no headers, no bodies.
 */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args) => {
    const req = args[0] instanceof Request ? args[0] : undefined;
    const rid = req ? requestId(req) : crypto.randomUUID();
    const route = req ? routeLabel(req) : "unknown";
    const start = performance.now();
    try {
      const res = await fn(...args);
      const ms = performance.now() - start;
      recordRequest(route, res.status, ms);
      logger.info({ rid, method: req?.method, route, status: res.status, ms: Math.round(ms) }, "request");
      if (!res.headers.get("x-request-id")) {
        res.headers.set("x-request-id", rid);
      }
      return res;
    } catch (e) {
      const ms = performance.now() - start;
      if (e instanceof ApiError) {
        recordRequest(route, e.status, ms);
        logger.info({ rid, method: req?.method, route, status: e.status, ms: Math.round(ms) }, "request");
        // E1 — every authenticated denial is an auditable access_denied
        // event (user from the JWT, route + IP from the request).
        if (e.status === 403 && req) {
          const token = req.headers
            .get("cookie")
            ?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))?.[1];
          const payload = token ? await verifyToken(token) : null;
          await audit(
            {
              userId: payload?.sub ?? "unknown",
              action: "access_denied",
              entityType: "route",
              entityId: new URL(req.url).pathname,
              sessionId: payload?.sid,
            },
            req,
          ).catch(() => {});
        }
        return NextResponse.json(
          { error: e.message },
          { status: e.status, headers: { "x-request-id": rid } },
        );
      }
      recordRequest(route, 500, ms);
      captureError(e, { rid, route, method: req?.method });
      return NextResponse.json(
        { error: "internal" },
        { status: 500, headers: { "x-request-id": rid } },
      );
    }
  };
}
