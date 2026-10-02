"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { postJson, useApi } from "@/lib/api";
import { useToast } from "@/components/toast";

export interface DoctorTaskRow {
  id: string;
  patientId: string;
  patient: {
    id: string;
    nameEn: string;
    nameAr: string;
    room: string;
    dept: string;
  } | null;
  level: string;
  score: number;
  status: string;
  ladderStep: number;
  waitingMin: number;
  acknowledgedAt: string | null;
  reviewedAt: string | null;
  decision: string | null;
  createdAt: string;
}

export function useDoctorTasks(patientId?: string) {
  const res = useApi<{ tasks: DoctorTaskRow[] }>("/api/doctor-tasks");
  const tasks = res.data?.tasks ?? [];
  return {
    ...res,
    tasks: patientId ? tasks.filter((t) => t.patientId === patientId) : tasks,
  };
}

const DECISIONS = [
  "treatment",
  "escalate",
  "monitor",
  "not_significant",
] as const;

/**
 * E6 — doctor action panel on /patient/[id]. Rendered only for roles
 * holding clinical_decide; the server additionally enforces task
 * ownership. Acknowledge → bedside review → mandatory decision with a
 * reason (required for not_significant).
 */
export function DoctorTaskCard({
  patientId,
  onChanged,
}: {
  patientId: string;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const { can } = useAuth();
  const { tasks, refetch } = useDoctorTasks(patientId);
  const [deciding, setDeciding] = useState(false);
  const [decision, setDecision] = useState<(typeof DECISIONS)[number] | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [intervalMin, setIntervalMin] = useState(30);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const task = tasks[0] ?? null;
  if (!can("clinical_decide") || !task) return null;

  const act = async (step: string, body?: unknown) => {
    setBusy(true);
    try {
      await postJson(`/api/doctor-tasks/${task.id}/${step}`, body ?? {});
      await refetch();
      onChanged?.();
      toast(t("common.saved"), "success");
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : t("common.failed"), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitDecision = async () => {
    if (!decision) return;
    const okDone = await act("decide", {
      decision,
      reason: reason.trim() || undefined,
      intervalMin: decision === "monitor" ? intervalMin : undefined,
    });
    if (okDone) {
      setDeciding(false);
      setDecision(null);
      setReason("");
    }
  };

  const needsReason = decision === "not_significant";
  const btn =
    "rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 transition-colors";

  return (
    <section className="rounded-xl border-2 border-red-200 bg-red-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-sm">
            ⚠
          </span>
          <div>
            <h3 className="text-sm font-bold text-red-800">
              {t("doc.needsAction")}
            </h3>
            <p className="text-[11px] text-red-700/80">{t("doc.taskHint")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          <span className="rounded-md bg-white px-2 py-1 font-mono text-red-700 border border-red-200">
            NEWS2 {task.score}
          </span>
          <span className="rounded-md bg-white px-2 py-1 text-slate-600 border border-[#e2e9f2]">
            {task.waitingMin} {t("doc.min")} {t("doc.sinceAlert")}
          </span>
          {task.ladderStep > 0 && (
            <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-800 border border-amber-200">
              {t("doc.ladder")} {task.ladderStep}
            </span>
          )}
        </div>
      </div>

      {/* Ordered steps — server also enforces the sequence. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
            task.acknowledgedAt
              ? "bg-emerald-100 text-emerald-800"
              : "bg-white text-slate-600 border border-[#e2e9f2]"
          }`}
        >
          1 · {task.acknowledgedAt ? t("doc.acked") : t("doc.ack")}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
            task.reviewedAt
              ? "bg-emerald-100 text-emerald-800"
              : "bg-white text-slate-600 border border-[#e2e9f2]"
          }`}
        >
          2 · {task.reviewedAt ? t("doc.reviewed") : t("doc.review")}
        </span>
        <span className="rounded-full border border-[#e2e9f2] bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">
          3 · {t("doc.decide")}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!task.acknowledgedAt && (
          <button
            disabled={busy}
            onClick={() => act("ack")}
            className={`${btn} bg-[#0b7a8d] text-white hover:bg-[#075e6e]`}
          >
            {t("doc.ack")}
          </button>
        )}
        {task.acknowledgedAt && !task.reviewedAt && (
          <button
            disabled={busy}
            onClick={() => act("review")}
            className={`${btn} bg-[#0b7a8d] text-white hover:bg-[#075e6e]`}
          >
            {t("doc.review")}
          </button>
        )}
        {task.reviewedAt && !deciding && (
          <button
            disabled={busy}
            onClick={() => setDeciding(true)}
            className={`${btn} bg-[#0b7a8d] text-white hover:bg-[#075e6e]`}
          >
            {t("doc.decide")}
          </button>
        )}
      </div>

      {deciding && (
        <div className="mt-3 space-y-2 rounded-lg border border-[#e2e9f2] bg-white p-3">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {DECISIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDecision(d)}
                className={`rounded-lg border px-3 py-2 text-start text-xs font-semibold ${
                  decision === d
                    ? "border-[#0e9bb5] bg-[#0e9bb5]/10 text-[#075e6e]"
                    : "border-[#e2e9f2] text-slate-600 hover:border-[#0e9bb5]/40"
                }`}
              >
                {t(`doc.decision.${d}`)}
              </button>
            ))}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              needsReason ? t("doc.reasonRequired") : t("doc.reasonHint")
            }
            aria-label={t("doc.reason")}
            className={`w-full rounded-lg border px-3 py-2 text-xs outline-none ${
              needsReason ? "border-amber-300 bg-amber-50" : "border-[#e2e9f2]"
            }`}
          />
          {decision === "monitor" && (
            <input
              type="number"
              min={5}
              max={240}
              value={intervalMin}
              onChange={(e) => setIntervalMin(Number(e.target.value) || 30)}
              aria-label={t("doc.interval")}
              className="w-32 rounded-lg border border-[#e2e9f2] px-3 py-2 text-xs"
            />
          )}
          <div className="flex gap-2">
            <button
              disabled={
                busy || !decision || (needsReason && !reason.trim())
              }
              onClick={submitDecision}
              className={`${btn} bg-[#13304d] text-white hover:bg-[#0b7a8d]`}
            >
              {t("doc.decide")}
            </button>
            <button
              onClick={() => {
                setDeciding(false);
                setDecision(null);
              }}
              className={`${btn} border border-[#e2e9f2] text-slate-600`}
            >
              {t("usr.cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
