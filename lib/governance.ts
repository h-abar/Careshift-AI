/**
 * B1–B6 shared governance helpers (client + server safe).
 * Rule classification derives from the KB category — never hand-typed.
 */

export type RuleClass =
  | "validated"    // ordering/risk rules backed by cited evidence
  | "informational"// context rules — displayed, never reordering
  | "kpi"          // operational KPI definitions
  | "prototype";   // configurable prototype settings (env)

export const RULE_CLASS: Record<string, RuleClass> = {
  ordering: "validated",
  risk: "validated",
  "claim-map": "validated",
  context: "informational",
  kpi: "kpi",
};

/** "Used in" map — derived from rule category, not hand-written text. */
export const USED_IN: Record<string, string[]> = {
  ordering: ["priority list", "alerts"],
  risk: ["alerts", "priority list"],
  context: ["display only"],
  "claim-map": ["claims"],
  kpi: ["KPIs"],
};

/** Prototype settings — env-configurable, NOT clinical standards. */
export const PROTOTYPE_SETTINGS: {
  key: string; env: string; default: number; unit: string;
}[] = [
  { key: "lateEntryMinutes", env: "LATE_ENTRY_MINUTES", default: 240, unit: "min" },
  { key: "chainAckMinutes", env: "CHAIN_ACK_MINUTES", default: 15, unit: "min" },
  { key: "chainSeenMinutes", env: "CHAIN_SEEN_MINUTES", default: 60, unit: "min" },
];

/** Feature groups for the scientific references page (B4). A rule key
 *  assigns its references to a feature; unmapped keys go to 'other'. */
export const FEATURE_OF_RULE: Record<string, string> = {
  "news2-score": "early-warning",
  "news2-tier": "early-warning",
  "shock-lactate": "sepsis",
  "sepsis-hour1-bundle": "sepsis",
  "patient-ordering": "decision-support",
  "qsofa-context": "sepsis",
  "claim-line-map": "claims",
};

export const FEATURES = [
  "early-warning", "sepsis", "handoff", "nursing-care",
  "decision-support", "claims", "other",
] as const;
export type Feature = (typeof FEATURES)[number];

/** Line-based diff of two pretty-printed JSON payloads (B1 history). */
export function diffJson(a: string, b: string): { line: string; kind: "same" | "del" | "add" }[] {
  const aa = a.split("\n");
  const bb = b.split("\n");
  const out: { line: string; kind: "same" | "del" | "add" }[] = [];
  const A = new Set(aa), B = new Set(bb);
  // simple symmetric view — good enough for version-to-version display
  for (const l of aa) if (!B.has(l)) out.push({ line: `- ${l}`, kind: "del" });
  for (const l of bb) if (!A.has(l)) out.push({ line: `+ ${l}`, kind: "add" });
  if (!out.length) out.push({ line: "(identical)", kind: "same" });
  return out;
}

/** BibTeX/RIS export for a reference row (B4). */
export function toBibtex(r: {
  key: string; titleEn: string; venue: string; year: number | null;
  kind: string; value: string;
}): string {
  const id = r.kind === "pmid" ? `pmid:${r.value}` : r.kind === "doi" ? `doi:${r.value}` : r.value;
  return [
    `@article{${r.key},`,
    `  title = {${r.titleEn}},`,
    `  journal = {${r.venue}},`,
    `  year = {${r.year ?? ""}},`,
    `  note = {${id}},`,
    `}`,
  ].join("\n");
}

export function toRis(r: {
  key: string; titleEn: string; venue: string; year: number | null;
  kind: string; value: string;
}): string {
  return [
    "TY  - JOUR",
    `TI  - ${r.titleEn}`,
    `JO  - ${r.venue}`,
    `PY  - ${r.year ?? ""}`,
    `UR  - ${r.kind === "pmid" ? `https://pubmed.ncbi.nlm.nih.gov/${r.value}/` : r.kind === "doi" ? `https://doi.org/${r.value}` : r.value}`,
    `ID  - ${r.key}`,
    "ER  -",
  ].join("\n");
}
