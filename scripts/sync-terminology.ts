/**
 * A4 — offline-first terminology sync.
 *
 * Pulls the demo's required subsets into the Terminology/ExtCache tables
 * so the app runs fully offline afterwards:
 *   • seed drugs      → RxNav/RxNorm + openFDA label mentions + DailyMed links
 *   • seed conditions → NLM Clinical Tables (conditions + ICD-10-CM)
 *   • vitals/labs     → NLM Clinical Tables LOINC items
 *   • NPHIES          → adjudication-reason codes (bundled FHIR snapshot)
 *   • ICD-11          → Arabic display names (skipped without credentials)
 *   • MedlinePlus     → education links per condition
 *
 * Every row carries provider + system + version + fetchedAt.
 * Prints a per-provider count summary.
 */
import { bouncerUrl } from "./bouncer-url";
process.env.DATABASE_URL = bouncerUrl(process.env.DATABASE_URL);

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

import { patients } from "../lib/data/patients";
import en from "../lib/i18n/en";
import { searchRxnorm } from "../lib/server/ext/rxnav";
import { labelMentions } from "../lib/server/ext/openfda";
import { searchLabels } from "../lib/server/ext/dailymed";
import { searchTable } from "../lib/server/ext/clinicaltables";
import { icd11Search } from "../lib/server/ext/icd11";
import { educationLinks } from "../lib/server/ext/medlineplus";
import {
  loadNphiesAdjudicationReasons,
  NPHIES_SOURCE_URL,
} from "../lib/server/ext/nphies";

const counts = new Map<string, number>();
const bump = (p: string, n = 1) => counts.set(p, (counts.get(p) ?? 0) + n);

async function putTerm(
  provider: string,
  system: string,
  code: string,
  displayEn: string,
  displayAr = "",
  meta: Record<string, unknown> = {},
  version = "",
) {
  await prisma.terminology.upsert({
    where: { provider_system_code: { provider, system, code } },
    create: {
      provider, system, code, displayEn, displayAr,
      metaJson: JSON.stringify(meta), version,
    },
    update: {
      displayEn, displayAr, metaJson: JSON.stringify(meta),
      version, fetchedAt: new Date(),
    },
  });
  bump(provider);
}

async function tryStep(provider: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.warn(`  [${provider}] skipped: ${(e as Error).message}`);
  }
}

async function main() {
  const medKeys = [...new Set(patients.flatMap((p) => p.meds))];
  const dxKeys = [...new Set(patients.map((p) => p.dxKey))];
  const medTerms = medKeys.map((k) => en[`med.${k}`] ?? k);
  const dxTerms = dxKeys.map((k) => en[`dx.${k}`] ?? k);
  const loincTerms = [
    "glucose", "lactate", "ketones", "creatinine", "white blood cells",
    "heart rate", "systolic blood pressure", "respiratory rate",
    "body temperature", "oxygen saturation",
  ];

  console.log(`sync: ${medTerms.length} drug terms, ${dxTerms.length} conditions, ${loincTerms.length} LOINC searches`);

  // ── NPHIES — bundled FHIR snapshot, no network ──
  const nphies = loadNphiesAdjudicationReasons();
  for (const c of nphies.concepts) {
    await putTerm("nphies", "adjudication-reason", c.code, c.displayEn, c.displayAr,
      { sourceUrl: NPHIES_SOURCE_URL }, nphies.version);
  }

  // ── Drugs: RxNorm + openFDA + DailyMed ──
  for (const term of medTerms) {
    await tryStep("rxnav", async () => {
      const r = await searchRxnorm(term, 3);
      for (const c of r.data)
        await putTerm("rxnav", "rxcui", c.rxcui, c.name, "", { term });
    });
    await tryStep("openfda", async () => {
      // Seed meds are generic classes ("Insulin infusion") — relax the
      // query by dropping route/class words; results remain real labels.
      const relaxed = term.replace(/\b(infusion|iv|oral|tablet)s?\b/gi, "").trim() || term;
      const r = await labelMentions(relaxed);
      if (r.data)
        await putTerm("openfda", "label", term.toLowerCase(), term, "", {
          query: relaxed,
          drugInteractions: r.data.drugInteractions.length,
          boxedWarning: r.data.boxedWarning.length,
          contraindications: r.data.contraindications.length,
        });
    });
    await tryStep("dailymed", async () => {
      const r = await searchLabels(term);
      for (const l of r.data.slice(0, 3))
        await putTerm("dailymed", "setid", l.setId, l.title, "", { url: l.url, term });
    });
  }

  // ── Conditions: Clinical Tables + ICD-10-CM + MedlinePlus + ICD-11 ar ──
  for (const term of dxTerms) {
    let icdCode: string | null = null;
    await tryStep("clinicaltables", async () => {
      const r = await searchTable("conditions", term, 3);
      for (const h of r.data)
        await putTerm("clinicaltables", "conditions", h.key, h.display, "", { term });
      const icd = await searchTable("icd10cm", term, 3);
      for (const h of icd.data)
        await putTerm("clinicaltables", "icd10cm", h.key, h.display, "", { term });
      icdCode = icd.data[0]?.key ?? null;
    });
    await tryStep("medlineplus", async () => {
      // Connect requires a CODED query — reuse this run's ICD-10-CM hit.
      if (!icdCode) return;
      const r = await educationLinks({ code: icdCode, codeSystem: "icd10cm", display: term });
      for (const l of r.data.slice(0, 3))
        await putTerm("medlineplus", "education", l.url, l.title, "", { term });
    });
    await tryStep("icd11", async () => {
      const r = await icd11Search(term, "ar");
      for (const h of r.data.slice(0, 3))
        await putTerm("icd11", "icd11-mms", h.id || h.code, h.title, h.title,
          { term, license: "CC BY-ND 3.0 IGO" }, "2024-01");
    });
  }

  // ── LOINC items ──
  for (const term of loincTerms) {
    await tryStep("clinicaltables", async () => {
      const r = await searchTable("loinc_items", term, 3);
      for (const h of r.data)
        await putTerm("clinicaltables", "loinc", h.key, h.display, "", { term });
    });
  }

  console.log("\nSync complete — rows per provider:");
  for (const p of ["rxnav", "openfda", "dailymed", "clinicaltables", "icd11", "medlineplus", "nphies"])
    console.log(`  ${p.padEnd(15)} ${counts.get(p) ?? 0}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
