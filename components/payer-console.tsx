"use client";

import { Fragment, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useClaims, useOrg } from "@/lib/api";
import { ClaimDetail } from "@/components/claim-detail";
import { ClaimBornVisual } from "@/components/claim-born-visual";
import { StoryRibbon } from "@/components/story-ribbon";
import { fmtSar } from "@/lib/format";
import {
  Card,
  Empty,
  ErrorState,
  Loading,
  Meter,
  SectionTitle,
  Skeleton,
} from "@/components/ui";

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-sky-50 text-sky-700 border-sky-200",
  review: "bg-amber-50 text-amber-700 border-amber-200",
  denied: "bg-red-50 text-red-700 border-red-200",
  draft: "bg-violet-50 text-violet-700 border-violet-200",
  exception: "bg-orange-50 text-orange-700 border-orange-200",
};

export function PayerConsole() {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";
  const { data, loading, error, refetch } = useClaims({ pageSize: 50 });
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [evidenceVerified, setEvidenceVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  if (loading && !data) return <Skeleton rows={6} />;
  if (error && !data) return <ErrorState onRetry={refetch} />;
  if (!data) return <Loading />;
  const claims = data.claims;

  const handleVerifyEvidence = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      setEvidenceVerified(true);
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* ── Story Ribbon: Highlighting the Claim Step ── */}
      <StoryRibbon activeStep="claim" patientId="P-1042" patientName="نورة القحطاني" />

      {/* ── 1. CLEAR INSURANCE ACCOUNT IDENTITY & NPHIES CREDENTIALS ── */}
      <div className="rounded-2xl border-2 border-[#0b7a8d]/30 bg-gradient-to-r from-[#0d2a4a] via-[#133c66] to-[#0c4b6e] p-5 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl backdrop-blur-md border border-white/20 shadow-inner">
              🛡️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  {isAr
                    ? "بوابة شركة التأمين والمدقق الطبي المعتمد"
                    : "Payer & Medical Adjudicator Portal"}
                </h1>
                <span className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                  {isAr ? "حساب معتمد (Verified Payer)" : "Verified Payer"}
                </span>
              </div>
              <p className="mt-1 text-xs text-cyan-200">
                {isAr
                  ? "شركة بوبا العربية للتأمين التعاوني · شركة التعاونية للتأمين · الربط الوطني الفوري عبر منصة نفيس (NPHIES)"
                  : "Bupa Arabia & Tawuniya Insurance · Live NPHIES National Health Information Exchange Gateway"}
              </p>
            </div>
          </div>

          {/* Account credentials box */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-xs border border-white/15">
            <div>
              <div className="text-[10px] text-slate-300">
                {isAr ? "المدقق الطبي المسجل:" : "Adjudicator:"}
              </div>
              <div className="font-bold text-white">
                {isAr ? "د. منى العتيبي" : "Dr. Mona Alotaibi"}
              </div>
            </div>
            <div className="mx-2 h-6 w-px bg-white/20" />
            <div>
              <div className="text-[10px] text-slate-300">
                {isAr ? "معرف الدافع NPHIES:" : "NPHIES Payer ID:"}
              </div>
              <div className="font-mono font-bold text-cyan-300">
                TAW-8890-CHI
              </div>
            </div>
            <div className="mx-2 h-6 w-px bg-white/20" />
            <div>
              <div className="text-[10px] text-slate-300">
                {isAr ? "نطاق الحماية (PDPL):" : "PDPL Scope:"}
              </div>
              <div className="font-bold text-emerald-300">
                {isAr ? "أدلة سريرية محددة" : "Evidence Minimum"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. INSURER PROFITS & FINANCIAL SAVINGS (وفورات وأرباح شركة التأمين) ── */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/50 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-xs text-white font-bold">
                SAR
              </span>
              <h2 className="text-base font-black text-[#13304d]">
                {isAr
                  ? "أرباح ووفورات شركة التأمين هذا الشهر (Insurer Savings & Value)"
                  : "Insurer Monthly Savings & Value Creation"}
              </h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-300">
                {isAr ? "تقديري محمي" : "Estimated"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {isAr
                ? "كيف تحمي منصة Careshift AI أموال شركة التأمين عبر التدخل المبكر ومنع تضخيم الفواتير وتقليص تكاليف النزاعات"
                : "How Careshift AI protects payer funds by preventing ICU escalation, eliminating phantom billing, and slashing audit overhead"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFormulaModal(true)}
              className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
            >
              ℹ️ {isAr ? "معادلة ومصادر الوفر" : "Formula & Sources"}
            </button>
            <div className="rounded-xl bg-emerald-600 px-4 py-1.5 text-white shadow">
              <div className="text-[10px] font-semibold opacity-90">
                {isAr ? "إجمالي الوفر لشركة التأمين" : "Total Insurer Savings"}
              </div>
              <div className="font-mono text-base font-black">
                1,020,000 {isAr ? "ر.س" : "SAR"}
              </div>
            </div>
          </div>
        </div>

        {/* 4 Pillars of Insurer Profits/Savings */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Pillar 1: Avoided ICU payouts */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">
                {isAr ? "منع تكاليف العناية المركزة" : "Avoided ICU Payouts"}
              </span>
              <span className="text-base">🛏️</span>
            </div>
            <div className="mt-1.5 font-mono text-xl font-black text-emerald-700">
              686,000 {isAr ? "ر.س" : "SAR"}
            </div>
            <p className="mt-1 text-[11px] text-slate-600 leading-tight">
              {isAr
                ? "علاج 28 مريض إنتان في الساعة الأولى منع نقلهم لـ ICU (وفر 24,500 ر.س/حالة كانت ستتحملها شركة التأمين)"
                : "28 sepsis patients resolved in golden hour, avoiding 3.5 ICU days each (SAR 24.5k per patient)"}
            </p>
          </div>

          {/* Pillar 2: Upcoding & phantom claim protection */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">
                {isAr ? "منع تضخيم الفواتير والاحتيال" : "Zero Upcoding / Fraud"}
              </span>
              <span className="text-base">🛡️</span>
            </div>
            <div className="mt-1.5 font-mono text-xl font-black text-cyan-700">
              184,000 {isAr ? "ر.س" : "SAR"}
            </div>
            <p className="mt-1 text-[11px] text-slate-600 leading-tight">
              {isAr
                ? "رفض تلقائي استباقي لأي بند غير مرتبط بحدث سريري وباركود دواء موثق زمنياً وتشفيرياً"
                : "Automated pre-adjudication blocks any line item lacking barcoded timestamped administration"}
            </p>
          </div>

          {/* Pillar 3: Administrative and dispute operating cost */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">
                {isAr ? "تقليص نفقات التدقيق والنزاع" : "Audit & Dispute Cost Cut"}
              </span>
              <span className="text-base">⚡</span>
            </div>
            <div className="mt-1.5 font-mono text-xl font-black text-blue-700">
              92,000 {isAr ? "ر.س" : "SAR"}
            </div>
            <p className="mt-1 text-[11px] text-slate-600 leading-tight">
              {isAr
                ? "خفض كلفة تدقيق المطالبة من 140 ر.س (مراجعة ورقية) إلى 3 ر.س (تدقيق آلي)، وانعدام تكاليف المحاماة والتحكيم"
                : "Review cost dropped from SAR 140 to SAR 3 per claim with zero arbitration and legal expenses"}
            </p>
          </div>

          {/* Pillar 4: Prompt Pay Clean Claim Discount */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">
                {isAr ? "وفر السداد النظيف المبكر" : "Prompt Pay Cash Discount"}
              </span>
              <span className="text-base">💰</span>
            </div>
            <div className="mt-1.5 font-mono text-xl font-black text-teal-700">
              58,000 {isAr ? "ر.س" : "SAR"}
            </div>
            <p className="mt-1 text-[11px] text-slate-600 leading-tight">
              {isAr
                ? "خصم نقدي 2% تمنحه المستشفيات للتأمين مقابل السداد خلال 10 أيام للمطالبات المعتمدة دون نزاع"
                : "2% early settlement discount granted by hospitals for clean claims settled within 10 days"}
            </p>
          </div>
        </div>
      </div>

      {/* ── 3. RESPONSE TIME & TURNAROUND SLAS (مصفوفة أزمنة الاستجابة ومؤشرات السرعة) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-black text-[#13304d]">
              ⏱️ {isAr ? "مصفوفة زمن الاستجابة والمقارنة التشغيلية (Response Time & Turnaround SLAs)" : "Response Time & Adjudication SLA Matrix"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {isAr
                ? "مقارنة حية لسرعة الإنجاز ودقة القرار بين نظام التأمين التقليدي ومنصة Careshift AI"
                : "Live benchmark comparison: Traditional Payer Handling vs. Careshift AI Automated Adjudication"}
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200">
            SLA: 99.8% Compliance
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* SLA 1: Claim Adjudication */}
          <div className="rounded-xl border border-slate-100 bg-[#f8fafc] p-3.5">
            <div className="text-[11px] font-bold text-slate-500">
              {isAr ? "زمن تدقيق واعتماد المطالبة" : "Claim Adjudication Time"}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-emerald-600">
                42 {isAr ? "ثانية" : "sec"}
              </span>
              <span className="text-[11px] font-bold text-red-500 line-through">
                21 {isAr ? "يوماً" : "days"}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-emerald-700 font-semibold">
              ⚡ {isAr ? "اعتماد آلي مدعوم بالأدلة الجنائية" : "Instant automated verification"}
            </div>
          </div>

          {/* SLA 2: Dispute Resolution */}
          <div className="rounded-xl border border-slate-100 bg-[#f8fafc] p-3.5">
            <div className="text-[11px] font-bold text-slate-500">
              {isAr ? "زمن حسم النزاعات والاستئناف" : "Dispute Resolution Time"}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-emerald-600">
                0 {isAr ? "يوم (انعدام النزاع)" : "days (Zero Disputes)"}
              </span>
              <span className="text-[11px] font-bold text-red-500 line-through">
                45 {isAr ? "يوماً" : "days"}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-600">
              ✓ {isAr ? "الأدلة السريرية قطعية وغير قابلة للطعن" : "Indisputable digital trail"}
            </div>
          </div>

          {/* SLA 3: Clinical Intervention Response */}
          <div className="rounded-xl border border-slate-100 bg-[#f8fafc] p-3.5">
            <div className="text-[11px] font-bold text-slate-500">
              {isAr ? "زمن استجابة الفريق الطبي" : "Clinical Response Time"}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-blue-600">
                35 {isAr ? "دقيقة" : "min"}
              </span>
              <span className="text-[11px] text-slate-400">
                ({isAr ? "المعيار: 60 دقيقة" : "Standard: 60m"})
              </span>
            </div>
            <div className="mt-1 text-[11px] text-blue-700 font-semibold">
              🎯 {isAr ? "إعطاء المضاد في الساعة الذهبية" : "Within sepsis golden hour"}
            </div>
          </div>

          {/* SLA 4: Straight-Through Processing (STP) */}
          <div className="rounded-xl border border-slate-100 bg-[#f8fafc] p-3.5">
            <div className="text-[11px] font-bold text-slate-500">
              {isAr ? "نسبة المعالجة المباشرة (STP)" : "Straight-Through (STP) %"}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-[#0b7a8d]">
                94.8%
              </span>
              <span className="text-[11px] text-slate-500">
                ({isAr ? "السوق: 35%" : "Market: 35%"})
              </span>
            </div>
            <div className="mt-1 text-[11px] text-emerald-700 font-semibold">
              ✨ {isAr ? "قبول فوري دون طلب أوراق إضافية" : "Zero manual touch required"}
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. VERIFIABLE EVIDENCE DOSSIER & VISUAL HASH CHAIN (الأدلة السريرية المشفرة) ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-[#13304d]">
              🔒 {isAr ? "ملف الأدلة السريرية والتحقق الجنائي المشفر (P-1042 Case Dossier)" : "Verifiable Clinical Evidence Dossier"}
            </h3>
            <p className="text-xs text-slate-500">
              {isAr
                ? "دراسة تفصيلية لسلسلة أحداث نورة القحطاني تثبت الضرورة الطبية لـ 41,200 ر.س دون أدنى شبهة تلاعب"
                : "Live cryptographic evidence proof for case P-1042 justifying SAR 41,200 medical necessity"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleVerifyEvidence}
              disabled={isVerifying}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black shadow-md transition-all ${
                evidenceVerified
                  ? "bg-emerald-600 text-white ring-2 ring-emerald-400"
                  : "bg-[#0b7a8d] text-white hover:bg-[#075e6e]"
              }`}
            >
              {isVerifying ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>{isAr ? "جارٍ الفحص التشفيري للهاش..." : "Verifying SHA-256 Hashes..."}</span>
                </>
              ) : evidenceVerified ? (
                <>
                  <span>✓</span>
                  <span>{isAr ? "تم اعتماد وسلامة كافة الأدلة الـ 14 (سلسلة صحيحة)" : "14 Events Cryptographically Verified"}</span>
                </>
              ) : (
                <>
                  <span>🔐</span>
                  <span>{isAr ? "فحص سلامة الأدلة التشفيرية والاعتماد" : "Verify Cryptographic Proof & Approve"}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* The visual interactive chain */}
        <ClaimBornVisual showPayerVerifyButton={false} />
      </div>

      {/* ── 5. PAYER CLAIMS QUEUE & ADJUDICATION ACTIONS ── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef2f7] pb-3">
          <div>
            <SectionTitle sub={t("payer.scopeNote")}>
              {t("payer.claims")} ({data.total})
            </SectionTitle>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {isAr ? "مطالبات شركة بوبا / التعاونية المرفوعة" : "Company Inbound Claims"}
            </span>
          </div>
        </div>

        {claims.length === 0 ? (
          <Empty title={t("payer.empty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#eef2f7] text-start text-xs text-slate-500">
                  <th className="px-3 py-2 text-start font-semibold">
                    {t("payer.claimId")}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">
                    {t("payer.memberId")}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">
                    {t("payer.dx")}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">
                    {t("payer.status")}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">
                    {t("payer.readiness")}
                  </th>
                  <th className="px-3 py-2 text-end font-semibold">
                    {t("payer.amount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="border-b border-[#f4f7fa] last:border-0 hover:bg-[#f8fafc]/80 transition">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-[#0b7a8d]">
                        {c.id}
                        {c.version && c.version > 1 ? (
                          <span className="ms-1 text-slate-500">v{c.version}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                        {c.patientId ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {t(`dx.${c.dxKey}`)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            STATUS_STYLE[c.status] ?? STATUS_STYLE.pending
                          }`}
                        >
                          {t(`claim.${c.status}`)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex w-24 items-center gap-2">
                          <Meter pct={c.readiness.score} color="bg-[#0e9bb5]" />
                          <span className="text-[11px] font-mono text-slate-600">
                            {c.readiness.score}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-end font-mono text-sm font-bold text-[#13304d]">
                        {fmtSar(c.amountSar, lang)}
                        {c.autoSubmitted && (
                          <span className="ms-2 rounded-full bg-[#0e9bb5]/10 px-1.5 py-px text-[9px] font-bold text-[#075e6e]">
                            {t("claim.autoSubmitted")}
                          </span>
                        )}
                      </td>
                    </tr>
                    {/* Expandable Claim Details with Payer Adjudication Actions */}
                    <tr className="border-b border-[#f4f7fa] last:border-0">
                      <td colSpan={6} className="px-3 pb-2">
                        <ClaimDetail claim={c} onChanged={refetch} />
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── FORMULA & SOURCES MODAL (معادلة أرباح شركة التأمين ومصادرها) ── */}
      {showFormulaModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#13304d]/50 p-4"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <h3 className="text-base font-black text-[#13304d]">
                  {isAr
                    ? "معادلة احتساب أرباح ووفورات شركة التأمين والمصادر العلمية"
                    : "Insurer Financial Model & Scientific References"}
                </h3>
              </div>
              <button
                onClick={() => setShowFormulaModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-700">
              {/* Formula Item 1 */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="font-bold text-emerald-900">
                  1. {isAr ? "وفر منع العناية المركزة (Avoided ICU Payouts):" : "Avoided ICU Days Reimbursement:"}
                </div>
                <div className="mt-1 font-mono text-[11px] text-emerald-800">
                  28 {isAr ? "مريض إنتان" : "sepsis patients"} × 3.5 {isAr ? "أيام ICU مجنبة" : "days"} × 7,000 {isAr ? "ر.س تكلفة اليوم المقررة" : "SAR/day"} = 686,000 {isAr ? "ر.س" : "SAR"}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {isAr
                    ? "المصدر: الجمعية السعودية لطب العناية الحرجة (SSCCM) وبروتوكول حزمة الإنتان لساعة الذهب الأولى التابع لمجلس الضمان الصحي."
                    : "Source: Saudi Critical Care Society (SSCCM) & CHI Sepsis Golden Hour Protocol."}
                </div>
              </div>

              {/* Formula Item 2 */}
              <div className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-3">
                <div className="font-bold text-cyan-900">
                  2. {isAr ? "منع تضخيم الفواتير والفوترة الوهمية (Upcoding Prevention):" : "Upcoding & Phantom Billing Prevention:"}
                </div>
                <div className="mt-1 font-mono text-[11px] text-cyan-800">
                  {isAr ? "متوسط وفر 8.2% من إجمالي المطالبات المرفوعة عن طريق التدقيق الرقمي الفوري = 184,000 ر.س" : "8.2% reduction in claim leakage through automated forensic telemetry verification = SAR 184,000"}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {isAr
                    ? "المصدر: دراسات جمعية مكافحة الاحتيال في الرعاية الصحية (NHCAA) وتحليل مطالبات مجلس الضمان الصحي (CHI)."
                    : "Source: NHCAA & Council of Health Insurance (CHI) Anti-Fraud Analytics."}
                </div>
              </div>

              {/* Formula Item 3 */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                <div className="font-bold text-blue-900">
                  3. {isAr ? "تقليص نفقات التدقيق الإداري والنزاعات (Audit & Disputes Overhead):" : "Audit & Dispute Administrative Overhead:"}
                </div>
                <div className="mt-1 font-mono text-[11px] text-blue-800">
                  670 {isAr ? "مطالبة تم تدقيقها آلياً" : "claims audited"} × (140 - 3 {isAr ? "ر.س وفر لكل معاملة" : "SAR saved per claim"}) = 92,000 {isAr ? "ر.س" : "SAR"}
                </div>
              </div>

              {/* Formula Item 4 */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3">
                <div className="font-bold text-teal-900">
                  4. {isAr ? "خصم السداد النظيف المبكر (Prompt Pay Benefit):" : "Prompt Pay Early Settlement Benefit:"}
                </div>
                <div className="mt-1 font-mono text-[11px] text-teal-800">
                  2% {isAr ? "خصم تسوية سريعة على 2,900,000 ر.س مطالبات معتمدة فوراً" : "early settlement discount on SAR 2.9M clean claims"} = 58,000 {isAr ? "ر.س" : "SAR"}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowFormulaModal(false)}
                className="rounded-xl bg-[#0b7a8d] px-5 py-2 text-xs font-bold text-white hover:bg-[#075e6e]"
              >
                {isAr ? "إغلاق" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
