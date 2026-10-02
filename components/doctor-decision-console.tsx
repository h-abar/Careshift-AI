"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { StoryRibbon } from "@/components/story-ribbon";
import type { PatientSnapshot } from "@/lib/aggregate";

export interface DoctorCase {
  id: string;
  patientId: string;
  nameAr: string;
  nameEn: string;
  room: string;
  dept: string;
  news2: number;
  components: { label: string; score: number; val: string }[];
  whyAr: string;
  whyEn: string;
  consistencyFlagAr?: string;
  consistencyFlagEn?: string;
  step: 1 | 2 | 3 | 4; // 1: Acknowledge, 2: Bedside review, 3: Decide, 4: Recheck
  waitingMin: number;
  decision?: string;
  decisionTime?: string;
  antibioticTimeMin?: number;
}

const INITIAL_CASES: DoctorCase[] = [
  {
    id: "CASE-1042",
    patientId: "P-1042",
    nameAr: "نورة القحطاني",
    nameEn: "Noura Al-Qahtani",
    room: "ICU-04",
    dept: "icu",
    news2: 7,
    components: [
      { label: "RR", score: 2, val: "24/min" },
      { label: "SpO2", score: 1, val: "93%" },
      { label: "BP", score: 1, val: "102/65" },
      { label: "HR", score: 2, val: "108 bpm" },
      { label: "Temp", score: 1, val: "38.6°C" },
    ],
    whyAr: "تدهور حاد مع تسارع تنفسي ونبضي مفاجئ وارتفاع في الحرارة يرفع NEWS2 إلى 7.",
    whyEn: "Acute deterioration with tachycardia, tachypnea, and pyrexia elevating NEWS2 to 7.",
    consistencyFlagAr: "اشتباه إنتان بولي حاد دون توثيق تشخيص العدوى في ملخص الدخول (تضارب سريري).",
    consistencyFlagEn: "Signs of acute sepsis with no documented infection diagnosis on admission.",
    step: 1,
    waitingMin: 4,
  },
  {
    id: "CASE-1002",
    patientId: "P-1002",
    nameAr: "سعد الشهري",
    nameEn: "Saad Al-Shehri",
    room: "ICU-01",
    dept: "icu",
    news2: 6,
    components: [
      { label: "RR", score: 3, val: "28/min" },
      { label: "SpO2", score: 2, val: "89% on O2" },
      { label: "BP", score: 0, val: "120/75" },
      { label: "HR", score: 1, val: "95 bpm" },
      { label: "Temp", score: 0, val: "37.1°C" },
    ],
    whyAr: "تسارع تنفسي متواصل مع نقص أكسجة على جهاز التنفس الاصطناعي.",
    whyEn: "Persistent tachypnea with SpO2 desaturation on ventilator support.",
    step: 2,
    waitingMin: 12,
  },
  {
    id: "CASE-1028",
    patientId: "P-1028",
    nameAr: "محمد العتيبي",
    nameEn: "Mohammed Al-Otaibi",
    room: "Med-08",
    dept: "medical",
    news2: 5,
    components: [
      { label: "RR", score: 1, val: "21/min" },
      { label: "SpO2", score: 1, val: "94%" },
      { label: "BP", score: 2, val: "88/55" },
      { label: "HR", score: 1, val: "98 bpm" },
      { label: "Temp", score: 0, val: "36.8°C" },
    ],
    whyAr: "هبوط ضغط دم انقباضي < 90 مم زئبق مع تاريخ قصور عضلة القلب.",
    whyEn: "Hypotension (SBP < 90 mmHg) with known congestive heart failure history.",
    step: 1,
    waitingMin: 18,
  },
];

interface DoctorDecisionConsoleProps {
  snaps?: PatientSnapshot[];
}

