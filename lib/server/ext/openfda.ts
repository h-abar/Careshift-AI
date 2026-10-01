/**
 * openFDA drug label — https://api.fda.gov/drug/label.json
 * Reads ONLY drug_interactions, boxed_warning, contraindications and
 * returns them as "label mentions" — never as clinical advice.
 * Optional OPENFDA_API_KEY raises the rate ceiling; never logged.
 */
import { env } from "@/lib/server/env";
import { cachedCall, prismaCache, type CacheAdapter, type CachedResult } from "./cache";
import { extFetch, type ExtFetchOpts } from "./http";

export const OPENFDA_ATTRIBUTION =
  "openFDA — U.S. Food and Drug Administration drug label text (mentions only; do not rely on for clinical decisions)";

const BASE = "https://api.fda.gov/drug/label.json";

export interface LabelMentions {
  drugInteractions: string[];
  boxedWarning: string[];
  contraindications: string[];
}

interface LabelRes {
  results?: {
    drug_interactions?: string[];
    boxed_warning?: string[];
    contraindications?: string[];
  }[];
}

/** First-label mentions for a generic/brand name — display-only. */
export async function labelMentions(
  drugName: string,
  opts: ExtFetchOpts = {},
  cache: CacheAdapter = prismaCache,
): Promise<CachedResult<LabelMentions | null>> {
  const key = `label:${drugName.toLowerCase()}`;
  return cachedCall(
    "openfda",
    key,
    async () => {
      const params: Record<string, string> = {
        search: `openfda.generic_name:"${drugName}"`,
        limit: "1",
      };
      const k = env().OPENFDA_API_KEY;
      if (k) params.api_key = k;
      const j = await extFetch<LabelRes>("openfda", BASE, { params, ...opts });
      const r = j.results?.[0];
      if (!r) return null;
      return {
        drugInteractions: r.drug_interactions ?? [],
        boxedWarning: r.boxed_warning ?? [],
        contraindications: r.contraindications ?? [],
      };
    },
    cache,
  );
}
