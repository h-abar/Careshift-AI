/**
 * NPHIES IG code systems — STATIC IMPORT ONLY (no live calls).
 * Snapshot: knowledge/terminology/nphies-adjudication-reason.json
 * fetched once from the official IG page; the importer stamps sourceUrl,
 * version and fetch date onto every Terminology row.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export const NPHIES_ATTRIBUTION =
  "NPHIES Implementation Guide — Saudi Health Information Exchange Policies (nphies.sa)";

export const NPHIES_SOURCE_URL =
  "https://portal.nphies.sa/ig/CodeSystem-adjudication-reason.html";

const FILE = path.join(
  process.cwd(),
  "knowledge",
  "terminology",
  "nphies-adjudication-reason.json",
);

interface FhirConcept {
  code: string;
  display?: string;
  definition?: string;
  designation?: { language?: string; value?: string }[];
}

interface FhirCodeSystem {
  resourceType: string;
  url?: string;
  version?: string;
  date?: string;
  concept?: FhirConcept[];
}

export interface NphiesConcept {
  code: string;
  displayEn: string;
  displayAr: string;
}

export interface NphiesSnapshot {
  sourceUrl: string;
  version: string;
  concepts: NphiesConcept[];
}

/** Read the bundled FHIR CodeSystem snapshot — no network. */
export function loadNphiesAdjudicationReasons(): NphiesSnapshot {
  const j = JSON.parse(readFileSync(FILE, "utf8")) as FhirCodeSystem;
  if (j.resourceType !== "CodeSystem" || !Array.isArray(j.concept))
    throw new Error("nphies snapshot is not a FHIR CodeSystem");
  const concepts = j.concept
    .filter((c) => c.code && c.display)
    .map((c) => ({
      code: c.code,
      displayEn: c.display!,
      displayAr:
        c.designation?.find((d) => d.language === "ar")?.value ?? "",
    }));
  return {
    sourceUrl: NPHIES_SOURCE_URL,
    version: j.version ?? "",
    concepts,
  };
}
