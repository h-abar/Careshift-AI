import pino from "pino";

/**
 * Structured logging (item 8). JSON lines in every environment so log
 * shippers parse identically. Redaction list strips credentials, PHI-ish
 * fields and secrets wherever they appear in logged objects — keep it in
 * sync with request bodies that ever contain secrets.
 */
const opts: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "password",
      "newPassword",
      "captchaToken",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.secret",
      "*.SESSION_SECRET",
      'req.headers["authorization"]',
      'req.headers["cookie"]',
      'req.headers["x-captcha-token"]',
    ],
    censor: "[redacted]",
  },
};

/** Factory — tests pass a capture stream and get the same redaction config. */
export function createLogger(stream?: pino.DestinationStream) {
  return stream ? pino(opts, stream) : pino(opts);
}

export const logger = createLogger();

export function requestId(req: Request): string {
  const incoming = req.headers.get("x-request-id");
  return incoming && incoming.length <= 64 ? incoming : crypto.randomUUID();
}

/** Route label for logs/metrics — collapses dynamic ids to avoid
 *  high-cardinality series and to avoid logging patient ids. */
export function routeLabel(req: Request): string {
  const p = new URL(req.url).pathname;
  return p.replace(
    /\/(P-\d+|C-\d+|U-[\w-]+|c[a-z0-9]{20,}|[a-z]+_[a-z0-9]{10,})\b/gi,
    "/:id",
  );
}
