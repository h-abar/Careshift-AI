/**
 * Server-only environment validation — imported by instrumentation.ts so
 * production FAILS FAST at boot instead of at the first signed request.
 * Do not import this module from client components.
 */
if (typeof window !== "undefined") {
  throw new Error("lib/server/env.ts is server-only");
}

const MIN_SECRET_LEN = 32;

export class EnvConfigError extends Error {}

export function validateEnv() {
  const s = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!s || s.length < MIN_SECRET_LEN) {
      throw new EnvConfigError(
        "SESSION_SECRET is missing or shorter than 32 chars — refusing to boot. Set a strong random secret in the environment.",
      );
    }
  } else if (!s || s.length < MIN_SECRET_LEN) {
    console.warn(
      "[SECURITY] SESSION_SECRET is missing/short — dev mode falls back to an INSECURE fixed key. DO NOT deploy like this.",
    );
  }
}

/** Trust x-forwarded-for only when explicitly running behind a proxy. */
export function trustedProxy(): boolean {
  const v = process.env.TRUSTED_PROXY;
  return v === "1" || v === "true";
}
