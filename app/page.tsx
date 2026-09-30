"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { useOrg, usePatientsTable } from "@/lib/api";
import { fmtSarK } from "@/lib/format";
import {
  Card,
  IvStatusChip,
  KpiCard,
  Loading,
  Meter,
  RiskBadge,
  SectionTitle,
} from "@/components/ui";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

export default function Home() {
  const { user } = useAuth();
  if (!user) return <Loading />;
  if (user.role === "admin" || user.role === "hospital_admin")
    return <CommandCenter />;
  return <MyWork />;
}

/* ═══════════ Command Center — "what needs attention now?" ═══════════ */
function CommandCenter() {
  const { t, lang } = useI18n();
  const { data: s } = useOrg();
  if (!s) return <Loading />;
  const snaps = s.snaps;

  const riskMap = snaps.map((x) => ({
    x: x.risk.score,
    y: x.insurance.exposureSar / 1000,
    name: x.patient.id,
    level: x.risk.level,
  }));

  const trajectory = [
    { t: "07:00", risk: 22 },
    { t: "08:00", risk: 41 },
    { t: "09:20", risk: 87 },
    { t: "10:20", risk: 42 },
    { t: "11:30", risk: 18 },
  ];

  const cvs = s.value.careValue;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#13304d] sm:text-2xl">
            {t("cmd.title")}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">{t("cmd.pipeline")}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {t("common.liveUnit")}
        </span>
      </div>

      {/* KPI row — hierarchy level 1 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("cmd.monitored")} value={s.clinical.monitored} trend="+12%" trendUp />
        <KpiCard label={t("cmd.highRisk")} value={s.clinical.highRisk} accent="text-orange-600" trend="+25%" trendUp />
        <KpiCard label={t("cmd.critical")} value={s.clinical.critical} accent="text-red-600" trend="+33%" trendUp />
        <KpiCard label={t("cmd.pending")} value={s.clinical.interventionsPending} accent="text-sky-700" trend="-18%" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Risk map */}
        <Card>
          <SectionTitle sub={`${t("common.score")} × ${t("common.exposure")} (${t("ins.thousands")} ${t("common.sar")})`}>
            {t("cmd.clinical")} — Risk Map
          </SectionTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, bottom: 0 }}>
                <CartesianGrid stroke="#eef2f7" />
                <XAxis dataKey="x" domain={[0, 100]} stroke="#94a3b8" fontSize={11} name={t("common.score")} />
                <YAxis dataKey="y" stroke="#94a3b8" fontSize={11} name={t("common.exposure")} />
                <ZAxis range={[90, 90]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e9f2", fontSize: 12 }}
                  formatter={(v, n) => [v, n === "x" ? t("common.score") : t("common.exposure")]}
                  labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ""}
                />
                <Scatter
                  data={riskMap}
                  fill="#0e9bb5"
                  shape={(props: { cx?: number; cy?: number; payload?: { level: string } }) => {
                    const colors: Record<string, string> = {
                      critical: "#ef4444", high: "#f97316",
                      medium: "#f59e0b", low: "#10b981",
                    };
                    return (
                      <circle
                        cx={props.cx} cy={props.cy} r={7}
                        fill={colors[props.payload?.level ?? "low"]}
                        fillOpacity={0.85}
                        stroke="#fff" strokeWidth={2}
                      />
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Actions now */}
        <Card>
          <SectionTitle sub={t("inv.loop")}>{t("cmd.pending")} — Now</SectionTitle>
          <div className="space-y-2.5">
            {snaps
              .flatMap((x) =>
                x.plan
                  .filter((st) => st.status === "in_progress" || st.status === "pending")
                  .slice(0, 1)
                  .map((st) => ({ x, st })),
              )
              .slice(0, 4)
              .map(({ x, st }) => (
                <Link
                  key={st.id}
                  href={`/patient/${x.patient.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#eef2f7] bg-[#f8fafc] px-3 py-2.5 hover:border-[#0e9bb5]/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <RiskBadge level={x.risk.level} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#13304d]">
                        {x.patient.id} · {t(`action.${st.actionKey}`)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {lang === "ar" ? x.patient.nameAr : x.patient.nameEn} · {t(`role.${st.role}`)}
                      </div>
                    </div>
                  </div>
                  <IvStatusChip status={st.status} />
                </Link>
              ))}
          </div>
          <Link
            href="/interventions"
            className="mt-3 block text-center text-xs font-semibold text-[#0e9bb5] hover:underline"
          >
            {t("common.viewAll")} →
          </Link>
        </Card>
      </div>

      {/* Level 3 — monitoring row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle sub="P-1042">{t("pt.trajectory")}</SectionTitle>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trajectory}>
                <CartesianGrid stroke="#eef2f7" />
                <XAxis dataKey="t" stroke="#94a3b8" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e9f2", fontSize: 12 }} />
                <Line type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4, fill: "#ef4444" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle>{t("cmd.operational")}</SectionTitle>
          <div className="flex h-40 flex-col justify-center gap-4">
            {[
              { label: t("cmd.closedLoop"), v: s.operational.closedLoopCompletion, c: "bg-emerald-500" },
              { label: t("cmd.avgTime"), v: Math.min(100, s.operational.avgInterventionMin * 3), c: "bg-[#0e9bb5]", suffix: ` ${t("common.min")}` },
              { label: t("cmd.escalations"), v: s.operational.escalations * 20, c: "bg-purple-500", suffix: "" },
            ].map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-500">{r.label}</span>
                  <span className="font-bold text-[#13304d]">
                    {r.label === t("cmd.avgTime") ? s.operational.avgInterventionMin : Math.round(r.v / (r.suffix ? 1 : 20)) || r.v}
                    {r.label === t("cmd.closedLoop") ? "%" : r.suffix}
                  </span>
                </div>
                <Meter pct={r.v} color={r.c} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>{t("cmd.financial")}</SectionTitle>
          <div className="flex h-40 flex-col justify-center gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{t("cmd.claimsDoc")}</span>
              <span className="text-2xl font-bold text-[#13304d]">{s.financial.claimsDocPct}%</span>
            </div>
            <Meter pct={s.financial.claimsDocPct} color="bg-[#1b5fad]" />
            <div className="flex items-center justify-between border-t border-[#eef2f7] pt-3">
              <span className="text-xs text-slate-500">{t("cmd.exposure")}</span>
              <span className="font-mono text-lg font-bold text-red-600">
                {t("common.sar")} {fmtSarK(s.financial.exposureSar)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{t("cmd.careValue")}</span>
              <span className="text-lg font-bold text-[#0e9bb5]">{cvs.total}/100</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ═══════════ Role-based "My Work" dashboard ═══════════ */
function MyWork() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { data } = usePatientsTable();
  if (!data || !user) return <Loading />;
  const { snaps, assignments } = data;

  const mine = assignments.filter(
    (a) => a.nurseId === user.id || a.physicianId === user.id || a.chargeNurseId === user.id,
  );
  const myPatients = snaps.filter((s) => mine.some((a) => a.patientId === s.patient.id));
  const critical = myPatients.filter((s) => s.risk.level === "critical" || s.risk.level === "high");
  const mySteps = myPatients.flatMap((s) =>
    s.plan.filter((st) => st.status !== "done").map((st) => ({ st, s })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#13304d] sm:text-2xl">{t("my.title")}</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {lang === "ar" ? user.nameAr : user.nameEn} · {t(`userRole.${user.role}`)} · {t(`dept.${user.dept}`)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("my.patients")} value={myPatients.length} />
        <KpiCard label={t("my.criticalPatients")} value={critical.length} accent="text-red-600" />
        <KpiCard label={t("my.interventions")} value={mySteps.length} accent="text-sky-700" />
        <KpiCard label={t("my.handoffs")} value={1} accent="text-[#0e9bb5]" />
      </div>

      <Card>
        <SectionTitle sub={t("ho.subtitle")}>{t("my.patients")}</SectionTitle>
        {myPatients.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">{t("my.nothing")}</p>
        )}
        <div className="space-y-2.5">
          {myPatients.map(({ patient, risk, insurance, plan }) => {
            const next = plan.find((s) => s.status !== "done");
            return (
              <Link
                key={patient.id}
                href={`/patient/${patient.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#eef2f7] bg-[#f8fafc] px-4 py-3 hover:border-[#0e9bb5]/40"
              >
                <div className="flex items-center gap-3">
                  <RiskBadge level={risk.level} score={risk.score} />
                  <div>
                    <div className="text-sm font-semibold text-[#13304d]">
                      {lang === "ar" ? patient.nameAr : patient.nameEn}
                      <span className="ms-2 font-mono text-xs text-slate-400">{patient.id}</span>
                    </div>
                    <div className="text-xs text-slate-500">{t(`condition.${risk.conditionKey}`)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  {next && (
                    <span className="hidden sm:block">
                      {t("common.nextAction")}: <b className="text-[#13304d]">{t(`action.${next.actionKey}`)}</b>
                    </span>
                  )}
                  <span className="font-mono">
                    {t("common.sar")} {fmtSarK(insurance.exposureSar)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