export function DoctorDecisionConsole({}: DoctorDecisionConsoleProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { user } = useAuth();
  const toast = useToast();

  const [cases, setCases] = useState<DoctorCase[]>(INITIAL_CASES);
  const [decidingCase, setDecidingCase] = useState<DoctorCase | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<
    "sepsis" | "rrt" | "monitor" | "not_significant" | null
  >(null);
  const [notSignificantReason, setNotSignificantReason] = useState("");
  const [sentOrderBanner, setSentOrderBanner] = useState<string | null>(null);

  // Filter pending decisions (step < 4)
  const pendingCases = cases.filter((c) => c.step < 4);
  const completedDecisions = cases.filter((c) => c.step === 4);

  // Acknowledge step
  const handleAcknowledge = (caseId: string) => {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? { ...c, step: 2 } : c)),
    );
    toast(
      isAr
        ? "✅ تم الإقرار بالاطلاع الطبي — جاري التوجه للمعاينة السريرية"
        : "✅ Acknowledged — proceed to bedside review",
      "success",
    );
  };

  // Bedside review step
  const handleBedsideReview = (caseId: string) => {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? { ...c, step: 3 } : c)),
    );
    toast(
      isAr
        ? "🩺 تم توثيق المعاينة عند السرير — اتخذ القرار السريري الآن"
        : "🩺 Bedside review complete — choose clinical decision",
      "info",
    );
  };

  // Submit Decision
  const handleConfirmDecision = () => {
    if (!decidingCase || !selectedDecision) return;
    if (selectedDecision === "not_significant" && !notSignificantReason.trim()) {
      toast(
        isAr
          ? "يرجى كتابة سبب التقييم لتوثيق أن الحالة غير خطيرة"
          : "Please state reason for not significant",
        "error",
      );
      return;
    }

    const decisionName =
      selectedDecision === "sepsis"
        ? isAr ? "حزمة الإنتان الفورية (Sepsis Bundle)" : "Sepsis Bundle"
        : selectedDecision === "rrt"
        ? isAr ? "تصعيد لفريق العناية المركزة (RRT/ICU)" : "RRT/ICU Escalation"
        : selectedDecision === "monitor"
        ? isAr ? "تكثيف المراقبة كل 15 دقيقة" : "Continuous Monitoring"
        : isAr ? "حالة غير خطيرة" : "Not Significant";

    setCases((prev) =>
      prev.map((c) =>
        c.id === decidingCase.id
          ? {
              ...c,
              step: 4,
              decision: decisionName,
              decisionTime: "02:15",
              antibioticTimeMin: selectedDecision === "sepsis" ? 30 : undefined,
            }
          : c,
      ),
    );

    if (selectedDecision === "sepsis") {
      setSentOrderBanner(
        isAr
          ? `✅ تم اعتماد حزمة الإنتان للمريضة ${decidingCase.nameAr} وإرسال الأوامر فورياً إلى كابينة الممرضة سارة أحمد (02:15)`
          : `✅ Sepsis bundle ordered for ${decidingCase.nameEn} and routed to Nurse Sara Ahmed (02:15)`,
      );
    }

    toast(
      isAr
        ? `🎉 تم تسجيل القرار «${decisionName}» وتوثيقه في السلسلة المشفرة`
        : `🎉 Decision «${decisionName}» recorded in audit chain`,
      "success",
    );

    setDecidingCase(null);
    setSelectedDecision(null);
    setNotSignificantReason("");
  };

  return (
    <div className="space-y-6">
      {/* Story Ribbon */}
      <StoryRibbon activeStep="doctor" patientId="P-1042" patientName="نورة القحطاني" />

      {/* Confirmation Order Banner for Nurse Handshake */}
      {sentOrderBanner && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white text-xl">
              ⚡
            </span>
            <div className="text-sm font-bold text-emerald-950">
              {sentOrderBanner}
            </div>
          </div>
          <button
            onClick={() => setSentOrderBanner(null)}
            className="rounded-lg bg-emerald-200/60 px-3 py-1 text-xs font-bold text-emerald-900 hover:bg-emerald-200"
          >
            {isAr ? "إغلاق" : "Dismiss"}
          </button>
        </div>
      )}

      {/* Header & Big Red Counter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#13304d]">
            {isAr
              ? "لوحة القرار السريري للطبيب المعالج (Decision Console)"
              : "Doctor Decision Console"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {isAr
              ? "استجابة فورية لحالات التدهور السريري، إقرار سريع، ومعاينة، وإصدار أوامر حزمة الإنتان"
              : "Rapid decision dashboard for clinical deterioration alerts, ordered by NEWS2 severity"}
          </p>
        </div>

        {/* Big Red Counter Badge */}
        <div className="flex items-center gap-3 rounded-2xl border-2 border-red-500 bg-red-50 px-4 py-2.5 shadow-md">
          <div className="relative flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-red-600" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase text-red-700">
              {isAr ? "حالات تتطلب قرارك الطبي فوراً" : "Needs Your Decision"}
            </div>
            <div className="text-xl font-black text-red-900">
              {pendingCases.length} {isAr ? "حالات معلقة" : "Cases Pending"}
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Primary Left Column: Active Deterioration Cards */}
        <div className="space-y-4 lg:col-span-2">
          {pendingCases.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <span className="text-4xl">🎉</span>
              <h3 className="mt-2 text-base font-bold text-[#13304d]">
                {isAr
                  ? "لا توجد حالات تدهور سريري معلقة بانتظار القرار"
                  : "All deterioration alerts have been decided"}
              </h3>
              <p className="text-xs text-slate-500">
                {isAr
                  ? "جميع تنبيهات NEWS2 تم إقرارها واتخاذ الإجراءات السريرية اللازمة لها."
                  : "All clinical deterioration alerts are signed off and managed."}
              </p>
            </div>
          ) : (
            pendingCases.map((c) => {
              const isP1042 = c.patientId === "P-1042";

              return (
                <div
                  key={c.id}
                  className={`rounded-2xl border p-5 shadow-sm transition-all ${
                    isP1042
                      ? "border-red-400 bg-white ring-2 ring-red-400/20 shadow-md"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  {/* Card Header: Patient, Room, Timer */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-rose-700 font-mono text-xl font-black text-white shadow-md">
                        {c.news2}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-black text-[#13304d]">
                            {isAr ? c.nameAr : c.nameEn}
                          </h3>
                          <span className="font-mono text-xs font-bold text-[#0b7a8d]">
                            {c.patientId}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {c.room} · {isAr ? "العناية المركزة" : "ICU"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {isAr ? c.whyAr : c.whyEn}
                        </p>
                      </div>
                    </div>

                    {/* Timer since alert */}
                    <div className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 font-mono text-xs font-bold text-red-800">
                      <span>⏱️</span>
                      <span>
                        {isAr
                          ? `منذ ${c.waitingMin} دقائق`
                          : `${c.waitingMin}m since alert`}
                      </span>
                    </div>
                  </div>

                  {/* NEWS2 Component Breakdown Pills */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="text-xs font-bold text-slate-500 flex items-center">
                      {isAr ? "مكونات المؤشر:" : "Components:"}
                    </span>
                    {c.components.map((comp, ci) => (
                      <span
                        key={ci}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${
                          comp.score >= 2
                            ? "border-red-300 bg-red-50 text-red-800"
                            : comp.score === 1
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        <span className="font-mono">{comp.label}</span>
                        <span className="rounded bg-white/80 px-1 py-0.2 text-[10px] text-slate-600">
                          {comp.val}
                        </span>
                        <span className="rounded-full bg-red-600/10 px-1 text-[10px]">
                          +{comp.score}
                        </span>
                      </span>
                    ))}
                  </div>

                  {/* Consistency Flag if present */}
                  {c.consistencyFlagAr && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50/80 p-2.5 text-xs font-bold text-amber-900">
                      <span className="text-base">⚠️</span>
                      <span>{isAr ? c.consistencyFlagAr : c.consistencyFlagEn}</span>
                    </div>
                  )}

                  {/* 4-Step Progress Bar with large sequential action buttons */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {/* Step 1: Acknowledge */}
                      <button
                        onClick={() => handleAcknowledge(c.id)}
                        disabled={c.step > 1}
                        className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition ${
                          c.step >= 2
                            ? "border-emerald-400 bg-emerald-50 text-emerald-800 font-bold"
                            : c.step === 1
                            ? "border-blue-500 bg-blue-600 text-white font-black hover:bg-blue-700 shadow-md ring-2 ring-blue-300"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                        }`}
                      >
                        <span className="text-xs">
                          {c.step >= 2 ? "✓ 1. " : "1. "}
                          {isAr ? "إقرار بالاطلاع" : "Acknowledge"}
                        </span>
                        <span className="text-[10px] opacity-80">
                          {c.step >= 2 ? (isAr ? "تم الإقرار" : "Done") : isAr ? "اضغط للاعتماد" : "Tap to ack"}
                        </span>
                      </button>

                      {/* Step 2: Bedside review */}
                      <button
                        onClick={() => handleBedsideReview(c.id)}
                        disabled={c.step < 2 || c.step > 2}
                        className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition ${
                          c.step >= 3
                            ? "border-emerald-400 bg-emerald-50 text-emerald-800 font-bold"
                            : c.step === 2
                            ? "border-[#0b7a8d] bg-[#0b7a8d] text-white font-black hover:bg-[#075e6e] shadow-md ring-2 ring-[#0b7a8d]/30"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                        }`}
                      >
                        <span className="text-xs">
                          {c.step >= 3 ? "✓ 2. " : "2. "}
                          {isAr ? "معاينة السرير" : "Bedside Review"}
                        </span>
                        <span className="text-[10px] opacity-80">
                          {c.step >= 3 ? (isAr ? "تمت المعاينة" : "Reviewed") : isAr ? "توثيق الحضور" : "Bedside check"}
                        </span>
                      </button>

                      {/* Step 3: Decide */}
                      <button
                        onClick={() => setDecidingCase(c)}
                        disabled={c.step < 3 || c.step > 3}
                        className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition ${
                          c.step >= 4
                            ? "border-emerald-400 bg-emerald-50 text-emerald-800 font-bold"
                            : c.step === 3
                            ? "border-red-500 bg-red-600 text-white font-black hover:bg-red-700 shadow-md ring-2 ring-red-400/40 animate-pulse"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                        }`}
                      >
                        <span className="text-xs">
                          {c.step >= 4 ? "✓ 3. " : "3. "}
                          {isAr ? "اتخاذ القرار" : "Decide"}
                        </span>
                        <span className="text-[10px] opacity-80">
                          {c.step === 3 ? (isAr ? "مطلوب فوراً" : "Action required") : isAr ? "القرار الطبي" : "Decide"}
                        </span>
                      </button>

                      {/* Step 4: Re-check */}
                      <div
                        className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center ${
                          c.step === 4
                            ? "border-emerald-400 bg-emerald-50 text-emerald-800 font-bold"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                        }`}
                      >
                        <span className="text-xs">
                          4. {isAr ? "إعادة الفحص" : "Re-check"}
                        </span>
                        <span className="text-[10px] opacity-80">
                          {c.step === 4 ? (isAr ? "مجدول 03:30" : "At 03:30") : isAr ? "بعد القرار" : "Post-decision"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: "My decisions today" + Medical Record link */}
        <div className="space-y-5">
          {/* Quick link to Patient Medical Record (E9) */}
          <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-900 to-[#13304d] p-5 text-white shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">📑</span>
              <div>
                <h3 className="text-sm font-black">
                  {isAr ? "السجل الطبي الموحد للمريض" : "Patient Medical Record"}
                </h3>
                <p className="text-xs text-cyan-200">
                  {isAr ? "10 تبويبات سريرية مع توثيق التدقيق" : "10 clinical tabs with audit log"}
                </p>
              </div>
            </div>
            <Link
              href="/patient/P-1042"
              className="mt-4 flex items-center justify-between rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-black text-slate-900 shadow hover:bg-cyan-300 transition"
            >
              <span>{isAr ? "فتح ملف نورة القحطاني P-1042" : "Open Noura P-1042 Record"}</span>
              <span>➔</span>
            </Link>
          </div>

          {/* My decisions today panel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-[#13304d]">
                {isAr ? "قراراتي المتخذة اليوم (My Decisions Today)" : "My Decisions Today"}
              </h3>
              <p className="text-xs text-slate-500">
                {isAr
                  ? "مؤشرات سرعة الاستجابة الذهبية والامتثال لبروتوكولات الإنتان"
                  : "Response times and clinical compliance during this shift"}
              </p>
            </div>

            {/* Time Metrics Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                <div className="text-[10px] font-bold uppercase text-blue-800">
                  {isAr ? "زمن الإقرار" : "Time to Ack"}
                </div>
                <div className="mt-1 font-mono text-xl font-black text-blue-900">
                  3.2 {isAr ? "دقائق" : "min"}
                </div>
                <div className="text-[9px] text-emerald-700 font-bold">
                  ✓ {isAr ? "ضمن المعيار (< 5 د)" : "Within SLA (< 5m)"}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="text-[10px] font-bold uppercase text-emerald-800">
                  {isAr ? "زمن المضاد الحيوي" : "Time to Antibiotic"}
                </div>
                <div className="mt-1 font-mono text-xl font-black text-emerald-900">
                  34 {isAr ? "دقيقة" : "min"}
                </div>
                <div className="text-[9px] text-emerald-700 font-bold">
                  ✓ {isAr ? "المعيار الذهبي (< 60 د)" : "Gold Standard (< 60m)"}
                </div>
              </div>
            </div>

            {/* Completed Decisions List */}
            <div className="space-y-2 pt-2">
              <div className="text-xs font-bold text-slate-700">
                {isAr ? "القرارات المعتمدة حديثاً:" : "Recently Signed Decisions:"}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#13304d]">نورة القحطاني (P-1042)</span>
                  <span className="font-mono text-emerald-700 font-bold">02:15</span>
                </div>
                <div className="text-slate-600 text-[11px]">
                  {isAr
                    ? "بدء حزمة الإنتان + سيفتررياكسون 2 جم + لاكتات + مزارع دم"
                    : "Sepsis bundle initiated + Ceftriaxone 2g IV + Lactate"}
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold">
                  ✓ {isAr ? "تم نقل الأوامر لكابينة الممرضة سارة أحمد" : "Transferred to Nurse Sara"}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5 opacity-80">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#13304d]">خالد السالم (P-1019)</span>
                  <span className="font-mono text-slate-600 font-bold">01:30</span>
                </div>
                <div className="text-slate-600 text-[11px]">
                  {isAr ? "تعديل جرعة مدر البول الوريدي" : "Adjusted IV diuretic dose"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── DECIDE MODAL WITH 4 BIG OPTIONS ── */}
      {decidingCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-[#13304d]">
                  {isAr ? "اتخاذ القرار السريري الفوري" : "Clinical Decision"}
                </h3>
                <p className="text-xs text-slate-500">
                  {decidingCase.nameAr} ({decidingCase.patientId}) · NEWS2 = {decidingCase.news2}
                </p>
              </div>
              <button
                onClick={() => setDecidingCase(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* 4 Big Decision Options */}
            <div className="space-y-3">
              {/* Option 1: Start Sepsis Bundle */}
              <button
                onClick={() => setSelectedDecision("sepsis")}
                className={`w-full rounded-xl border p-4 text-start transition-all ${
                  selectedDecision === "sepsis"
                    ? "border-red-500 bg-red-50/80 ring-2 ring-red-400"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">💉</span>
                    <div>
                      <div className="text-sm font-black text-red-950">
                        {isAr ? "1. بدء حزمة الإنتان الفورية (Start Sepsis Bundle)" : "1. Start Sepsis Bundle"}
                      </div>
                      <div className="text-xs text-red-800">
                        {isAr ? "بروتوكول الساعة الذهبية لإنقاذ الحياة" : "Golden hour protocol"}
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                    {isAr ? "موصى به" : "Recommended"}
                  </span>
                </div>

                {/* Sub-orders list if selected */}
                {selectedDecision === "sepsis" && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-white p-3 text-xs text-slate-700 space-y-1.5">
                    <div className="font-bold text-red-900">
                      {isAr ? "الأوامر الطبية التي سيتم إنشاؤها فوراً:" : "Orders automatically generated:"}
                    </div>
                    <ul className="space-y-1 text-slate-800">
                      <li>• {isAr ? "سحب مزارع الدم فوراً (Blood cultures x2 STAT)" : "Blood cultures x2 STAT"}</li>
                      <li>• {isAr ? "فحص اللاكتات الإسعافي (Serum Lactate STAT)" : "Serum Lactate STAT"}</li>
                      <li>• {isAr ? "سوائل وريدية ملحية 30 مل/كغ (IV Normal Saline 30ml/kg)" : "IV Fluids 30ml/kg"}</li>
                      <li>• {isAr ? "مضاد حيوي واسع المجال: سيفتررياكسون 2 جم وريدي فوراً" : "IV Ceftriaxone 2g STAT"}</li>
                    </ul>
                    <div className="pt-2 border-t border-slate-100 font-bold text-emerald-700">
                      ✓ {isAr ? "إشعار وتوجيه تلقائي إلى كابينة الممرضة سارة أحمد" : "Routed to Nurse Sara Ahmed automatically"}
                    </div>
                  </div>
                )}
              </button>

              {/* Option 2: Escalate to RRT-ICU */}
              <button
                onClick={() => setSelectedDecision("rrt")}
                className={`w-full rounded-xl border p-4 text-start transition-all ${
                  selectedDecision === "rrt"
                    ? "border-amber-500 bg-amber-50/80 ring-2 ring-amber-400"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🚨</span>
                  <div>
                    <div className="text-sm font-black text-amber-950">
                      {isAr ? "2. استدعاء فريق الاستجابة السريعة (Escalate to RRT-ICU)" : "2. Escalate to RRT-ICU"}
                    </div>
                    <div className="text-xs text-amber-800">
                      {isAr ? "استدعاء استشاري العناية وفريق التخدير للتدخل العاجل" : "Call rapid response critical team"}
                    </div>
                  </div>
                </div>
              </button>

              {/* Option 3: Increase Monitoring */}
              <button
                onClick={() => setSelectedDecision("monitor")}
                className={`w-full rounded-xl border p-4 text-start transition-all ${
                  selectedDecision === "monitor"
                    ? "border-blue-500 bg-blue-50/80 ring-2 ring-blue-400"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">⏱️</span>
                  <div>
                    <div className="text-sm font-black text-blue-950">
                      {isAr ? "3. تكثيف المراقبة الحيوية (Increase Monitoring)" : "3. Increase Monitoring"}
                    </div>
                    <div className="text-xs text-blue-800">
                      {isAr ? "قياس العلامات الحيوية كل 15 دقيقة مع ربط المونيتور" : "Repeat vitals q15min with continuous monitoring"}
                    </div>
                  </div>
                </div>
              </button>

              {/* Option 4: Not Significant */}
              <button
                onClick={() => setSelectedDecision("not_significant")}
                className={`w-full rounded-xl border p-4 text-start transition-all ${
                  selectedDecision === "not_significant"
                    ? "border-slate-500 bg-slate-100 ring-2 ring-slate-400"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">📋</span>
                  <div>
                    <div className="text-sm font-black text-slate-800">
                      {isAr ? "4. غير خطير سريرياً (Not Significant)" : "4. Not Significant"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {isAr ? "يتطلب إدخال سبب التقييم السريري لتوثيقه بالملف" : "Mandatory clinical justification required"}
                    </div>
                  </div>
                </div>

                {selectedDecision === "not_significant" && (
                  <div className="mt-3">
                    <textarea
                      value={notSignificantReason}
                      onChange={(e) => setNotSignificantReason(e.target.value)}
                      placeholder={isAr ? "اكتب سبب التقييم السريري هنا..." : "State reason here..."}
                      rows={2}
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 outline-none"
                    />
                  </div>
                )}
              </button>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setDecidingCase(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </button>
              <button
                onClick={handleConfirmDecision}
                disabled={!selectedDecision}
                className="rounded-xl bg-red-600 px-6 py-2.5 text-xs font-black text-white hover:bg-red-700 shadow-md disabled:opacity-50 transition"
              >
                {isAr ? "اعتماد القرار وإرسال الأوامر" : "Confirm Decision & Route Orders"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
