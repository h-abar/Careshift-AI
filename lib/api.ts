"use client";

import { useEffect, useState } from "react";
import type { PatientSnapshot } from "@/lib/aggregate";
import type {
  Assignment,
  Claim,
  HandoffRecord,
  JourneyKind,
  NotificationItem,
  ShiftHandoff,
  StaffPicker,
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

export interface ClaimLinkedCase {
  patientId: string;
  claimId: string;
  claimStatus: string;
  dxKey: string;
  riskLevel: string;
  claimRisk: string;
  docCompleteness: number;
  exposureSar: number;
}

export interface OrgStats {
  /** Present ONLY for roles with patients_view — see A1 PHI split. */
  snaps?: PatientSnapshot[];
  /** Minimum-necessary claim-linked cases for oversight roles. */
  claimLinked: ClaimLinkedCase[];
  savingsTrend: { month: string; monthAr: string; avoided: number; exposure: number }[];
  clinical: {
    monitored: number;
    highRisk: number;
    elevated: number;
    critical: number;
    docGaps: number;
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
export const usePatientsTable = (p?: { page?: number; pageSize?: number }) =>
  useApi<{
    snaps: PatientSnapshot[];
    total?: number;
    page?: number;
    pageSize?: number;
    assignments: Assignment[];
    userNames: Record<string, { en: string; ar: string }>;
  }>(`/api/patients${qs(p ?? {})}`);
export const useHandoffContext = () =>
  useApi<{ ho: ShiftHandoff; snaps: PatientSnapshot[] }>("/api/handoff");
export const useHandoffs = () =>
  useApi<{ handoffs: HandoffRecord[]; users: StaffPicker[] }>(
    "/api/handoffs",
  );
export const useHandoff = (id: string) =>
  useApi<{
    handoff: HandoffRecord;
    users: StaffPicker[];
    snaps: PatientSnapshot[];
  }>(`/api/handoffs/${id}`, [id]);
export const qs = (p: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p))
    if (v !== undefined && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};

export const useUsers = (p?: {
  q?: string;
  role?: string;
  dept?: string;
  status?: string;
  page?: number;
}) =>
  useApi<{
    users: (Omit<User, "password"> & { locked: boolean })[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/api/users${qs(p ?? {})}`);
export const useUser = (id: string) =>
  useApi<{ user: Omit<User, "password"> }>(`/api/users/${id}`, [id]);
export const useClaims = (p?: {
  status?: string;
  page?: number;
  pageSize?: number;
}) =>
  useApi<{
    claims: (Claim & {
      readiness: { score: number; checklist: { key: string; ok: boolean }[] };
    })[];
    savingsTrend: { month: string; monthAr: string; avoided: number; exposure: number }[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/api/claims${qs(p ?? {})}`);
export const useAudit = (p?: {
  userId?: string;
  action?: string;
  page?: number;
}) =>
  useApi<{
    total: number;
    page: number;
    pageSize: number;
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
  }>(`/api/audit${qs(p ?? {})}`);
export const useNotifications = () =>
  useApi<{ notifications: NotificationItem[]; unread: number }>(
    "/api/notifications",
  );

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
  riskHistory: {
    score: number;
    level: string;
    conditionKey: string;
    confidence: number;
    assessedAt: string;
  }[];
  claim: (Claim & { updatedAt?: string }) | null;
  readiness: {
    score: number;
    checklist: { key: string; ok: boolean }[];
  } | null;
}

export const usePatientDetail = (id: string) =>
  useApi<PatientDetail>(`/api/patients/${id}`, [id]);

export interface TimelineEvent {
  id: string;
  type: string;
  occurredAt: string;
  recordedAt: string;
  lateEntry: boolean;
  actorRole: string;
  actor: string | null;
  payload: Record<string, unknown>;
  ruleId: string | null;
  ruleKey: string | null;
  ruleVersion: number | null;
  correctsId: string | null;
  correctionReason: string | null;
  claimId: string | null;
  hash: string;
  categories: string[];
}

export interface ChainStep {
  step: string;
  status: "ok" | "gap" | "na";
  eventId?: string;
  at?: string;
  note?: string;
}

export const usePatientEvents = (id: string, category = "") =>
  useApi<{
    scope: string;
    events: TimelineEvent[];
    chain?: { steps: ChainStep[]; gaps: number; label: string } | null;
  }>(
    `/api/patients/${id}/events${category ? `?category=${category}` : ""}`,
    [id, category],
  );

/* ── Mutations ── */

/** Carries the consistent server error shape {error, code?, fields?} to callers. */
export class ApiError extends Error {
  code?: string;
  fields?: Record<string, string>;
  status: number;
  constructor(status: number, body: { error?: string; code?: string; fields?: Record<string, string> }) {
    super(body.error ?? `${status}`);
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
  }
}

async function failIfNotOk(r: Response) {
  if (!r.ok) throw new ApiError(r.status, await r.json().catch(() => ({})));
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await failIfNotOk(r);
  return (await r.json()) as T;
}

export async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await failIfNotOk(r);
  return (await r.json()) as T;
}
