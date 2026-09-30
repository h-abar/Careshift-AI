"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { postJson, useSnapshots } from "@/lib/api";
import { useToast } from "@/components/toast";
import { fmtSar } from "@/lib/format";
import {
  Card,
  Countdown,
  Empty,
  ErrorState,
  IvStatusChip,
  Loading,
  RiskBadge,
  Skeleton,
} from "@/components/ui";
import type { InterventionStatus, Role } from "@/lib/types";

interface StepState {
  status: InterventionStatus;
  escalatedTo?: Role;
}

const LOOP_STAGES = ["Alert", "Assigned", "Action", "Verify", "Outcome"];
const LOOP_STAGES_AR = ["تنبيه", "إسناد", "تنفيذ", "تحقق", "نتيجة"];

export default function InterventionsPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const { data, loading, error, refetch } = useSnapshots();
  const toast = useToast();
  const snaps = data?.snaps ?? [];

  // Optimistic overrides — each change is POSTed to the API which persists
  // an InterventionOverride row and writes an audit entry.
  const [overrides, setOverrides] = useState<Record<string, StepState>>({});
  const [filter, setFilter] = useState<"active" | "done">("active");
  if (loading && !data) return <Skeleton rows={5} />;
  if (error && !data) return <ErrorState onRetry={refetch} />;
  if (!data) return <Loading />;

  const steps = snaps
    .flatMap((s) =>
      s.plan.map((step) => ({
        step,
        patient: s.patient,
        risk: s.risk,
        insurance: s.insurance,
      })),
    )
    .map((row) => {
      const ov = overrides[row.step.id];
      return {
        ...row,
        status: (ov?.status ?? row.step.status) as InterventionStatus,
        escalatedTo: ov?.escalatedTo,
      };
    });

  const closed = (s: InterventionStatus) => s === "done" || s === "resolved";
  const active = steps.filter((s) => !closed(s.status));
  const done = steps.filter((s) => closed(s.status));
  const shown = filter === "active" ? active : done;

  const persist = (
    stepId: string,
    patientId: string,
    status: InterventionStatus,
    escalatedTo?: Role,
  ) => {
    setOverrides((o) => ({ ...o, [stepId]: { status, escalatedTo } }));
    postJson(`/api/interventions/${stepId}`, { patientId, status, escalatedTo })
      .then(() => toast(t("common.saved"), "success"))
      .catch(() => {
        setOverrides((o) =>
          Object.fromEntries(Object.entries(o).filter(([k]) => k !== stepId)),
        );
        toast(t("common.failed"), "error");
      })
      .finally(() => refetch());
  };
  const markDone = (id: string, patientId: string) =>
    persist(id, patientId, "done");
  const simulateOverdue = (id: string, patientId: string) =>
    persist(id, patientId, "overdue");
  const escalate = (id: string, patientId: string, chain: Role[]) =>
    persist(id, patientId, "escalated", chain[0]);
  const startStep = (id: string, patientId: string) =>
    persist(id, patientId, "in_progress");
  const resolve = (id: string, patientId: string) =>
    persist(id, patientId, "resolved");

  const stages = lang === "ar" ? LOOP_STAGES_AR : LOOP_STAGES;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#13304d]">{t("inv.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("inv.subtitle")}</p>
      </div>

      {/* Closed-loop lifecycle strip */}
      <Card>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {stages.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className="rounded-lg border border-[#0e9bb5]/30 bg-[#0e9bb5]/5 px-3 py-1.5 text-xs font-bold text-[#0e9bb5]">
                {i + 1}. {s}
              </span>
              {i < stages.length - 1 && (
                <span className="text-slate-600">→</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="flex gap-2">
        {(["active", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              filter === f
                ? "bg-[#0e9bb5]/10 text-[#0e9bb5]"
                : "text-slate-500 hover:text-slate-200"
            }`}
          >
            {t(f === "active" ? "inv.activeOnly" : "inv.completed")} (
            {f === "active" ? active.length : done.length})
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.map(({ step, patient, risk, insurance, status, escalatedTo }) => (
          <Card key={step.id} className="!p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <span className="w-12 font-mono text-sm text-[#0e9bb5]">
                  +{step.offsetMin}m
                </span>
                <div>
                  <div className="text-sm font-semibold text-[#13304d]">
                    {t(`action.${step.actionKey}`)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <Link
                      href={`/patient/${patient.id}`}
                      className="font-mono text-[#0e9bb5] hover:underline"
                    >
                      {patient.id}
                    </Link>
                    <span>{lang === "ar" ? patient.nameAr : patient.nameEn}</span>
                    <span>· {t(`role.${step.role}`)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <RiskBadge level={risk.level} />
                {!closed(status) && status !== "escalated" && (
                  <Countdown
                    seedMin={step.dueInMin}
                    onExpire={() => simulateOverdue(step.id, patient.id)}
                  />
                )}
                {status === "escalated" && escalatedTo && (
                  <span className="rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700">
                    {t("common.escalatedTo")}: {t(`role.${escalatedTo}`)}
                  </span>
                )}
                <IvStatusChip status={status} />
              </div>
            </div>

            {/* actions row */}
            {!closed(status) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#e2e9f2] pt-3">
                {status === "pending" && (
                  <button
                    onClick={() => startStep(step.id, patient.id)}
                    className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    ▶ {t("common.start")}
                  </button>
                )}
                {status === "escalated" && can("intervention_escalate") && (
                  <button
                    onClick={() => resolve(step.id, patient.id)}
                    className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                  >
                    ✓ {t("common.resolve")}
                  </button>
                )}
                {status !== "escalated" && (
                  <button
                    onClick={() => markDone(step.id, patient.id)}
                    className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    ✓ {t("common.markDone")}
                  </button>
                )}
                {status === "overdue" && can("intervention_escalate") && (
                  <button
                    onClick={() => escalate(step.id, patient.id, step.escalationChain)}
                    className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100"
                  >
                    🔺 {t("common.escalate")} → {t(`role.${step.escalationChain[0]}`)}
                  </button>
                )}
                {status === "in_progress" && (
                  <button
                    onClick={() => simulateOverdue(step.id, patient.id)}
                    className="rounded-lg border border-[#e2e9f2] px-3 py-1 text-xs text-slate-500 hover:text-slate-200"
                  >
                    ⏱ {t("common.simulateDelay")}
                  </button>
                )}
                <span className="ms-auto text-[11px] text-slate-500">
                  {t("common.exposure")}: {t("common.sar")} {fmtSar(insurance.exposureSar, lang)}
                </span>
              </div>
            )}
          </Card>
        ))}
        {shown.length === 0 && <Empty />}
      </div>
    </div>
  );
}
