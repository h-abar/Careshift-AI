/**
 * MedlinePlus Connect — https://connect.medlineplus.gov/service
 * (100 req/min). Patient-education links only. Arabic handouts hub:
 * https://medlineplus.gov/languages/arabic.html
 */
import { cachedCall, prismaCache, type CacheAdapter, type CachedResult } from "./cache";
import { extFetch, type ExtFetchOpts } from "./http";

export const MEDLINEPLUS_ATTRIBUTION =
  "MedlinePlus Connect — U.S. National Library of Medicine patient education";
export const MEDLINEPLUS_ARABIC_HUB = "https://medlineplus.gov/languages/arabic.html";

const BASE = "https://connect.medlineplus.gov/service";

export interface EducationLink {
  title: string;
  url: string;
}

interface MpRes {
  feed?: { entry?: { title?: { _value?: string }; link?: { href?: string }[] }[] };
}

/** English education links for a SNOMED-CT problem name. */
export async function educationLinks(
  problemName: string,
  opts: ExtFetchOpts = {},
  cache: CacheAdapter = prismaCache,
): Promise<CachedResult<EducationLink[]>> {
  const key = `edu:${problemName.toLowerCase()}`;
  return cachedCall(
    "medlineplus",
    key,
    async () => {
      const j = await extFetch<MpRes>("medlineplus", BASE, {
        params: {
          "mainSearchCriteria.v.cs": "2.16.840.1.113883.6.96",
          "mainSearchCriteria.v.dn": problemName,
          knowledgeResponseType: "application/json",
        },
        ...opts,
      });
      return (j.feed?.entry ?? [])
        .map((e) => ({
          title: e.title?._value ?? "",
          url: e.link?.[0]?.href ?? "",
        }))
        .filter((l) => l.url);
    },
    cache,
  );
}

/** Arabic education hub — MedlinePlus Arabic is a curated index page. */
export function arabicEducationLink(): EducationLink {
  return { title: "MedlinePlus بالعربية", url: MEDLINEPLUS_ARABIC_HUB };
}
