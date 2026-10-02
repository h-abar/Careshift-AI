"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { StoryRibbon } from "@/components/story-ribbon";

export interface IPassPatient {
  id: string;
  nameAr: string;
  nameEn: string;
  room: string;
  severity: "stable" | "watcher" | "unstable";
  summaryAr: string;
  summaryEn: string;
  actions: { textAr: string; textEn: string; due: string; done: boolean }[];
  contingencyAr: string;
  contingencyEn: string;
  synthesisAr?: string;
  synthesisEn?: string;
}

const DEFAULT_PATIENTS: IPassPatient[] = [
  {
    id: "P-1042",
    nameAr: "نورة القحطاني",
    nameEn: "Noura Al-Qahtani",
    room: "ICU-04",
    severity: "watcher",
    summaryAr: "اشتباه إنتان بولي تم تشخيصه 02:11. تلقت حزمة الإنتان والمضاد الحيوي الوريدي، انخفض NEWS2 من 7 إلى 3.",
    summaryEn: "Suspected urosepsis identified at 02:11. Sepsis bundle + IV Ceftriaxone completed, NEWS2 improved from 7 to 3.",
    actions: [
      { textAr: "فحص اللاكتات الإعادي (Repeat Lactate)", textEn: "Repeat Serum Lactate", due: "08:00", done: false },
      { textAr: "قياس العلامات الحيوية كل ساعة", textEn: "Hourly vitals monitoring", due: "08:30", done: false },
      { textAr: "متابعة نتيجة مزرعة الدم والبول", textEn: "Track blood & urine cultures", due: "10:00", done: false },
    ],
    contingencyAr: "إذا ارتفع NEWS2 ≥ 5 أو هبط الضغط < 90/60، اتصل فوراً بد. أحمد سالم أو فريق الاستجابة السريعة.",
    contingencyEn: "If NEWS2 >= 5 or SBP < 90, call Dr. Ahmed Salem or RRT immediately.",
    synthesisAr: "",
  },
  {
    id: "P-1002",
    nameAr: "سعد الشهري",
    nameEn: "Saad Al-Shehri",
    room: "ICU-01",
    severity: "unstable",
    summaryAr: "فشل تنفسي حاد على جهاز التنفس الاصطناعي مع تسريب أكسجين متكرر. تحت التهدئة العصبية.",
    summaryEn: "Acute respiratory failure on mechanical ventilation. Sedated, frequent SpO2 desaturations.",
    actions: [
      { textAr: "فحص غازات الدم الشرياني (ABG)", textEn: "Morning ABG check", due: "07:30", done: false },
      { textAr: "معايرة جرعة النورأدرينالين الوريدي", textEn: "Titrate Noradrenaline infusion", due: "08:00", done: false },
    ],
    contingencyAr: "إذا انخفض SpO2 < 88% استدعِ أخصائي العلاج التنفسي والطبيب المناوب لإعادة تقييم PEEP.",
    contingencyEn: "If SpO2 < 88%, call RT and on-duty physician for PEEP adjustment.",
    synthesisAr: "",
  },
  {
    id: "P-1015",
    nameAr: "فاطمة الدوسري",
    nameEn: "Fatima Al-Dossary",
    room: "Surg-12",
    severity: "stable",
    summaryAr: "اليوم الثاني بعد استئصال المرارة بالمنظار. الجرح نظيف، بدأت التغذية الفموية، الألم متحكم به.",
    summaryEn: "Post-lap cholecystectomy day 2. Wound clean, diet tolerated, pain controlled.",
    actions: [
      { textAr: "تغيير ضماد الجرح الجراحي", textEn: "Change surgical wound dressing", due: "09:00", done: false },
      { textAr: "المساعدة في المشي في الممر", textEn: "Ambulation assistance", due: "10:30", done: false },
    ],
    contingencyAr: "إذا اشتكت من ألم حاد مفاجئ أو حمى > 38.3، أبلغ طبيب الجراحة المناوب.",
    contingencyEn: "If severe acute pain or fever > 38.3, notify on-call surgeon.",
    synthesisAr: "",
  },
  {
    id: "P-1028",
    nameAr: "محمد العتيبي",
    nameEn: "Mohammed Al-Otaibi",
    room: "Med-08",
    severity: "watcher",
    summaryAr: "قصور قلب احتقاني خفيف ومتابعة مدرات البول وميزان السوائل الصارم.",
    summaryEn: "Mild CHF exacerbation, receiving IV furosemide, strict fluid balance.",
    actions: [
      { textAr: "وزن المريض الصباحي اليومي", textEn: "Daily morning weight", due: "07:15", done: false },
      { textAr: "توثيق ميزان السوائل للوردية", textEn: "Record strict fluid balance", due: "08:00", done: false },
    ],
    contingencyAr: "إذا قل الإدرار عن 30 مل/ساعة لمدة ساعتين أبلغ الطبيب لتعديل جرعة اللازكس.",
    contingencyEn: "If urine output < 30ml/hr for 2 hrs, alert MD for Lasix adjustment.",
    synthesisAr: "",
  },
];

