"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import { useHandoffContext } from "@/lib/api";
import { buildSbar } from "@/lib/engines/sbar";
import { fmtSar } from "@/lib/format";
import {
  Card,
  Countdown,
  LEVEL_STYLES,
  ErrorState,
  Loading,
  Skeleton,
  Meter,
  RiskBadge,
  SectionTitle,
} from "@/components/ui";

export default function HandoffPage() {
  const { t, lang } = useI18n();
  const { data, loading, error, refetch } = useHandoffContext();
  if (loading && !data) return <Skeleton rows={5} />;
  if (error && !data) return <ErrorState onRetry={refetch} />;
  if (!data) return <Loading />;
  const { ho, snaps } = data;
  const elevated = snaps.filter((s) => s.risk.level !== "low");
  const routine = snaps.filter((s) => s.risk.level === "low");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#13304d]">{t("ho.title")}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("ho.subtitle")}</p>
        </div>
        <div className="rounded-xl border border-[#e2e9f2] bg-white px-4 py-2 text-xs">
          <div className="flex items-center gap-3 text-slate-600">
            <span>
              {t("ho.from")}:{" "}
              <b className="text-[#13304d]">{lang === "ar" ? ho.fromShift.ar : ho.fromShift.en}</b>
            </span>
            <span className="text-[#0b7a8d]">←</span>
            <span>
              {t("ho.to")}:{" "}
              <b className="text-[#13304d]">{lang === "ar" ? ho.toShift.ar : ho.toShift.en}</b>
            </span>
            <span className="text-slate-600">
              {t("ho.at")} {ho.at}
            </span>
          </div>
        </div>
      </div>

      {/* Context strip — unit · shift · date + live counts */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#e2e9f2] bg-white px-4 py-3 text-sm shadow-sm">
        <span className="font-bold text-[#13304d]">{t("dept.icu")}</span>
        <span className="text-slate-600">{t("hf.shift.day")}</span>
        <span className="text-slate-600">29 Sep 2026</span>
        <span className="mx-1 hidden h-4 w-px bg-[#e2e9f2] sm:block" />
        <span className="text-slate-600">
          <b className="text-[#13304d]">{snaps.length}</b> {t("ho.count")}
        </span>
        <span className="text-slate-600">
          <b className="text-orange-700">{snaps.filter((s) => s.risk.level === "high").length}</b>{" "}
          {t("ho.highRisk")}
        </span>
        <span className="text-slate-600">
          <b className="text-red-600">{snaps.filter((s) => s.risk.level === "critical").length}</b>{" "}
          {t("hf.critical")}
        </span>
        <span className="text-slate-600">
          <b className="text-sky-700">{snaps.flatMap((s) => s.plan).filter((x) => x.status !== "done").length}</b>{" "}
          {t("ho.pendingActions")}
        </span>
      </div>

      {/* Elevated-risk cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {elevated.map(({ patient, risk, insurance, plan }) => {
          const sbar = buildSbar(patient, risk, t, lang);
          const next = plan.find((s) => s.status === "in_progress" || s.status === "pending");
          const st = LEVEL_STYLES[risk.level];
          return (
            <Card
              key={patient.id}
              className={`border-2 ${st.ring} relative overflow-hidden`}
            >
              <div className={`absolute inset-x-0 top-0 h-1 ${st.bar}`} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-600">{patient.id}</span>
                    <Link
                      href={`/patient/${patient.id}`}
                      className="text-lg font-bold text-[#13304d] hover:text-[#0b7a8d]"
                    >
                      {lang === "ar" ? patient.nameAr : patient.nameEn}
                    </Link>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600">
                    {patient.age} {t("common.years")} · {patient.room} ·{" "}
                    {t(`dx.${patient.dxKey}`)}
                  </div>
                </div>
                <RiskBadge level={risk.level} score={risk.score} />
              </div>

              <p className={`mt-2 text-sm font-semibold ${st.text}`}>
                {t(`condition.${risk.conditionKey}`)}
              </p>
              <p className="text-xs text-slate-600">
                {t("ho.window")}: &lt; {risk.windowHrs} {t("common.hrs")}
              </p>

              {/* WHY — explainable factors */}
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] font-bold tracking-wide text-slate-600">
                  {t("common.why")}
                </div>
                <div className="space-y-1.5">
                  {risk.factors.slice(0, 4).map((f) => (
                    <div key={f.key} className="flex items-center gap-2">
                      <span className="w-8 shrink-0 text-end font-mono text-[11px] text-slate-600">
                        {f.weight}%
                      </span>
                      <div className="flex-1">
                        <Meter pct={f.weight} color={st.bar} />
                      </div>
                      <span className="w-32 truncate text-[11px] text-slate-600">
                        {t(`factor.${f.key}`)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Next action + timer */}
              {next && (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-sky-700">
                      {t("common.nextAction")}
                    </div>
                    <div className="text-sm font-semibold text-[#13304d]">
                      {t(`action.${next.actionKey}`)}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {t("common.assignedTo")}: {t(`role.${next.role}`)}
                    </div>
                  </div>
                  <Countdown seedMin={next.dueInMin} />
                </div>
              )}

              {/* Insurance + documentation */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[#e2e9f2] bg-[#f8fafc] p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    {t("common.exposure")}
                  </div>
                  <div className="font-mono text-base font-bold text-red-600">
                    {t("common.sar")} {fmtSar(insurance.exposureSar, lang)}
                  </div>
                </div>
                <div className="rounded-lg border border-[#e2e9f2] bg-[#f8fafc] p-2.5">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    <span>{t("common.documentation")}</span>
                    <span className="text-slate-200">{insurance.docCompleteness}%</span>
                  </div>
                  <Meter
                    pct={insurance.docCompleteness}
                    color={insurance.docCompleteness >= 85 ? "bg-teal-400" : "bg-amber-400"}
                    className="mt-2"
                  />
                </div>
              </div>

              {/* SBAR */}
              <details className="mt-3 rounded-lg border border-[#e2e9f2] bg-[#f8fafc] px-3 py-2">
                <summary className="cursor-pointer text-xs font-bold text-[#0b7a8d]">
                  {t("ho.sbarTitle")}
                </summary>
                <dl className="mt-2 space-y-2 text-xs">
                  {(["s", "b", "a", "r"] as const).map((k) => (
                    <div key={k}>
                      <dt className="font-bold text-slate-600">{t(`sbar.${k}`)}</dt>
                      <dd className="text-slate-600">{sbar[k]}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </Card>
          );
        })}
      </div>

      {/* Routine-risk compact list */}
      <Card>
        <SectionTitle>
          {t(`risk.low`)} — {routine.length} {t("ho.count")}
        </SectionTitle>
        <div className="divide-y divide-[#e2e9f2]">
          {routine.map(({ patient, risk }) => (
            <Link
              key={patient.id}
              href={`/patient/${patient.id}`}
              className="flex items-center justify-between py-2.5 hover:bg-[#f4f7fa] px-2 rounded"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-slate-600">{patient.id}</span>
                <span className="text-sm font-medium text-slate-200">
                  {lang === "ar" ? patient.nameAr : patient.nameEn}
                </span>
                <span className="text-xs text-slate-600">
                  {t(`dx.${patient.dxKey}`)} · {patient.room}
                </span>
              </div>
              <RiskBadge level={risk.level} score={risk.score} />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
