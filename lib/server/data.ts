import { prisma } from "@/lib/server/prisma";
import type { PatientSnapshot } from "@/lib/aggregate";
import type {
  Claim,
  HandoffRecord,
  InterventionStatus,
  InterventionStep,
  Patient,
  User,
} from "@/lib/types";
import { assessClinicalRisk } from "@/lib/engines/clinical-risk";
import { assessInsuranceRisk } from "@/lib/engines/insurance-risk";
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

function toUser(r: {
  id: string; username: string; nameEn: string; nameAr: string;
  roleKey: string; dept: string; specialtyEn: string; specialtyAr: string;
  email: string; phone: string; employeeId: string; status: string;
  lastLoginAt: Date | null; createdAt: Date;
}): Omit<User, "password"> {
  return {
    id: r.id, username: r.username, nameEn: r.nameEn, nameAr: r.nameAr,
    role: r.roleKey as User["role"], dept: r.dept,
    specialty: { en: r.specialtyEn, ar: r.specialtyAr },
    email: r.email, phone: r.phone, employeeId: r.employeeId,
    status: r.status as "active" | "suspended",
    lastLoginMin: r.lastLoginAt
      ? Math.max(0, Math.round((Date.now() - r.lastLoginAt.getTime()) / 60000))
      : null,
    createdAt: r.createdAt.toISOString().slice(0, 10),
  };
}

function toClaim(r: {
  id: string; patientId: string | null; amountSar: number; status: string;
  dxKey: string; losDays: number; icuDays: number;
  evidenceJson: string; frictionJson: string;
}): Claim {
  return {
    id: r.id, patientId: r.patientId ?? undefined, amountSar: r.amountSar,
    status: r.status as Claim["status"], dxKey: r.dxKey,
    losDays: r.losDays, icuDays: r.icuDays,
    evidence: J(r.evidenceJson, []), frictionKeys: J(r.frictionJson, []),
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

/** Snapshots over DB patients, applying persisted intervention overrides. */
export async function dbSnapshots(): Promise<PatientSnapshot[]> {
  const [rows, overrides] = await Promise.all([
    prisma.patient.findMany(),
    prisma.interventionOverride.findMany(),
  ]);
  const ov = new Map(overrides.map((o) => [o.stepId, o]));
  return rows
    .map(toPatient)
    .map((patient) => {
      const risk = assessClinicalRisk(patient);
      const now = Date.now();
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
      return { patient, risk, insurance: assessInsuranceRisk(patient, risk), plan };
    })
    .sort((a, b) => b.risk.score - a.risk.score);
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
