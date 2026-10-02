"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";

export interface DemoStep {
  step: number;
  time: string;
  roleAr: string;
  roleEn: string;
  route: string;
  titleAr: string;
  titleEn: string;
  captionAr: string;
  captionEn: string;
  whyAr: string;
  whyEn: string;
}

const DEMO_STEPS: DemoStep[] = [
  {
    step: 1,
    time: "02:10",
    roleAr: "تمريض سريري (سارة أحمد)",
    roleEn: "Ward Nurse (Sara Ahmed)",
    route: "/",
    titleAr: "رصد العلامات الحيوية وحساب NEWS2 = 7",
    titleEn: "Vitals Recorded: Instant NEWS2 = 7",
    captionAr: "قامت الممرضة سارة برصد العلامات الحيوية لنورة القحطاني؛ قام النظام بحساب مؤشر NEWS2 تلقائياً مسجلاً 7 درجات حرجة.",
    captionEn: "Sara recorded vitals for Noura; system calculated instant NEWS2 = 7 critical score.",
    whyAr: "الأهمية للجنة: كشف التدهور السريري في الدقائق الأولى يمنع الوفيات وتوقف القلب المفاجئ.",
    whyEn: "Jury Takeaway: Early automated detection stops silent deterioration before cardiac arrest.",
  },
  {
    step: 2,
    time: "02:11",
    roleAr: "محرك الذكاء السريري",
    roleEn: "Clinical AI Engine",
    route: "/patient/P-1042",
    titleAr: "إنذار تدهور + كشف تضارب سريري (إنتان دون تشخيص)",
    titleEn: "Red Alert + Clinical Consistency Flag Raised",
    captionAr: "أطلق النظام تنبيهاً أحمر واكتشف تضارباً سريرياً: المريضة لديها علامات إنتان حاد دون توثيق تشخيص العدوى بالملف.",
    captionEn: "System raised red alert and detected consistency conflict: sepsis signs present without documented infection dx.",
    whyAr: "الأهمية للجنة: التنبيه الاستباقي يمنع إغفال التشخيص ويحمي المستشفى من رفض المطالبة لاحقاً.",
    whyEn: "Jury Takeaway: Eliminates diagnosis omission, protecting both patient life and claim validity.",
  },
  {
    step: 3,
    time: "02:15",
    roleAr: "طبيب معالج (د. أحمد سالم)",
    roleEn: "Physician (Dr. Ahmed Salem)",
    route: "/",
    titleAr: "إقرار فوري ومعاينة سريرية واعتماد حزمة الإنتان",
    titleEn: "Physician Bedside Review & Sepsis Bundle Ordered",
    captionAr: "استجاب الطبيب للتنبيه خلال 4 دقائق؛ عاين المريضة واعتمد حزمة الإنتان الذهبية وأمر المضاد الحيوي سيفتررياكسون 2 جم.",
    captionEn: "Physician acknowledged within 4 min, reviewed patient, and ordered 1-Hour Sepsis Bundle & Ceftriaxone 2g.",
    whyAr: "الأهمية للجنة: إغلاق حلقة القرار الطبي (Closed-Loop) يضمن بدء العلاج خلال الساعة الذهبية الأولى.",
    whyEn: "Jury Takeaway: Closed-loop governance guarantees treatment within the golden hour.",
  },
  {
    step: 4,
    time: "02:45",
    roleAr: "تمريض سريري (سارة أحمد)",
    roleEn: "Ward Nurse (Sara Ahmed)",
    route: "/patient/P-1042",
    titleAr: "إعطاء المضاد الحيوي بالتحقق الثنائي بالباركود في eMAR",
    titleEn: "Antibiotic Administered with eMAR Barcode Scan",
    captionAr: "استلمت سارة الأوامر فورياً؛ قامت بمسح باركود إسوارة المريضة والدواء، وأعطت الحقنة الساعة 02:45 موثقة في السلسلة المشفرة.",
    captionEn: "Sara scanned patient wristband & medication barcode; antibiotic given at 02:45 and locked in hash chain.",
    whyAr: "الأهمية للجنة: توثيق دقيق لا يقبل التلاعب يثبت تنفيذ الأوامر بنسبة 100% ويمنع الأخطاء الدوائية.",
    whyEn: "Jury Takeaway: Barcode eMAR scan creates cryptographic proof that prevents insurance denials.",
  },
  {
    step: 5,
    time: "03:30",
    roleAr: "تمريض سريري (سارة أحمد)",
    roleEn: "Ward Nurse (Sara Ahmed)",
    route: "/patient/P-1042",
    titleAr: "إعادة قياس المؤشرات واستقرار الحالة (NEWS2 انخفض إلى 3)",
    titleEn: "Vitals Re-check: NEWS2 Decreased to 3",
    captionAr: "تمت إعادة فحص المؤشرات الحيوية بعد السوائل والمضاد؛ استقرت حرارة المريضة ونبضها وهبط NEWS2 إلى 3 درجات.",
    captionEn: "Re-check after IV fluids and antibiotics showed stabilization: NEWS2 dropped from 7 down to 3.",
    whyAr: "الأهمية للجنة: إثبات فعالية التدخل السريري وتجنب نقل المريضة للعناية المركزة وتوفير 8,500 ر.س/يوم.",
    whyEn: "Jury Takeaway: Demonstrates clinical recovery, avoiding expensive ICU admission (SAR 8,500/day saved).",
  },
  {
    step: 6,
    time: "07:00",
    roleAr: "تسليم الورديات (سارة أحمد ➔ رانيا يوسف)",
    roleEn: "Handoff (Sara Ahmed ➔ Rania Yousef)",
    route: "/handoff",
    titleAr: "تسليم I-PASS متكامل وقبول المراجعة ونقل المهام تلقائياً",
    titleEn: "I-PASS Handoff Sent, Reviewed, and Accepted",
    captionAr: "تم تسليم حالة نورة ضمن معيار I-PASS؛ قامت رانيا بقراءة التلخيص وتدوينه وقبول الاستلام، فانتقلت المهام المتبقية لورديتها تلقائياً.",
    captionEn: "Noura was handed off via I-PASS; Rania wrote synthesis read-back, accepted, and pending tasks transferred automatically.",
    whyAr: "الأهمية للجنة: 80% من الأخطاء الطبية تقع أثناء تسليم الشيفت؛ كيرشيفت تضمن نقلاً محكماً بنسبة صفر فجوات.",
    whyEn: "Jury Takeaway: Eliminates the #1 source of sentinel medical errors (handoff communication gaps).",
  },
  {
    step: 7,
    time: "14:00",
    roleAr: "الطبيب المعالج والتمريض",
    roleEn: "Care Team & Discharge",
    route: "/patient/P-1042",
    titleAr: "تعافي المريضة الكامل واعتماد قرار الخروج السريري",
    titleEn: "Full Clinical Recovery & Safe Discharge",
    captionAr: "بعد إكمال الخطة العلاجية والتأكد من سلبية مزارع الدم، تم اعتماد خروج المريضة نورة القحطاني بسلامة وتوثيق ملخص الخروج.",
    captionEn: "Following treatment and clinical stability, Noura is discharged safely with complete medical discharge summary.",
    whyAr: "الأهمية للجنة: تقليص أيام الإقامة الزائدة بفضل السيطرة المبكرة على العدوى.",
    whyEn: "Jury Takeaway: Shortened hospital length of stay safely through rapid infection resolution.",
  },
  {
    step: 8,
    time: "14:05",
    roleAr: "محرك تجميع المطالبات الآلي",
    roleEn: "Automated Claim Assembly",
    route: "/claims",
    titleAr: "توليد ورفع مطالبة نفيس NPHIES تلقائياً خلال 12 دقيقة",
    titleEn: "Claim Auto-Assembled & Submitted to NPHIES in 12m",
    captionAr: "قام النظام آلياً بتجميع بنود المطالبة (A41.9 إنتان، 96365 حقن وريدي، تحاليل، دواء) وإرفاق 14 دليلاً مشفراً ورفعها لنفيس فوراً.",
    captionEn: "System assembled claim items (ICD-10 A41.9, CPT 96365, labs, Rx), attached 14 hashed events, and submitted to NPHIES.",
    whyAr: "الأهمية للجنة: تقليص زمن إعداد ورفع المطالبة من 18 يوماً إلى 12 دقيقة فقط، وتحسين السيولة النقدية.",
    whyEn: "Jury Takeaway: Slashes revenue cycle latency from 18 days to 12 minutes with zero manual paperwork.",
  },
  {
    step: 9,
    time: "14:15",
    roleAr: "مراجع شركة التأمين (منى العتيبي)",
    roleEn: "Payer Reviewer (Mona Alotaibi)",
    route: "/payer",
    titleAr: "تدقيق السلسلة المشفرة وقبول المطالبة 100% (Zero Denial)",
    titleEn: "Cryptographic Chain Verified & 100% Approved",
    captionAr: "فتحت مراجعة التأمين الملف، وتحققت بنقرة واحدة من سلامة وتكامل الـ 14 حدثاً المشفرة، واعتمدت سداد 41,200 ر.س بالكامل.",
    captionEn: "Payer reviewer verified the 14 tamper-proof events and approved the full SAR 41,200 payout with zero deduction.",
    whyAr: "الأهمية للجنة: دليل قطعي غير قابل للطعن يمنع الرفض التأميني وينهي نزاعات المستشفيات وشركات التأمين.",
    whyEn: "Jury Takeaway: Uncontestable evidence package creates a trustless bridge between hospital and payer.",
  },
  {
    step: 10,
    time: "14:20",
    roleAr: "إدارة المستشفى والمالية",
    roleEn: "Hospital Administration & CFO",
    route: "/claims",
    titleAr: "تحديث مؤشرات الوفر المالي المحمي (41,200 ر.س وفر مباشر)",
    titleEn: "Savings Dashboard Updates with Net Value Protected",
    captionAr: "تم تحديث لوحة الوفر التراكمي بالمستشفى: حماية 41,200 ر.س من الرفض، تجنب 3 أيام تنويم زائدة، وتوفير 119 ألف ر.س عناية.",
    captionEn: "Hospital savings updated: SAR 41,200 denial avoided, avoided ICU days, total hospital value protected.",
    whyAr: "الأهمية للجنة: إثبات المعادلة الكبرى: رعاية مريض واحدة أكثر أماناً تعادل وفراً مالياً مستداماً وقابلاً للقياس.",
    whyEn: "Jury Takeaway: The Master Formula Proven: One patient event ➔ safer care ➔ verifiable claim ➔ measurable savings.",
  },
];

