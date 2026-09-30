"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { orgStats } from "@/lib/aggregate";
import { savingsTrend } from "@/lib/data/claims";
import { fmtSarK } from "@/lib/format";
import { Card, KpiCard, Meter, SectionTitle } from "@/components/ui";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function ReportsPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const s = orgStats();

  if (!can("reports_view"))
    return <p className="py-20 text-center text-slate-400">{t("common.noAccess")}</p>;

  const trend = savingsTrend.map((m) => ({
    name: lang === "ar" ? m.monthAr : m.month,
    avoided: m.avoided,
    exposure: m.exposure,
  }));

  const cvs = s.value.careValue;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle sub={t("rpt.subtitle")}>{t("rpt.title")}</SectionTitle>
        <button className="rounded-lg border border-[#e2e9f2] bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-[#0e9bb5]/40 hover:text-[#0e9bb5]">
          ⤓ {t("rpt.export")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("rpt.handoffs")} value={34} trend="+9%" trendUp />
        <KpiCard label={t("rpt.closures")} value={`${s.operational.closedLoopCompletion}%`} accent="text-emerald-600" trend="+6%" trendUp />
        <KpiCard label={t("rpt.denials")} value={17} accent="text-[#0e9bb5]" trend="+21%" trendUp />
        <KpiCard
          label={t("ins.avoided")}
          value={fmtSarK(trend[trend.length - 1].avoided * 1000)}
          unit={t("common.sar")}
          accent="text-emerald-600"
          sub={t("common.simulated")}
        />
      </div>

      <Card>
        <SectionTitle sub={`${t("ins.thousands")} ${t("common.sar")}`}>{t("rpt.weekly")}</SectionTitle>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend}>
              <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e9f2", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="avoided" name={t("ins.avoided")} fill="#10b981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="exposure" name={t("ins.residual")} fill="#f87171" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <SectionTitle>{t("cmd.careValue")}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { k: "cmd.cvs.safety", v: cvs.clinicalSafety },
            { k: "cmd.cvs.timeliness", v: cvs.timeliness },
            { k: "cmd.cvs.docs", v: cvs.documentation },
            { k: "cmd.cvs.ops", v: cvs.operational },
            { k: "cmd.cvs.insurance", v: cvs.insuranceReadiness },
          ].map((r) => (
            <div key={r.k} className="rounded-lg border border-[#eef2f7] bg-[#f8fafc] p-3">
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="text-slate-500">{t(r.k)}</span>
                <b className="text-[#13304d]">{r.v}</b>
              </div>
              <Meter pct={r.v} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
