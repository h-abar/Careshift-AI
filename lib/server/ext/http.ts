/**
 * Shared transport for external evidence providers (A3).
 * Server-only: timeout via AbortController, exponential backoff retry on
 * 429/5xx/network errors, per-provider request pacing, and a hard PHI
 * guard that rejects outbound query params carrying patient identifiers.
 * fetch is injectable for tests.
 */
import { setTimeout as sleep } from "node:timers/promises";

if (typeof window !== "undefined") {
  throw new Error("lib/server/ext is server-only");
}

export type ExtProvider =
  | "rxnav"
  | "openfda"
  | "dailymed"
  | "clinicaltables"
  | "icd11"
  | "medlineplus"
  | "nphies";

export class ExtHttpError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly provider: ExtProvider | "" = "",
  ) {
    super(message);
  }
}

export class PhiBlockError extends ExtHttpError {}
export class ExtOfflineError extends ExtHttpError {}

/** Minimum ms between outbound requests per provider. */
const RATE_MS: Record<ExtProvider, number> = {
  rxnav: 50, // NLM limit: 20 req/s
  clinicaltables: 40, // NLM limit: ~25 req/s
  medlineplus: 600, // 100 req/min
  openfda: 250, // 240 req/min anonymous
  dailymed: 100, // conservative
  icd11: 200, // conservative
  nphies: Infinity, // static import — live calls are forbidden
};

const lastAt = new Map<ExtProvider, number>();

async function pace(provider: ExtProvider) {
  const wait = RATE_MS[provider];
  if (!Number.isFinite(wait))
    throw new ExtHttpError(`provider ${provider} is static-import only`, 0, provider);
  const gap = wait - (Date.now() - (lastAt.get(provider) ?? 0));
  if (gap > 0) await sleep(gap);
  lastAt.set(provider, Date.now());
}

/** Test hook — reset pacing state between tests. */
export function __resetPacing() {
  lastAt.clear();
}

/* ── PHI guard ─────────────────────────────────────────────────── */

const PHI_PARAM_NAMES =
  /^(patient(_?id)?|mrn|name|patient_?name|first_?name|last_?name|email|e-?mail|phone|mobile|ssn|national_?id|iqama|nhs|dob|date_?of_?birth|birthdate|address)$/i;
const PHI_VALUE_PATTERNS = [
  /\bP-\d{3,}\b/i, // internal patient ids (P-1042…)
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN shape
  /[\w.+-]+@[\w-]+\.[\w.]+/, // email
  /\+?\d[\d\s-]{8,}\d/, // phone-like runs (9+ digits/seps)
];

/**
 * Blocks any outbound parameter that could identify a patient — by
 * parameter NAME or by VALUE pattern. Throws before the URL is built.
 */
export function assertNoPhi(params: Record<string, string>) {
  for (const [k, v] of Object.entries(params)) {
    if (PHI_PARAM_NAMES.test(k))
      throw new PhiBlockError(`outbound param "${k}" is a patient identifier`);
    if (PHI_VALUE_PATTERNS.some((re) => re.test(v)))
      throw new PhiBlockError(`outbound value for "${k}" matches a PHI pattern`);
  }
}

/* ── transport ─────────────────────────────────────────────────── */

export interface ExtFetchOpts {
  params?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

/** GET JSON with pacing, timeout and backoff. Throws ExtHttpError. */
export async function extFetch<T = unknown>(
  provider: ExtProvider,
  url: string,
  opts: ExtFetchOpts = {},
): Promise<T> {
  const { timeoutMs = 8000, retries = 2, fetchImpl = fetch } = opts;
  if (opts.params) assertNoPhi(opts.params);
  const u = new URL(url);
  for (const [k, v] of Object.entries(opts.params ?? {}))
    u.searchParams.set(k, v);

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await pace(provider);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(u.toString(), {
        signal: ctrl.signal,
        headers: { accept: "application/json", ...opts.headers },
      });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after") ?? 0);
        lastErr = new ExtHttpError(`${provider} HTTP ${res.status}`, res.status, provider);
        if (attempt < retries)
          await sleep(Math.max(retryAfter * 1000, 250 * 2 ** attempt));
        continue;
      }
      if (!res.ok)
        throw new ExtHttpError(`${provider} HTTP ${res.status}`, res.status, provider);
      return (await res.json()) as T;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof PhiBlockError || (e instanceof ExtHttpError && e.status > 0 && e.status < 500 && e.status !== 429))
        throw e; // not retried: PHI block or deterministic 4xx
      lastErr = e;
      if (attempt < retries) await sleep(250 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  const e = lastErr as Error & { name?: string };
  if (e?.name === "AbortError")
    throw new ExtHttpError(`${provider} timed out after ${timeoutMs}ms`, 0, provider);
  if (e instanceof ExtHttpError) throw e;
  throw new ExtHttpError(`${provider} unreachable: ${e?.message ?? "offline"}`, 0, provider);
}
