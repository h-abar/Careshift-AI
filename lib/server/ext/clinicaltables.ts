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
  /** the table's key field — RxCUI, LOINC num, HPO id, ICD-10-CM code, conditions key_id */
  key: string;
  /** display fields joined (e.g. "E11.10 — Type 2 diabetes …") */
  display: string;
}

// Response shape: [total, key_ids[], extra_fields{}, display_fields[][]]
type CtRes = [number, string[], Record<string, string[]> | null, ...(string[][])[]];

/** Per-table request params (icd10cm must search `name`, default is code only). */
const TABLE_PARAMS: Record<ClinicalTable, Record<string, string>> = {
  conditions: {},
  icd10cm: { sf: "code,name" },
  rxterms: {},
  loinc_items: {},
  hpo: {},
};

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
        {
          params: { terms, maxList: String(maxList), ...TABLE_PARAMS[table] },
          ...opts,
        },
      );
      const keys = j[1] ?? [];
      const fields = j[3] ?? [];
      return keys.map((k, i) => ({ key: k, display: (fields[i] ?? []).join(" — ") }));
    },
    cache,
  );
}
