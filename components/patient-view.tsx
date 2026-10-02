"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { postJson, usePatientDetail } from "@/lib/api";
import { useToast } from "@/components/toast";
import { fmtSar } from "@/lib/format";
import {
  Card,
  ErrorState,
  IvStatusChip,
  LEVEL_STYLES,
  Meter,
  RiskBadge,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { JourneyKind } from "@/lib/types";
import { EventTimeline } from "@/components/event-timeline";

const KIND_ICON: Record<JourneyKind, string> = {
  admission: "🏥",
  signal: "📡",
  risk: "🧠",
  notify: "🔔",
  action: "⚡",
  escalation: "🔺",
  review: "🩺",
  outcome: "✅",
};

export function PatientView({ patientId }: { patientId: string }) {
  const { t, lang } = useI18n();
  const { data, error, refetch } = usePatientDetail(patientId);
  const { can } = useAuth();
  const toast = useToast();
  const [reassessing, setReassessing] = useState(false);
  if (error) return <ErrorState onRetry={refetch} />;
  if (!data) return <Skeleton rows={6} />;
  const {
    patient: p,
    risk,
    insurance: ins,
    plan,
    journey,
    sim,
    claim: linkedClaim,
    readiness,
    riskHistory,
  } = data;
  const st = LEVEL_STYLES[risk.level];

  const vitals = p.vitals.map((v) => ({
    t: v.t,
    hr: v.hr,
    sbp: v.sbp,
    spo2: v.spo2,
    glucose: v.glucose,
  }));

  const exportEvidence = () => {
    const pack = {
      patientId: p.id,
      generatedAt: new Date().toISOString(),
      risk,
      insurance: ins,
      journey,
      interventions: plan,
      claim: linkedClaim,
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `evidence-pack-${p.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/handoff" className="text-xs text-slate-600 hover:text-[#0b7a8d]">
            ← {t("common.back")}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-[#13304d]">
            {lang === "ar" ? p.nameAr : p.nameEn}
            <span className="ms-3 font-mono text-sm font-normal text-slate-600">
              {p.id}
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {p.age} {t("common.years")} ·{" "}
            {t(p.sex === "M" ? "common.male" : "common.female")} · {p.room} ·{" "}
            {t(`dx.${p.dxKey}`)} · {t("common.attending")}: {p.attending}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {can("risk_view") && (
            <button
              onClick={() => {
                setReassessing(true);
                postJson(`/api/patients/${p.id}/reassess`, {})
                  .then(() => {
                    refetch();
                    toast(t("common.saved"), "success");
                  })
                  .catch(() => toast(t("common.failed"), "error"))
                  .finally(() => setReassessing(false));
              }}
              disabled={reassessing}
              className="rounded-lg border border-[#0e9bb5]/40 px-3 py-1.5 text-xs font-semibold text-[#0b7a8d] hover:bg-[#0e9bb5]/5 disabled:opacity-50"
            >
              {reassessing ? "…" : t("pt.reassess")}
            </button>
          )}
          <RiskBadge level={risk.level} score={risk.score} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Journey timeline ── */}
        <Card className="lg:col-span-1">
          <SectionTitle sub={t(`condition.${risk.conditionKey}`)}>
            {t("pt.title")}
          </SectionTitle>
          {/* trajectory chips */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[11px] text-slate-600">{t("pt.trajectory")}:</span>
            {journey
              .filter((e) => e.riskScore !== undefined)
              .map((e, i, arr) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-xs font-bold ${
                      e.riskScore! >= 60
                        ? "bg-red-50 text-red-700"
                        : e.riskScore! >= 30
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {e.riskScore}
                  </span>
                  {i < arr.length - 1 && (
                    <span className="text-slate-600">→</span>
                  )}
                </span>
              ))}
          </div>
          <ol className="relative space-y-4 border-s-2 border-[#e2e9f2] ps-4">
            {journey.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -start-[1.4rem] top-0 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs">
                  {KIND_ICON[e.kind]}
                </span>
                <div className="font-mono text-[11px] text-[#0b7a8d]">{e.t}</div>
                <div className="text-sm text-slate-700">{t(`journey.${e.key}`)}</div>
              </li>
            ))}
          </ol>
        </Card>

        {/* ── Vitals + labs ── */}
        <Card className="lg:col-span-2">
          <SectionTitle>{t("pt.vitals")}</SectionTitle>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={vitals}>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" />
                <XAxis dataKey="t" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e2e9f2",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="hr" name={t("pt.hr")} stroke="#f87171" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="sbp" name={t("pt.sbp")} stroke="#38bdf8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="spo2" name={t("pt.spo2")} stroke="#2dd4bf" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="glucose" name={t("pt.glucose")} stroke="#fbbf24" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {p.labs.map((l) => (
              <div
                key={l.key}
                className="flex items-center justify-between rounded-lg border border-[#e2e9f2] bg-[#f8fafc] px-3 py-2 text-sm"
              >
                <span className="text-slate-600">{t(`lab.${l.key}`)}</span>
                <span className="flex items-center gap-2 font-mono text-slate-700">
                  {l.value}
                  <span
                    className={`rounded px-1.5 text-[10px] font-bold ${
                      l.flag === "high"
                        ? "bg-red-50 text-red-700"
                        : l.flag === "low"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {t(`pt.flag.${l.flag}`)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Explainable AI ── */}
        <Card>
          <SectionTitle sub={t(`condition.${risk.conditionKey}`)}>
            {t("why.title")}
          </SectionTitle>
          <div className="space-y-2">
            {risk.factors.map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <span className="w-9 shrink-0 text-end font-mono text-[11px] text-slate-600">
                  {f.weight}%
                </span>
                <div className="flex-1">
                  <Meter pct={f.weight} color={st.bar} />
                </div>
                <span className="w-36 truncate text-xs text-slate-600">
                  {t(`factor.${f.key}`)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-[#e2e9f2] bg-[#f8fafc] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                {t("why.confidence")}
              </span>
              <span className="font-mono text-sm font-bold text-[#1b5fad]">
                {risk.confidence}%
              </span>
            </div>
            <Meter pct={risk.confidence} color="bg-[#1b5fad]" className="mt-1.5" />
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-600">
              {t("why.note")}
            </p>
            <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-600">
              {t("common.meds")}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {p.meds.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-sky-50 border border-sky-100 px-2 py-0.5 text-[11px] text-sky-700"
                >
                  {t(`med.${m}`)}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              {lang === "ar" ? p.noteAr : p.noteEn}
            </p>
          </div>
          {/* Persisted RiskAssessment history — chart + rows */}
          {riskHistory.length > 0 && (
            <div className="mt-4 rounded-lg border border-[#e2e9f2] bg-[#f8fafc] p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                {t("why.history")}
              </div>
              {riskHistory.length > 1 && (
                <div className="mb-2 h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={[...riskHistory].reverse().map((r) => ({
                        t: r.assessedAt.slice(11, 16),
                        score: r.score,
                      }))}
                    >
                      <CartesianGrid stroke="#eef2f7" />
                      <XAxis dataKey="t" stroke="#94a3b8" fontSize={10} />
                      <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={10} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid #e2e9f2", fontSize: 11 }}
                      />
                      <Line type="monotone" dataKey="score" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="space-y-1">
                {riskHistory.map((r) => (
                  <div
                    key={r.assessedAt}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-slate-600">
                      {r.assessedAt.slice(5, 16).replace("T", " ")}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-600">
                        {t(`condition.${r.conditionKey}`)} · {r.confidence}%
                      </span>
                      <RiskBadge
                        level={r.level as never}
                        score={r.score}
                      />
                    </span>
                  </div>
                ))}
                {riskHistory.length > 1 &&
                  riskHistory[0].score !==
                    riskHistory[riskHistory.length - 1].score && (
                    <div className="pt-1 text-end font-mono text-[11px] text-slate-600">
                      Δ {riskHistory[0].score - riskHistory[riskHistory.length - 1].score > 0 ? "+" : ""}
                      {riskHistory[0].score - riskHistory[riskHistory.length - 1].score}
                    </div>
                  )}
              </div>
            </div>
          )}
        </Card>

        {/* ── Intervention plan + what happens next ── */}
        <Card>
          <SectionTitle>{t("pt.plan")}</SectionTitle>

          {/* What happens next — the closed-loop contract */}
          <div className="mb-3 rounded-lg border border-[#e2e9f2] bg-[#f8fafc] p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
              {t("whn.title")}
            </div>
            <ol className="space-y-1.5 text-xs">
              {(() => {
                const next = plan.find((s) => s.status !== "done") ?? plan[0];
                const rows = [
                  t("whn.detected"),
                  `${t("whn.action")}: ${t(`action.${next.actionKey}`)}`,
                  `${t("whn.assigned")}: ${t(`role.${next.role}`)}`,
                  `${t("whn.deadline")}: +${next.dueInMin}m`,
                  `${t("whn.verify")}`,
                  `${t("whn.escalate")}: ${next.escalationChain.map((r) => t(`role.${r}`)).join(" ← ")}`,
                ];
                return rows.map((row, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span
                      className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                        i === 0
                          ? "bg-[#0b7a8d] text-white"
                          : "bg-white border border-[#e2e9f2] text-slate-600"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="text-slate-600">{row}</span>
                  </li>
                ));
              })()}
            </ol>
          </div>

          <div className="space-y-2">
            {plan.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[#e2e9f2] bg-[#f8fafc] px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-[#0b7a8d]">
                    +{s.offsetMin}m
                  </span>
                  <div>
                    <div className="text-sm text-slate-700">
                      {t(`action.${s.actionKey}`)}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {t(`role.${s.role}`)}
                    </div>
                  </div>
                </div>
                <IvStatusChip status={s.status} />
              </div>
            ))}
          </div>
        </Card>

        {/* ── What-If simulator ── */}
        <Card>
          <SectionTitle sub={t("common.simulated")}>{t("pt.whatif")}</SectionTitle>
          <div className="space-y-3">
            {(
              [
                { key: "pt.scenarioA", s: sim.noIntervention, danger: true },
                { key: "pt.scenarioB", s: sim.earlyIntervention, danger: false },
              ] as const
            ).map(({ key, s, danger }) => (
              <div
                key={key}
                className={`rounded-lg border p-3 ${
                  danger
                    ? "border-red-200 bg-red-50"
                    : "border-teal-200 bg-teal-50"
                }`}
              >
                <div className={`text-xs font-bold ${danger ? "text-red-600" : "text-[#0b7a8d]"}`}>
                  {t(key)}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <span className="text-slate-600">{t("pt.icuRisk")}</span>
                  <b className="text-end text-slate-700">{s.icuRiskPct}%</b>
                  <span className="text-slate-600">{t("pt.extraLos")}</span>
                  <b className="text-end text-slate-700">
                    +{s.extraLosDays} {t("cmd.days")}
                  </b>
                  <span className="text-slate-600">{t("pt.exposureLabel")}</span>
                  <b className="text-end text-slate-700">
                    {t("common.sar")} {fmtSar(s.exposureSar, lang)}
                  </b>
                  <span className="text-slate-600">{t("pt.docLabel")}</span>
                  <b className="text-end text-slate-700">{s.docCompleteness}%</b>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Insurance Impact — clinical event → insurance evidence ── */}
      <Card>
        <SectionTitle sub={t("imp.sub")}>{t("imp.title")}</SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{t("common.documentation")}</span>
              <b className="font-mono text-[#13304d]">{ins.docCompleteness}%</b>
            </div>
            <Meter
              pct={ins.docCompleteness}
              color={ins.docCompleteness >= 85 ? "bg-teal-500" : "bg-amber-400"}
              className="mt-1.5"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{t("imp.claimReady")}</span>
              <b className="font-mono text-[#13304d]">{readiness?.score ?? ins.docCompleteness}%</b>
            </div>
            <Meter
              pct={readiness?.score ?? ins.docCompleteness}
              color={(readiness?.score ?? 0) >= 85 ? "bg-teal-500" : "bg-amber-400"}
              className="mt-1.5"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{t("imp.evidence")}</span>
              <b className="font-mono text-[#13304d]">
                {readiness
                  ? Math.round(
                      (readiness.checklist.filter((c) => c.ok).length /
                        Math.max(readiness.checklist.length, 1)) * 100,
                    )
                  : Math.min(100, ins.docCompleteness + 4)}%
              </b>
            </div>
            <Meter
              pct={
                readiness
                  ? Math.round(
                      (readiness.checklist.filter((c) => c.ok).length /
                        Math.max(readiness.checklist.length, 1)) * 100,
                    )
                  : Math.min(100, ins.docCompleteness + 4)
              }
              className="mt-1.5"
            />
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <div className="text-[11px] text-slate-600">
              {t("imp.estExposure")}{" "}
              <span className="text-[10px]">({t("common.simulated")})</span>
            </div>
            <div className="mt-0.5 font-mono text-xl font-bold text-red-600">
              {t("common.sar")} {fmtSar(ins.exposureSar, lang)}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-emerald-700">
              {t("imp.status")}: ✓ {t("imp.complete")}
            </div>
          </div>
        </div>

        {/* Insurance friction — resolve before submission */}
        {ins.driverKeys.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-amber-800">
                {t("imp.friction")}
              </span>
              <Link
                href="/claims"
                className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 border border-amber-200 hover:bg-amber-100"
              >
                {t("imp.resolve")} →
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ins.driverKeys.map((k) => (
                <span
                  key={k}
                  className="rounded-full bg-white border border-amber-200 px-2.5 py-0.5 text-[11px] text-amber-800"
                >
                  ⚠ {t(`drv.${k}`)}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── Digital Evidence Pack ── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle sub={t("pt.evidenceSub")}>{t("pt.evidence")}</SectionTitle>
          <button
            onClick={exportEvidence}
            className="rounded-lg border border-[#0e9bb5]/40 bg-[#0e9bb5]/10 px-3 py-1.5 text-xs font-semibold text-[#075e6e] hover:bg-[#0e9bb5]/20"
          >
            ⤓ {t("common.export")}
          </button>
        </div>
        {readiness && linkedClaim ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {t("ins.linkedClaim")}:{" "}
                  <span className="font-mono text-[#0b7a8d]">{linkedClaim.id}</span>
                </span>
                <span className="font-bold text-[#13304d]">
                  {t("ins.readiness")}: {readiness.score}%
                </span>
              </div>
              <Meter
                pct={readiness.score}
                color={readiness.score >= 85 ? "bg-teal-400" : "bg-amber-400"}
              />
              <ul className="mt-3 space-y-1.5 text-xs">
                {readiness.checklist.map((c) => (
                  <li key={c.key} className="flex items-center gap-2">
                    <span className={c.ok ? "text-emerald-700" : "text-amber-700"}>
                      {c.ok ? "✓" : "⚠"}
                    </span>
                    <span className={c.ok ? "text-slate-600" : "text-amber-700"}>
                      {t(`ev.${c.key}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-[#e2e9f2] bg-[#f8fafc] p-3 text-xs leading-relaxed text-slate-600">
              {journey.map((e, i) => (
                <div key={i} className="flex gap-2 py-0.5">
                  <span className="font-mono text-[#0b7a8d]">{e.t}</span>
                  <span>{t(`journey.${e.key}`)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            {journey.length} {t("pt.evidenceSub")}
          </p>
        )}
      </Card>

      {/* C2 — hash-chained event timeline */}
      <EventTimeline patientId={p.id} />
    </div>
  );
}