export function DemoTourDock() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const router = useRouter();
  const pathname = usePathname();

  const [active, setActive] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  // Check URL query param ?demo=true or localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("careshift_demo_active");
      if (stored === "true" || window.location.search.includes("demo=true")) {
        setActive(true);
      }
    }
  }, []);

  const cur = DEMO_STEPS[currentStepIdx] ?? DEMO_STEPS[0];

  const handleToggle = () => {
    const next = !active;
    setActive(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("careshift_demo_active", next ? "true" : "false");
    }
  };

  const handleNext = () => {
    if (currentStepIdx < DEMO_STEPS.length - 1) {
      const nextIdx = currentStepIdx + 1;
      setCurrentStepIdx(nextIdx);
      const targetRoute = DEMO_STEPS[nextIdx].route;
      if (pathname !== targetRoute) {
        router.push(targetRoute);
      }
    }
  };

  const handlePrev = () => {
    if (currentStepIdx > 0) {
      const prevIdx = currentStepIdx - 1;
      setCurrentStepIdx(prevIdx);
      const targetRoute = DEMO_STEPS[prevIdx].route;
      if (pathname !== targetRoute) {
        router.push(targetRoute);
      }
    }
  };

  const handleReset = () => {
    setCurrentStepIdx(0);
    router.push(DEMO_STEPS[0].route);
  };

  if (!active) {
    return (
      <div className="fixed bottom-4 end-4 z-50">
        <button
          onClick={handleToggle}
          className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#1b5fad] to-[#0b7a8d] px-4 py-2.5 text-xs font-black text-white shadow-2xl hover:scale-105 hover:opacity-95 transition-all border border-cyan-400/40 ring-4 ring-cyan-500/20 active:scale-95"
        >
          <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-300 animate-ping" />
          <span>{isAr ? "▶ تفعيل مسار العرض للجنة (Demo Mode)" : "▶ Launch Jury Walkthrough"}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-cyan-400 bg-gradient-to-b from-slate-950/95 to-slate-900/98 p-4 text-white shadow-2xl backdrop-blur-md">
      <div className="mx-auto max-w-7xl space-y-3">
        {/* Top bar inside dock: Step title, timing, controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2.5 text-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-cyan-500/20 px-3 py-1 font-mono text-xs font-black text-cyan-300 border border-cyan-400/30">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              {isAr ? `خطوة العرض ${cur.step} من 10` : `Step ${cur.step} of 10`}
            </span>
            <span className="font-mono text-cyan-200 font-bold bg-white/10 px-2 py-0.5 rounded">
              {cur.time}
            </span>
            <span className="font-bold text-slate-300">
              {isAr ? cur.roleAr : cur.roleEn}
            </span>
          </div>

          {/* Stepper buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-white/15 transition"
            >
              {isAr ? "إعادة ضبط" : "Reset"}
            </button>
            <button
              disabled={currentStepIdx === 0}
              onClick={handlePrev}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-1 font-bold text-white hover:bg-white/15 disabled:opacity-30 transition"
            >
              ‹ {isAr ? "السابق" : "Prev"}
            </button>
            <button
              onClick={handleNext}
              disabled={currentStepIdx >= DEMO_STEPS.length - 1}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-400 px-4 py-1.5 text-xs font-black text-slate-950 shadow hover:bg-cyan-300 disabled:opacity-40 transition"
            >
              <span>{isAr ? "الخطوة التالية" : "Next Step"}</span>
              <span>➔</span>
            </button>
            <button
              onClick={handleToggle}
              className="ms-2 rounded-lg p-1 text-slate-400 hover:bg-white/10 text-xs"
              title={isAr ? "إخفاء شريط العرض" : "Hide Dock"}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Middle: Step Title & Live Caption */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 items-center">
          <div className="md:col-span-2">
            <div className="text-sm font-black text-cyan-200">
              {cur.step}. {isAr ? cur.titleAr : cur.titleEn}
            </div>
            <p className="mt-1 text-xs text-slate-200 leading-relaxed">
              {isAr ? cur.captionAr : cur.captionEn}
            </p>
          </div>

          {/* Right box: The Jury Takeaway */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-2.5 text-xs">
            <div className="font-bold text-emerald-300">
              💡 {isAr ? "رسالة القيمة للجنة التحكيم:" : "Jury Value Takeaway:"}
            </div>
            <div className="mt-1 text-[11px] text-emerald-100">
              {isAr ? cur.whyAr : cur.whyEn}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
