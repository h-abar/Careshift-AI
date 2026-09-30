/**
 * Next.js instrumentation hook — runs once at server startup.
 * Validates required environment so a misconfigured production build
 * fails fast instead of serving requests with a weak/missing secret.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/server/env");
    validateEnv();
  }
}
