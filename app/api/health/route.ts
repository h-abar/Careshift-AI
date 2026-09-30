import { handle } from "@/lib/server/json";

/**
 * Liveness (item 8) — process is up. No dependencies, no sensitive data.
 * Unauthenticated by design (listed in PUBLIC_API in proxy.ts).
 */
export const GET = handle(async (_req: Request) =>
  Response.json({ status: "ok", uptime: process.uptime() }),
);
