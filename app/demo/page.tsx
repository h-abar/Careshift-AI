"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { getPatient } from "@/lib/data/patients";
import { assessClinicalRisk } from "@/lib/engines/clinical-risk";
import { assessInsuranceRisk } from "@/lib/engines/insurance-risk";
import { SectionTitle } from "@/components/ui";

const STEP_MS = 6000;
const TOTAL_STEPS = 6;

function useAnimatedNumber(target: number, duration = 800) {
  const [v, setV] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

export default function DemoPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  const p = getPatient("P-1042")!;
  const risk = assessClinicalRisk(p);
  const _ins = assessInsuranceRisk(p, risk);

  useEffect(() => {
    if (!playing || step >= TOTAL_STEPS) return;
    const id = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [step, playing]);

  const riskNow = useAnimatedNumber(
    step === 0 ? 88 : step === 1 ? 84 : step === 2 ? 65 : step === 3 ? 38 : step >= 4 ? 16 : 88,
  );
  const readinessNow = useAnimatedNumber(
    step <= 1 ? 34 : step === 2 ? 62 : step === 3 ? 84 : 100,
  );

  const timelineSteps = [
    {
      time: "02:10",
      roleAr: "الممرضة سارة",
      roleEn: "Nurse Sara",
      titleAr: "رصد العلامات الحيوية وحساب NEWS2 تلقائياً",
      titleEn: "Vitals Recorded & NEWS2 Calculated Automatically",
      badge: "NEWS2 = 7 (Emergency)",
      badgeColor: "bg-red-600 text-white",
      descAr:
        "قامت سارة بقياس العلامات الحيوية (نبض 118، ضغط 90/60، حرارة 38.8°C، تنفس 25). محرك الإنذار المبكر حسب NEWS2 فورياً = 7 وأطلق إنذاراً أحمر مع فتح تكليف طارئ للطبيب.",
      descEn:
        "Sara recorded patient vitals (HR 118, BP 90/60, Temp 38.8C, RR 25). Early warning engine calculated NEWS2 = 7 immediately, triggering red alert and urgent physician task.",
      actorIcon: "🩺",
    },
    {
      time: "02:14",
      roleAr: "الدكتور خالد العتيبي",
      roleEn: "Dr. Khalid (Physician)",
      titleAr: "استلام التكليف، التقييم السريري، وبدء حزمة الإنتان",
      titleEn: "Doctor Task Acknowledged & Sepsis 1-Hour Bundle Ordered",
      badge: "E6 Action Task Complete",
      badgeColor: "bg-teal-600 text-white",
      descAr:
        "استلم د. خالد التكليف السريري وأقر به الساعة 02:14. قام بالتقييم السريري بجانب السرير الساعة 02:18، واعتمد قرار بدء حزمة الإنتان الذهبية (Ceftriaxone 2g IV، زراعة دم، سوائل وريدية، قياس اللاكتيك).",
      descEn:
        "Dr. Khalid acknowledged task at 02:14, completed bedside review at 02:18, and ordered Sepsis 1-Hour Bundle (Ceftriaxone 2g IV, blood cultures, IV fluids, serial lactate).",
      actorIcon: "👨‍⚕️",
    },
    {
      time: "02:30",
      roleAr: "الممرضة سارة",
      roleEn: "Nurse Sara",
      titleAr: "تنفيذ بضغطة واحدة وتوثيق إعطاء الدواء بالباركود في MAR",
      titleEn: "1-Tap Quick Complete & Barcode MAR Administration",
      badge: "Verified MAR Administration",
      badgeColor: "bg-indigo-600 text-white",
      descAr:
        "استلمت سارة الأوامر في كونسول التمريض؛ وثّقت سحب التحاليل وبدء السوائل بضغطة واحدة، وأعطت المضاد الحيوي الساعة 02:45 مع التحقق بالباركود. تم تشفير الحدث في سلسلة الكتل.",
      descEn:
        "Sara received orders in the nurse cockpit; documented labs and fluids via 1-tap quick complete, and administered Ceftriaxone at 02:45 verified via barcode scan into the immutable hash chain.",
      actorIcon: "💊",
    },
    {
      time: "07:00",
      roleAr: "سارة ← وردية الصباح",
      roleEn: "Sara → Day Shift",
      titleAr: "تسليم الوردية المنظم بمعيار I-PASS المعتمد",
      titleEn: "Structured I-PASS Shift Handoff",
      badge: "Starmer et al. (NEJM 2014)",
      badgeColor: "bg-sky-600 text-white",
      descAr:
        "تم تسليم المريضة للوردية الصباحية بالأركان الخمسة: خطورة المرض (Unstable)، ملخص الحالة، قائمة الإجراءات المطلوبة، الوعي بالمواقف وخطة الطوارئ، وتوليف المستلم. لا مجال لفقدان المعلومات.",
      descEn:
        "Handoff conducted using Starmer 5 elements: Illness severity (Unstable), Patient summary, Action list, Situation awareness & contingencies, and Synthesis by receiver.",
      actorIcon: "🤝",
    },
    {
      time: "07:15",
      roleAr: "النظام الآلي Careshift",
      roleEn: "Careshift Automated Pipeline",
      titleAr: "تجميع المطالبة آلياً من الأحداث الحقيقية ورفعها لنفيس",
      titleEn: "Claim Auto-Assembled & Submitted to NPHIES",
      badge: "100% Event-Backed Lines",
      badgeColor: "bg-emerald-600 text-white",
      descAr:
        "قام محرك التجميع الآلي بتحويل الأحداث المشفرة إلى سطور مطالبة مدعومة بأدلة بنسبة 100%. اكتملت الجاهزية بدون تدخل يدوي وأُرسلت المطالبة فورياً لمنصة نفيس NPHIES.",
      descEn:
        "Automated assembly converted real clinical events into 100% event-backed claim lines. Claim readiness hit 100% without human friction and auto-submitted to NPHIES.",
      actorIcon: "⚡",
    },
    {
      time: "07:30",
      roleAr: "المؤمن الخارجي",
      roleEn: "External Payer",
      titleAr: "اعتماد فوري وقبول المطالبة مع صفر استبعاد فني",
      titleEn: "Zero-Friction Clean Payer Adjudication & Approval",
      badge: "First-Pass Approved",
      badgeColor: "bg-teal-700 text-white",
      descAr:
        "راجع مدقق التأمين في بوابة المؤمّن حزمة الأدلة الرقمية الكاملة: التشخيص متطابق، التوقيت دقيق، التوثيق لا يمكن التلاعب به. تمت الموافقة الفورية وحماية المستشفى من أي استقطاع.",
      descEn:
        "External payer reviewed tamper-proof evidence pack in /payer portal. Full clinical congruence confirmed; claim approved on first pass with zero denial friction.",
      actorIcon: "✅",
    },
  ];

  const currentTimeline = timelineSteps[Math.min(step, timelineSteps.length - 1)];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ══ Header & Interactive Controls ══ */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-800">
              {isAr ? "الديمو التفاعلي الشامل (E12)" : "Interactive Hero Demo (E12)"}
            </span>
            <span className="rounded-lg bg-amber-100 px-2 py-0.5 font-mono text-xs font-bold text-amber-800">
              Case P-1042 · Noura / Sara
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {isAr ? "دورة الرعاية السريرية والمالية المغلقة كاملة" : "Complete Closed-Loop Clinical & Financial Demo"}
          </h1>
          <p className="text-xs text-slate-500">
            {isAr
              ? "استعراض عملي خطوة بخطوة من رصد التدهور الحاد حتى السداد التأميني عبر نفيس"
              : "Step-by-step operational journey from bedside deterioration to clean NPHIES settlement"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 active:scale-95"
          >
            <span>{playing ? "⏸" : "▶"}</span>
            <span>{playing ? (isAr ? "إيقاف مؤقت" : "Pause") : (isAr ? "تشغيل تلقائي" : "Auto Play")}</span>
          </button>
          <button
            onClick={() => {
              setStep(0);
              setPlaying(true);
            }}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            ↺ {isAr ? "إعادة البدء" : "Restart"}
          </button>
          <Link
            href="/handoff"
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-teal-800 hover:bg-slate-100"
          >
            {isAr ? "الخروج إلى النظام" : "Exit"}
          </Link>
        </div>
      </div>

      {/* ══ Interactive Timeline Navigation Stepper ══ */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {timelineSteps.map((st, i) => {
          const isActive = step === i;
          const isDone = step > i;
          return (
            <button
              key={i}
              onClick={() => {
                setStep(i);
                setPlaying(false);
              }}
              className={`rounded-2xl border p-3 text-start transition-all ${
                isActive
                  ? "border-teal-500 bg-teal-50/80 shadow-md ring-2 ring-teal-500/20"
                  : isDone
                    ? "border-slate-200 bg-white opacity-80 hover:opacity-100"
                    : "border-slate-200 bg-slate-50 opacity-40 hover:opacity-75"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-teal-800">{st.time}</span>
                <span className="text-sm">{st.actorIcon}</span>
              </div>
              <div className="mt-1 text-[11px] font-bold text-slate-900 truncate">
                {isAr ? st.roleAr : st.roleEn}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500 truncate">
                {isAr ? st.titleAr : st.titleEn}
              </div>
            </button>
          );
        })}
      </div>

      {/* ══ Live Dynamic Telemetry & Risk Indicators ══ */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
          <div className="text-xs font-bold text-slate-500">{isAr ? "مستوى الخطر السريري" : "Clinical Risk Score"}</div>
          <div
            className={`mt-1 font-mono text-4xl font-black ${
              riskNow >= 60 ? "text-red-600" : riskNow >= 30 ? "text-amber-600" : "text-emerald-600"
            }`}
          >
            {riskNow}%
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            {step >= 3 ? (isAr ? "انخفض بعد التدخل الدوائي" : "Reduced Post-Intervention") : (isAr ? "تدهور نشط" : "Active Deterioration")}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
          <div className="text-xs font-bold text-slate-500">{isAr ? "اكتمال أدلة المطالبة" : "Evidence Completeness"}</div>
          <div className="mt-1 font-mono text-4xl font-black text-teal-600">
            {readinessNow}%
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            {readinessNow === 100 ? (isAr ? "مطالبة كاملة 100% بدون نقص" : "100% Audit-Proof") : (isAr ? "قيد التجميع التدريجي" : "Accumulating Events")}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
          <div className="text-xs font-bold text-slate-500">{isAr ? "الأثر المالي المتوقع" : "Financial Value"}</div>
          <div className="mt-1 font-mono text-3xl font-black text-emerald-700">
            {step >= 4 ? "+58,800" : "0"} <span className="text-sm font-normal">SAR</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            {isAr ? "تقديري: تجنب 4.2 يوم عناية مركزة" : "Est: 4.2 ICU Days Avoided"}
          </div>
        </div>
      </div>

      {/* ══ Current Stage Live Action Mock Screen ══ */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-md space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-2xl">
              {currentTimeline.actorIcon}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-teal-800">{currentTimeline.time}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${currentTimeline.badgeColor}`}>
                  {currentTimeline.badge}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                {isAr ? currentTimeline.titleAr : currentTimeline.titleEn}
              </h2>
            </div>
          </div>
          <span className="font-bold text-xs text-slate-500">
            {isAr ? `المسؤول: ${currentTimeline.roleAr}` : `Actor: ${currentTimeline.roleEn}`}
          </span>
        </div>

        <p className="text-sm leading-relaxed text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-200">
          {isAr ? currentTimeline.descAr : currentTimeline.descEn}
        </p>

        {/* Dynamic Mock Stage Simulator */}
        {step === 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-red-900">
              <span>🩺 نافذة الرصد التمريضي السريع (Quick Vitals Modal)</span>
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-white">NEWS2 = 7 (Emergency)</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 font-mono">
              <div className="bg-white p-2 rounded-xl border border-red-100">تنفس RR: 25 /min (3 pts)</div>
              <div className="bg-white p-2 rounded-xl border border-red-100">أكسجين SpO2: 93% on O2 (2 pts)</div>
              <div className="bg-white p-2 rounded-xl border border-red-100">ضغط SBP: 90 mmHg (1 pt)</div>
              <div className="bg-white p-2 rounded-xl border border-red-100">حرارة Temp: 38.8 °C (1 pt)</div>
            </div>
            <div className="text-[11px] text-red-800 font-semibold">
              ⚡ تم إرسال تنبيه فوري للطبيب المعالج وفتح تكليف عمل سريري (Doctor Task) تلقائياً!
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-teal-900">
              <span>🩺 بطاقة التكليف الطبي E6 (Physician Bedside Task)</span>
              <span className="rounded-full bg-teal-600 px-2 py-0.5 text-white">تم الإقرار والتقييم ✓</span>
            </div>
            <div className="space-y-1.5 text-xs text-teal-950">
              <div>✓ 02:14 الإقرار بالتكليف (Acknowledge) خلال أقل من 4 دقائق.</div>
              <div>✓ 02:18 التقييم بجانب السرير (Bedside Evaluation).</div>
              <div className="font-bold text-teal-800">
                ✓ 02:19 اعتماد القرار السريري: بدء حزمة الإنتان الذهبية (Sepsis 1-Hour Bundle).
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
              <span>💊 كونسول التمريض وسجل إعطاء الدواء eMAR</span>
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-white">تحقق بالباركود ✓</span>
            </div>
            <div className="divide-y divide-indigo-100 text-xs">
              <div className="flex justify-between py-1.5">
                <span>سحب زراعة الدم واللاكتيك</span>
                <span className="font-bold text-emerald-700">✓ تم التوثيق بضغطة واحدة (02:30)</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span>تسريب 1000 مل محلول ملحي</span>
                <span className="font-bold text-emerald-700">✓ جاري التسريب (02:32)</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span>إعطاء سفترياكسون 2 جم وريدي (Ceftriaxone)</span>
                <span className="font-bold text-emerald-700">✓ أُعطي بالباركود (02:45)</span>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-sky-900">
              <span>🤝 تسليم وردية الصباح بمعيار I-PASS القياسي (07:00)</span>
              <span className="rounded-full bg-sky-600 px-2 py-0.5 text-white">مقبول وموقع رقمياً ✓</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 text-xs">
              <div className="bg-white p-2 rounded-xl border border-sky-100">
                <b className="text-rose-700">I (Severity):</b> غير مستقرة (Unstable) لكن مستجيبة.
              </div>
              <div className="bg-white p-2 rounded-xl border border-sky-100">
                <b className="text-sky-800">P (Summary):</b> استجابة ممتازة لحزمة الإنتان والمضاد.
              </div>
              <div className="bg-white p-2 rounded-xl border border-sky-100">
                <b className="text-sky-800">A (Actions):</b> تكرار فحص حمض اللاكتيك الساعة 08:00.
              </div>
              <div className="bg-white p-2 rounded-xl border border-sky-100">
                <b className="text-sky-800">S (Awareness):</b> مراقبة ضغط MAP فوق 65.
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
              <span>⚡ محرك التجميع الآلي للمطالبات (Automatic Claims Pipeline)</span>
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-white">Auto-Submitted NPHIES ✓</span>
            </div>
            <p className="text-xs text-emerald-950">
              تجمعت كافة سطور المطالبة من الأحداث المشفرة الحقيقية: أدوية، خدمات تمريضية، مراقبة حيوية، وفحوص مخبرية.
              تم التحقق المشفر بنسبة 100% وإرسالها آلياً دون تدخل بشري.
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-teal-900">
              <span>✅ بوابة المؤمّن الخارجي (Payer Adjudication Portal)</span>
              <span className="rounded-full bg-teal-700 px-2 py-0.5 text-white">Clean Claim Approved (100%)</span>
            </div>
            <p className="text-xs text-teal-950">
              تم فحص حزمة الأدلة الرقمية بالكامل ومطابقة التشخيص ICD-10 A41.9 مع النتائج المخبرية. اعتمدت شركة التأمين المطالبة فورياً دون أي استبعاد مالي أو استفسارات متأخرة.
            </p>
          </div>
        )}

        {/* Navigation Next/Prev buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <button
            disabled={step === 0}
            onClick={() => {
              setStep((s) => Math.max(0, s - 1));
              setPlaying(false);
            }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            ← {isAr ? "الخطوة السابقة" : "Previous Step"}
          </button>
          <span className="text-xs font-bold text-slate-500">
            {step + 1} / {TOTAL_STEPS}
          </span>
          <button
            disabled={step === TOTAL_STEPS - 1}
            onClick={() => {
              setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
              setPlaying(false);
            }}
            className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-40"
          >
            {isAr ? "الخطوة التالية" : "Next Step"} →
          </button>
        </div>
      </div>

      {/* ══ Value Chain Summary ══ */}
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-6 shadow-sm">
        <SectionTitle>{isAr ? "سلسلة القيمة المضافة المتحققة في الحالة" : "Achieved Value Chain in Case P-1042"}</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-1">
            <div className="font-bold text-slate-900">🛡️ السلامة السريرية</div>
            <p className="text-slate-600 leading-relaxed">
              اكتشاف مبكر للصدمة الإنتانية في الجناح العام وبدء العلاج في أقل من 35 دقيقة منع دخول العناية المركزة.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-1">
            <div className="font-bold text-slate-900">⚡ الكفاءة التشغيلية</div>
            <p className="text-slate-600 leading-relaxed">
              تسليم I-PASS سلس دون تسريب مهام، وتوثيق تمريضي بضغطة واحدة وفّر أكثر من 40 دقيقة من الأعمال الورقية.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-1">
            <div className="font-bold text-slate-900">💰 حماية الإيرادات</div>
            <p className="text-slate-600 leading-relaxed">
              مطالبة مدعومة بأدلة مشفرة بنسبة 100% تم قبولها من المرة الأولى عبر نفيس دون أي اقتطاع أو رفض.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
