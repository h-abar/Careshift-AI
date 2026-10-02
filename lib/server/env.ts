import { z } from "zod";

/**
 * Server-only environment — zod-validated at boot (instrumentation.ts),
 * so production FAILS FAST on misconfiguration instead of at the first
 * request. Never log env VALUES — names only. Do not import from client
 * components.
 */
if (typeof window !== "undefined") {
  throw new Error("lib/server/env.ts is server-only");
}

const MIN_SECRET_LEN = 32;

export class EnvConfigError extends Error {}

const optionalPort = z
  .string()
  .regex(/^\d*$/)
  .optional();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().optional(),
  // Session JWT signing — SESSION_SECRET is the CURRENT key;
  // SESSION_SECRET_PREV keeps sessions valid during rotation (kid "s1"/"s0").
  SESSION_SECRET: z.string().optional(),
  SESSION_SECRET_PREV: z.string().optional(),
  // Trust x-forwarded-for only when deployed behind a known proxy.
  TRUSTED_PROXY: z.enum(["", "0", "1", "true", "false"]).optional(),
  UPLOAD_DIR: z.string().optional(),
  // Public origin used by the Capacitor shell.
  API_ORIGIN: z.string().optional(),
  // Login CAPTCHA (item 0.6) — both required to enable.
  CAPTCHA_PROVIDER: z.enum(["", "turnstile"]).optional(),
  CAPTCHA_SECRET: z.string().optional(),
  // Upload AV scan hook (item 0.2) — clamav only.
  AV_PROVIDER: z.enum(["", "clamav"]).optional(),
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: optionalPort,
  // Rate limits (item 4) — request count per fixed minute window.
  RL_LOGIN: optionalPort,
  RL_USERADMIN: optionalPort,
  RL_UPLOAD: optionalPort,
  RL_REASSESS: optionalPort,
  RL_CLAIMWRITE: optionalPort,
  // Retention days (item 7) — used by scripts/purge.ts.
  RETENTION_AUDIT_DAYS: optionalPort,
  RETENTION_LOGIN_DAYS: optionalPort,
  RETENTION_SESSION_DAYS: optionalPort,
  RETENTION_NOTIFICATION_DAYS: optionalPort,
  RETENTION_DOCUMENT_DAYS: optionalPort,
  RETENTION_RATEBUCKET_DAYS: optionalPort,
  DORMANT_DAYS: optionalPort,
  // Seed only when explicitly requested (compose sets it for demo envs).
  // APP_ENV gates it separately so a real production NODE_ENV build can
  // still run as a demo container when SEED_DEMO=1 AND APP_ENV=demo.
  SEED_DEMO: z.enum(["", "0", "1", "true"]).optional(),
  APP_ENV: z.enum(["", "development", "demo", "production"]).optional(),
  // Observability (item 8).
  LOG_LEVEL: z.enum(["", "debug", "info", "warn", "error"]).optional(),
  SENTRY_DSN: z.string().optional(),
  // External evidence APIs (A3) — optional; demo runs fully offline.
  OPENFDA_API_KEY: z.string().optional(),
  ICD11_CLIENT_ID: z.string().optional(),
  ICD11_CLIENT_SECRET: z.string().optional(),
  // C1 prototype setting — minutes after which a recorded event is
  // flagged lateEntry. Configurable; not a clinical standard.
  LATE_ENTRY_MINUTES: optionalPort,
  // E7 prototype setting — appeals above this amount (SAR) need an
  // explicit hospital_admin approval instead of auto-resubmission.
  APPEAL_APPROVAL_SAR: optionalPort,
  // C10 — NPHIES: "sandbox" enables outbound calls; never send real data.
  NPHIES_ENV: z.enum(["", "sandbox"]).optional(),
  NPHIES_ENDPOINT: z.string().optional(),
  NPHIES_CLIENT_CERT: z.string().optional(),
  NPHIES_CLIENT_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Parsed env — validates on first access; boot calls validateEnv() first. */
export function env(): Env {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}

export function validateEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = Object.keys(parsed.error.flatten().fieldErrors);
    throw new EnvConfigError(
      `Invalid environment (fields: ${fields.join(", ")}) — see .env.example`,
    );
  }
  const e = parsed.data;
  const prod = e.NODE_ENV === "production";
  if (prod) {
    if (!e.SESSION_SECRET || e.SESSION_SECRET.length < MIN_SECRET_LEN) {
      throw new EnvConfigError(
        "SESSION_SECRET is missing or shorter than 32 chars — refusing to boot.",
      );
    }
    if (!e.DATABASE_URL) {
      throw new EnvConfigError("DATABASE_URL is required in production.");
    }
  } else if (!e.SESSION_SECRET || e.SESSION_SECRET.length < MIN_SECRET_LEN) {
    console.warn(
      "[SECURITY] SESSION_SECRET is missing/short — dev mode falls back to an INSECURE fixed key. DO NOT deploy like this.",
    );
  }
  cached = e;
}

/** Trust x-forwarded-for only when explicitly running behind a proxy.
 *  Reads process.env live (not the cached schema) — cheap, and tests
 *  toggle it per-request. */
export function trustedProxy(): boolean {
  const v = process.env.TRUSTED_PROXY;
  return v === "1" || v === "true";
}

/** Test hook — reset the parsed cache after mutating process.env. */
export function __resetEnvCacheForTests() {
  cached = null;
}
