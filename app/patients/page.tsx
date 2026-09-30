"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { usePatientsTable } from "@/lib/api";
import { fmtSarK } from "@/lib/format";
import { Card, Empty, ErrorState, Loading, Skeleton, Meter, RiskBadge, SectionTitle } from "@/components/ui";

export default function PatientsPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const { data, loading, error, refetch } = usePatientsTable();
  const snaps = data?.snaps ?? [];
  const userName = (id: string) =>
    data?.userNames[id] ? (lang === "ar" ? data.userNames[id].ar : data.userNames[id].en) : "—";
  const getAssignment = (pid: string) =>
    data?.assignments.find((a) => a.patientId === pid);

  if (!can("patients_view"))
    return <p className="py-20 text-center text-slate-500">{t("common.noAccess")}</p>;
  if (loading && !data) return <Skeleton rows={6} />;
  if (error && !data) return <ErrorState onRetry={refetch} />;
  if (!data) return <Loading />;

  return (
    <div className="space-y-5">
      <SectionTitle sub={t("pts.subtitle")}>{t("pts.title")}</SectionTitle>

      {/* Desktop table */}
      <Card className="hidden !p-0 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e2e9f2] text-xs text-slate-500">
              {[
                t("common.patient"), t("common.room"), t("common.dx"),
                t("common.score"), t("pts.vitals"), t("common.team"),
                t("common.documentation"), "",
              ].map((h, i) => (
                <th key={i} className="px-4 py-3 text-start font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snaps.map(({ patient, risk, insurance }) => {
              const v = patient.vitals[patient.vitals.length - 1];
              const a = getAssignment(patient.id);
              return (
                <tr key={patient.id} className="border-b border-[#eef2f7] last:border-0 hover:bg-[#f8fafc]">
                  <td className="px-4 py-3">
                    <Link href={`/patient/${patient.id}`} className="font-semibold text-[#13304d] hover:text-[#0e9bb5]">
                      {lang === "ar" ? patient.nameAr : patient.nameEn}
                    </Link>
                    <div className="font-mono text-[11px] text-slate-500">{patient.id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{patient.room}</td>
                  <td className="px-4 py-3 text-slate-600">{t(`dx.${patient.dxKey}`)}</td>
                  <td className="px-4 py-3"><RiskBadge level={risk.level} score={risk.score} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    HR {v.hr} · BP {v.sbp} · SpO₂ {v.spo2}%{v.glucose ? ` · Glu ${v.glucose}` : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {a ? userName(a.nurseId) : "—"}
                  </td>
                  <td className="px-4 py-3 w-28">
                    <div className="flex items-center gap-1.5">
                      <Meter pct={insurance.docCompleteness} className="!h-1.5 flex-1" />
                      <span className="font-mono text-xs text-slate-600">{insurance.docCompleteness}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end font-mono text-xs text-red-600">
                    {fmtSarK(insurance.exposureSar, lang)}
                  </td>
                </tr>
              );
            })}
            {snaps.length === 0 && (
              <tr><td colSpan={8}><Empty /></td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-2.5 md:hidden">
        {snaps.map(({ patient, risk, insurance }) => (
          <Link key={patient.id} href={`/patient/${patient.id}`}>
            <Card className="!p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-[11px] text-slate-500">{patient.id}</span>
                  <div className="text-sm font-semibold text-[#13304d]">
                    {lang === "ar" ? patient.nameAr : patient.nameEn}
                  </div>
                  <div className="text-xs text-slate-500">
                    {patient.room} · {t(`dx.${patient.dxKey}`)}
                  </div>
                </div>
                <RiskBadge level={risk.level} score={risk.score} />
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                <span>{t("common.documentation")}: {insurance.docCompleteness}%</span>
                <span className="font-mono text-red-600">
                  {t("common.sar")} {fmtSarK(insurance.exposureSar, lang)}
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
