import { prisma } from "@/lib/server/prisma";
import type { PatientSnapshot } from "@/lib/aggregate";
import type {
  Claim,
  HandoffRecord,
  InterventionStatus,
  InterventionStep,
  Patient,
  StaffPicker,
  User,
} from "@/lib/types";
import { assessClinicalRisk } from "@/lib/engines/clinical-risk";
import { assessInsuranceRisk } from "@/lib/engines/insurance-risk";
import {
  byPriority,
  computePriority,
  lactateOf,
  latestVitals,
  vitalsStaleMin,
  type PrioritySignals,
} from "@/lib/engines/priority";
import { runRule, KbError } from "@/lib/server/kb";
import { buildInterventionPlan } from "@/lib/engines/interventions";
import { claimReadiness } from "@/lib/engines/claim-readiness";
import { computeCareValue } from "@/lib/engines/care-value";
import { simulateWhatIf } from "@/lib/engines/simulator";

const J = <T>(s: string | null | undefined, fb: T): T =>
  s ? (JSON.parse(s) as T) : fb;

/* ── DB → domain mappers ── */

function toPatient(r: {
  id: string; nameEn: string; nameAr: string; age: number; sex: string;
  room: string; dxKey: string; attending: string; admittedAt: string;
  shift: string; vitalsJson: string; labsJson: string; riskFlagsJson: string;
  medsJson: string; noteEn: string; noteAr: string;
}): Patient {
  return {
    id: r.id, nameEn: r.nameEn, nameAr: r.nameAr, age: r.age,
    sex: r.sex as "M" | "F", room: r.room, dxKey: r.dxKey,
    attending: r.attending, admittedAt: r.admittedAt,
    shift: r.shift as "day" | "night",
    vitals: J(r.vitalsJson, []), labs: J(r.labsJson, []),
    riskFlags: J(r.riskFlagsJson, []), meds: J(r.medsJson, []),
    noteEn: r.noteEn, noteAr: r.noteAr,
  };
}

export function toUser(r: {
  id: string; username: string; nameEn: string; nameAr: string;
  roleKey: string; dept: string; specialtyEn: string; specialtyAr: string;
  email: string; phone: string; employeeId: string; status: string;
  consentAt: Date | null; lastLoginAt: Date | null; createdAt: Date;
  termsVersion: string; tenantId: string;
}): Omit<User, "password"> {
  return {
    tenantId: r.tenantId,
    id: r.id, username: r.username, nameEn: r.nameEn, nameAr: r.nameAr,
    role: r.roleKey as User["role"], dept: r.dept,
    specialty: { en: r.specialtyEn, ar: r.specialtyAr },
    email: r.email, phone: r.phone, employeeId: r.employeeId,
    status: r.status as "active" | "suspended",
    termsVersion: r.termsVersion,
    consentAt: r.consentAt?.toISOString() ?? null,
    lastLoginMin: r.lastLoginAt
      ? Math.max(0, Math.round((Date.now() - r.lastLoginAt.getTime()) / 60000))
      : null,
    createdAt: r.createdAt.toISOString().slice(0, 10),
  };
}

export function toClaim(r: {
  id: string; patientId: string | null; amountSar: number; status: string;
  dxKey: string; losDays: number; icuDays: number;
  evidenceJson: string; frictionJson: string;
  nphiesCode?: string | null; version?: number; supersedesId?: string | null;
}): Claim {
  return {
    id: r.id, patientId: r.patientId ?? undefined, amountSar: r.amountSar,
    status: r.status as Claim["status"], dxKey: r.dxKey,
    losDays: r.losDays, icuDays: r.icuDays,
    evidence: J(r.evidenceJson, []), frictionKeys: J(r.frictionJson, []),
    nphiesCode: r.nphiesCode ?? null,
    version: r.version ?? 1,
    supersedesId: r.supersedesId ?? null,
  };
}

function toHandoff(r: {
  id: string; dept: string; shift: string; date: string;
  outgoingId: string; incomingId: string; patientIdsJson: string;
  status: string; reviewedJson: string; checklistJson: string; timelineJson: string;
}): HandoffRecord {
  return {
    id: r.id, dept: r.dept, shift: r.shift as "day" | "night", date: r.date,
    outgoingId: r.outgoingId, incomingId: r.incomingId,
    patientIds: J(r.patientIdsJson, []), status: r.status as HandoffRecord["status"],
    reviewed: J(r.reviewedJson, {}), checklist: J(r.checklistJson, []),
    timeline: J(r.timelineJson, []),
  };
}

/* ── Queries ── */

export async function dbPatients(): Promise<Patient[]> {
  return (await prisma.patient.findMany()).map(toPatient);
}

export async function dbPatient(id: string): Promise<Patient | null> {
  const r = await prisma.patient.findUnique({ where: { id } });
  return r ? toPatient(r) : null;
}

