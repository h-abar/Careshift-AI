import { logger } from "@/lib/server/log";

/**
 * Error-tracking hook (item 8) — Sentry-compatible reporter, disabled by
 * default. Set SENTRY_DSN to enable; errors are POSTed as a minimal event
 * envelope. Swaps to the real @sentry/nextjs SDK later without touching
 * call sites — captureError is the only surface.
 */
interface ErrorReporter {
  capture(err: unknown, ctx?: Record<string, unknown>): void;
}

const noop: ErrorReporter = { capture: () => {} };

function dsnEndpoint(dsn: string): { url: string; key: string } | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace("/", "");
    return {
      url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
      key: u.username,
    };
  } catch {
    return null;
  }
}

function sentryReporter(dsn: string): ErrorReporter {
  const ep = dsnEndpoint(dsn);
  if (!ep) return noop;
  return {
    capture(err, ctx) {
      const message =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      const event = {
        event_id: crypto.randomUUID().replaceAll("-", ""),
        timestamp: Date.now() / 1000,
        level: "error",
        message,
        extra: ctx,
      };
      const envelope = `${JSON.stringify({ event_id: event.event_id, dsn })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
      fetch(ep.url, {
        method: "POST",
        headers: {
          "content-type": "application/x-sentry-envelope",
          "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${ep.key}`,
        },
        body: envelope,
      }).catch(() => {});
    },
  };
}

const reporter: ErrorReporter = process.env.SENTRY_DSN
  ? sentryReporter(process.env.SENTRY_DSN)
  : noop;

/** Report an error to the tracker (no-op unless SENTRY_DSN) and log it. */
export function captureError(err: unknown, ctx?: Record<string, unknown>) {
  logger.error({ err: err instanceof Error ? err.message : String(err), ...ctx }, "unhandled error");
  try {
    reporter.capture(err, ctx);
  } catch {
    // reporting must never break the request path
  }
}
