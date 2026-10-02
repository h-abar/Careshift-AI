"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useClaims, useOrg } from "@/lib/api";
import { ClaimDetail } from "@/components/claim-detail";
import { ClaimKpis } from "@/components/claim-kpis";
import { fmtSar, fmtSarK } from "@/lib/format";
import {
  Card,
  Empty,
  ErrorState,
  Loading,
  Meter,
  RiskBadge,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  approved: "#34d399",
  pending: "#94a3b8",
  review: "#fbbf24",
  denied: "#f87171",
};

/**
 * E4 — which role must clear each readiness-checklist gap. The system
 * auto-submits once the item exists; the exception is routed to its owner.
 */
const CHECKLIST_OWNER: Record<string, string> = {
  diagnosis: "doctor",
  justification: "doctor",
  clinician: "doctor",
  intervention: "nurse",
  timeline: "nurse",
  lab: "charge_nurse",
};

export default function ClaimsMonitorPage() {
  const { t, lang } = useI18n();
  const { data: org } = useOrg();
  const [claimsPage, setClaimsPage] = useState(1);
  const { data: claimsData, loading, error, refetch } = useClaims({ page: claimsPage });
  if (loading && !claimsData) return <Skeleton rows={5} />;
  if (error && !claimsData) return <ErrorState onRetry={refetch} />;
  if (!org || !claimsData) return <Loading />;
  const claims = claimsData.claims;
  const claimsTotalPages = Math.max(
    1,
    Math.ceil(claimsData.total / claimsData.pageSize),
  );
  const savingsTrend = claimsData.savingsTrend;

  // All figures are server-computed aggregates / minimum-necessary claim
  // fields — this page must work for roles WITHOUT patients_view.
  const exposure = {
    highRisk: org.clinical.elevated,
    icu: org.clinical.critical,
    docGaps: org.clinical.docGaps,
    claimsAtRisk: org.financial.claimsAtRisk,
    total: org.financial.exposureSar,
  };

  const topCases = org.claimLinked.slice(0, 6);

  const byStatus = (["approved", "pending", "review", "denied"] as const).map(
    (st) => ({
      status: t(`claim.${st}`),
      count: claims.filter((c) => c.status === st).length,
      fill: STATUS_COLORS[st],
    }),
  );

  const trend = savingsTrend.map((m) => ({
    name: lang === "ar" ? m.monthAr : m.month,
    avoided: m.avoided,
    exposure: m.exposure,
  }));

  const riskyClaims = claims
    .filter((c) => c.status !== "approved")
    .map((c) => ({ c, r: c.readiness }))
    .sort((a, b) => a.r.score - b.r.score)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#13304d]">{t("ins.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("ins.subtitle")}</p>
      </div>

      {/* Current exposure KPIs */}
      <section>
        <SectionTitle>{t("ins.exposure")}</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-xl border border-[#e2e9f2] bg-white p-4">
            <div className="text-xs text-slate-600">{t("ins.highRisk")}</div>
            <div className="mt-1 text-2xl font-bold text-[#13304d]">{exposure.highRisk}</div>
          </div>
          <div className="rounded-xl border border-[#e2e9f2] bg-white p-4">
            <div className="text-xs text-slate-600">{t("ins.potentialIcu")}</div>
            <div className="mt-1 text-2xl font-bold text-orange-700">{exposure.icu}</div>
          </div>
          <div className="rounded-xl border border-[#e2e9f2] bg-white p-4">
            <div className="text-xs text-slate-600">{t("ins.docGaps")}</div>
            <div className="mt-1 text-2xl font-bold text-amber-700">{exposure.docGaps}</div>
          </div>
          <div className="rounded-xl border border-[#e2e9f2] bg-white p-4">
            <div className="text-xs text-slate-600">{t("ins.claimsRisk")}</div>
            <div className="mt-1 text-2xl font-bold text-red-600">{exposure.claimsAtRisk}</div>
          </div>
          <div className="col-span-2 rounded-xl border border-red-200 bg-red-50 p-4 lg:col-span-1">
            <div className="text-xs text-slate-600">
              {t("ins.estExposure")}{" "}
              <span className="text-[10px]">({t("common.simulated")})</span>
            </div>
            <div className="mt-1 text-2xl font-bold text-red-600">
              {t("common.sar")} {fmtSarK(exposure.total, lang)}
            </div>
          </div>
        </div>
      </section>

      {/* C7 — registry-computed claim integrity KPIs */}
      <ClaimKpis />

      {/* Top financial risk cases */}
      <Card>
        <SectionTitle>{t("ins.topCases")}</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e2e9f2] text-start text-xs text-slate-600">
                <th className="pb-2 text-start font-medium">{t("common.patient")}</th>
                <th className="pb-2 text-start font-medium">{t("cmd.clinical")}</th>
                <th className="pb-2 text-start font-medium">{t("ins.claimRisk")}</th>
                <th className="pb-2 text-start font-medium">{t("common.documentation")}</th>
                <th className="pb-2 text-end font-medium">{t("common.exposure")}</th>
              </tr>
            </thead>
            <tbody>
              {topCases.map((c) => (
                <tr key={c.claimId} className="border-b border-[#e2e9f2]/60">
                  <td className="py-2.5">
                    <span className="font-mono text-[#0b7a8d]">{c.claimId}</span>
                    <span className="ms-2 font-mono text-xs text-slate-600">
                      {c.patientId} · {t(`dx.${c.dxKey}`)}
                    </span>
                  </td>
                  <td>
                    <RiskBadge level={c.riskLevel as never} />
                  </td>
                  <td>
                    <RiskBadge level={c.claimRisk as never} />
                  </td>
                  <td className="min-w-28">
                    <div className="flex items-center gap-2">
                      <Meter
                        pct={c.docCompleteness}
                        color={
                          c.docCompleteness >= 85
                            ? "bg-[#0e9bb5]"
                            : "bg-amber-400"
                        }
                        className="!h-1.5 w-16"
                      />
                      <span className="font-mono text-xs text-slate-600">
                        {c.docCompleteness}%
                      </span>
                    </div>
                  </td>
                  <td className="text-end font-mono font-bold text-red-600">
                    {fmtSar(c.exposureSar, lang)}
                  </td>
                </tr>
              ))}
              {claims.length === 0 && (
                <tr><td colSpan={8}><Empty /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
          <span>
            {t("common.page")} {claimsData.page} / {claimsTotalPages} · {claimsData.total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={claimsPage <= 1}
              onClick={() => setClaimsPage((p) => p - 1)}
              className="rounded-lg border border-[#e2e9f2] px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              ‹ {t("common.prev")}
            </button>
            <button
              disabled={claimsPage >= claimsTotalPages}
              onClick={() => setClaimsPage((p) => p + 1)}
              className="rounded-lg border border-[#e2e9f2] px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              {t("common.next")} ›
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Claims by status */}
        <Card>
          <SectionTitle>{t("ins.byStatus")}</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStatus}>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" />
                <XAxis dataKey="status" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e2e9f2",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {byStatus.map((s, i) => (
                    <Cell key={i} fill={s.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Savings trend */}
        <Card>
          <SectionTitle sub={`${t("ins.thousands")} ${t("common.sar")}`}>
            {t("ins.trend")}
          </SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e2e9f2",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="avoided"
                  name={t("ins.avoided")}
                  stroke="#2dd4bf"
                  strokeWidth={2.5}
                />
                <Line
                  type="monotone"
                  dataKey="exposure"
                  name={t("ins.residual")}
                  stroke="#f87171"
                  strokeWidth={2.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* E4 — exceptions queue: claims the auto-pipeline cannot submit
          yet, with the exact missing item and the role that must fix it */}
      <Card>
        <SectionTitle sub={t("ins.exceptionsSub")}>{t("ins.exceptions")}</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          {riskyClaims.map(({ c, r }) => (
            <div
              key={c.id}
              className="rounded-lg border border-[#e2e9f2] bg-[#f8fafc] p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-[#0b7a8d]">{c.id}</span>
                  {c.patientId && (
                    <Link
                      href={`/patient/${c.patientId}`}
                      className="font-mono text-[11px] text-slate-600 hover:text-[#0b7a8d]"
                    >
                      → {c.patientId}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      c.status === "approved"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : c.status === "denied"
                          ? "bg-red-50 border-red-200 text-red-700"
                          : c.status === "review"
                            ? "bg-amber-50 border-amber-200 text-amber-700"
                            : "bg-slate-50 border-[#e2e9f2] text-slate-600"
                    }`}
                  >
                    {t(`claim.${c.status}`)}
                  </span>
                  <span className="font-mono text-sm font-bold text-[#13304d]">
                    {r.score}%
                  </span>
                </div>
              </div>
              <Meter
                pct={r.score}
                color={r.score >= 85 ? "bg-[#0e9bb5]" : "bg-amber-400"}
                className="mt-2"
              />
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                {r.checklist.map((item) => (
                  <span
                    key={item.key}
                    className={`flex items-center gap-1.5 ${
                      item.ok ? "text-slate-600" : "text-amber-700"
                    }`}
                  >
                    <span className={item.ok ? "text-emerald-700" : "text-amber-700"}>
                      {item.ok ? "✓" : "⚠"}
                    </span>
                    {t(`ev.${item.key}`)}
                    {!item.ok && CHECKLIST_OWNER[item.key] && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-bold text-amber-800">
                        → {t(`userRole.${CHECKLIST_OWNER[item.key]}`)}
                      </span>
                    )}
                  </span>
                ))}
              </div>
              {c.frictionKeys.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.frictionKeys.map((f) => (
                    <span
                      key={f}
                      className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] text-red-700"
                    >
                      {t(`friction.${f}`)}
                    </span>
                  ))}
                </div>
              )}
              <ClaimDetail claim={c} onChanged={refetch} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
