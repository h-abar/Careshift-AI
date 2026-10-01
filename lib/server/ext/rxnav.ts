/**
 * NLM RxNav / RxNorm — https://rxnav.nlm.nih.gov/REST/ (20 req/s limit).
 * NOTE: the RxNav interaction API was discontinued 2024-01-02 and is
 * intentionally NOT implemented here.
 */
import { cachedCall, prismaCache, type CacheAdapter, type CachedResult } from "./cache";
import { extFetch, type ExtFetchOpts } from "./http";

export const RXNAV_ATTRIBUTION =
  "RxNorm/RxNav — U.S. National Library of Medicine, National Institutes of Health";

const BASE = "https://rxnav.nlm.nih.gov/REST";

export interface RxNormConcept {
  rxcui: string;
  name: string;
  score: number;
}

interface ApproxRes {
  approxGroup?: { candidate?: { rxcui?: string; name?: string; score?: string }[] };
}

/** Approximate-match drug search → normalized RxCUIs. No PHI: term only. */
export async function searchRxnorm(
  term: string,
  maxEntries = 10,
  opts: ExtFetchOpts = {},
  cache: CacheAdapter = prismaCache,
): Promise<CachedResult<RxNormConcept[]>> {
  const key = `approx:${term.toLowerCase()}:${maxEntries}`;
  return cachedCall(
    "rxnav",
    key,
    async () => {
      const j = await extFetch<ApproxRes>("rxnav", `${BASE}/approximateTerm.json`, {
        params: { term, maxEntries: String(maxEntries) },
        ...opts,
      });
      return (j.approxGroup?.candidate ?? [])
        .filter((c) => c.rxcui && c.name)
        .map((c) => ({ rxcui: c.rxcui!, name: c.name!, score: Number(c.score ?? 0) }));
    },
    cache,
  );
}

interface PropsRes {
  properties?: { rxcui?: string; name?: string; synonym?: string; tty?: string };
}

/** Canonical name/synonym for an RxCUI. */
export async function rxnormProps(
  rxcui: string,
  opts: ExtFetchOpts = {},
  cache: CacheAdapter = prismaCache,
): Promise<CachedResult<{ rxcui: string; name: string; synonym: string; tty: string } | null>> {
  return cachedCall(
    "rxnav",
    `props:${rxcui}`,
    async () => {
      const j = await extFetch<PropsRes>(
        "rxnav",
        `${BASE}/rxcui/${encodeURIComponent(rxcui)}/properties.json`,
        opts,
      );
      const p = j.properties;
      return p?.rxcui
        ? { rxcui: p.rxcui, name: p.name ?? "", synonym: p.synonym ?? "", tty: p.tty ?? "" }
        : null;
    },
    cache,
  );
}