export async function dbUsers(): Promise<Omit<User, "password">[]> {
  return (await prisma.user.findMany({ orderBy: { id: "asc" } })).map(toUser);
}

/**
 * Minimum-necessary staff list for pickers (handoff wizard, handoff
 * detail name resolution, patient assignments). Never leaks
 * email/phone/employeeId/username to non-admin roles.
 */
export async function dbStaffPickers(): Promise<StaffPicker[]> {
  return (
    await prisma.user.findMany({
      select: { id: true, nameEn: true, nameAr: true, roleKey: true, dept: true },
      orderBy: { id: "asc" },
    })
  ).map((r) => ({
    id: r.id,
    nameEn: r.nameEn,
    nameAr: r.nameAr,
    role: r.roleKey as StaffPicker["role"],
    dept: r.dept,
  }));
}

export async function dbUser(id: string) {
  const r = await prisma.user.findUnique({ where: { id } });
  return r ? toUser(r) : null;
}

export async function dbClaims(): Promise<Claim[]> {
  return (await prisma.insuranceClaim.findMany()).map(toClaim);
}

export async function dbHandoffs(): Promise<HandoffRecord[]> {
  return (await prisma.handoff.findMany({ orderBy: { id: "desc" } })).map(toHandoff);
}

/**
 * Snapshots over DB patients, applying persisted intervention overrides.
 *
 * MULTI-INSTANCE SAFETY: this is a per-process, best-effort cache with a
 * short TTL (15 s). Writes bust it locally via invalidateSnapshots(), but a
 * second app instance will not see that invalidation — its cache simply
 * expires. That is acceptable for reads (worst case: a stale view for up to
 * 15 s); all mutating routes still write straight to the DB. If the
 * deployment ever scales past one instance and 15 s staleness matters,
 * replace this with a shared store (Redis) or drop the cache — it is an
 * optimization only, never a correctness dependency.
 */
const SNAPS_TTL_MS = 15_000;
let snapsCache: { at: number; data: PatientSnapshot[] } | null = null;

/** Bust the snapshot cache after any patient/intervention write. */
export function invalidateSnapshots() {
  snapsCache = null;
}

/**
 * Minutes since the earliest high/critical RiskAssessment per patient —
 * the hour-1 bundle clock's t0 (SSC 2021 / Seymour 2017). 0 when the
 * patient never crossed a high tier.
 */
async function triggerMinutes(): Promise<Map<string, number>> {
  const rows = await prisma.riskAssessment.findMany({
    where: { level: { in: ["high", "critical"] } },
    orderBy: { assessedAt: "asc" },
    select: { patientId: true, assessedAt: true },
  });
  const first = new Map<string, Date>();
  for (const r of rows) if (!first.has(r.patientId)) first.set(r.patientId, r.assessedAt);
  const now = Date.now();
  const out = new Map<string, number>();
  for (const [pid, at] of first)
    out.set(pid, Math.max(0, Math.round((now - at.getTime()) / 60000)));
  return out;
}

/**
 * Compute PrioritySignals via the seeded knowledge-base rules — every run
 * writes RuleExecution rows (id + version + inputs + output). Falls back
 * to the pure engine only when the KB is not seeded yet (KbError), so the
 * ordering contract never silently breaks; parity is asserted in tests.
 */
async function priorityViaRules(
  patient: Patient,
  plan: InterventionStep[],
  triggeredMin: number,
): Promise<PrioritySignals | null> {
  try {
    const v = latestVitals(patient);
    if (!v) return null;
    const n2 = await runRule("news2-score", v as unknown as Record<string, unknown>, { patientId: patient.id });
    const tier = await runRule("news2-tier", { score: n2.score, maxSingle: n2.maxSingle }, { patientId: patient.id });
    const lactate = lactateOf(patient);
    const shock = await runRule("shock-lactate", {
      si: v.sbp > 0 ? v.hr / v.sbp : 0,
      lactate: lactate ?? -1,
    }, { patientId: patient.id });
    const bundle = await runRule("sepsis-hour1-bundle", {
      news2: n2.score as number,
      shockSuspect: shock.suspect ? 1 : 0,
      elapsedMin: triggeredMin,
    }, { patientId: patient.id });
    const ordering = await runRule("patient-ordering", {
      tier: tier.tier, news2: n2.score, shock: shock.suspect ? 1 : 0,
      bundleOverdueMin: bundle.overdueMin,
    }, { patientId: patient.id });
    const q = await runRule("qsofa-context", v as unknown as Record<string, unknown>, { patientId: patient.id });
    return {
      news2: Number(n2.score), tier: Number(tier.tier) as PrioritySignals["tier"],
      maxSingle: Number(n2.maxSingle),
      shockIndex: Math.round((v.sbp > 0 ? v.hr / v.sbp : 0) * 100) / 100,
      shockSuspect: Boolean(shock.suspect),
      lactate,
      bundleIndicated: Boolean(bundle.indicated),
      bundleOverdueMin: Number(bundle.overdueMin),
      sortKey: Number(ordering.sortKey),
      qsofa: Number(q.score),
      info: {
        overdueTasks: plan.filter((s) => s.status === "overdue").length,
        vitalsStaleMin: vitalsStaleMin(patient),
        nurseConcern: patient.riskFlags.includes("nurse-concern"),
      },
    };
  } catch (e) {
    if (e instanceof KbError) return computePriority(patient, plan, triggeredMin);
    throw e;
  }
}

