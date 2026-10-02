"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useClaims, useOrg } from "@/lib/api";
import { ClaimDetail } from "@/components/claim-detail";
import { StoryRibbon } from "@/components/story-ribbon";
import { ClaimBornVisual } from "@/components/claim-born-visual";
import { SavingsMonthPanel } from "@/components/savings-month-panel";
import { fmtSar } from "@/lib/format";
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

const STATUS_CHIPS: Record<string, { bg: string; text: string; labelAr: string; labelEn: string }> = {
  approved: { bg: "bg-emerald-100 border-emerald-300", text: "text-emerald-800", labelAr: "مقبولة (Accepted)", labelEn: "Accepted" },
  pending: { bg: "bg-sky-100 border-sky-300", text: "text-sky-800", labelAr: "مرفوعة تلقائياً (Auto-submitted)", labelEn: "Auto-submitted" },
  exception: { bg: "bg-orange-100 border-orange-300", text: "text-orange-800", labelAr: "استثناء يحتاج تدقيق (In exception)", labelEn: "In exception" },
  review: { bg: "bg-amber-100 border-amber-300", text: "text-amber-800", labelAr: "قيد المراجعة", labelEn: "In review" },
  denied: { bg: "bg-red-100 border-red-300", text: "text-red-800", labelAr: "مرفوضة (Denied)", labelEn: "Denied" },
  draft: { bg: "bg-slate-100 border-slate-300", text: "text-slate-700", labelAr: "مسودة", labelEn: "Draft" },
};

