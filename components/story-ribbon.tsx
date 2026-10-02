"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";

export type StoryStep = "event" | "alert" | "doctor" | "handoff" | "claim";

interface StoryRibbonProps {
  activeStep?: StoryStep;
  patientId?: string;
  patientName?: string;
}

const STEPS: {
  key: StoryStep;
  ar: string;
  en: string;
  time: string;
  icon: string;
  color: string;
  descAr: string;
  descEn: string;
}[] = [
  {
    key: "event",
    ar: "1. حدث سريري",
    en: "1. Clinical Event",
    time: "02:10",
    icon: "🫀",
    color: "from-blue-500 to-indigo-600",
    descAr: "تسجيل علامات حيوية (P-1042)",
    descEn: "Vitals recorded (P-1042)",
  },
  {
    key: "alert",
    ar: "2. تنبيه وتدهور",
    en: "2. Deterioration",
    time: "02:11",
    icon: "⚠️",
    color: "from-amber-500 to-red-600",
    descAr: "ارتفاع NEWS2 إلى 7 + اشتباه إنتان",
    descEn: "NEWS2 spikes to 7 + Sepsis alert",
  },
  {
    key: "doctor",
    ar: "3. قرار الطبيب",
    en: "3. Doctor Action",
    time: "02:15",
    icon: "👨‍⚕️",
    color: "from-cyan-600 to-blue-700",
    descAr: "إقرار فوري وحزمة إنتان + مضاد",
    descEn: "Sepsis bundle + IV Antibiotic",
  },
  {
    key: "handoff",
    ar: "4. تسليم I-PASS",
    en: "4. I-PASS Handoff",
    time: "07:00",
    icon: "🔄",
    color: "from-teal-600 to-emerald-600",
    descAr: "نقل المهام دون انقطاع سريري",
    descEn: "Closed-loop shift transition",
  },
  {
    key: "claim",
    ar: "5. مطالبة ووفر",
    en: "5. Claim & Savings",
    time: "14:05",
    icon: "🛡️",
    color: "from-emerald-600 to-green-700",
    descAr: "دليل مشفّر + وفر 41,200 ر.س",
    descEn: "Hash-verified + SAR 41.2k saved",
  },
];

export function StoryRibbon({
  activeStep = "event",
  patientId = "P-1042",
  patientName = "نورة القحطاني",
}: StoryRibbonProps) {
  const { lang } = useI18n();

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-[#0e9bb5]/25 bg-gradient-to-r from-[#0c233c] via-[#102d4d] to-[#0c233c] p-3 text-white shadow-md">
      {/* Top micro-bar: Core Thesis */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {lang === "ar" ? "مسار القيمة المترابطة" : "Value Creation Stream"}
          </span>
          <span className="hidden font-medium text-slate-300 sm:inline">
            {lang === "ar"
              ? "حدث المريض الواحد ➔ رعاية أسرع ➔ تسليم موثّق ➔ مطالبة مقبولة ➔ وفر مالي مثبت"
              : "One Patient Event ➔ Safer Care ➔ Verified Handoff ➔ Approved Claim ➔ Measurable Savings"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-cyan-300">
            {patientName} ({patientId})
          </span>
          <Link
            href="/demo"
            className="inline-flex items-center gap-1 rounded-md bg-[#0e9bb5] px-2 py-0.5 text-[11px] font-bold text-white transition hover:bg-[#0b7a8d]"
          >
            ▶ {lang === "ar" ? "عرض المسار الكامل" : "Hero Demo"}
          </Link>
        </div>
      </div>

      {/* 5-Step Connected Flow */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {STEPS.map((s, idx) => {
          const isActive = s.key === activeStep;
          const isPassed =
            STEPS.findIndex((x) => x.key === activeStep) >= idx;

          return (
            <div
              key={s.key}
              className={`relative flex flex-col justify-between rounded-xl border p-2 transition-all ${
                isActive
                  ? "border-cyan-400 bg-cyan-950/60 shadow-lg ring-1 ring-cyan-400/50"
                  : isPassed
                  ? "border-emerald-500/30 bg-white/5 opacity-90"
                  : "border-white/5 bg-white/[0.02] opacity-60"
              }`}
            >
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <span className="flex items-center gap-1 font-bold">
                  <span>{s.icon}</span>
                  <span className={isActive ? "text-cyan-200" : "text-white"}>
                    {lang === "ar" ? s.ar : s.en}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  {s.time}
                </span>
              </div>
              <p className="mt-1 line-clamp-1 text-[10px] text-slate-300">
                {lang === "ar" ? s.descAr : s.descEn}
              </p>
              {isActive && (
                <span className="mt-1.5 inline-block w-fit rounded bg-cyan-400/20 px-1.5 py-0.2 text-[9px] font-bold text-cyan-300">
                  {lang === "ar" ? "المرحلة الحالية" : "Active Stage"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
