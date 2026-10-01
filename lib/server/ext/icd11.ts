/**
 * WHO ICD-11 API — https://icd.who.int (OAuth2 client credentials).
 * Arabic supported via Accept-Language. Attribution is REQUIRED and the
 * WHO text must be displayed unmodified: CC BY-ND 3.0 IGO.
 */
import { env } from "@/lib/server/env";
import { cachedCall, prismaCache, type CacheAdapter, type CachedResult } from "./cache";
import { extFetch, ExtHttpError, type ExtFetchOpts } from "./http";

export const ICD11_ATTRIBUTION =
  "ICD-11 content © World Health Organization — CC BY-ND 3.0 IGO; WHO text shown unmodified";

const TOKEN_URL = "https://icd.who.int/connect/token";
const API = "https://id.who.int/icd/release/11/2024-01/mms";

interface TokenRes {
  access_token?: string;
  expires_in?: number;
}

let tokenCache: { token: string; exp: number } | null = null;

/** OAuth client-credentials token; cached until ~expiry. */
export async function icd11Token(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp - 30_000) return tokenCache.token;
  const e = env();
  if (!e.ICD11_CLIENT_ID || !e.ICD11_CLIENT_SECRET)
    throw new ExtHttpError("ICD11_CLIENT_ID/ICD11_CLIENT_SECRET not configured", 0, "icd11");
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "icdapi_access",
      client_id: e.ICD11_CLIENT_ID,
      client_secret: e.ICD11_CLIENT_SECRET,
    }).toString(),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new ExtHttpError(`icd11 token HTTP ${res.status}`, res.status, "icd11");
  const j = (await res.json()) as TokenRes;
  if (!j.access_token) throw new ExtHttpError("icd11 token response missing access_token", 0, "icd11");
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

export interface Icd11Hit {
  code: string;
  title: string; // WHO text — display verbatim
  id: string;
}

interface SearchRes {
  destinationEntities?: { id?: string; theCode?: string; title?: string }[];
}

/** ICD-11 MMS linearization search. `lang: "ar"` returns WHO Arabic text. */
export async function icd11Search(
  term: string,
  lang: "en" | "ar" = "ar",
  opts: ExtFetchOpts = {},
  cache: CacheAdapter = prismaCache,
): Promise<CachedResult<Icd11Hit[]>> {
  const key = `mms:${lang}:${term.toLowerCase()}`;
  return cachedCall(
    "icd11",
    key,
    async () => {
      const token = await icd11Token(opts.fetchImpl);
      const j = await extFetch<SearchRes>("icd11", `${API}/search`, {
        params: { q: term, flatResults: "true", useFlexisearch: "false" },
        headers: {
          authorization: `Bearer ${token}`,
          "accept-language": lang,
          "api-version": "v2",
        },
        ...opts,
      });
      return (j.destinationEntities ?? [])
        .filter((d) => d.title)
        .map((d) => ({ code: d.theCode ?? "", title: d.title!, id: d.id ?? "" }));
    },
    cache,
  );
}