export default function ClaimsAndSavingsPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { data: org } = useOrg();
  const [claimsPage, setClaimsPage] = useState(1);
  const { data: claimsData, loading, error, refetch } = useClaims({ page: claimsPage });

  if (loading && !claimsData) return <Skeleton rows={6} />;
  if (error && !claimsData) return <ErrorState onRetry={refetch} />;
  if (!org || !claimsData) return <Loading />;

  const claims = claimsData.claims;
  const claimsTotalPages = Math.max(1, Math.ceil(claimsData.total / claimsData.pageSize));

  return (
    <div className="space-y-6">
      {/* Story Ribbon */}
      <StoryRibbon activeStep="claim" patientId="P-1042" patientName="نورة القحطاني" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#13304d]">
            {isAr ? "المطالبات والوفر المالي (Claims & Savings)" : "Claims & Savings"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {isAr
              ? "تحويل الأدلة السريرية المشفرة إلى مطالبات جاهزة للقبول الفوري مع قياس العائد المالي المحمي"
              : "Transforming hash-verified clinical evidence into first-pass accepted claims with measurable financial return"}
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          {isAr ? "محدث لحظياً مع نفيس NPHIES" : "Live NPHIES Connected"}
        </span>
      </div>

      {/* ── ROW 1: KPI TILES (Big Numbers) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* KPI 1: Auto-submitted claims % */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {isAr ? "نسبة الرفع التلقائي" : "Auto-Submitted %"}
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-[#0b7a8d]">
            94.2%
          </div>
          <div className="mt-1 text-[10px] text-emerald-700 font-semibold">
            ✓ {isAr ? "دون تدخل بشري" : "Automated pipeline"}
          </div>
        </div>

        {/* KPI 2: First-pass acceptance % */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {isAr ? "قبول من أول مرة" : "First-Pass Acceptance"}
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-emerald-600">
            98.6%
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            {isAr ? "معيار السوق: 78%" : "Industry avg: 78%"}
          </div>
        </div>

        {/* KPI 3: Avg time discharge -> submission */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {isAr ? "زمن الرفع بعد الخروج" : "Discharge to Submit"}
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-blue-700">
            12 {isAr ? "دقيقة" : "min"}
          </div>
          <div className="mt-1 text-[10px] text-emerald-700 font-semibold">
            ⚡ {isAr ? "مقارنة بـ 18 يوماً تقليدياً" : "vs 18 days traditional"}
          </div>
        </div>

        {/* KPI 4: Claims in exception queue */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {isAr ? "طابور الاستثناءات" : "Exception Queue"}
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-orange-600">
            3
          </div>
          <div className="mt-1 text-[10px] text-orange-700 font-semibold">
            {isAr ? "تتطلب توقيع طبيب/تمريض" : "Action required"}
          </div>
        </div>

        {/* KPI 5: Denials prevented by evidence */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {isAr ? "رفوضات تم تفاديها" : "Denials Prevented"}
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-teal-700">
            47
          </div>
          <div className="mt-1 text-[10px] text-teal-800 font-semibold">
            {isAr ? "موثقة بالأدلة الرقمية" : "Evidence-backed"}
          </div>
        </div>

        {/* KPI 6: Value at risk protected */}
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900 uppercase">
            <span>{isAr ? "وفر مالي محمي" : "Protected Value"}</span>
            <span className="rounded bg-emerald-200 px-1 py-0.2 text-[9px] text-emerald-950 font-bold">
              {isAr ? "تقديري" : "Estimated"}
            </span>
          </div>
          <div className="mt-2 font-mono text-xl font-black text-emerald-900">
            1.25M {isAr ? "ر.س" : "SAR"}
          </div>
          <div className="mt-1 text-[10px] text-emerald-800 font-semibold">
            {isAr ? "إجمالي حماية المطالبات" : "Zero leakage"}
          </div>
        </div>
      </div>

      {/* ── ROW 2: SAVINGS THIS MONTH PANEL (Estimated with 4-part bar chart) ── */}
      <SavingsMonthPanel />

      {/* ── ROW 3: HOW A CLAIM IS BORN VISUAL (P-1042 Live Example) ── */}
      <ClaimBornVisual />

      {/* ── ROW 4: CLAIMS TABLE (With status, readiness, value, and who must fix) ── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <SectionTitle sub={isAr ? "مطالبات المرضى المربوطة بسلاسل الأدلة الرقمية والتأمين الصحي" : "Patient claims linked to cryptographic evidence chains"}>
              {isAr ? "سجل المطالبات وحالة الاستثناءات" : "Claims Registry & Exceptions"}
            </SectionTitle>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-bold text-slate-700">
            {claimsData.total} {isAr ? "مطالبة إجمالية" : "total claims"}
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-start text-xs font-bold text-slate-500">
                <th className="px-3 py-2.5 text-start">{isAr ? "رقم المطالبة" : "Claim ID"}</th>
                <th className="px-3 py-2.5 text-start">{isAr ? "المريض / الغرفة" : "Patient / Room"}</th>
                <th className="px-3 py-2.5 text-start">{isAr ? "التشخيص (ICD-10)" : "Diagnosis"}</th>
                <th className="px-3 py-2.5 text-start">{isAr ? "حالة الرفع" : "Status"}</th>
                <th className="px-3 py-2.5 text-start">{isAr ? "جاهزية الدليل" : "Readiness"}</th>
                <th className="px-3 py-2.5 text-start">{isAr ? "مسؤول الحل (إذا كان استثناء)" : "Who Must Fix"}</th>
                <th className="px-3 py-2.5 text-end">{isAr ? "قيمة المطالبة" : "Claim Amount"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Highlight P-1042 live case */}
              <tr className="bg-cyan-50/40 hover:bg-cyan-50/70 font-medium">
                <td className="px-3 py-3 font-mono font-bold text-[#0b7a8d]">
                  <Link href="/patient/P-1042" className="hover:underline">
                    CLM-1042
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <div className="font-bold text-[#13304d]">نورة القحطاني</div>
                  <div className="text-xs text-slate-500 font-mono">P-1042 · ICU-04</div>
                </td>
                <td className="px-3 py-3 text-xs">
                  <span className="font-semibold text-slate-800">A41.9 إنتان بولي حاد</span>
                  <div className="text-[10px] text-slate-500">Sepsis Bundle Completed</div>
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                    {isAr ? "مقبولة 100% (Accepted)" : "Accepted"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Meter pct={100} color="bg-emerald-500" className="!h-2 w-16" />
                    <span className="font-mono text-xs font-bold text-emerald-700">100%</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-xs">
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                    <span>✓</span>
                    <span>{isAr ? "مكتمل التدقيق" : "Cleared"}</span>
                  </span>
                </td>
                <td className="px-3 py-3 text-end font-mono font-black text-slate-900">
                  41,200 {isAr ? "ر.س" : "SAR"}
                </td>
              </tr>

              {/* Other Claims */}
              {claims.map((c) => {
                const readinessScore = c.readiness?.score ?? 90;
                const isException = c.status === "exception" || readinessScore < 85;
                const chip = STATUS_CHIPS[c.status] ?? STATUS_CHIPS.pending;
                const whoMustFix =
                  c.status === "exception"
                    ? isAr
                      ? "د. أحمد سالم — توقيع أمر المضاد الحيوي معلق"
                      : "Dr. Ahmed Salem — unsigned order"
                    : readinessScore < 80
                    ? isAr
                      ? "الممرضة سارة — استكمال مسح الباركود"
                      : "Nurse Sara — eMAR barcode pending"
                    : "—";

                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-mono font-bold text-slate-700">
                      {c.id}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-[#13304d]">{c.patientId}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-700 font-mono">
                      {c.dxKey || "Clinical Care"}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${chip.bg} ${chip.text}`}>
                        {isAr ? chip.labelAr : chip.labelEn}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Meter
                          pct={readinessScore}
                          color={readinessScore >= 85 ? "bg-[#0b7a8d]" : "bg-orange-500"}
                          className="!h-2 w-16"
                        />
                        <span className="font-mono text-xs font-semibold text-slate-700">
                          {readinessScore}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {isException ? (
                        <span className="rounded bg-orange-100 px-2 py-0.5 font-bold text-orange-800">
                          ⚠️ {whoMustFix}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-end font-mono font-bold text-slate-900">
                      {fmtSar(c.amountSar || 24000, lang)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
          <span>
            {isAr ? "الصفحة" : "Page"} {claimsData.page} / {claimsTotalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={claimsPage <= 1}
              onClick={() => setClaimsPage((p) => p - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40 hover:bg-slate-50"
            >
              ‹ {isAr ? "السابق" : "Prev"}
            </button>
            <button
              disabled={claimsPage >= claimsTotalPages}
              onClick={() => setClaimsPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40 hover:bg-slate-50"
            >
              {isAr ? "التالي" : "Next"} ›
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
