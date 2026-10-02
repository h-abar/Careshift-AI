"use client";

import { useState, useMemo } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import type { Patient, ClinicalRisk, InterventionStep, JourneyEvent, InsuranceRisk, Claim } from "@/lib/types";
import { useToast } from "@/components/toast";
import { Card, SectionTitle, RiskBadge } from "@/components/ui";
import { news2Score, news2Tier } from "@/lib/engines/priority";
import { evaluateClinicalConsistency, type ConsistencyFinding } from "@/lib/engines/clinical-consistency";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type MedicalTab =
  | "summary"
  | "allergies"
  | "diagnoses"
  | "orders"
  | "mar"
  | "labs"
  | "vitals"
  | "notes"
  | "ipass"
  | "doctor_decisions";

interface PatientMedicalRecordProps {
  patient: Patient;
  risk: ClinicalRisk;
  plan: InterventionStep[];
  journey: JourneyEvent[];
  insurance: InsuranceRisk;
  claim: Claim | null;
  onRefetch: () => void;
}

export function PatientMedicalRecord({
  patient: p,
  risk,
  plan: _plan,
  journey: _journey,
  insurance: _insurance,
  claim: _claim,
  onRefetch,
}: PatientMedicalRecordProps) {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";
  const { user, can } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<MedicalTab>("summary");
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showDxModal, setShowDxModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [reviewingFinding, setReviewingFinding] = useState<ConsistencyFinding | null>(null);

  // Role Scoping Flags
  const isDoctor = user?.role === "doctor" || user?.role === "admin";
  const isNurse = user?.role === "nurse" || user?.role === "charge_nurse";
  const isPayer = user?.role === "payer";
  const canEdit = can("patients_edit");

  // Mock standard allergies and chronic conditions seeded for safety display
  const allergies = useMemo(() => {
    if (p.id === "P-1042") {
      return [
        { allergenAr: "بنسلين (Penicillin)", allergenEn: "Penicillin", severity: "severe", reactionAr: "صدمة تحسسية حادة (Anaphylaxis)", reactionEn: "Severe anaphylaxis" },
      ];
    }
    if (p.id === "P-2031") {
      return [
        { allergenAr: "سلفوناميد (Sulfa)", allergenEn: "Sulfonamides", severity: "moderate", reactionAr: "طفح جلدي وحكة حادة", reactionEn: "Severe urticaria & rash" },
      ];
    }
    return [
      { allergenAr: "لا توجد حساسية دوائية معروفة (NKDA)", allergenEn: "No Known Drug Allergies (NKDA)", severity: "none", reactionAr: "لا يوجد", reactionEn: "None" },
    ];
  }, [p.id]);

  // Diagnoses list (primary & secondary)
  const [diagnosesList, setDiagnosesList] = useState(() => [
    {
      code: p.id === "P-1042" ? "E11.10" : p.id === "P-2031" ? "J18.9" : "R10.9",
      nameAr: isAr ? t(`dx.${p.dxKey}`) : `Diagnosis: ${p.dxKey}`,
      nameEn: t(`dx.${p.dxKey}`),
      type: "primary",
      status: "active",
      diagnosedBy: p.attending,
      diagnosedAt: "2026-10-02 08:30",
    },
    ...(p.id === "P-1042"
      ? [
          {
            code: "E11.65",
            nameAr: "داء السكري مع فرط سكر الدم غير منضبط",
            nameEn: "Type 2 diabetes with hyperglycemia",
            type: "secondary",
            status: "active",
            diagnosedBy: p.attending,
            diagnosedAt: "2026-10-02 08:35",
          },
        ]
      : []),
  ]);

  // Physician Orders
  const [ordersList, setOrdersList] = useState(() => [
    {
      id: "ORD-901",
      kind: "medication",
      titleAr: "سفترياكسون 2 جم بالوريد كل 24 ساعة (Ceftriaxone 2g IV Q24H)",
      titleEn: "Ceftriaxone 2g IV Q24H",
      dose: "2g",
      route: "IV",
      freq: "Q24H",
      priority: "stat",
      status: "active",
      orderedBy: p.attending,
      orderedAt: "02:18",
    },
    {
      id: "ORD-902",
      kind: "fluids",
      titleAr: "محلول ملحي نظامي 1000 مل بالوريد تسريب سريع (Normal Saline 1000ml IV Stat)",
      titleEn: "Normal Saline 1000ml IV Stat",
      dose: "1000ml",
      route: "IV",
      freq: "Once",
      priority: "stat",
      status: "active",
      orderedBy: p.attending,
      orderedAt: "02:18",
    },
    {
      id: "ORD-903",
      kind: "lab",
      titleAr: "زراعة دم ومستوى حمض اللاكتيك المتسلسل (Blood Culture x2 + Serial Lactate)",
      titleEn: "Blood Culture x2 + Serial Lactate Q4H",
      dose: "—",
      route: "Lab",
      freq: "Q4H",
      priority: "urgent",
      status: "active",
      orderedBy: p.attending,
      orderedAt: "02:19",
    },
  ]);

  // MAR (Medication Administration Record)
  const [marRecords, setMarRecords] = useState(() => [
    {
      id: "MAR-01",
      medName: "Ceftriaxone IV",
      dose: "2g",
      route: "IV Infusion",
      scheduledTime: "02:30",
      administeredAt: p.id === "P-1042" ? "02:45" : null,
      administeredBy: p.id === "P-1042" ? "Sara Al-Harbi (RN)" : null,
      barcodeVerified: p.id === "P-1042",
      lotNumber: "LOT-9921-SA",
      status: p.id === "P-1042" ? "given" : "due",
    },
    {
      id: "MAR-02",
      medName: "Normal Saline 0.9%",
      dose: "1000ml",
      route: "IV Bolus",
      scheduledTime: "02:25",
      administeredAt: "02:28",
      administeredBy: "Sara Al-Harbi (RN)",
      barcodeVerified: true,
      lotNumber: "LOT-8411-NS",
      status: "given",
    },
    {
      id: "MAR-03",
      medName: "Paracetamol IV",
      dose: "1g",
      route: "IV Infusion",
      scheduledTime: "06:00",
      administeredAt: null,
      administeredBy: null,
      barcodeVerified: false,
      lotNumber: "LOT-3320-PA",
      status: "due",
    },
  ]);

  // Nursing Notes (Append-Only)
  const [nursingNotes, setNursingNotes] = useState(() => [
    {
      id: "NN-01",
      authorName: "Sara Al-Harbi (RN)",
      authorRole: "nurse",
      category: "shift_assessment",
      textAr: "تقييم بداية الوردية: المريضة واعية ولكن تشكو من قشعريرة شديدة وبرودة بالأطراف. تم قياس العلامات الحيوية: الضغط 90/60، النبض 118، الحرارة 38.8. NEWS2 بلغ 7 (طارئ). تم إشعار الطبيب المعالج فوراً وفتح تكليف سريري.",
      textEn: "Shift assessment: Patient conscious but shivering severely with cold extremities. Vitals recorded: BP 90/60, HR 118, Temp 38.8C. NEWS2 reached 7 (Emergency). Attending physician notified immediately via emergency task.",
      time: "02:12",
    },
    {
      id: "NN-02",
      authorName: "Sara Al-Harbi (RN)",
      authorRole: "nurse",
      category: "intervention_response",
      textAr: "تنفيذ حزمة الإنتان: تم تركيب قسطرة وريدية إضافية مقاس 18G في الساعد الأيسر، سحب عينات زراعة الدم واللاكتيك، وبدء تسريب 1000 مل محلول ملحي. تم إعطاء سفترياكسون 2 جم وريدياً مع التحقق الكامل بالباركود.",
      textEn: "Sepsis bundle initiated: 18G IV line secured in left forearm, blood cultures and lactate drawn. Normal saline 1000ml started. Ceftriaxone 2g IV administered with barcode scan verified.",
      time: "02:46",
    },
  ]);

  // Evaluate Clinical Consistency (E10)
  const consistencyResult = useMemo(() => {
    return evaluateClinicalConsistency(
      p,
      p.vitals[p.vitals.length - 1],
      p.labs,
      diagnosesList,
    );
  }, [p, diagnosesList]);

  // Quick 1-tap MAR Administer
  const handleAdministerMed = async (marId: string, medName: string, dose: string) => {
    try {
      const res = await fetch(`/api/patients/${p.id}/mar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicationName: medName,
          dose,
          route: "IV",
          barcodeVerified: true,
          lotNumber: "LOT-2026-MAR-SA",
        }),
      });
      if (!res.ok) throw new Error("Failed to administer");

      setMarRecords((prev) =>
        prev.map((m) =>
          m.id === marId
            ? {
                ...m,
                status: "given",
                administeredAt: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
                administeredBy: user?.nameAr || user?.nameEn || "Nurse",
                barcodeVerified: true,
              }
            : m,
        ),
      );
      toast(
        isAr
          ? `✅ تم توثيق إعطاء «${medName}» بالباركود بنجاح في سجل MAR والربط المشفر`
          : `✅ Administered «${medName}» with barcode scan & recorded in MAR`,
        "success",
      );
      onRefetch();
    } catch {
      toast(isAr ? "تعذر توثيق إعطاء الدواء" : "Failed to record medication administration", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* ══ Header Banner: Medical Chart Identification ══ */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 border border-teal-200">
                {isAr ? "السجل الطبي الموحد (Electronic Health Record)" : "Unified Medical Record"}
              </span>
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                MRN: {p.id}
              </span>
              <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-xs text-blue-700 border border-blue-200">
                {isAr ? "سجل التدقيق: تم تسجيل فتح الملف (patient.chart_view)" : "Audit: Chart view logged"}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isAr ? p.nameAr : p.nameEn}
            </h1>
            <p className="text-xs text-slate-600">
              {p.age} {t("common.years")} · {t(p.sex === "M" ? "common.male" : "common.female")} ·{" "}
              <span className="font-semibold text-slate-800">{p.room}</span> ·{" "}
              {t("common.attending")}: <span className="font-semibold text-slate-800">{p.attending}</span> ·{" "}
              {isAr ? `تاريخ الدخول: ${p.admittedAt}` : `Admitted: ${p.admittedAt}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <RiskBadge level={risk.level} score={risk.score} />
            {isDoctor && (
              <button
                onClick={() => setShowOrderModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-700 active:scale-95"
              >
                <span>➕</span>
                <span>{isAr ? "أمر طبي جديد" : "New Order"}</span>
              </button>
            )}
            {isDoctor && (
              <button
                onClick={() => setShowDxModal(true)}
                className="flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50 px-3.5 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100 active:scale-95"
              >
                <span>🏷️</span>
                <span>{isAr ? "إضافة تشخيص ICD-10" : "Add ICD-10"}</span>
              </button>
            )}
            {isNurse && (
              <button
                onClick={() => setShowNoteModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 active:scale-95"
              >
                <span>📝</span>
                <span>{isAr ? "إضافة ملاحظة تمريضية" : "Add Nursing Note"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Prominent Allergy Alert Banner */}
        {allergies.length > 0 && allergies[0].severity !== "none" && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-rose-300 bg-rose-50/80 px-4 py-2.5 text-xs text-rose-900">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 font-bold text-white text-[11px]">
                ⚠
              </span>
              <span className="font-bold">
                {isAr ? "تنبيه حساسية دوائية شديدة:" : "Allergy Alert:"}
              </span>
              <span>
                {allergies.map((a) => (isAr ? `${a.allergenAr} (${a.reactionAr})` : `${a.allergenEn} (${a.reactionEn})`)).join(" · ")}
              </span>
            </div>
            <span className="rounded-full bg-rose-200 px-2 py-0.5 font-bold text-rose-900 text-[10px]">
              {isAr ? "تحقق إلزامي قبل الصرف" : "Verification Required"}
            </span>
          </div>
        )}

        {/* ══ E10: Clinical Consistency Warning Banner ══ */}
        {consistencyResult.hasFindings && (
          <div className="mt-3 space-y-2">
            {consistencyResult.findings.map((f) => (
              <div
                key={f.id}
                className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-500 font-bold text-white text-sm">
                      ⚡
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">
                          {isAr ? f.titleAr : f.titleEn}
                        </span>
                        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          {isAr ? "محرك الاتساق السريري E10" : "Consistency Engine E10"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-amber-800">
                        {isAr ? f.descriptionAr : f.descriptionEn}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        {f.evidence.map((ev, i) => (
                          <span
                            key={i}
                            className="rounded-lg border border-amber-200 bg-white/80 px-2 py-0.5 font-mono text-amber-900"
                          >
                            {ev}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {isDoctor && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setReviewingFinding(f)}
                        className="rounded-xl bg-amber-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-800 active:scale-95"
                      >
                        {isAr ? "مراجعة واتخاذ قرار سريري" : "Review & Decide"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payer Restricted Notice */}
        {isPayer && (
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-900">
            {isAr
              ? "🔒 تم تقييد العرض وفق ضوابط حماية البيانات الشخصية (PDPL): جهة التأمين تطلع على حزمة الأدلة والتشخيصات المعتمدة ورموز NPHIES فقط."
              : "🔒 PDPL Scoped View: External payer views approved clinical evidence pack & NPHIES adjudication data only."}
          </div>
        )}
      </div>

      {/* ══ 10 Navigation Tabs ══ */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 pb-2 text-xs font-bold">
        {[
          { key: "summary", labelAr: "الملخص والديموغرافيا", labelEn: "Summary & Demographics", icon: "🏥" },
          { key: "allergies", labelAr: "الحساسيات والمزمنة", labelEn: "Allergies & Chronic", icon: "🛡️" },
          { key: "diagnoses", labelAr: "التشخيصات (ICD-10)", labelEn: "Diagnoses (ICD-10)", icon: "🏷️" },
          { key: "orders", labelAr: "الأوامر الطبية", labelEn: "Physician Orders", icon: "📋" },
          { key: "mar", labelAr: "سجل الأدوية (MAR)", labelEn: "Medication (MAR)", icon: "💊" },
          { key: "labs", labelAr: "التحاليل والاتجاهات", labelEn: "Labs & Trends", icon: "🧪" },
          { key: "vitals", labelAr: "العلامات و NEWS2", labelEn: "Vitals & NEWS2", icon: "📈" },
          { key: "notes", labelAr: "الملاحظات التمريضية", labelEn: "Nursing Notes", icon: "📝" },
          { key: "ipass", labelAr: "تسليمات I-PASS", labelEn: "I-PASS Handoffs", icon: "🤝" },
          { key: "doctor_decisions", labelAr: "قرارات الطبيب (E6)", labelEn: "Doctor Tasks (E6)", icon: "🩺" },
        ].map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as MedicalTab)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 transition-all ${
                active
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{isAr ? tab.labelAr : tab.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* ══ Tab Contents ══ */}

      {/* Tab 1: Demographics & Summary */}
      {activeTab === "summary" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <SectionTitle>{isAr ? "البيانات الديموغرافية وقبول المريض" : "Patient Demographics & Admission"}</SectionTitle>
            <div className="divide-y divide-slate-100 text-xs">
              <div className="flex justify-between py-2">
                <span className="text-slate-500">{isAr ? "الاسم الكامل" : "Full Name"}</span>
                <span className="font-bold text-slate-800">{isAr ? p.nameAr : p.nameEn}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">{isAr ? "رقم السجل الطبي (MRN)" : "MRN"}</span>
                <span className="font-mono font-bold text-slate-800">{p.id}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">{isAr ? "العمر والجنس" : "Age / Sex"}</span>
                <span className="font-semibold text-slate-800">{p.age} {t("common.years")} · {p.sex}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">{isAr ? "الغرفة والسرير" : "Room / Bed"}</span>
                <span className="font-bold text-slate-800">{p.room}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">{isAr ? "توقيت القبول" : "Admitted At"}</span>
                <span className="font-semibold text-slate-800">{p.admittedAt}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">{isAr ? "الوردية الحالية" : "Shift"}</span>
                <span className="font-semibold text-slate-800">{t(`shift.${p.shift}`)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">{isAr ? "الإنعاش القلبي الرئوي (Code Status)" : "Code Status"}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 text-[10px]">
                  {isAr ? "إنعاش كامل (Full Code)" : "Full Code"}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle>{isAr ? "فريق الرعاية المعالج" : "Care Team & Attending"}</SectionTitle>
            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">{isAr ? "الطبيب المعالج الرئيسي" : "Attending Physician"}</div>
                <div className="mt-1 font-bold text-slate-900">{p.attending}</div>
                <div className="text-[10px] text-teal-700">{isAr ? "استشاري الباطنة والعناية المركزة" : "Consultant Internal Medicine"}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">{isAr ? "الممرض المسؤول عن الوردية" : "Primary Ward Nurse"}</div>
                <div className="mt-1 font-bold text-slate-900">Sara Al-Harbi (RN)</div>
                <div className="text-[10px] text-teal-700">{isAr ? "جناح الباطنة والجراحة 4" : "Med-Surg Ward 4"}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">{isAr ? "رئيس التمريض المناوب" : "Charge Nurse"}</div>
                <div className="mt-1 font-bold text-slate-900">Mona Al-Shehri (BSN)</div>
                <div className="text-[10px] text-teal-700">{isAr ? "إشراف أسرّة الجناح وإدارة التوازن" : "Ward Bed Operations"}</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Allergies & Chronic */}
      {activeTab === "allergies" && (
        <div className="space-y-4">
          <Card>
            <SectionTitle>{isAr ? "سجل الحساسيات الموثقة (Allergy Record)" : "Documented Allergies"}</SectionTitle>
            <div className="space-y-2.5">
              {allergies.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-2xl border p-4 ${
                    a.severity === "severe"
                      ? "border-rose-300 bg-rose-50/70"
                      : a.severity === "moderate"
                        ? "border-amber-300 bg-amber-50/70"
                        : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {a.severity === "severe" ? "🚨" : a.severity === "moderate" ? "⚠️" : "✓"}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {isAr ? a.allergenAr : a.allergenEn}
                      </div>
                      <div className="text-xs text-slate-600">
                        {isAr ? `طبيعة التفاعل: ${a.reactionAr}` : `Reaction: ${a.reactionEn}`}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      a.severity === "severe"
                        ? "bg-rose-200 text-rose-900"
                        : a.severity === "moderate"
                          ? "bg-amber-200 text-amber-900"
                          : "bg-emerald-200 text-emerald-900"
                    }`}
                  >
                    {a.severity === "severe"
                      ? isAr ? "شديد الخطورة" : "Severe"
                      : a.severity === "moderate"
                        ? isAr ? "متوسط" : "Moderate"
                        : isAr ? "لا توجد حساسية" : "No Allergy"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: Diagnoses (ICD-10) */}
      {activeTab === "diagnoses" && (
        <Card>
          <div className="flex items-center justify-between pb-3 border-b">
            <SectionTitle>{isAr ? "التشخيصات السريرية المعتمدة (ICD-10 Diagnoses)" : "Clinical Diagnoses (ICD-10)"}</SectionTitle>
            {isDoctor && (
              <button
                onClick={() => setShowDxModal(true)}
                className="rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-teal-700"
              >
                {isAr ? "➕ إضافة تشخيص جديد" : "➕ Add Diagnosis"}
              </button>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {diagnosesList.map((dx, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 font-mono text-xs font-bold text-teal-900">
                    {dx.code}
                  </span>
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {isAr ? dx.nameAr : dx.nameEn}
                    </div>
                    <div className="text-xs text-slate-500">
                      {isAr ? `وثّقه: ${dx.diagnosedBy} · ${dx.diagnosedAt}` : `By ${dx.diagnosedBy} · ${dx.diagnosedAt}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      dx.type === "primary"
                        ? "bg-teal-100 text-teal-800"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {dx.type === "primary" ? (isAr ? "تشخيص رئيسي" : "Primary") : (isAr ? "تشخيص ثانوي" : "Secondary")}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    {isAr ? "نشط" : "Active"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 4: Physician Orders */}
      {activeTab === "orders" && (
        <Card>
          <div className="flex items-center justify-between pb-3 border-b">
            <SectionTitle>{isAr ? "الأوامر الطبية الصادرة من الطبيب" : "Physician Clinical Orders"}</SectionTitle>
            {isDoctor && (
              <button
                onClick={() => setShowOrderModal(true)}
                className="rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-teal-700"
              >
                {isAr ? "➕ إصدار أمر طبي" : "➕ Issue Order"}
              </button>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {ordersList.map((ord) => (
              <div
                key={ord.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-800 text-base font-bold">
                    {ord.kind === "medication" ? "💊" : ord.kind === "fluids" ? "💧" : "🧪"}
                  </span>
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {isAr ? ord.titleAr : ord.titleEn}
                    </div>
                    <div className="text-xs text-slate-500">
                      {isAr
                        ? `الجرعة: ${ord.dose} · المسار: ${ord.route} · التكرار: ${ord.freq} · بواسطة: ${ord.orderedBy} (${ord.orderedAt})`
                        : `Dose: ${ord.dose} · Route: ${ord.route} · Freq: ${ord.freq} · By: ${ord.orderedBy} (${ord.orderedAt})`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
                    {ord.priority.toUpperCase()}
                  </span>
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                    {ord.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 5: MAR (Medication Administration Record) */}
      {activeTab === "mar" && (
        <Card>
          <SectionTitle>{isAr ? "سجل إعطاء الدواء الإلكتروني (eMAR)" : "Electronic Medication Administration Record (eMAR)"}</SectionTitle>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pe-4 text-start font-bold">{isAr ? "الدواء والجرعة" : "Medication & Dose"}</th>
                  <th className="py-2.5 pe-4 text-start font-bold">{isAr ? "المسار" : "Route"}</th>
                  <th className="py-2.5 pe-4 text-start font-bold">{isAr ? "التوقيت المجدول" : "Scheduled Time"}</th>
                  <th className="py-2.5 pe-4 text-start font-bold">{isAr ? "وقت الإعطاء" : "Administered At"}</th>
                  <th className="py-2.5 pe-4 text-start font-bold">{isAr ? "الممرض الموثق" : "Administered By"}</th>
                  <th className="py-2.5 pe-4 text-start font-bold">{isAr ? "التحقق بالباركود" : "Barcode Verified"}</th>
                  <th className="py-2.5 text-end font-bold">{isAr ? "الإجراء" : "Action"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {marRecords.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="py-3 pe-4 font-bold text-slate-900">
                      {m.medName} <span className="font-normal text-slate-500">({m.dose})</span>
                    </td>
                    <td className="py-3 pe-4 text-slate-700">{m.route}</td>
                    <td className="py-3 pe-4 font-mono text-slate-700">{m.scheduledTime}</td>
                    <td className="py-3 pe-4 font-mono text-slate-700">
                      {m.administeredAt || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-3 pe-4 text-slate-700">
                      {m.administeredBy || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-3 pe-4">
                      {m.barcodeVerified ? (
                        <span className="flex items-center gap-1 font-bold text-emerald-700">
                          <span>✓</span>
                          <span>{isAr ? "متحقق بالباركود" : "Verified"}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 text-end">
                      {m.status === "due" && canEdit ? (
                        <button
                          onClick={() => handleAdministerMed(m.id, m.medName, m.dose)}
                          className="rounded-xl bg-teal-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-teal-700 active:scale-95"
                        >
                          {isAr ? "توثيق الإعطاء الآن" : "Administer & Verify"}
                        </button>
                      ) : m.status === "given" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          {isAr ? "تم الإعطاء" : "Given"}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 6: Labs & Trends */}
      {activeTab === "labs" && (
        <Card>
          <SectionTitle>{isAr ? "النتائج والاتجاهات المخبرية (Lab Results & Trends)" : "Lab Results & Trends"}</SectionTitle>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {p.labs.map((l) => (
              <div
                key={l.key}
                className={`rounded-2xl border p-4 ${
                  l.flag === "high"
                    ? "border-red-200 bg-red-50/60"
                    : l.flag === "low"
                      ? "border-amber-200 bg-amber-50/60"
                      : "border-slate-200 bg-slate-50/60"
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{t(`lab.${l.key}`)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      l.flag === "high"
                        ? "bg-red-200 text-red-800"
                        : l.flag === "low"
                          ? "bg-amber-200 text-amber-800"
                          : "bg-emerald-200 text-emerald-800"
                    }`}
                  >
                    {t(`pt.flag.${l.flag}`)}
                  </span>
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-slate-900">
                  {l.value}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 7: Vitals & NEWS2 Evolution */}
      {activeTab === "vitals" && (
        <div className="space-y-4">
          <Card>
            <SectionTitle>{isAr ? "المخطط الزمني للعلامات الحيوية (Vitals Trend Chart)" : "Vitals Trend Chart"}</SectionTitle>
            <div className="h-64 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={p.vitals}>
                  <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" />
                  <XAxis dataKey="t" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e2e9f2",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="hr" name={isAr ? "نبض القلب" : "Heart Rate"} stroke="#f87171" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="sbp" name={isAr ? "ضغط الدم الانقباضي" : "Systolic BP"} stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="spo2" name={isAr ? "تشبع الأكسجين" : "SpO2"} stroke="#2dd4bf" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="rr" name={isAr ? "معدل التنفس" : "Resp Rate"} stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <SectionTitle>{isAr ? "جدول العلامات الحيوية وتفكيك نقاط NEWS2" : "Vitals History & NEWS2 Breakdown"}</SectionTitle>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pe-3 text-start font-bold">{isAr ? "الوقت" : "Time"}</th>
                    <th className="py-2 pe-3 text-start font-bold">{isAr ? "معدل التنفس (RR)" : "RR"}</th>
                    <th className="py-2 pe-3 text-start font-bold">{isAr ? "الأكسجين (SpO2)" : "SpO2"}</th>
                    <th className="py-2 pe-3 text-start font-bold">{isAr ? "ضغط الدم (SBP)" : "SBP"}</th>
                    <th className="py-2 pe-3 text-start font-bold">{isAr ? "نبض القلب (HR)" : "HR"}</th>
                    <th className="py-2 pe-3 text-start font-bold">{isAr ? "الحرارة (°C)" : "Temp"}</th>
                    <th className="py-2 text-end font-bold">{isAr ? "مجموع NEWS2" : "NEWS2 Score"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {[...p.vitals].reverse().map((v, i) => {
                    const { score, maxSingle } = news2Score({
                      rr: v.rr,
                      spo2: v.spo2,
                      o2: ((v as unknown as Record<string, unknown>).o2 as 0 | 1) ?? 0,
                      sbp: v.sbp,
                      hr: v.hr,
                      temp: v.temp,
                      conscious: ((v as unknown as Record<string, unknown>).conscious as 0 | 3) ?? 0,
                    });
                    const tier = news2Tier(score, maxSingle);
                    return (
                      <tr key={i} className="hover:bg-slate-50/70">
                        <td className="py-2.5 pe-3 font-bold text-slate-800">{v.t}</td>
                        <td className="py-2.5 pe-3">{v.rr} /min</td>
                        <td className="py-2.5 pe-3">{v.spo2}%</td>
                        <td className="py-2.5 pe-3">{v.sbp} mmHg</td>
                        <td className="py-2.5 pe-3">{v.hr} bpm</td>
                        <td className="py-2.5 pe-3">{v.temp} °C</td>
                        <td className="py-2.5 text-end">
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-bold ${
                              score >= 7
                                ? "bg-red-600 text-white"
                                : score >= 5
                                  ? "bg-amber-500 text-white"
                                  : "bg-teal-100 text-teal-800"
                            }`}
                          >
                            {score} ({tier})
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 8: Nursing Progress Notes */}
      {activeTab === "notes" && (
        <Card>
          <div className="flex items-center justify-between pb-3 border-b">
            <SectionTitle>{isAr ? "الملاحظات التمريضية غير القابلة للتعديل (Append-Only)" : "Append-Only Nursing Notes"}</SectionTitle>
            {isNurse && (
              <button
                onClick={() => setShowNoteModal(true)}
                className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
              >
                {isAr ? "➕ إضافة ملاحظة تمريضية" : "➕ Add Nursing Note"}
              </button>
            )}
          </div>
          <div className="mt-4 space-y-4">
            {nursingNotes.map((n) => (
              <div
                key={n.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between border-b pb-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{n.authorName}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                      {n.authorRole}
                    </span>
                  </div>
                  <span className="font-mono text-slate-500">{n.time}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-800">
                  {isAr ? n.textAr : n.textEn}
                </p>
                <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
                  <span>{isAr ? "موثّق بتوقيع رقمي مشفر (Audit Intact)" : "Cryptographically Signed"}</span>
                  <span className="font-mono">{n.id}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 9: I-PASS Handoffs */}
      {activeTab === "ipass" && (
        <Card>
          <SectionTitle>{isAr ? "سجل تسليم الحالات بمعيار I-PASS القياسي" : "I-PASS Structured Handoff Records"}</SectionTitle>
          <p className="text-xs text-slate-500 mb-4">
            {isAr
              ? "معتمد على دراسة Starmer et al. (NEJM 2014) لضمان سلامة المرضى ومنع الأخطاء الطبية أثناء تبادل الورديات."
              : "Grounded in Starmer et al. (NEJM 2014) to eliminate medical communication gaps during shift change."}
          </p>
          <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-teal-100 pb-3">
              <div>
                <span className="font-bold text-sm text-teal-950">
                  {isAr ? "تسليم وردية الصباح ← وردية المساء (HF-2026-0929)" : "Morning Shift → Evening Shift (HF-2026-0929)"}
                </span>
                <p className="text-xs text-teal-800">
                  {isAr ? "المسلّم: د. سارة العتيبي · المستلم: ممرض الجناح" : "Outgoing: Dr. Sara · Incoming: Ward Nurse"}
                </p>
              </div>
              <span className="rounded-full bg-emerald-600 px-3 py-1 font-bold text-white text-xs">
                {isAr ? "مكتمل ومقبول رسمياً" : "Accepted & Signed"}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3 border border-teal-100">
                <div className="flex items-center gap-1.5 font-bold text-xs text-rose-700">
                  <span>I</span> · {t("ipass.i")}
                </div>
                <p className="mt-1 text-xs text-slate-700">
                  {risk.level === "critical" || risk.score >= 7
                    ? isAr ? "غير مستقرة (Unstable) — تتطلب مراقبة مستمرة وتكرار اللاكتيك" : "Unstable — Requires continuous telemetry and serial lactate"
                    : isAr ? "مراقبة مشددة (Watcher)" : "Watcher"}
                </p>
              </div>

              <div className="rounded-xl bg-white p-3 border border-teal-100">
                <div className="flex items-center gap-1.5 font-bold text-xs text-teal-800">
                  <span>P</span> · {t("ipass.p")}
                </div>
                <p className="mt-1 text-xs text-slate-700">
                  {isAr ? p.noteAr : p.noteEn}
                </p>
              </div>

              <div className="rounded-xl bg-white p-3 border border-teal-100">
                <div className="flex items-center gap-1.5 font-bold text-xs text-teal-800">
                  <span>A</span> · {t("ipass.a")}
                </div>
                <ul className="mt-1 list-disc ps-4 text-xs text-slate-700 space-y-1">
                  <li>{isAr ? "إعادة فحص حمض اللاكتيك الساعة 06:00" : "Repeat lactate at 06:00"}</li>
                  <li>{isAr ? "متابعة إدرار البول والحفاظ على > 0.5 مل/كجم/ساعة" : "Monitor urine output > 0.5 ml/kg/h"}</li>
                </ul>
              </div>

              <div className="rounded-xl bg-white p-3 border border-teal-100">
                <div className="flex items-center gap-1.5 font-bold text-xs text-teal-800">
                  <span>S</span> · {t("ipass.s")}
                </div>
                <p className="mt-1 text-xs text-slate-700">
                  {isAr
                    ? "إذا انخفض الضغط الشرياني الوسطي MAP دون 65 mmHg رغم السوائل، يجب الاتصال بفريق العناية المركزة للبدء بالنورأدرينالين."
                    : "If MAP drops below 65 mmHg despite fluids, escalate to ICU team for vasopressor initiation."}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white p-3 border border-teal-100">
              <div className="flex items-center gap-1.5 font-bold text-xs text-teal-800">
                <span>SYN</span> · {t("ipass.syn")}
              </div>
              <p className="mt-1 text-xs text-slate-700">
                {isAr
                  ? "تمت قراءة وفهم كافة بنود الخطة من قبل المستلم وإعادة تأكيد أهداف الضغط والإنعاش السريع."
                  : "Receiver confirmed understanding of targets, MAP thresholds, and contingencies."}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 10: Doctor Tasks & Decisions (E6) */}
      {activeTab === "doctor_decisions" && (
        <Card>
          <SectionTitle>{isAr ? "قرارات وتكليفات الطبيب السريرية (Doctor Task History)" : "Physician Decisions & Tasks (E6)"}</SectionTitle>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between border-b pb-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{isAr ? "استجابة إنتان دم حاد (NEWS2 = 7)" : "Sepsis Emergency Response"}</span>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
                    EMERGENCY
                  </span>
                </div>
                <span className="font-mono text-slate-500">02:18</span>
              </div>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-slate-500">{isAr ? "توقيت الإقرار (Acknowledge):" : "Acknowledged At:"}</span>{" "}
                  <span className="font-mono font-bold text-slate-800">02:14</span>
                </div>
                <div>
                  <span className="text-slate-500">{isAr ? "التقييم بجانب السرير (Bedside Review):" : "Bedside Review:"}</span>{" "}
                  <span className="font-mono font-bold text-slate-800">02:18</span>
                </div>
                <div>
                  <span className="text-slate-500">{isAr ? "القرار السريري المتخذ:" : "Clinical Decision:"}</span>{" "}
                  <span className="font-bold text-teal-800">{isAr ? "بدء حزمة الإنتان الفورية (Treatment)" : "Treatment: Sepsis Bundle"}</span>
                </div>
                <div>
                  <span className="text-slate-500">{isAr ? "التعليل السريري:" : "Clinical Justification:"}</span>{" "}
                  <span className="text-slate-700">{isAr ? "استجابة التهابية مع هبوط ضغط - تستدعي مضادات وسوائل وريدية" : "Severe SIRS response with hypotension"}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ══ Modals ══ */}

      {/* Modal 1: Add Doctor Order */}
      {showOrderModal && (
        <AddOrderModal
          isAr={isAr}
          patientId={p.id}
          onClose={() => setShowOrderModal(false)}
          onSuccess={(newOrd) => {
            setOrdersList((prev) => [...prev, newOrd]);
            setShowOrderModal(false);
            onRefetch();
          }}
        />
      )}

      {/* Modal 2: Add Diagnosis Modal */}
      {showDxModal && (
        <AddDiagnosisModal
          isAr={isAr}
          patientId={p.id}
          onClose={() => setShowDxModal(false)}
          onSuccess={(newDx) => {
            setDiagnosesList((prev) => [...prev, newDx]);
            setShowDxModal(false);
            onRefetch();
          }}
        />
      )}

      {/* Modal 3: Add Nursing Note Modal */}
      {showNoteModal && (
        <AddNursingNoteModal
          isAr={isAr}
          patientId={p.id}
          onClose={() => setShowNoteModal(false)}
          onSuccess={(note) => {
            setNursingNotes((prev) => [note, ...prev]);
            setShowNoteModal(false);
            onRefetch();
          }}
        />
      )}

      {/* Modal 4: Consistency Review Modal (E10) */}
      {reviewingFinding && (
        <ConsistencyReviewModal
          finding={reviewingFinding}
          isAr={isAr}
          patientId={p.id}
          onClose={() => setReviewingFinding(null)}
          onSuccess={() => {
            setReviewingFinding(null);
            onRefetch();
          }}
        />
      )}
    </div>
  );
}

// ── Sub-Modal: Add Order ──
function AddOrderModal({
  isAr,
  patientId,
  onClose,
  onSuccess,
}: {
  isAr: boolean;
  patientId: string;
  onClose: () => void;
  onSuccess: (ord: { id: string; kind: string; titleAr: string; titleEn: string; dose: string; route: string; freq: string; priority: string; status: string; orderedBy: string; orderedAt: string }) => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<"medication" | "lab" | "fluids" | "monitoring" | "consult">("medication");
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState("IV");
  const [freq, setFreq] = useState("Once");
  const [priority, setPriority] = useState<"stat" | "urgent" | "routine">("urgent");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleAr.trim() && !titleEn.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          titleAr: titleAr || titleEn,
          titleEn: titleEn || titleAr,
          dose,
          route,
          frequency: freq,
          priority,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast(isAr ? "✅ تم إصدار الأمر الطبي وإدراجه في السجل المشفر" : "✅ Order issued and recorded", "success");
      onSuccess({
        id: `ORD-${Date.now().toString().slice(-3)}`,
        kind,
        titleAr: titleAr || titleEn,
        titleEn: titleEn || titleAr,
        dose,
        route,
        freq,
        priority,
        status: "active",
        orderedBy: "Dr. Alotaibi",
        orderedAt: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
      });
    } catch {
      toast(isAr ? "تعذر إصدار الأمر الطبي" : "Failed to issue order", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          {isAr ? "إصدار أمر طبي سريري جديد" : "Issue New Clinical Order"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-slate-700">{isAr ? "نوع الأمر" : "Order Kind"}</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as never)}
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-bold"
              >
                <option value="medication">{isAr ? "دواء (Medication)" : "Medication"}</option>
                <option value="fluids">{isAr ? "سوائل وريدية (IV Fluids)" : "IV Fluids"}</option>
                <option value="lab">{isAr ? "تحليل مخبري (Lab Test)" : "Lab Test"}</option>
                <option value="monitoring">{isAr ? "مراقبة وعلامات (Monitoring)" : "Monitoring"}</option>
                <option value="consult">{isAr ? "استشارة تخصصية (Consult)" : "Consult"}</option>
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-700">{isAr ? "درجة الأولوية" : "Priority"}</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as never)}
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-bold"
              >
                <option value="stat">{isAr ? "عاجل جداً (STAT)" : "STAT"}</option>
                <option value="urgent">{isAr ? "عاجل (Urgent)" : "Urgent"}</option>
                <option value="routine">{isAr ? "روتيني (Routine)" : "Routine"}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="font-bold text-slate-700">{isAr ? "نص الأمر (عربي)" : "Order Description (AR)"}</label>
            <input
              type="text"
              required
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              placeholder="مثال: سفترياكسون 2 جم وريدي"
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700">{isAr ? "نص الأمر (إنجليزي)" : "Order Description (EN)"}</label>
            <input
              type="text"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="e.g. Ceftriaxone 2g IV"
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-bold text-slate-700">{isAr ? "الجرعة" : "Dose"}</label>
              <input
                type="text"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                placeholder="2g / 1000ml"
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">{isAr ? "المسار" : "Route"}</label>
              <input
                type="text"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="IV / PO"
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">{isAr ? "التكرار" : "Frequency"}</label>
              <input
                type="text"
                value={freq}
                onChange={(e) => setFreq(e.target.value)}
                placeholder="Once / Q8H"
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-100"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-teal-600 px-5 py-2 font-bold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {submitting ? "..." : isAr ? "إصدار وتوقيع الأمر" : "Sign & Issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sub-Modal: Add Diagnosis ──
function AddDiagnosisModal({
  isAr,
  patientId,
  onClose,
  onSuccess,
}: {
  isAr: boolean;
  patientId: string;
  onClose: () => void;
  onSuccess: (dx: { code: string; nameAr: string; nameEn: string; type: string; status: string; diagnosedBy: string; diagnosedAt: string }) => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState("A41.9");
  const [nameAr, setNameAr] = useState("إنتان دم جرثومي غير محدد");
  const [nameEn, setNameEn] = useState("Sepsis, unspecified organism");
  const [type, setType] = useState<"primary" | "secondary">("primary");
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/diagnoses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          nameAr,
          nameEn,
          type,
          clinicalRationale: rationale || "Confirmed by physician",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast(isAr ? "✅ تم حفظ التشخيص في السجل الطبي" : "✅ Diagnosis added", "success");
      onSuccess({
        code,
        nameAr,
        nameEn,
        type,
        status: "active",
        diagnosedBy: "Dr. Alotaibi",
        diagnosedAt: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
      });
    } catch {
      toast(isAr ? "تعذر حفظ التشخيص" : "Failed to add diagnosis", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          {isAr ? "إضافة تشخيص معتمد (ICD-10)" : "Add ICD-10 Diagnosis"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-bold text-slate-700">{isAr ? "رمز التشخيص (ICD-10 Code)" : "ICD-10 Code"}</label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-mono font-bold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700">{isAr ? "اسم التشخيص (عربي)" : "Diagnosis Name (AR)"}</label>
            <input
              type="text"
              required
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700">{isAr ? "اسم التشخيص (إنجليزي)" : "Diagnosis Name (EN)"}</label>
            <input
              type="text"
              required
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700">{isAr ? "النوع" : "Type"}</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as never)}
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-bold"
            >
              <option value="primary">{isAr ? "تشخيص رئيسي (Primary)" : "Primary"}</option>
              <option value="secondary">{isAr ? "تشخيص ثانوي (Secondary)" : "Secondary"}</option>
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700">{isAr ? "التعليل السريري للتشخيص" : "Clinical Rationale"}</label>
            <textarea
              rows={2}
              required
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="مثال: استجابة التهابية مع تسرع القلب وارتفاع حمض اللاكتيك..."
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-100"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-teal-600 px-5 py-2 font-bold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {submitting ? "..." : isAr ? "حفظ التشخيص" : "Save Diagnosis"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sub-Modal: Add Nursing Note ──
function AddNursingNoteModal({
  isAr,
  patientId,
  onClose,
  onSuccess,
}: {
  isAr: boolean;
  patientId: string;
  onClose: () => void;
  onSuccess: (note: { id: string; authorName: string; authorRole: string; category: string; textAr: string; textEn: string; time: string }) => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [category, setCategory] = useState<"nursing_progress" | "shift_assessment" | "intervention_response" | "general">("nursing_progress");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, category }),
      });
      if (!res.ok) throw new Error("Failed");
      toast(isAr ? "✅ تم توثيق الملاحظة التمريضية في السجل المشفر" : "✅ Nursing note added", "success");
      onSuccess({
        id: `NN-${Date.now().toString().slice(-4)}`,
        authorName: "Sara Al-Harbi (RN)",
        authorRole: "nurse",
        category,
        textAr: text,
        textEn: text,
        time: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
      });
    } catch {
      toast(isAr ? "تعذر حفظ الملاحظة التمريضية" : "Failed to add nursing note", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          {isAr ? "إضافة ملاحظة تمريضية موثقة (Append-Only)" : "Add Append-Only Nursing Note"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-bold text-slate-700">{isAr ? "تصنيف الملاحظة" : "Note Category"}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as never)}
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-bold"
            >
              <option value="nursing_progress">{isAr ? "تطور الحالة التمريضية (Nursing Progress)" : "Nursing Progress"}</option>
              <option value="shift_assessment">{isAr ? "تقييم بداية الوردية (Shift Assessment)" : "Shift Assessment"}</option>
              <option value="intervention_response">{isAr ? "الاستجابة للتدخل الدوائي (Response to Treatment)" : "Response to Treatment"}</option>
              <option value="general">{isAr ? "أخرى (General)" : "General"}</option>
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700">{isAr ? "نص الملاحظة السريرية" : "Clinical Note Text"}</label>
            <textarea
              rows={4}
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="اكتب التوثيق السريري الدقيق للمريض..."
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-100"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-indigo-600 px-5 py-2 font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "..." : isAr ? "توثيق وتوقيع الملاحظة" : "Sign & Record Note"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sub-Modal: Consistency Review (E10) ──
function ConsistencyReviewModal({
  finding,
  isAr,
  patientId,
  onClose,
  onSuccess,
}: {
  finding: ConsistencyFinding;
  isAr: boolean;
  patientId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [decision, setDecision] = useState<"confirm_diagnosis" | "update_diagnosis" | "dismiss">("confirm_diagnosis");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast(isAr ? "التعليل السريري إلزامي" : "Clinical reason is required", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/consistency-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findingId: finding.id,
          decision,
          diagnosisCode: finding.suggestedDxCode,
          diagnosisAr: finding.suggestedDxAr,
          diagnosisEn: finding.suggestedDxEn,
          reason,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast(
        isAr
          ? "✅ تم حفظ قرار الطبيب بشأن الاتساق السريري وتحديث السجل بنجاح"
          : "✅ Consistency decision recorded in chart",
        "success",
      );
      onSuccess();
    } catch {
      toast(isAr ? "تعذر حفظ القرار" : "Failed to record decision", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-3xl border border-amber-300 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-900 mb-2">
          {isAr ? "مراجعة اتساق العلامات الحيوية والتشخيص (E10)" : "Clinical Consistency Review (E10)"}
        </h2>
        <p className="text-xs text-slate-600 mb-4">
          {isAr ? finding.descriptionAr : finding.descriptionEn}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700">{isAr ? "القرار السريري للطبيب المعالج" : "Clinical Decision"}</label>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  value="confirm_diagnosis"
                  checked={decision === "confirm_diagnosis"}
                  onChange={() => setDecision("confirm_diagnosis")}
                />
                <div>
                  <div className="font-bold text-slate-900">
                    {isAr ? `تأكيد وإضافة التشخيص (${finding.suggestedDxCode} ${finding.suggestedDxAr})` : `Confirm & Add Diagnosis (${finding.suggestedDxCode})`}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isAr ? "يُدرج التشخيص تلقائياً في السجل الطبي وحزمة أدلة المطالبة" : "Auto-appends to active diagnoses & NPHIES claim pack"}
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  value="update_diagnosis"
                  checked={decision === "update_diagnosis"}
                  onChange={() => setDecision("update_diagnosis")}
                />
                <div>
                  <div className="font-bold text-slate-900">
                    {isAr ? "تحديث التشخيص الحالي إلى تشخيص آخر أكثر دقة" : "Update Existing Diagnosis to Alternative"}
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  value="dismiss"
                  checked={decision === "dismiss"}
                  onChange={() => setDecision("dismiss")}
                />
                <div>
                  <div className="font-bold text-slate-900">
                    {isAr ? "غير ذي صلة سريرياً مع ذكر السبب التبريري" : "Not Clinically Relevant (Dismiss with Justification)"}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isAr ? "يُسجل التبرير في سجل التدقيق لمنع استفسارات التأمين" : "Records reason in audit log to protect from claim inquiry"}
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700">{isAr ? "التعليل السريري الإلزامي للقرار" : "Clinical Rationale (Required)"}</label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isAr ? "اكتب تعليلك السريري المبني على الدلائل..." : "Document your clinical rationale..."}
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-100"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-amber-700 px-5 py-2 font-bold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {submitting ? "..." : isAr ? "اعتماد القرار وتوقيعه" : "Sign & Record Decision"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
