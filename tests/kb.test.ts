/**
 * Knowledge-base engine tests (A1) — pure, no DB.
 *  - seed files are zod-valid,
 *  - every rule carries >=1 reference with a real pmid/doi/url,
 *  - the JSON-logic payloads produce EXACTLY the pure-engine results
 *    (NEWS2 bands, tier, shock/lactate, bundle clock, ordering key, qSOFA).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { evalLogic, kbFileSchema, type KbFile } from "@/lib/server/kb";
import {
  computePriority,
  news2Score,
  news2Tier,
  qsofaScore,
  type News2Inputs,
} from "@/lib/engines/priority";
import type { Patient } from "@/lib/types";

const KB_DIR = path.join(process.cwd(), "knowledge", "seed");

type SeedRef = NonNullable<KbFile["references"]>[number];
type SeedRule = NonNullable<KbFile["rules"]>[number];

function loadSeeds(): { rules: Map<string, SeedRule>; refs: Map<string, SeedRef> } {
  const refs = new Map<string, SeedRef>();
  const rules = new Map<string, SeedRule>();
  for (const f of readdirSync(KB_DIR).filter((x) => x.endsWith(".json"))) {
    const file = kbFileSchema.parse(
      JSON.parse(readFileSync(path.join(KB_DIR, f), "utf8")),
    );
    for (const r of file.references ?? []) refs.set(r.key, r);
    for (const r of file.rules ?? []) rules.set(r.key, r);
  }
  return { rules, refs };
}

const { rules, refs } = loadSeeds();
const ruleOutput = (key: string, inputs: object) =>
  evalLogic(
    JSON.stringify(rules.get(key)!.logic),
    inputs as Record<string, unknown>,
  );

describe("knowledge-base seed files (A1)", () => {
  it("parses cleanly through the zod schema", () => {
    expect(rules.size).toBeGreaterThanOrEqual(5);
    expect(refs.size).toBeGreaterThanOrEqual(10);
  });

  it("every rule has >=1 reference with a real PMID/DOI/official URL", () => {
    for (const [key, rule] of rules) {
      expect(rule.refs.length, `rule ${key}`).toBeGreaterThanOrEqual(1);
      for (const rk of rule.refs) {
        const ref = refs.get(rk);
        expect(ref, `rule ${key} → unknown ref ${rk}`).toBeTruthy();
        expect(["pmid", "doi", "url"]).toContain(ref!.kind);
        if (ref!.kind === "pmid") expect(refs.get(rk)).toMatchObject({ kind: "pmid" });
      }
    }
  });

  it("PMID references are digit strings; DOI/URL are well-formed", () => {
    for (const [key, r] of refs) {
      if (r.kind === "pmid") expect(r.value, key).toMatch(/^\d+$/);
      if (r.kind === "doi") expect(r.value, key).toMatch(/^10\.\d+\//);
      if (r.kind === "url") expect(r.value, key).toMatch(/^https:\/\//);
    }
  });
});

describe("NEWS2 rule parity vs pure engine", () => {
  // RCP 2017 scoring table — boundary cases per parameter.
  const cases: News2Inputs[] = [
    { rr: 20, spo2: 96, o2: 0, sbp: 111, hr: 90, temp: 38, conscious: 0 }, // all 0 → 0
    { rr: 8, spo2: 91, o2: 1, sbp: 90, hr: 40, temp: 35, conscious: 3 },   // all max
    { rr: 9, spo2: 92, o2: 0, sbp: 91, hr: 41, temp: 35.5, conscious: 0 },
    { rr: 11, spo2: 93, o2: 0, sbp: 100, hr: 50, temp: 36, conscious: 0 },
    { rr: 21, spo2: 94, o2: 0, sbp: 101, hr: 91, temp: 38.1, conscious: 0 },
    { rr: 24, spo2: 95, o2: 1, sbp: 110, hr: 110, temp: 39, conscious: 0 },
    { rr: 25, spo2: 90, o2: 1, sbp: 220, hr: 131, temp: 39.1, conscious: 3 },
    { rr: 118, spo2: 96, o2: 0, sbp: 110, hr: 118, temp: 37.5, conscious: 0 }, // P-1042 peak-ish
  ];

  it("news2-score rule output == pure news2Score on every case", () => {
    for (const v of cases) {
      const out = ruleOutput("news2-score", v);
      const pure = news2Score(v);
      expect(out.score, JSON.stringify(v)).toBe(pure.score);
      expect(out.maxSingle).toBe(pure.maxSingle);
    }
  });

  it("news2-tier rule == news2Tier on RCP response boundaries", () => {
    const combos: [number, number][] = [
      [0, 0], [1, 1], [4, 1], [4, 3], [5, 2], [6, 2], [7, 2], [7, 3], [10, 3],
    ];
    for (const [score, maxSingle] of combos) {
      const out = ruleOutput("news2-tier", { score, maxSingle });
      expect(out.tier, `${score}/${maxSingle}`).toBe(news2Tier(score, maxSingle));
    }
  });

  it("shock-lactate rule: SI>1 or lactate>=2.5 flags, >2 is context", () => {
    const edge = [
      { si: 1.01, lactate: 0 }, { si: 1, lactate: 2.5 }, { si: 0.8, lactate: 2.4 },
      { si: 0.9, lactate: 2.0 }, { si: 0.7, lactate: 1.0 },
    ];
    for (const c of edge) {
      const out = ruleOutput("shock-lactate", c);
      expect(out.siHigh).toBe(c.si > 1);
      expect(out.lactate25).toBe(c.lactate >= 2.5);
      expect(out.lactate2).toBe(c.lactate > 2);
      expect(out.suspect).toBe(c.si > 1 || c.lactate >= 2.5);
    }
  });

  it("hour-1 bundle rule: indicated at NEWS2>=7 or shock; overdue = elapsed-60", () => {
    const a = ruleOutput("sepsis-hour1-bundle", { news2: 7, shockSuspect: 0, elapsedMin: 75 });
    expect(a.indicated).toBe(true);
    expect(a.overdueMin).toBe(15);
    const b = ruleOutput("sepsis-hour1-bundle", { news2: 4, shockSuspect: 1, elapsedMin: 30 });
    expect(b.indicated).toBe(true);
    expect(b.overdueMin).toBe(0);
    const c = ruleOutput("sepsis-hour1-bundle", { news2: 4, shockSuspect: 0, elapsedMin: 300 });
    expect(c.indicated).toBe(false);
    expect(c.overdueMin).toBe(0);
  });

  it("patient-ordering key = tier*1e6 + news2*1e4 + shock*1e3 + min(overdue,999)", () => {
    const out = ruleOutput("patient-ordering", {
      tier: 2, news2: 5, shock: 1, bundleOverdueMin: 1500,
    });
    expect(out.sortKey).toBe(2e6 + 5e4 + 1e3 + 999);
  });

  it("qSOFA context rule scores rr>=22, sbp<=100, altered mentation", () => {
    const out = ruleOutput("qsofa-context", { rr: 22, sbp: 100, conscious: 3 });
    expect(out.score).toBe(3);
    expect(qsofaScore({ rr: 22, sbp: 100, conscious: 3 })).toBe(3);
  });
});

describe("ordering contract (3B2-16)", () => {
  const base: Patient = {
    id: "T-1", nameEn: "T", nameAr: "ت", age: 50, sex: "F",
    room: "Med-1", dxKey: "x", attending: "d", admittedAt: "08:00",
    shift: "day",
    vitals: [{ t: "10:00", hr: 120, sbp: 90, rr: 24, temp: 38.5, spo2: 94 }],
    labs: [], riskFlags: [], meds: [], noteEn: "", noteAr: "",
  };

  it("NEWS2 tier dominates ordering; equal indicators break ties by id", () => {
    const high = computePriority({ ...base, id: "B" }, [], 0)!;
    const low = computePriority(
      { ...base, id: "A", vitals: [{ t: "10:00", hr: 70, sbp: 125, rr: 14, temp: 36.8, spo2: 98 }] },
      [], 0,
    )!;
    expect(high.sortKey).toBeGreaterThan(low.sortKey);
  });

  it("nurse concern / overdue tasks / stale vitals NEVER change sortKey", () => {
    const clean = computePriority(base, [], 0)!;
    const noisy = computePriority(
      { ...base, riskFlags: ["nurse-concern"] },
      [{ status: "overdue" }, { status: "overdue" }],
      0,
    )!;
    expect(noisy.sortKey).toBe(clean.sortKey);
    // but they ARE surfaced as information
    expect(noisy.info.overdueTasks).toBe(2);
    expect(noisy.info.nurseConcern).toBe(true);
  });
});
