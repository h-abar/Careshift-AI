"use client";

import { useEffect, useState } from "react";
import type { PatientSnapshot } from "@/lib/aggregate";
import type {
  Claim,
  HandoffRecord,
  JourneyKind,
  NotificationItem,
  ShiftHandoff,
  User,
} from "@/lib/types";

/** Tiny fetch hook — returns {data, loading, error}; refetch() reloads. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let live = true;
    fetch(path)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return (await r.json()) as T;
      })
      .then((d) => {
        if (live) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (live) setError(String(e?.message ?? e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  return {
    data,
    loading,
    error,
    refetch: () => {
      setLoading(true);
      setTick((t) => t + 1);
    },
  };
}

/* ── Typed endpoints ── */

export interface OrgStats {
  snaps: PatientSnapshot[];
  savingsTrend: { month: string; monthAr: string; avoided: number; exposure: number }[];
  clinical: {
    monitored: number;
    highRisk: number;
    critical: number;
    interventionsPending: number;
  };
  operational: {
    avgInterventionMin: number;
    overdue: number;
    escalations: number;
    closedLoopCompletion: number;
    handoffs: number;
  };
  financial: {
    claimsMonitored: number;
    claimsDocPct: number;
    claimsAtRisk: number;
    claimsDenied: number;
    exposureSar: number;
  };
  value: {
    icuAvoided: number;
    losDaysReduced: number;
    docImprovement: number;
    careValue: {
      total: number;
      clinicalSafety: number;
      timeliness: number;
      documentation: number;
      operational: number;
      insuranceReadiness: number;
    };
  };
}

export const useOrg = () => useApi<OrgStats>("/api/snapshots");
export const useSnapshots = () =>
  useApi<{ snaps: PatientSnapshot[] }>("/api/patients");
export const usePatientsTable = () =>
  useApi<{
    snaps: PatientSnapshot[];
    assignments: {
      patientId: string;
      nurseId: string;
      physicianId: string;
      chargeNurseId: string;
    }[];
    userNames: Record<string, { en: string; ar: string }>;
  }>("/api/patients");
export const useHandoffContext = () =>
  useApi<{ ho: ShiftHandoff; snaps: PatientSnapshot[] }>("/api/handoff");
export const useHandoffs = () =>
  useApi<{ handoffs: HandoffRecord[]; users: Omit<User, "password">[] }>(
    "/api/handoffs",
  );
export const useHandoff = (id: string) =>
  useApi<{
    handoff: HandoffRecord;
    users: Omit<User, "password">[];
    snaps: PatientSnapshot[];
  }>(`/api/handoffs/${id}`, [id]);
export const useUsers = () =>
  useApi<{ users: Omit<User, "password">[] }>("/api/users");
export const useUser = (id: string) =>
  useApi<{ user: Omit<User, "password"> }>(`/api/users/${id}`, [id]);
export const useClaims = () =>
  useApi<{
    claims: (Claim & {
      readiness: { score: number; checklist: { key: string; ok: boolean }[] };
    })[];
    savingsTrend: { month: string; monthAr: string; avoided: number; exposure: number }[];
  }>("/api/claims");
export const useAudit = () =>
  useApi<{
    entries: {
      id: string;
      userId: string;
      userName: string;
      userNameAr: string;
      action: string;
      entityType: string;
      entityId: string;
      prev: unknown;
      next: unknown;
      ip: string | null;
      sessionId: string | null;
      createdAt: string;
    }[];
  }>("/api/audit");
export const useNotifications = () =>
  useApi<{ notifications: NotificationItem[] }>("/api/notifications");

export interface PatientDetail {
  patient: PatientSnapshot["patient"];
  risk: PatientSnapshot["risk"];
  insurance: PatientSnapshot["insurance"];
  plan: PatientSnapshot["plan"];
  sim: {
    noIntervention: { icuRiskPct: number; extraLosDays: number; exposureSar: number; docCompleteness: number };
    earlyIntervention: { icuRiskPct: number; extraLosDays: number; exposureSar: number; docCompleteness: number };
  };
  journey: { t: string; kind: JourneyKind; key: string; riskScore?: number }[];
  claim: (Claim & { updatedAt?: string }) | null;
  readiness: {
    score: number;
    checklist: { key: string; ok: boolean }[];
  } | null;
}

export const usePatientDetail = (id: string) =>
  useApi<PatientDetail>(`/api/patients/${id}`, [id]);

/* ── Mutations ── */

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `${r.status}`);
  return (await r.json()) as T;
}