export function HandoffFlow() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { user } = useAuth();
  const toast = useToast();

  // Step 1: PREPARE, Step 2: RECEIVE, Step 3: DONE
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [handoffStatus, setHandoffStatus] = useState<"draft" | "sent" | "accepted" | "rejected">("draft");
  const [patients, setPatients] = useState<IPassPatient[]>(DEFAULT_PATIENTS);
  const [sentMinutesAgo, setSentMinutesAgo] = useState(14);
  const [activePatientId, setActivePatientId] = useState("P-1042");

  // Review checklist for step 2
  const [checkSeverity, setCheckSeverity] = useState(false);
  const [checkActions, setCheckActions] = useState(false);
  const [checkContingency, setCheckContingency] = useState(false);
  const [synthesisText, setSynthesisText] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [showReturnModal, setShowReturnModal] = useState(false);

  const activePatient = patients.find((p) => p.id === activePatientId) ?? patients[0];

  const handleSend = () => {
    setHandoffStatus("sent");
    setCurrentStep(2);
    setSentMinutesAgo(1);
    toast(
      isAr
        ? "✅ تم إرسال ملف التسليم السريري إلى المستلم (الممرضة رانيا يوسف)"
        : "✅ Handoff sent to receiver (Nurse Rania Yousef)",
      "success",
    );
  };

  const handleAccept = () => {
    if (!checkSeverity || !checkActions || !checkContingency) {
      toast(
        isAr
          ? "يرجى تأكيد مراجعة جميع بنود القائمة الثلاثة قبل القبول"
          : "Please check all 3 verification items before accepting",
        "error",
      );
      return;
    }
    if (!synthesisText.trim()) {
      toast(
        isAr
          ? "يجب كتابة ملخص المستلم (Synthesis) بسطر واحد على الأقل لضمان سلامة النقل"
          : "Please write receiver synthesis read-back (at least 1 line)",
        "error",
      );
      return;
    }
    setHandoffStatus("accepted");
    setCurrentStep(3);
    toast(
      isAr
        ? "🎉 تم قبول التسليم بنجاح ونقل كافة المهام السريرية إلى ورديتك"
        : "🎉 Handoff accepted! All clinical tasks transferred to your shift",
      "success",
    );
  };

  const handleReturn = () => {
    if (!returnReason.trim()) {
      toast(
        isAr ? "يرجى توضيح سبب الإعادة للمُسلّم" : "Please state return reason",
        "error",
      );
      return;
    }
    setHandoffStatus("rejected");
    setShowReturnModal(false);
    toast(
      isAr
        ? `⚠️ تمت إعادة التسليم للمُسلّم: ${returnReason}`
        : `⚠️ Handoff returned: ${returnReason}`,
      "info",
    );
  };

  return (
    <div className="space-y-6">
      {/* Story Ribbon */}
      <StoryRibbon activeStep="handoff" patientId="P-1042" patientName="نورة القحطاني" />

      {/* Page Title & Status Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#13304d]">
            {isAr ? "التسليم السريري الذكي (I-PASS)" : "Smart Clinical Handoff (I-PASS)"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {isAr
              ? "نقل آمن ومتكامل لمسؤولية رعاية المرضى بين الورديات مع ربط المهام بسجل الأحداث المشفر"
              : "Closed-loop shift transition with auto-populated events, I-PASS synthesis, and automated task handover"}
          </p>
        </div>

        {/* Status chip + Timer */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
            <span className="text-xs text-slate-500">
              {isAr ? "حالة التسليم:" : "Handoff Status:"}
            </span>
            {handoffStatus === "draft" && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                {isAr ? "مسودة (Draft)" : "Draft"}
              </span>
            )}
            {handoffStatus === "sent" && (
              <span className="flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">
                <span className="h-2 w-2 animate-ping rounded-full bg-sky-500" />
                {isAr ? `مُرسل (منذ ${sentMinutesAgo} د)` : `Sent (${sentMinutesAgo}m ago)`}
              </span>
            )}
            {handoffStatus === "accepted" && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                ✓ {isAr ? "مقبول وموثّق (Accepted)" : "Accepted & Signed"}
              </span>
            )}
            {handoffStatus === "rejected" && (
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-800">
                {isAr ? "معاد مع استفسار (Returned)" : "Returned"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── BIG 3-STEP FLOW STEPPER ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Step 1: PREPARE */}
          <button
            onClick={() => setCurrentStep(1)}
            className={`flex items-center gap-3 rounded-xl border p-3.5 text-start transition-all ${
              currentStep === 1
                ? "border-[#0b7a8d] bg-[#0b7a8d]/5 ring-2 ring-[#0b7a8d]/30"
                : "border-slate-200 bg-slate-50/50 hover:bg-slate-100"
            }`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold ${
                currentStep === 1
                  ? "bg-[#0b7a8d] text-white"
                  : handoffStatus !== "draft"
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {handoffStatus !== "draft" ? "✓" : "1"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {isAr ? "الخطوة الأولى" : "Step 1"}
              </div>
              <div className="text-sm font-bold text-[#13304d]">
                {isAr ? "تحضير التسليم (المُسلِّم)" : "PREPARE (Outgoing Nurse)"}
              </div>
              <div className="truncate text-xs text-slate-500">
                {isAr ? "سارة أحمد · I-PASS تلقائي" : "Sara Ahmed · Auto-filled"}
              </div>
            </div>
          </button>

          {/* Step 2: RECEIVE */}
          <button
            onClick={() => setCurrentStep(2)}
            className={`flex items-center gap-3 rounded-xl border p-3.5 text-start transition-all ${
              currentStep === 2
                ? "border-[#0b7a8d] bg-[#0b7a8d]/5 ring-2 ring-[#0b7a8d]/30"
                : "border-slate-200 bg-slate-50/50 hover:bg-slate-100"
            }`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold ${
                currentStep === 2
                  ? "bg-[#0b7a8d] text-white"
                  : handoffStatus === "accepted"
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {handoffStatus === "accepted" ? "✓" : "2"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {isAr ? "الخطوة الثانية" : "Step 2"}
              </div>
              <div className="text-sm font-bold text-[#13304d]">
                {isAr ? "استلام ومراجعة (المستلم)" : "RECEIVE (Incoming Nurse)"}
              </div>
              <div className="truncate text-xs text-slate-500">
                {isAr ? "رانيا يوسف · فحص وتلخيص" : "Rania Yousef · Side-by-side"}
              </div>
            </div>
          </button>

          {/* Step 3: DONE */}
          <button
            onClick={() => setCurrentStep(3)}
            className={`flex items-center gap-3 rounded-xl border p-3.5 text-start transition-all ${
              currentStep === 3
                ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/30"
                : "border-slate-200 bg-slate-50/50 hover:bg-slate-100"
            }`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold ${
                currentStep === 3 || handoffStatus === "accepted"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              3
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {isAr ? "الخطوة الثالثة" : "Step 3"}
              </div>
              <div className="text-sm font-bold text-[#13304d]">
                {isAr ? "مكتمل ومعتمد (DONE)" : "DONE (Transferred & Signed)"}
              </div>
              <div className="truncate text-xs text-slate-500">
                {isAr ? "نقل المهام المتبقية تلقائياً" : "All tasks moved to receiver"}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          STEP 1: PREPARE (Outgoing nurse: I-PASS cards, editable, send button)
          ═════════════════════════════════════════════════════════════════════ */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-blue-900 to-[#13304d] p-4 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xl">
                📋
              </span>
              <div>
                <h2 className="text-base font-bold">
                  {isAr ? "ملف تسليم الوردية — جناح العناية المركزة" : "Shift Handoff Sheet — ICU Ward"}
                </h2>
                <p className="text-xs text-slate-300">
                  {isAr
                    ? "المُسلِّم: سارة أحمد (الشيفت الليلي) ➔ المستلم المجدول: رانيا يوسف (الشيفت الصباحي)"
                    : "Outgoing: Sara Ahmed (Night Shift) ➔ Incoming: Rania Yousef (Morning Shift)"}
                </p>
              </div>
            </div>
            <button
              onClick={handleSend}
              className="flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-black text-slate-900 shadow-lg hover:bg-cyan-300 transition-transform active:scale-95"
            >
              <span>🚀</span>
              <span>
                {isAr ? "إرسال التسليم إلى رانيا يوسف" : "Send Handoff to Rania Yousef"}
              </span>
            </button>
          </div>

          {/* Patient Selector Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
            {patients.map((p) => {
              const isSelected = p.id === activePatientId;
              const sevBadge =
                p.severity === "unstable"
                  ? "bg-red-100 text-red-700 border-red-200"
                  : p.severity === "watcher"
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : "bg-emerald-100 text-emerald-700 border-emerald-200";

              return (
                <button
                  key={p.id}
                  onClick={() => setActivePatientId(p.id)}
                  className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
                    isSelected
                      ? "border-[#0b7a8d] bg-white text-[#13304d] shadow-md ring-2 ring-[#0b7a8d]/20"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                  }`}
                >
                  <span className="font-mono text-[#0b7a8d]">{p.id}</span>
                  <span>{isAr ? p.nameAr : p.nameEn}</span>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${sevBadge}`}>
                    {p.severity === "unstable"
                      ? isAr ? "غير مستقر" : "Unstable"
                      : p.severity === "watcher"
                      ? isAr ? "للمراقبة" : "Watcher"
                      : isAr ? "مستقر" : "Stable"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Patient I-PASS Card with 5 Colored Sections */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-black text-[#13304d]">
                    {isAr ? activePatient.nameAr : activePatient.nameEn}
                  </h3>
                  <span className="font-mono text-sm font-bold text-[#0b7a8d]">
                    {activePatient.id}
                  </span>
                  <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {activePatient.room}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {isAr
                    ? "تعبئة تلقائية من سجل المريض السريري — يمكنك التعديل والإضافة يدوياً"
                    : "Auto-populated from clinical events — editable by outgoing nurse"}
                </p>
              </div>

              {/* Severity Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">
                  {isAr ? "تصنيف الخطورة (I):" : "Illness Severity (I):"}
                </span>
                {(["stable", "watcher", "unstable"] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => {
                      setPatients((prev) =>
                        prev.map((p) =>
                          p.id === activePatient.id ? { ...p, severity: sev } : p,
                        ),
                      );
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                      activePatient.severity === sev
                        ? sev === "unstable"
                          ? "border-red-500 bg-red-50 text-red-700 ring-2 ring-red-300"
                          : sev === "watcher"
                          ? "border-amber-500 bg-amber-50 text-amber-700 ring-2 ring-amber-300"
                          : "border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-300"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {sev === "unstable"
                      ? isAr ? "غير مستقر (Unstable)" : "Unstable"
                      : sev === "watcher"
                      ? isAr ? "تحت المراقبة (Watcher)" : "Watcher"
                      : isAr ? "مستقر (Stable)" : "Stable"}
                  </button>
                ))}
              </div>
            </div>

            {/* The 5 I-PASS Sections */}
            <div className="mt-6 grid gap-4">
              {/* I = Illness Severity summary */}
              <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-red-800">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white text-[10px]">I</span>
                  <span>{isAr ? "درجة الخطورة والحالة السريرية (Illness Severity)" : "Illness Severity"}</span>
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-800">
                  {activePatient.severity === "unstable" && (
                    <span className="text-red-700">
                      🚨 {isAr ? "حالة حرجة غير مستقرة — تتطلب متابعة مستمرة وتواجد سريري وثيق" : "Critical unstable condition — requires close monitoring"}
                    </span>
                  )}
                  {activePatient.severity === "watcher" && (
                    <span className="text-amber-800">
                      ⚠️ {isAr ? "حالة تحت المراقبة الدقيقة — قابل للتدهور السريع وملاحظة أي تغير حيوي" : "Watcher condition — watch for early deterioration signs"}
                    </span>
                  )}
                  {activePatient.severity === "stable" && (
                    <span className="text-emerald-800">
                      ✅ {isAr ? "حالة مستقرة — رعاية تمريضية اعتيادية ومتابعة خطة الخروج" : "Stable condition — routine nursing care"}
                    </span>
                  )}
                </div>
              </div>

              {/* P = Patient Summary */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-blue-800">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px]">P</span>
                  <span>{isAr ? "ملخص حالة المريض (Patient Summary)" : "Patient Summary"}</span>
                </div>
                <textarea
                  value={isAr ? activePatient.summaryAr : activePatient.summaryEn}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPatients((prev) =>
                      prev.map((p) =>
                        p.id === activePatient.id
                          ? isAr ? { ...p, summaryAr: val } : { ...p, summaryEn: val }
                          : p,
                      ),
                    );
                  }}
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-blue-200 bg-white p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              {/* A = Action List */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
                <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase text-teal-800">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white text-[10px]">A</span>
                    <span>{isAr ? "قائمة المهام والإجراءات المعلقة (Action List)" : "Action List"}</span>
                  </div>
                  <span className="text-[11px] font-normal text-slate-500">
                    {isAr ? "ستُنقل تلقائياً لقائمة مهام المستلم" : "Will transfer to receiver's shift tasks"}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {activePatient.actions.map((act, ai) => (
                    <div
                      key={ai}
                      className="flex items-center justify-between rounded-lg border border-teal-200/80 bg-white px-3 py-2 text-sm"
                    >
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={act.done}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setPatients((prev) =>
                              prev.map((p) =>
                                p.id === activePatient.id
                                  ? {
                                      ...p,
                                      actions: p.actions.map((a, i) =>
                                        i === ai ? { ...a, done: checked } : a,
                                      ),
                                    }
                                  : p,
                              ),
                            );
                          }}
                          className="h-4 w-4 accent-teal-600 rounded"
                        />
                        <span className={act.done ? "line-through text-slate-400" : "text-slate-800 font-medium"}>
                          {isAr ? act.textAr : act.textEn}
                        </span>
                      </label>
                      <span className="font-mono text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                        {act.due}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* S = Situation Awareness and Contingency */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-amber-800">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-white text-[10px]">S</span>
                  <span>{isAr ? "الوعي بالموقف وخطة الطوارئ (Situation Awareness & Contingency)" : "Situation Awareness & Contingency"}</span>
                </div>
                <textarea
                  value={isAr ? activePatient.contingencyAr : activePatient.contingencyEn}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPatients((prev) =>
                      prev.map((p) =>
                        p.id === activePatient.id
                          ? isAr ? { ...p, contingencyAr: val } : { ...p, contingencyEn: val }
                          : p,
                      ),
                    );
                  }}
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-amber-200 bg-white p-2.5 text-sm text-slate-800 outline-none focus:border-amber-500"
                />
              </div>

              {/* S = Synthesis (placeholder for incoming nurse) */}
              <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-purple-800">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-white text-[10px]">S</span>
                  <span>{isAr ? "إعادة التلخيص والفهم (Synthesis by Receiver)" : "Synthesis by Receiver"}</span>
                </div>
                <p className="mt-2 text-xs text-purple-900 bg-purple-100/60 p-2.5 rounded-lg border border-purple-200">
                  {isAr
                    ? "🔒 قسم مخصص للممرضة المستلمة (رانيا يوسف) لكتابة تلخيص الفهم وإعادة القراءة عند الاستلام في الخطوة 2."
                    : "🔒 Reserved for the incoming nurse (Rania Yousef) to provide read-back synthesis in Step 2."}
                </p>
              </div>
            </div>

            {/* Bottom Action inside card */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSend}
                className="flex items-center gap-2 rounded-xl bg-[#0b7a8d] px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-[#075e6e]"
              >
                <span>{isAr ? "إرسال التسليم للمستلم" : "Send Handoff"}</span>
                <span>➔</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          STEP 2: RECEIVE (Incoming nurse: Banner, Side-by-side, checklist, synthesis, accept/return)
          ═════════════════════════════════════════════════════════════════════ */}
      {currentStep === 2 && (
        <div className="space-y-6">
          {/* Waiting Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-sky-400 bg-sky-50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-white text-xl">
                📥
              </span>
              <div>
                <h2 className="text-base font-black text-sky-900">
                  {isAr
                    ? "تسليم وارد بانتظار المراجعة من سارة أحمد — 4 مرضى"
                    : "Handoff from Sara waiting — 4 patients"}
                </h2>
                <p className="text-xs text-sky-700">
                  {isAr
                    ? `مُرسل منذ ${sentMinutesAgo} دقيقة · يرجى مراجعة بيانات I-PASS وتدوين سطر التلخيص والقبول`
                    : `Sent ${sentMinutesAgo} mins ago · Please review I-PASS, write synthesis, and confirm transfer`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowReturnModal(true)}
                className="rounded-xl border border-orange-300 bg-white px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-50"
              >
                {isAr ? "إعادة مع استفسار" : "Return with question"}
              </button>
              <button
                onClick={handleAccept}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-black text-white shadow-md hover:bg-emerald-700"
              >
                {isAr ? "قبول واعتماد نقل المهام" : "Accept Handoff"}
              </button>
            </div>
          </div>

          {/* Side-by-Side Review Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Primary Left Column: I-PASS Content */}
            <div className="space-y-4 lg:col-span-2">
              {/* Patient switch buttons */}
              <div className="flex flex-wrap gap-2">
                {patients.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActivePatientId(p.id)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${
                      p.id === activePatientId
                        ? "border-[#0b7a8d] bg-[#0b7a8d] text-white shadow"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {isAr ? p.nameAr : p.nameEn} ({p.id})
                  </button>
                ))}
              </div>

              {/* Patient I-PASS Display Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-lg font-black text-[#13304d]">
                      {isAr ? activePatient.nameAr : activePatient.nameEn}
                    </h3>
                    <div className="text-xs text-slate-500 font-mono">
                      {activePatient.id} · {activePatient.room}
                    </div>
                  </div>
                  <span
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                      activePatient.severity === "unstable"
                        ? "bg-red-100 text-red-700"
                        : activePatient.severity === "watcher"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {activePatient.severity === "unstable"
                      ? isAr ? "غير مستقر (Unstable)" : "Unstable"
                      : activePatient.severity === "watcher"
                      ? isAr ? "للمراقبة (Watcher)" : "Watcher"
                      : isAr ? "مستقر (Stable)" : "Stable"}
                  </span>
                </div>

                {/* Summary */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                  <div className="text-xs font-bold text-blue-900">
                    P - {isAr ? "ملخص الحالة السريرية:" : "Patient Summary:"}
                  </div>
                  <p className="mt-1 text-sm text-slate-800">
                    {isAr ? activePatient.summaryAr : activePatient.summaryEn}
                  </p>
                </div>

                {/* Action Items */}
                <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3">
                  <div className="text-xs font-bold text-teal-900">
                    A - {isAr ? "المهام المعلقة لنقلها لورديتك:" : "Pending Actions to Transfer:"}
                  </div>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {activePatient.actions.map((act, i) => (
                      <li key={i} className="flex items-center justify-between bg-white rounded-lg p-2 border border-teal-100">
                        <span className="text-slate-800 font-medium">
                          • {isAr ? act.textAr : act.textEn}
                        </span>
                        <span className="font-mono text-xs font-bold text-amber-700">
                          {act.due}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Contingency */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                  <div className="text-xs font-bold text-amber-900">
                    S - {isAr ? "خطة الطوارئ والتصعيد:" : "Situation Awareness & Contingency:"}
                  </div>
                  <p className="mt-1 text-sm text-slate-800">
                    {isAr ? activePatient.contingencyAr : activePatient.contingencyEn}
                  </p>
                </div>
              </div>
            </div>

            {/* Side Column: Checklist & Synthesis Entry */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-black uppercase text-[#13304d]">
                  {isAr ? "إقرار مراجعة المستلم الإلزامي" : "Mandatory Receiver Verification"}
                </h3>

                {/* 3-Point Checklist */}
                <div className="space-y-2.5">
                  <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checkSeverity}
                      onChange={(e) => setCheckSeverity(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded accent-[#0b7a8d]"
                    />
                    <div className="text-xs font-semibold text-slate-800">
                      {isAr
                        ? "أقر بمراجعة تصنيف خطورة الحالات (Illness Severity)"
                        : "I reviewed illness severity classifications"}
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checkActions}
                      onChange={(e) => setCheckActions(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded accent-[#0b7a8d]"
                    />
                    <div className="text-xs font-semibold text-slate-800">
                      {isAr
                        ? "أقر بمراجعة قائمة المهام ونقلها إلى خطة ورديتي (Action List)"
                        : "I reviewed pending actions and agreed to transfer"}
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checkContingency}
                      onChange={(e) => setCheckContingency(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded accent-[#0b7a8d]"
                    />
                    <div className="text-xs font-semibold text-slate-800">
                      {isAr
                        ? "أقر بفهم خطة الطوارئ والتصعيد الطبي (Contingency)"
                        : "I understand contingency plans & escalation triggers"}
                    </div>
                  </label>
                </div>

                {/* Mandatory Synthesis Read-back */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="text-xs font-bold text-[#13304d]">
                    {isAr
                      ? "ملخص المستلم بأسلوبك (Synthesis Read-back) *"
                      : "Receiver Synthesis (Read-back) *"}
                  </label>
                  <p className="text-[11px] text-slate-500">
                    {isAr
                      ? "اكتب سطرًا يؤكد فهمك للحالات الحرجة مثل المريضة نورة القحطاني P-1042."
                      : "Write at least one line confirming comprehension of critical cases."}
                  </p>
                  <textarea
                    value={synthesisText}
                    onChange={(e) => setSynthesisText(e.target.value)}
                    placeholder={
                      isAr
                        ? "مثال: استلمت نورة القحطاني، مستقرة بعد حزمة الإنتان والمضاد، سأعيد اللاكتات 08:00 ومراقبة NEWS2..."
                        : "e.g., Received Noura P-1042, stable post-sepsis bundle, will repeat lactate at 08:00..."
                    }
                    rows={4}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 outline-none focus:border-[#0b7a8d]"
                  />
                </div>

                {/* Final Decision Buttons */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={handleAccept}
                    className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white shadow-md hover:bg-emerald-700 transition"
                  >
                    ✓ {isAr ? "قبول التسليم واعتماد نقل المهام" : "Accept Handoff"}
                  </button>
                  <button
                    onClick={() => setShowReturnModal(true)}
                    className="w-full rounded-xl border border-orange-300 bg-orange-50 py-2.5 text-xs font-bold text-orange-800 hover:bg-orange-100 transition"
                  >
                    ↩ {isAr ? "إعادة مع استفسار (Return with question)" : "Return with question"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          STEP 3: DONE (Completed, Accepted, Tasks Transferred Confirmation)
          ═════════════════════════════════════════════════════════════════════ */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/60 p-6 text-center shadow-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white shadow-lg">
              ✓
            </div>
            <h2 className="mt-3 text-2xl font-black text-emerald-950">
              {isAr ? "تم اعتماد التسليم السريري بنجاح" : "Handoff Successfully Accepted"}
            </h2>
            <p className="mt-1 text-sm text-emerald-800">
              {isAr
                ? "تم توثيق التسليم المشفر في سجل الأحداث، ونقل كافة المهام السريرية تلقائياً لوردية المستلم."
                : "Signed into immutable event audit log. All pending tasks transferred to incoming shift."}
            </p>

            {/* Transferred tasks counter badge */}
            <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 font-mono text-sm font-bold text-white shadow">
              <span>📋</span>
              <span>
                {isAr ? "تم نقل 3 مهام سريرية لورديتك مباشرة" : "3 clinical tasks transferred to you"}
              </span>
            </div>

            {/* Names & Times Sign-off block */}
            <div className="mx-auto mt-6 max-w-xl rounded-xl border border-emerald-200 bg-white p-4 text-start">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-bold text-slate-500 uppercase">{isAr ? "المُسلِّم:" : "Outgoing:"}</span>
                  <div className="text-sm font-bold text-[#13304d]">سارة أحمد (Sara Ahmed)</div>
                  <div className="text-slate-500">{isAr ? "الشيفت الليلي · أُرسل 07:00" : "Night Shift · Sent 07:00"}</div>
                </div>
                <div>
                  <span className="font-bold text-slate-500 uppercase">{isAr ? "المستلم:" : "Incoming:"}</span>
                  <div className="text-sm font-bold text-[#13304d]">رانيا يوسف (Rania Yousef)</div>
                  <div className="text-slate-500">{isAr ? "الشيفت الصباحي · قُبل 07:14" : "Morning Shift · Accepted 07:14"}</div>
                </div>
              </div>
              <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] font-mono text-slate-500 flex justify-between">
                <span>Hash: sha256-7f8a9b2c...1042</span>
                <span className="text-emerald-700 font-bold">{isAr ? "سلسلة الثقة متصلة ومطابقة" : "Chain Intact"}</span>
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/"
                className="rounded-xl bg-[#0b7a8d] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#075e6e]"
              >
                {isAr ? "العودة للوحة التمريض" : "Back to Nurse Cockpit"}
              </Link>
              <button
                onClick={() => {
                  setCurrentStep(1);
                  setHandoffStatus("draft");
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {isAr ? "إعادة تجربة التدفق" : "Reset Flow"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CHARGE NURSE BOARD PER WARD ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-black text-[#13304d]">
              {isAr ? "لوحة إشراف التمريض على تسليم الأجنحة" : "Charge Nurse Ward Handoff Board"}
            </h3>
            <p className="text-xs text-slate-500">
              {isAr
                ? "متابعة لحظية لنسب إنجاز التسليم حسب الأجنحة لمنع أي فجوات سريرية"
                : "Real-time compliance tracking across all wards to prevent handover gaps"}
            </p>
          </div>
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-mono font-bold text-slate-700">
            07:15 AM
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* ICU */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="text-xs font-bold text-emerald-900">
              {isAr ? "العناية المركزة (ICU)" : "ICU Ward"}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-black text-emerald-800">4 / 4</span>
              <span className="text-[10px] text-emerald-700 font-bold">{isAr ? "مكتمل" : "Accepted"}</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              {isAr ? "المُسلِّم: سارة ➔ المستلم: رانيا" : "Sara ➔ Rania"}
            </div>
          </div>

          {/* ER */}
          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3">
            <div className="text-xs font-bold text-sky-900">
              {isAr ? "طوارئ (ER)" : "Emergency (ER)"}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-black text-sky-800">3 / 4</span>
              <span className="text-[10px] text-sky-700 font-bold">{isAr ? "بانتظار القبول" : "Pending"}</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              {isAr ? "مُرسل منذ 8 دقائق" : "Sent 8 mins ago"}
            </div>
          </div>

          {/* Surgical */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="text-xs font-bold text-emerald-900">
              {isAr ? "جناح الجراحة (Surgical)" : "Surgical Ward"}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-black text-emerald-800">6 / 6</span>
              <span className="text-[10px] text-emerald-700 font-bold">{isAr ? "مكتمل" : "Accepted"}</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              {isAr ? "تم التوقيع 06:58" : "Signed 06:58"}
            </div>
          </div>

          {/* Medical */}
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
            <div className="text-xs font-bold text-red-900">
              {isAr ? "جناح الباطنية (Medical)" : "Medical Ward"}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-black text-red-700">1 / 5</span>
              <span className="text-[10px] text-red-700 font-bold">{isAr ? "متأخر 15 دقيقة" : "Overdue 15m"}</span>
            </div>
            <div className="mt-2 text-[10px] text-red-700 font-semibold">
              ⚠️ {isAr ? "تنبيه إشرافي مرسل للمشرف" : "Supervisor notified"}
            </div>
          </div>
        </div>
      </div>

      {/* Return with Question Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[#13304d]">
              {isAr ? "إعادة التسليم السريري مع استفسار" : "Return Handoff with Question"}
            </h3>
            <p className="text-xs text-slate-600">
              {isAr
                ? "يجب تحديد سبب عدم القبول (مثل: نقص فحص مخبري، مهمة غير واضحة، أو اختلاف في تصنيف الخطورة) لضمان سلامة المريض."
                : "Specify why handoff cannot be accepted (e.g. missing lab, ambiguous order, or severity discrepancy)."}
            </p>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder={isAr ? "اكتب سبب الإعادة هنا..." : "State question or reason here..."}
              rows={3}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 outline-none focus:border-orange-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReturnModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </button>
              <button
                onClick={handleReturn}
                className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700"
              >
                {isAr ? "تأكيد الإعادة للمُسلّم" : "Confirm Return"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
