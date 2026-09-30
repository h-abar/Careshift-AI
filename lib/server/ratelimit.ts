import { prisma } from "@/lib/server/prisma";

/**
 * Phase 3 item 4 — instance-safe rate limiting.
 * Fixed-window counters stored in the DB (RateBucket) — correct across
 * multiple app instances, unlike in-memory maps. The upsert+increment is
 * atomic, so concurrent requests can't overshoot the limit.
 * Expired buckets are purged by scripts/purge.ts (retention job).
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export async function checkRate(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs);
  const id = `${bucket}:${key}:${windowStart}`;
  const row = await prisma.rateBucket.upsert({
    where: { id },
    create: { id, count: 1, expiresAt: new Date((windowStart + 1) * windowMs) },
    update: { count: { increment: 1 } },
  });
  if (row.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((row.expiresAt.getTime() - now) / 1000)),
      remaining: 0,
    };
  }
  return { allowed: true, retryAfterSeconds: 0, remaining: limit - row.count };
}

/** One-liner for routes: returns a 429 Response or null when allowed. */
export async function rateGuard(
  key: string,
  bucket: keyof typeof RATE_LIMITS,
): Promise<Response | null> {
  const { limit, windowMs } = bucketLimit(bucket);
  return rateLimitResponseNullable(
    await checkRate(bucket, key, limit, windowMs),
  );
}

function rateLimitResponseNullable(r: RateLimitResult) {
  return r.allowed ? null : rateLimitResponse(r);
}

/** Standard 429 response matching the app error shape. */
export function rateLimitResponse(r: RateLimitResult) {
  return Response.json(
    { error: "rate_limited", code: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(r.retryAfterSeconds) },
    },
  );
}

/* ── Route limit profiles (per window, per key) ──
 * Limits are env-tunable (RL_<BUCKET>=<count>) for ops/test environments. */
export const RATE_LIMITS = {
  /** login attempts per username+ip — complements the fail-count lockout */
  login: { limit: 20, windowMs: 60_000 },
  /** admin user-admin writes (create/update/reset/unlock) per admin */
  userAdmin: { limit: 30, windowMs: 60_000 },
  /** claim document uploads per user */
  upload: { limit: 30, windowMs: 60_000 },
  /** manual risk reassessments per user+patient */
  reassess: { limit: 12, windowMs: 60_000 },
  /** claim status/appeal/resubmit transitions per user */
  claimWrite: { limit: 60, windowMs: 60_000 },
} as const;

const ENV_KEY: Record<keyof typeof RATE_LIMITS, string> = {
  login: "RL_LOGIN",
  userAdmin: "RL_USERADMIN",
  upload: "RL_UPLOAD",
  reassess: "RL_REASSESS",
  claimWrite: "RL_CLAIMWRITE",
};

export function bucketLimit(name: keyof typeof RATE_LIMITS) {
  const base = RATE_LIMITS[name];
  const override = Number(process.env[ENV_KEY[name]] ?? "");
  return {
    limit: Number.isFinite(override) && override > 0 ? override : base.limit,
    windowMs: base.windowMs,
  };
}