export async function dbSnapshots(): Promise<PatientSnapshot[]> {
  if (snapsCache && Date.now() - snapsCache.at < SNAPS_TTL_MS)
    return snapsCache.data;
  const [rows, overrides, triggers] = await Promise.all([
    prisma.patient.findMany(),
    prisma.interventionOverride.findMany(),
    triggerMinutes(),
  ]);
  const ov = new Map(overrides.map((o) => [o.stepId, o]));
  const now = Date.now();
  // Rule evaluations are independent per patient — run them in parallel
  // (real Postgres pools connections; local PGlite serializes safely).
  const data = await Promise.all(
    rows.map(toPatient).map(async (patient): Promise<PatientSnapshot> => {
      const risk = assessClinicalRisk(patient);
      const plan = buildInterventionPlan(patient, risk).map((s) => {
        const o = ov.get(s.id);
        if (!o) return s;
        // Overdue is DERIVED from the real dueAt timestamp, never stored.
        const derived =
          o.dueAt && o.dueAt.getTime() < now &&
          (o.status === "pending" || o.status === "in_progress")
            ? "overdue"
            : o.status;
        return {
          ...s,
          status: derived as InterventionStatus,
          escalatedTo: (o.escalatedTo ?? undefined) as InterventionStep["escalatedTo"],
          assigneeId: o.assigneeId ?? undefined,
          dueAt: o.dueAt?.toISOString(),
          dueInMin: o.dueAt
            ? Math.max(0, Math.round((o.dueAt.getTime() - now) / 60000))
            : s.dueInMin,
          note: o.note || undefined,
          resolvedAt: o.resolvedAt?.toISOString(),
        };
      });
      const priority = await priorityViaRules(patient, plan, triggers.get(patient.id) ?? 0);
      return { patient, risk, insurance: assessInsuranceRisk(patient, risk), plan, priority };
    }),
  );
  // Ordering = validated indicators ONLY (NEWS2 tier → score → shock →
  // bundle delay). risk.score, nurse concern, overdue tasks, stale vitals
  // are displayed as information and do NOT change the order.
  data.sort(byPriority);
  snapsCache = { at: Date.now(), data };
  return data;
}

/* ── Computed savings trend (B7 — replaces the static fixture) ── */

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/**
 * Monthly claim-value trend COMPUTED from claim rows: `avoided` = approved
 * claim value, `exposure` = non-approved claim value (SAR thousands),
 * bucketed by claim.updatedAt over the last 6 calendar months.
 */
export async function dbSavingsTrend() {
  const rows = await prisma.insuranceClaim.findMany({
    select: { amountSar: true, status: true, updatedAt: true },
  });
  const now = new Date();
  const buckets = new Map<
    string,
    { month: string; monthAr: string; avoided: number; exposure: number }
  >();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(`${d.getFullYear()}-${d.getMonth()}`, {
      month: MONTHS_EN[d.getMonth()],
      monthAr: MONTHS_AR[d.getMonth()],
      avoided: 0,
      exposure: 0,
    });
  }
  for (const c of rows) {
    const b = buckets.get(
      `${c.updatedAt.getFullYear()}-${c.updatedAt.getMonth()}`,
    );
    if (!b) continue;
    if (c.status === "approved") b.avoided += c.amountSar;
    else b.exposure += c.amountSar;
  }
  return [...buckets.values()].map((b) => ({
    ...b,
    avoided: Math.round(b.avoided / 1000),
    exposure: Math.round(b.exposure / 1000),
  }));
}

/**
 * Hospital-level aggregates — every figure derived from data.
 * includeSnaps controls whether patient-level records are returned at all;
 * claimLinked is the minimum-necessary view for claim-linked roles.
 */
