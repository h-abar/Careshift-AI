"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { patchJson, useClaims, useOrg } from "@/lib/api";
import type { ClaimStatus } from "@/lib/types";
import { fmtSar, fmtSarK } from "@/lib/format";
import {
  Card,
  Loading,
  Meter,
  RiskBadge,
  SectionTitle,
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

/** Mirrors the server-side transition map in app/api/claims/[id]/route.ts. */
const NEXT_STATUS: Record<ClaimStatus, ClaimStatus[]> = {
  pending: ["review", "approved", "denied"],
  review: ["approved", "denied"],
  denied: ["review"],
  approved: [],
};

const STATUS_COLORS: Record<string, string> = {
  approved: "#34d399",
  pending: "#94a3b8",
  review: "#fbbf24",
  denied: "#f87171",
};

export default function InsurancePage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const { data: org } = useOrg();
  const { data: claimsData, refetch } = useClaims();
  if (!org || !claimsData) return <Loading />;
  const snaps = org.snaps;
  const claims = claimsData.claims;
  const savingsTrend = claimsData.savingsTrend;

  const exposure = {
    highRisk: snaps.filter((s) => s.risk.level !== "low").length,
    icu: snaps.filter((s) => s.risk.level === "critical").length,
    docGaps: snaps.filter((s) => s.insurance.docCompleteness < 85).length,
    claimsAtRisk: org.financial.claimsAtRisk,
    total: snaps.reduce((s, x) => s + x.insurance.exposureSar, 0),
  };

  const topCases = snaps
    .filter((s) => s.insurance.exposureSar > 0)
    .sort((a, b) => b.insurance.exposureSar - a.insurance.exposureSar)
    .slice(0, 6);

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
        <p className="mt-1 text-sm text-slate-400">{t("ins.subtitle")}</p>
      </div>

      {/* Current exposure KPIs */}
      <section>
        <SectionTitle>{t("ins.exposure")}</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-xl border border-[#e2e9f2] bg-white p-4">
            <div className="text-xs text-slate-400">{t("ins.highRisk")}</div>
            <div className="mt-1 text-2xl font-bold text-[#13304d]">{exposure.highRisk}</div>
          </div>
          <div className="rounded-xl border border-[#e2e9f2] bg-white p-4">
            <div className="text-xs text-slate-400">{t("ins.potentialIcu")}</div>
            <div className="mt-1 text-2xl font-bold text-orange-400">{exposure.icu}</div>
          </div>
          <div className="rounded-xl border border-[#e2e9f2] bg-white p-4">
            <div className="text-xs text-slate-400">{t("ins.docGaps")}</div>
            <div className="mt-1 text-2xl font-bold text-amber-600">{exposure.docGaps}</div>
          </div>
          <div className="rounded-xl border border-[#e2e9f2] bg-white p-4">
            <div className="text-xs text-slate-400">{t("ins.claimsRisk")}</div>
            <div className="mt-1 text-2xl font-bold text-red-400">{exposure.claimsAtRisk}</div>
          </div>
          <div className="col-span-2 rounded-xl border border-red-200 bg-red-50 p-4 lg:col-span-1">
            <div className="text-xs text-slate-400">
              {t("ins.estExposure")}{" "}
              <span className="text-[10px]">({t("common.simulated")})</span>
            </div>
            <div className="mt-1 text-2xl font-bold text-red-400">
              {t("common.sar")} {fmtSarK(exposure.total)}
            </div>
          </div>
        </div>
      </section>

      {/* Top financial risk cases */}
      <Card>
        <SectionTitle>{t("ins.topCases")}</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e2e9f2] text-start text-xs text-slate-500">
                <th className="pb-2 text-start font-medium">{t("common.patient")}</th>
                <th className="pb-2 text-start font-medium">{t("cmd.clinical")}</th>
                <th className="pb-2 text-start font-medium">{t("ins.claimRisk")}</th>
                <th className="pb-2 text-start font-medium">{t("common.documentation")}</th>
                <th className="pb-2 text-end font-medium">{t("common.exposure")}</th>
              </tr>
            </thead>
            <tbody>
              {topCases.map(({ patient, risk, insurance }) => (
                <tr key={patient.id} className="border-b border-[#e2e9f2]/60">
                  <td className="py-2.5">
                    <Link
                      href={`/patient/${patient.id}`}
                      className="font-mono text-[#0e9bb5] hover:underline"
                    >
                      {patient.id}
                    </Link>
                    <span className="ms-2 text-slate-600">
                      {lang === "ar" ? patient.nameAr : patient.nameEn}
                    </span>
                  </td>
                  <td>
                    <RiskBadge level={risk.level} score={risk.score} />
                  </td>
                  <td>
                    <RiskBadge level={insurance.claimRisk} />
                  </td>
                  <td className="min-w-28">
                    <div className="flex items-center gap-2">
                      <Meter
                        pct={insurance.docCompleteness}
                        color={
                          insurance.docCompleteness >= 85
                            ? "bg-[#0e9bb5]"
                            : "bg-amber-400"
                        }
                        className="!h-1.5 w-16"
                      />
                      <span className="font-mono text-xs text-slate-600">
                        {insurance.docCompleteness}%
                      </span>
                    </div>
                  </td>
                  <td className="text-end font-mono font-bold text-red-600">
                    {fmtSar(insurance.exposureSar)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* Claim readiness — friction prevention */}
      <Card>
        <SectionTitle sub={t("ins.valueNote")}>{t("ins.readinessCheck")}</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          {riskyClaims.map(({ c, r }) => (
            <div
              key={c.id}
              className="rounded-lg border border-[#e2e9f2] bg-[#f8fafc] p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-[#0e9bb5]">{c.id}</span>
                  {c.patientId && (
                    <Link
                      href={`/patient/${c.patientId}`}
                      className="font-mono text-[11px] text-slate-400 hover:text-[#0e9bb5]"
                    >
                      → {c.patientId}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {can("claims_edit") ? (
                    <select
                      value={c.status}
                      title={t("claim.changeStatus")}
                      onChange={async (e) => {
                        try {
                          await patchJson(`/api/claims/${c.id}`, {
                            status: e.target.value,
                          });
                          refetch();
                        } catch {
                          /* invalid transition → server rejects, keep state */
                        }
                      }}
                      className="rounded-md border border-[#e2e9f2] bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-600"
                    >
                      <option value={c.status}>{t(`claim.${c.status}`)}</option>
                      {(NEXT_STATUS[c.status] ?? []).map((s) => (
                        <option key={s} value={s}>
                          → {t(`claim.${s}`)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`text-xs font-semibold ${
                      c.status === "denied" ? "text-red-600" : "text-amber-300"
                    }`}>
                      {t(`claim.${c.status}`)}
                    </span>
                  )}
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
                      item.ok ? "text-slate-400" : "text-amber-300"
                    }`}
                  >
                    <span className={item.ok ? "text-emerald-600" : "text-amber-600"}>
                      {item.ok ? "✓" : "⚠"}
                    </span>
                    {t(`ev.${item.key}`)}
                  </span>
                ))}
              </div>
              {c.frictionKeys.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.frictionKeys.map((f) => (
                    <span
                      key={f}
                      className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] text-red-600"
                    >
                      {t(`friction.${f}`)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
