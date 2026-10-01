/**
 * DailyMed — https://dailymed.nlm.nih.gov/dailymed/services/v2/
 * Resolves official SPL label links by set_id.
 */
import { cachedCall, prismaCache, type CacheAdapter, type CachedResult } from "./cache";
import { extFetch, type ExtFetchOpts } from "./http";

export const DAILYMED_ATTRIBUTION =
  "DailyMed — U.S. National Library of Medicine drug labels (FDA SPL)";

const BASE = "https://dailymed.nlm.nih.gov/dailymed/services/v2";

export interface DailyMedLabel {
  setId: string;
  title: string;
  url: string;
}

/** Canonical label page URL — deterministic, no request needed. */
export function labelUrl(setId: string): string {
  return `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(setId)}`;
}

interface SplRes {
  data?: { setid?: string; title?: string }[];
}

/** Search SPLs by drug name → label links keyed by set_id. */
export async function searchLabels(
  drugName: string,
  opts: ExtFetchOpts = {},
  cache: CacheAdapter = prismaCache,
): Promise<CachedResult<DailyMedLabel[]>> {
  const key = `spls:${drugName.toLowerCase()}`;
  return cachedCall(
    "dailymed",
    key,
    async () => {
      const j = await extFetch<SplRes>("dailymed", `${BASE}/spls.json`, {
        params: { drug_name: drugName },
        ...opts,
      });
      return (j.data ?? [])
        .filter((d) => d.setid)
        .map((d) => ({ setId: d.setid!, title: d.title ?? "", url: labelUrl(d.setid!) }));
    },
    cache,
  );
}
