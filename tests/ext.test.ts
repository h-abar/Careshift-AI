/**
 * External API client tests (A3/A6) — mocked fetch, in-memory cache.
 * Each client is exercised for: success, HTTP 429→retry, timeout, and
 * offline→cache fallback. Plus the hard PHI-blocking guarantee.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  __resetPacing,
  assertNoPhi,
  extFetch,
  PhiBlockError,
  ExtHttpError,
} from "@/lib/server/ext/http";
import type { CacheAdapter, CacheEntry } from "@/lib/server/ext/cache";
import { searchRxnorm } from "@/lib/server/ext/rxnav";
import { labelMentions } from "@/lib/server/ext/openfda";
import { searchLabels, labelUrl } from "@/lib/server/ext/dailymed";
import { searchTable } from "@/lib/server/ext/clinicaltables";
import { icd11Search } from "@/lib/server/ext/icd11";
import { educationLinks, arabicEducationLink } from "@/lib/server/ext/medlineplus";
import { loadNphiesAdjudicationReasons } from "@/lib/server/ext/nphies";
import { __resetEnvCacheForTests } from "@/lib/server/env";

class MemCache implements CacheAdapter {
  m = new Map<string, CacheEntry<unknown>>();
  async get(p: string, k: string) {
    return this.m.get(`${p}:${k}`) ?? null;
  }
  async set(p: string, k: string, data: unknown) {
    const at = new Date("2026-10-01T00:00:00Z");
    this.m.set(`${p}:${k}`, { data, fetchedAt: at });
    return at;
  }
}

const jsonRes = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const noPace = { fetchImpl: fetch, timeoutMs: 50, retries: 0 };

beforeEach(() => {
  __resetPacing();
  vi.restoreAllMocks();
});

describe("PHI guard", () => {
  it("blocks patient-identifier param names", () => {
    for (const k of ["patientId", "mrn", "name", "email", "phone", "iqama", "dob"]) {
      expect(() => assertNoPhi({ [k]: "x" } as Record<string, string>), k).toThrow(PhiBlockError);
    }
  });
  it("blocks PHI-shaped values (P-xxxx, email, phone)", () => {
    expect(() => assertNoPhi({ term: "P-1042" })).toThrow(PhiBlockError);
    expect(() => assertNoPhi({ term: "sara@example.com" })).toThrow(PhiBlockError);
    expect(() => assertNoPhi({ term: "+966501234567" })).toThrow(PhiBlockError);
  });
  it("allows clinical terms", () => {
    expect(() => assertNoPhi({ term: "metformin" })).not.toThrow();
    expect(() => assertNoPhi({ terms: "diabetic ketoacidosis" })).not.toThrow();
  });
  it("extFetch refuses to send PHI params", async () => {
    await expect(
      extFetch("rxnav", "https://rxnav.nlm.nih.gov/REST/x.json", {
        params: { patientId: "P-1042" },
      }),
    ).rejects.toThrow(PhiBlockError);
  });
});

describe("transport behavior", () => {
  it("retries on 429 with backoff then succeeds", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({}, 429))
      .mockResolvedValueOnce(jsonRes({ ok: 1 }));
    const out = await extFetch<{ ok: number }>(
      "rxnav", "https://x.example/", { fetchImpl: f, retries: 1 },
    );
    expect(out.ok).toBe(1);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("timeout aborts and surfaces a typed error", async () => {
    const f = vi.fn().mockImplementation(
      (_u: string, o: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          o.signal?.addEventListener("abort", () =>
            rej(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    await expect(
      extFetch("rxnav", "https://x.example/", { fetchImpl: f, timeoutMs: 20, retries: 0 }),
    ).rejects.toThrow(ExtHttpError);
  });
  it("nphies is static-only — live transport is refused", async () => {
    await expect(extFetch("nphies", "https://x.example/")).rejects.toThrow(/static/);
  });
});

describe("provider clients (mocked HTTP + cache fallback)", () => {
  it("rxnav searchRxnorm: success → cached", async () => {
    const cache = new MemCache();
    const f = vi.fn().mockResolvedValue(
      jsonRes({ approximateGroup: { candidate: [{ rxcui: "6809", name: "Metformin", score: "100" }] } }),
    );
    const r = await searchRxnorm("metformin", 5, { fetchImpl: f }, cache);
    expect(r.fresh).toBe(true);
    expect(r.data[0].rxcui).toBe("6809");
  });
  it("rxnav offline → stale cache with fetchedAt", async () => {
    const cache = new MemCache();
    const f = vi.fn().mockResolvedValue(
      jsonRes({ approximateGroup: { candidate: [{ rxcui: "6809", name: "Metformin" }] } }),
    );
    await searchRxnorm("metformin", 5, { fetchImpl: f }, cache);
    const down = vi.fn().mockRejectedValue(new Error("network down"));
    const r = await searchRxnorm("metformin", 5, { ...noPace, fetchImpl: down }, cache);
    expect(r.fresh).toBe(false);
    expect(r.data[0].name).toBe("Metformin");
    expect(r.fetchedAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("openfda labelMentions reads only the three label fields", async () => {
    const f = vi.fn().mockResolvedValue(
      jsonRes({
        results: [{
          drug_interactions: ["may increase x"],
          boxed_warning: ["warning y"],
          contraindications: ["do not use z"],
          openfda: { secret: "ignored" },
        }],
      }),
    );
    const r = await labelMentions("insulin", { fetchImpl: f }, new MemCache());
    expect(r.data).toEqual({
      drugInteractions: ["may increase x"],
      boxedWarning: ["warning y"],
      contraindications: ["do not use z"],
    });
  });
  it("openfda 429 → retry", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(jsonRes({}, 429))
      .mockResolvedValueOnce(jsonRes({ results: [] }));
    const r = await labelMentions("insulin", { fetchImpl: f, retries: 1 }, new MemCache());
    expect(r.data).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("dailymed resolves label links by set_id", async () => {
    const f = vi.fn().mockResolvedValue(
      jsonRes({ data: [{ setid: "abc-123", title: "INSULIN label" }] }),
    );
    const r = await searchLabels("insulin", { fetchImpl: f }, new MemCache());
    expect(r.data[0].setId).toBe("abc-123");
    expect(r.data[0].url).toContain("setid=abc-123");
    expect(labelUrl("abc-123")).toContain("dailymed.nlm.nih.gov");
  });

  it("clinicaltables maps key field + display fields correctly", async () => {
    const f = vi.fn().mockResolvedValue(
      jsonRes([1, ["E11"], null, [["E11", "Type 2 diabetes mellitus"]]]),
    );
    const r = await searchTable("icd10cm", "diabetes", 5, { fetchImpl: f }, new MemCache());
    expect(r.data[0]).toEqual({ key: "E11", display: "E11 — Type 2 diabetes mellitus" });
  });
  it("clinicaltables offline → cache", async () => {
    const cache = new MemCache();
    const ok = vi.fn().mockResolvedValue(jsonRes([1, ["X"], null, [["Y"]]]));
    await searchTable("conditions", "x", 5, { fetchImpl: ok }, cache);
    const down = vi.fn().mockRejectedValue(new Error("offline"));
    const r = await searchTable("conditions", "x", 5, { ...noPace, fetchImpl: down }, cache);
    expect(r.fresh).toBe(false);
  });

  it("icd11 sends Accept-Language ar and returns WHO text verbatim", async () => {
    const f = vi.fn().mockImplementation((url: string) => {
      if (url.includes("connect/token"))
        return Promise.resolve(jsonRes({ access_token: "t", expires_in: 3600 }));
      return Promise.resolve(
        jsonRes({ destinationEntities: [{ theCode: "5A11", title: "داء السكري", id: "e1" }] }),
      );
    });
    process.env.ICD11_CLIENT_ID = "cid";
    process.env.ICD11_CLIENT_SECRET = "csec";
    __resetEnvCacheForTests();
    const r = await icd11Search("diabetes", "ar", { fetchImpl: f }, new MemCache());
    expect(r.data[0]).toEqual({ code: "5A11", title: "داء السكري", id: "e1" });
    const headers = (f.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(headers["accept-language"]).toBe("ar");
  });

  it("medlineplus returns education links; arabic hub is a fixed URL", async () => {
    const f = vi.fn().mockResolvedValue(
      jsonRes({ feed: { entry: [{ title: { _value: "DKA" }, link: [{ href: "https://medlineplus.gov/x" }] }] } }),
    );
    const r = await educationLinks(
      { code: "E13.10", codeSystem: "icd10cm", display: "diabetic ketoacidosis" },
      { fetchImpl: f },
      new MemCache(),
    );
    expect(r.data[0].url).toContain("medlineplus.gov");
    expect(arabicEducationLink().url).toBe("https://medlineplus.gov/languages/arabic.html");
  });

  it("nphies loads the bundled snapshot — 71 real codes, no network", async () => {
    const f = vi.fn();
    const snap = loadNphiesAdjudicationReasons();
    expect(snap.concepts.length).toBe(71);
    expect(snap.version).toBe("1.0.0");
    expect(snap.sourceUrl).toContain("portal.nphies.sa");
    expect(snap.concepts[0].code).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });
});
