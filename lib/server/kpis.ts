/**
 * C7 — claim/event KPIs computed live from the registry tables.
 * Everything is real DB-derived; payer-dependent figures are labeled
 * Simulated because adjudication is simulated (C6).
 */
import { prisma } from "@/lib/server/prisma";
import { runClaimChecks } from "@/lib/server/claim-checks";

if (typeof window !== "undefined") {
  throw new Error("lib/server/kpis.ts is server-only");
}

export interface ClaimKpis {
  label: string;
  /** % of claim lines backed by ≥1 clinical event */
  eventBackedPct: number;
  linesTotal: number;
  linesEventBacked: number;
  /** Simulated payer: approved on first version / all adjudicated v1 */
  firstPassAcceptancePct: number | null;
  /** denial counts grouped by NPHIES code category (BE/SE/AD/CV/MN) */
  denialsByCategory: { category: string; count: number }[];
  /** mean C4 readiness across claims that have lines */
  meanReadinessPct: number | null;
  billedNotLived: number;
  livedNotBilled: number;
  /** % of events flagged as late entries */
  lateEntryPct: number;
  lateEntryCount: number;
  eventsTotal: number;
  /** mean hours from the patient's latest event to claim updatedAt —
   *  prototype discharge→claim proxy (no discharge timestamp modelled) */
  meanEventToClaimH: number | null;
}

export const KPI_LABEL =
  "KPIs computed from the event/claim registry — payer figures Simulated";

export async function claimKpis(): Promise<ClaimKpis> {
  const claims = await prisma.insuranceClaim.findMany({
    include: { lines: { select: { eventBacked: true } } },
  });
  const [eventsTotal, lateEntryCount] = await Promise.all([
    prisma.clinicalEvent.count(),
    prisma.clinicalEvent.count({ where: { lateEntry: true } }),
  ]);

  const linesTotal = claims.reduce((s, c) => s + c.lines.length, 0);
  const linesEventBacked = claims.reduce(
    (s, c) => s + c.lines.filter((l) => l.eventBacked).length, 0,
  );

  // First-pass (simulated payer): a v1 claim "passed" if it is approved
  // and nothing supersedes it; it "failed" if denied or superseded.
  const v1 = claims.filter((c) => !c.supersedesId);
  const supersededIds = new Set(
    claims.filter((c) => c.supersedesId).map((c) => c.supersedesId!),
  );
  const adjudicated = v1.filter(
    (c) => c.status === "approved" || c.status === "denied" || supersededIds.has(c.id),
  );
  const passed = adjudicated.filter(
    (c) => c.status === "approved" && !supersededIds.has(c.id),
  );

  const byCat = new Map<string, number>();
  for (const c of claims) {
    if (!c.nphiesCode) continue;
    const cat = c.nphiesCode.split("-")[0];
    byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
  }

  // Readiness + both-direction counts (only for claims that have lines).
  let readinessSum = 0, readinessN = 0, bnl = 0, lnb = 0;
  for (const c of claims) {
    if (c.lines.length === 0) continue;
    const chk = await runClaimChecks(c.id);
    readinessSum += chk.readiness;
    readinessN++;
    bnl += chk.counts.billedNotLived;
    lnb += chk.counts.livedNotBilled;
  }

  // Event→claim lag: latest event per claim patient vs claim.updatedAt.
  let lagSum = 0, lagN = 0;
  const patients = [...new Set(claims.map((c) => c.patientId).filter(Boolean))] as string[];
  if (patients.length) {
    const latest = await prisma.clinicalEvent.groupBy({
      by: ["patientId"],
      where: { patientId: { in: patients } },
      _max: { occurredAt: true },
    });
    const lastEv = new Map(latest.map((l) => [l.patientId, l._max.occurredAt]));
    for (const c of claims) {
      const t = c.patientId ? lastEv.get(c.patientId) : null;
      if (!t) continue;
      lagSum += (c.updatedAt.getTime() - t.getTime()) / 3_600_000;
      lagN++;
    }
  }

  return {
    label: KPI_LABEL,
    eventBackedPct: linesTotal ? Math.round((linesEventBacked / linesTotal) * 100) : 0,
    linesTotal,
    linesEventBacked,
    firstPassAcceptancePct: adjudicated.length
      ? Math.round((passed.length / adjudicated.length) * 100)
      : null,
    denialsByCategory: [...byCat.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    meanReadinessPct: readinessN ? Math.round(readinessSum / readinessN) : null,
    billedNotLived: bnl,
    livedNotBilled: lnb,
    lateEntryPct: eventsTotal ? Math.round((lateEntryCount / eventsTotal) * 100) : 0,
    lateEntryCount,
    eventsTotal,
    meanEventToClaimH: lagN ? Math.round((lagSum / lagN) * 10) / 10 : null,
  };
}
