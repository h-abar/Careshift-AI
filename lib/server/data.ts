import { prisma } from "@/lib/server/prisma";
import type { PatientSnapshot } from "@/lib/aggregate";
import type {
  Claim,
  HandoffRecord,
  InterventionStatus,
  Patient,
  User,
} from "@/lib/types";
import { assessClinicalRisk } from "@/lib/engines/clinical-risk";
import { assessInsuranceRisk } from "@/lib/engines/insurance-risk";
import { buildInterventionPlan } from "@/lib/engines/interventions";
import { claimReadiness } from "@/lib/engines/claim-readiness";
import { computeCareValue } from "@/lib/engines/care-value";
import { simulateWhatIf } from "@/lib/engines/simulator";
import { journeys } from "@/lib/data/journeys";
import { savingsTrend } from "@/lib/data/claims";

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
  createdAt: Date;
}): Omit<User, "password"> {
  return {
    id: r.id, username: r.username, nameEn: r.nameEn, nameAr: r.nameAr,
    role: r.roleKey as User["role"], dept: r.dept,
    specialty: { en: r.specialtyEn, ar: r.specialtyAr },
    email: r.email, phone: r.phone, employeeId: r.employeeId,
    status: r.status as "active" | "suspended",
    lastLoginMin: 0, createdAt: r.createdAt.toISOString().slice(0, 10),
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
      const plan = buildInterventionPlan(patient, risk).map((s) => {
        const o = ov.get(s.id);
        return o
          ? { ...s, status: o.status as InterventionStatus, escalatedTo: o.escalatedTo ?? undefined }
          : s;
      });
      return { patient, risk, insurance: assessInsuranceRisk(patient, risk), plan };
    })
    .sort((a, b) => b.risk.score - a.risk.score);
}

/** Hospital-level aggregates — every figure derived from data. */
export async function dbOrgStats() {
  const snaps = await dbSnapshots();
  const claims = await dbClaims();
  const handoffsCount = await prisma.handoff.count();
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
    Object.values(journeys).flat().filter((e) => e.kind === "escalation").length;
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

  return {
    snaps,
    savingsTrend,
    clinical: {
      monitored: snaps.length,
      highRisk: snaps.filter((s) => s.risk.level === "high").length,
      critical: snaps.filter((s) => s.risk.level === "critical").length,
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
