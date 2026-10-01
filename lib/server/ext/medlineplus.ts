/**
 * MedlinePlus Connect — https://connect.medlineplus.gov/service
 * (100 req/min). Patient-education links only. Queries are CODED
 * (SNOMED-CT / ICD-10-CM / RxNorm / NDC) — Connect does not search free
 * text; a display name may accompany the code. Arabic handouts hub:
 * https://medlineplus.gov/languages/arabic.html
 */
import { cachedCall, prismaCache, type CacheAdapter, type CachedResult } from "./cache";
import { extFetch, type ExtFetchOpts } from "./http";

export const MEDLINEPLUS_ATTRIBUTION =
  "MedlinePlus Connect — U.S. National Library of Medicine patient education";
export const MEDLINEPLUS_ARABIC_HUB = "https://medlineplus.gov/languages/arabic.html";

/** Common code-system OIDs accepted by Connect. */
export const CS = {
  snomed: "2.16.840.1.113883.6.96",
  icd10cm: "2.16.840.1.113883.6.90",
  rxnorm: "2.16.840.1.113883.6.88",
  ndc: "2.16.840.1.113883.6.69",
} as const;

const BASE = "https://connect.medlineplus.gov/service";

export interface EducationLink {
  title: string;
  url: string;
}

interface MpRes {
  feed?: { entry?: { title?: { _value?: string }; link?: { href?: string }[] }[] };
}

export interface EducationQuery {
  /** code in the given system, e.g. ICD-10-CM "E11.9" */
  code: string;
  codeSystem?: keyof typeof CS;
  /** human-readable display name sent as mainSearchCriteria.v.dn */
  display?: string;
}

/** English education links for a coded problem/drug. */
export async function educationLinks(
  q: EducationQuery,
  opts: ExtFetchOpts = {},
  cache: CacheAdapter = prismaCache,
): Promise<CachedResult<EducationLink[]>> {
  const cs = CS[q.codeSystem ?? "snomed"];
  const key = `edu:${cs}:${q.code}`;
  return cachedCall(
    "medlineplus",
    key,
    async () => {
      const params: Record<string, string> = {
        "mainSearchCriteria.v.cs": cs,
        "mainSearchCriteria.v.c": q.code,
        knowledgeResponseType: "application/json",
      };
      if (q.display) params["mainSearchCriteria.v.dn"] = q.display;
      const j = await extFetch<MpRes>("medlineplus", BASE, { params, ...opts });
      return (j.feed?.entry ?? [])
        .map((e) => ({ title: e.title?._value ?? "", url: e.link?.[0]?.href ?? "" }))
        .filter((l) => l.url);
    },
    cache,
  );
}

/** Arabic education hub — MedlinePlus Arabic is a curated index page. */
export function arabicEducationLink(): EducationLink {
  return { title: "MedlinePlus بالعربية", url: MEDLINEPLUS_ARABIC_HUB };
}
