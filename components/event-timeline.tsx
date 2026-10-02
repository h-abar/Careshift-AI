"use client";

/**
 * C2 — patient journey event timeline. Chronological, filterable by
 * category; the API already scopes insurance users to the
 * claim-linked subset (minimum necessary) and audits that access.
 */
import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { usePatientEvents, type TimelineEvent } from "@/lib/api";
import { Card, ErrorState, SectionTitle, Skeleton } from "@/components/ui";

const FILTERS = ["", "clinical", "nursing", "doctor", "medication", "billing"] as const;

const TYPE_ICON: Record<string, string> = {
  vital_set: "📈",
  score_computed: "🧠",
  alert_raised: "🔔",
  alert_acknowledged: "👁️",
  escalation: "🔺",
  intervention_started: "⚡",
  intervention_completed: "✅",
  order: "📋",
  medication_administered: "💊",
  lab_result: "🧪",
  procedure: "🔧",
  transfer: "🚑",
  handoff_started: "🔁",
  handoff_signed: "✍️",
  handoff_accepted: "🤝",
  documentation_entry: "📝",
  priority_snapshot: "🏅",
  priority_seen: "👀",
  action_item_created: "📌",
  action_item_completed: "☑️",
  claim_status: "💳",
};

/** Compact payload summary — coded values first. */
function summary(e: TimelineEvent, t: (k: string) => string): string {
  const p = e.payload;
  if (e.type === "vital_set" && Array.isArray(p.measurements)) {
    return (p.measurements as { loinc: string; value: number; unit: string }[])
      .map((m) => `${m.loinc}=${m.value}${m.unit}`)
      .join(" · ");
  }
  if (e.type === "score_computed")
    return `${p.score ?? "?"} · ${p.level ?? ""} · ${p.conditionKey ?? ""}`;
  if (e.type === "lab_result")
    return `${p.key ?? ""} ${p.value ?? ""} (${p.flag ?? ""})`;
  if (e.type === "order") return `${p.medKey ?? p.code ?? ""}`;
  if (p.claimId) return `${t("ev.t.claim_status")}: ${p.claimId} · ${p.action ?? ""}`;
  return String(p.detail ?? p.stepId ?? p.note ?? "").slice(0, 80);
}

function rowDate(iso: string, lang: string) {
  return new Date(iso).toLocaleString(lang === "ar" ? "ar-SA" : "en-GB", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function EventTimeline({ patientId }: { patientId: string }) {
  const { t, lang } = useI18n();
  const [cat, setCat] = useState<string>("");
  const { data, error, refetch } = usePatientEvents(patientId, cat);
  if (error) return <ErrorState onRetry={refetch} />;
  if (!data) return <Skeleton rows={4} />;

  return (
    <Card>
      <SectionTitle sub={t("ev.sub")}>{t("ev.title")}</SectionTitle>
      <p className="mb-3 text-[11px] text-slate-500">
        {data.scope === "full" ? t("ev.scopeFull") : t("ev.scopeSubset")}
      </p>
      {/* C9 — closed-loop safety chain (clinical scope only) */}
      {data.chain && (
        <div className="mb-4 rounded-lg border border-[#e2e9f2] bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#13304d]">
              {t("ev.chainTitle")}
            </span>
            {data.chain.gaps > 0 && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                {data.chain.gaps} {t("ev.chainGaps")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.chain.steps.map((s) => (
              <span
                key={s.step}
                title={s.note ?? s.at ?? ""}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  s.status === "ok"
                    ? "bg-emerald-100 text-emerald-800"
                    : s.status === "gap"
                      ? "bg-red-100 text-red-700"
                      : "bg-slate-200 text-slate-500"
                }`}
              >
                {t(`ev.step.${s.step}`)}
                {s.status === "gap" ? " ⚠" : s.status === "ok" ? " ✓" : ""}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">{data.chain.label}</p>
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f || "all"}
            role="tab"
            aria-selected={cat === f}
            onClick={() => setCat(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              cat === f
                ? "bg-[#0e9bb5] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t(`ev.f.${f || "all"}`)}
          </button>
        ))}
      </div>
      {data.events.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">{t("ev.empty")}</p>
      )}
      <ol className="relative space-y-3 border-s-2 border-[#e2e9f2] ps-4">
        {data.events.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -start-[1.35rem] top-0 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs">
              {TYPE_ICON[e.type] ?? "•"}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-[11px] text-[#0b7a8d]">
                {rowDate(e.occurredAt, lang)}
              </span>
              <span className="text-sm font-medium text-slate-800">
                {t(`ev.t.${e.type}`)}
              </span>
              {e.lateEntry && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  {t("ev.late")}
                </span>
              )}
              {e.correctsId && (
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                  {t("ev.corrected")}: {e.correctionReason ?? e.correctsId.slice(0, 8)}
                </span>
              )}
              {!!(e.payload.simulated || e.payload.synthetic) && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                  {t("ev.simulated")}
                </span>
              )}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-600">
              {summary(e, t)}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
              <span>
                {e.actor ?? t("ev.system")} · {t(`role.${e.actorRole}`)}
              </span>
              {e.recordedAt !== e.occurredAt && (
                <span>
                  {t("ev.recorded")} {rowDate(e.recordedAt, lang)}
                </span>
              )}
              {e.ruleKey && (
                <Link
                  href={`/references#${e.ruleKey}`}
                  className="text-[#1b5fad] underline underline-offset-2 hover:text-[#0b7a8d]"
                >
                  {t("ev.rule")} {e.ruleKey} v{e.ruleVersion}
                </Link>
              )}
              <span className="font-mono text-[10px] text-slate-400" title={e.hash}>
                {t("ev.hash")} {e.hash}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
