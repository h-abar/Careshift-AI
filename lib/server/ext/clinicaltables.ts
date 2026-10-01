/**
 * NLM Clinical Tables —
 * https://clinicaltables.nlm.nih.gov/api/{conditions,icd10cm,rxterms,loinc_items,hpo}/v3/search
 * Max ~25 req/s. Search TERMS only — never send PHI (guard in http.ts).
 */
import { cachedCall, prismaCache, type CacheAdapter, type CachedResult } from "./cache";
import { extFetch, type ExtFetchOpts } from "./http";

export const CLINICALTABLES_ATTRIBUTION =
  "NLM Clinical Table Search Service — U.S. National Library of Medicine";

export type ClinicalTable = "conditions" | "icd10cm" | "rxterms" | "loinc_items" | "hpo";

const BASE = "https://clinicaltables.nlm.nih.gov/api";

export interface TableHit {
  /** primary display string */
  display: string;
  /** code-like extra fields when the table provides them */
  extra: string[];
}

// Response shape: [total, items[], extraFields{}, fields[][]]
type CtRes = [number, string[], Record<string, string[]> | null, ...(string[][])[]];

/** Search one clinical table. `terms` must be a clinical term, never an identifier. */
export async function searchTable(
  table: ClinicalTable,
  terms: string,
  maxList = 10,
  opts: ExtFetchOpts = {},
  cache: CacheAdapter = prismaCache,
): Promise<CachedResult<TableHit[]>> {
  const key = `${table}:${terms.toLowerCase()}:${maxList}`;
  return cachedCall(
    "clinicaltables",
    key,
    async () => {
      const j = await extFetch<CtRes>(
        "clinicaltables",
        `${BASE}/${table}/v3/search`,
        { params: { terms, maxList: String(maxList) }, ...opts },
      );
      const displays = j[1] ?? [];
      const fields = j[3] ?? [];
      return displays.map((display, i) => ({ display, extra: fields[i] ?? [] }));
    },
    cache,
  );
}
