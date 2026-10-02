import type { Claim } from "@/lib/types";

// Deterministic PRNG so the dataset is identical on every build/seed.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260929);
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

const dxPool = [
  "pneumonia", "dka", "chf", "giBleed", "postOp", "asthma",
  "cellulitis", "dvt", "renalColic", "chestPain", "sepsis", "falls",
];
const frictionPool = [
  "missingLab", "missingTimestamp", "missingJustification",
  "missingIntervention", "missingAuth", "inconsistentTimeline",
];

// Explicit claims linked to live in-house patients (shown in detail tables).
const linkedClaims: Claim[] = [
  {
    id: "CL-88120", patientId: "P-1042", amountSar: 18500, status: "review",
    dxKey: "dka", losDays: 2, icuDays: 0,
    evidence: ["diagnosis", "justification", "intervention", "clinician", "timeline"],
    frictionKeys: ["missingLab"],
  },
  {
    id: "CL-87951", patientId: "P-2031", amountSar: 12200, status: "pending",
    dxKey: "sepsis", losDays: 4, icuDays: 1,
    evidence: ["diagnosis", "justification", "intervention", "clinician", "timeline", "lab"],
    frictionKeys: [],
  },
  {
    id: "CL-87734", patientId: "P-6304", amountSar: 22400, status: "denied",
    dxKey: "giBleed", losDays: 5, icuDays: 0,
    evidence: ["diagnosis", "intervention", "clinician"],
    frictionKeys: ["inconsistentTimeline", "missingTimestamp"],
  },
  {
    id: "CL-87402", patientId: "P-7455", amountSar: 15800, status: "pending",
    dxKey: "chf", losDays: 4, icuDays: 0,
    evidence: ["diagnosis", "justification", "clinician", "timeline", "lab"],
    frictionKeys: ["missingIntervention"],
  },
  // E7 — pipeline fixtures: "draft" claims are assembled, checked and
  // auto-submitted (or parked in exception) by the system, not a clerk.
  {
    id: "CL-88210", patientId: "P-1042", amountSar: 21400, status: "draft",
    dxKey: "dka", losDays: 2, icuDays: 0,
    evidence: ["diagnosis", "justification", "intervention", "clinician", "timeline", "lab"],
    frictionKeys: [],
  },
  {
    id: "CL-88501", patientId: "P-7455", amountSar: 12600, status: "draft",
    dxKey: "chf", losDays: 3, icuDays: 0,
    evidence: ["diagnosis", "justification", "clinician", "timeline"],
    frictionKeys: ["missingJustification"],
  },
];

// Remaining volume — realistic mix across the last 60 days.
const generated: Claim[] = Array.from({ length: 46 }, (_, i) => {
  const status = pick<Claim["status"]>([
    "approved", "approved", "approved", "approved",
    "pending", "pending", "review", "review", "denied",
  ]);
  const icu = rnd() < 0.18;
  const all = ["diagnosis", "justification", "intervention", "clinician", "timeline", "lab"];
  const missingCount =
    status === "approved" ? (rnd() < 0.8 ? 0 : 1) : 1 + Math.floor(rnd() * 3);
  const evidence = all.filter(() => rnd() > missingCount / 8);
  return {
    id: `CL-${86000 + i * 37}`,
    amountSar: Math.round((2800 + rnd() * 42000) / 100) * 100,
    status,
    dxKey: pick(dxPool),
    losDays: 1 + Math.floor(rnd() * 9),
    icuDays: icu ? 1 + Math.floor(rnd() * 4) : 0,
    evidence: evidence.length ? evidence : ["diagnosis"],
    frictionKeys:
      status === "approved"
        ? []
        : Array.from(new Set(Array.from({ length: missingCount }, () => pick(frictionPool)))),
  };
});

export const claims: Claim[] = [...linkedClaims, ...generated];

export const EVIDENCE_KEYS = [
  "diagnosis",
  "justification",
  "intervention",
  "clinician",
  "timeline",
  "lab",
] as const;