export async function dbOrgStats(opts?: { includeSnaps?: boolean }) {
  const [snaps, claims, handoffsCount, journeyRows, savingsTrend] =
    await Promise.all([
      dbSnapshots(),
      dbClaims(),
      prisma.handoff.count(),
      prisma.patient.findMany({ select: { journeyJson: true } }),
      dbSavingsTrend(),
    ]);
  const byPatient = new Map(snaps.map((s) => [s.patient.id, s]));
  const steps = snaps.flatMap((s) => s.plan);
  const pendingSteps = steps.filter(
    (i) => i.status === "pending" || i.status === "in_progress",
  );
  const doneSteps = steps.filter((i) => i.status === "done");

  const docScores = snaps.map((s) => s.insurance.docCompleteness);
  const avgDoc = Math.round(docScores.reduce((a, b) => a + b, 0) / docScores.length);
  const totalExposure = snaps.reduce((s, x) => s + x.insurance.exposureSar, 0);

  const escalations =
    steps.filter((s) => s.status === "escalated").length +
    journeyRows
      .flatMap((r) => J<{ kind: string }[]>(r.journeyJson, []))
      .filter((e) => e.kind === "escalation").length;
  const overdue = steps.filter(
    (s) => s.status !== "done" && s.offsetMin <= 3 && s.dueInMin <= 5,
  ).length;
  const closedLoopCompletion = steps.length
    ? Math.round((doneSteps.length / steps.length) * 100)
    : 0;
  const avgInterventionMin = doneSteps.length
    ? Math.round(doneSteps.reduce((a, s) => a + s.offsetMin, 0) / doneSteps.length)
    : 0;

  const readiness = claims.map((c) => claimReadiness(c).score);
  const avgReadiness = Math.round(
    readiness.reduce((a, b) => a + b, 0) / readiness.length,
  );
  const claimsAtRisk = claims.filter(
    (c) => c.status !== "approved" && claimReadiness(c).score < 80,
  ).length;

  const intervened = snaps.filter((s) => s.plan.some((i) => i.status === "done"));
  const icuAvoided = intervened.filter(
    (s) => s.risk.level === "critical" || s.risk.level === "high",
  ).length;
  const losDaysReduced = Math.round(
    intervened.reduce((a, s) => {
      const sim = simulateWhatIf(s.patient, s.risk);
      return a + (sim.noIntervention.extraLosDays - sim.earlyIntervention.extraLosDays);
    }, 0),
  );
  const docImprovement = intervened.length
    ? Math.max(
        0,
        Math.round(
          intervened.reduce((a, s) => a + s.insurance.docCompleteness, 0) /
            intervened.length - avgDoc,
        ),
      )
    : 0;

  const elevated = snaps.filter((s) => s.risk.level !== "low");
  const covered = elevated.filter((s) =>
    s.plan.some((i) => i.status === "done" || i.status === "in_progress"),
  );
  const clinicalSafety = elevated.length
    ? Math.round((covered.length / elevated.length) * 100)
    : 100;
  const dueSteps = steps.filter((s) => s.offsetMin <= 3);
  const timeliness = dueSteps.length
    ? Math.round(
        (dueSteps.filter((s) => s.status === "done").length / dueSteps.length) * 100,
      )
    : 100;

  const careValue = computeCareValue({
    clinicalSafety,
    timeliness,
    documentation: avgDoc,
    operational: closedLoopCompletion,
    insuranceReadiness: avgReadiness,
  });

  // Minimum-necessary, claim-linked patient fields for roles that may not
  // read patient records (e.g. insurance reviewer): id + dx + risk summary
  // only — never names, vitals, labs or meds.
  const claimLinked = claims
    .filter((c) => c.patientId && byPatient.has(c.patientId))
    .map((c) => {
      const s = byPatient.get(c.patientId!)!;
      return {
        patientId: c.patientId!,
        claimId: c.id,
        claimStatus: c.status,
        dxKey: c.dxKey,
        riskLevel: s.risk.level,
        claimRisk: s.insurance.claimRisk,
        docCompleteness: s.insurance.docCompleteness,
        exposureSar: s.insurance.exposureSar,
      };
    })
    .sort((a, b) => b.exposureSar - a.exposureSar)
    .slice(0, 12);

  return {
    savingsTrend,
    claimLinked,
    ...(opts?.includeSnaps ? { snaps } : {}),
    clinical: {
      monitored: snaps.length,
      highRisk: snaps.filter((s) => s.risk.level === "high").length,
      elevated: snaps.filter((s) => s.risk.level !== "low").length,
      critical: snaps.filter((s) => s.risk.level === "critical").length,
      docGaps: snaps.filter((s) => s.insurance.docCompleteness < 85).length,
      interventionsPending: pendingSteps.length,
    },
    operational: {
      avgInterventionMin,
      overdue,
      escalations,
      closedLoopCompletion,
      handoffs: handoffsCount,
    },
    financial: {
      claimsMonitored: claims.length,
      claimsDocPct: avgReadiness,
      claimsAtRisk,
      claimsDenied: claims.filter((c) => c.status === "denied").length,
      exposureSar: totalExposure,
    },
    value: { icuAvoided, losDaysReduced, docImprovement, careValue },
  };
}
