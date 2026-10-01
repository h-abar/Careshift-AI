/**
 * Offline-first response cache (A3/A4) — every external payload is stored
 * in ExtCache with its fetch date; on network failure the last cached
 * payload is returned and flagged `fresh: false`. Adapter is injectable
 * so unit tests run without a DB.
 */
import { prisma } from "@/lib/server/prisma";
import { ExtOfflineError, type ExtProvider } from "./http";

if (typeof window !== "undefined") {
  throw new Error("lib/server/ext is server-only");
}

export interface CacheEntry<T> {
  data: T;
  fetchedAt: Date;
}

export interface CacheAdapter {
  get(provider: string, key: string): Promise<CacheEntry<unknown> | null>;
  set(provider: string, key: string, data: unknown): Promise<Date>;
}

/** Prisma-backed adapter (production). */
export const prismaCache: CacheAdapter = {
  async get(provider, key) {
    const row = await prisma.extCache.findUnique({ where: { id: `${provider}:${key}` } });
    if (!row) return null;
    return { data: JSON.parse(row.payloadJson), fetchedAt: row.fetchedAt };
  },
  async set(provider, key, data) {
    const row = await prisma.extCache.upsert({
      where: { id: `${provider}:${key}` },
      create: { id: `${provider}:${key}`, provider, payloadJson: JSON.stringify(data) },
      update: { payloadJson: JSON.stringify(data), fetchedAt: new Date() },
    });
    return row.fetchedAt;
  },
};

export interface CachedResult<T> {
  data: T;
  /** true = just fetched; false = offline fallback to a stale cache row */
  fresh: boolean;
  fetchedAt: Date;
}

/** fetch → cache; on transport failure → last cached payload (or throw). */
export async function cachedCall<T>(
  provider: ExtProvider,
  key: string,
  fetcher: () => Promise<T>,
  adapter: CacheAdapter = prismaCache,
): Promise<CachedResult<T>> {
  try {
    const data = await fetcher();
    const fetchedAt = await adapter.set(provider, key, data);
    return { data, fresh: true, fetchedAt };
  } catch {
    const cached = await adapter.get(provider, key);
    if (cached) return { data: cached.data as T, fresh: false, fetchedAt: cached.fetchedAt };
    throw new ExtOfflineError(
      `${provider} is unreachable and no cached "${key}" exists`,
      0,
      provider,
    );
  }
}

/** Latest fetch date per provider — powers /api/ready freshness. */
export async function providerFreshness(
  adapter: Pick<CacheAdapter, "get"> | null = null,
): Promise<Record<string, string | null>> {
  const providers: ExtProvider[] = [
    "rxnav", "openfda", "dailymed", "clinicaltables", "icd11", "medlineplus", "nphies",
  ];
  if (adapter) {
    const out: Record<string, string | null> = {};
    for (const p of providers) out[p] = (await adapter.get(p, "__ping__"))?.fetchedAt.toISOString() ?? null;
    return out;
  }
  const rows = await prisma.extCache.groupBy({
    by: ["provider"],
    _max: { fetchedAt: true },
  });
  const byProvider = new Map(rows.map((r) => [r.provider, r._max.fetchedAt]));
  const out: Record<string, string | null> = {};
  for (const p of providers) out[p] = byProvider.get(p)?.toISOString() ?? null;
  return out;
}
