// ── Clinical Consistency Engine (E10) ─────────────────────────────────────────
// Compares patient vitals, labs, and active orders against recorded ICD-10
// diagnoses to detect undocumented clinical deterioration or documentation gaps.
// Grounded in Surviving Sepsis Campaign (Evans et al. Crit Care Med 2021) and
// Royal College of Physicians NEWS2 (Smith et al. 2013).

import type { Patient, VitalPoint, LabResult } from "@/lib/types";
import { news2Score } from "./priority";

export interface ConsistencyFinding {
  id: string;
  category: "sepsis" | "metabolic" | "respiratory" | "medication_indication";
  severity: "critical" | "warning" | "advisory";
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  suggestedDxCode?: string; // ICD-10
  suggestedDxAr?: string;
  suggestedDxEn?: string;
  evidence: string[];
}

export interface ConsistencyCheckResult {
  patientId: string;
  evaluatedAt: string;
  hasFindings: boolean;
  findings: ConsistencyFinding[];
}

/**
 * Evaluates clinical consistency between vitals/labs/orders and documented diagnoses.
 */
export function evaluateClinicalConsistency(
  patient: Patient,
  latestVitals?: VitalPoint,
  labs?: LabResult[],
  diagnoses: { code: string; nameEn: string; nameAr: string }[] = [],
): ConsistencyCheckResult {
  const findings: ConsistencyFinding[] = [];
  const vitals = latestVitals || patient.vitals[patient.vitals.length - 1];
  const patientLabs = labs || patient.labs;

  const dxCodes = new Set(diagnoses.map((d) => d.code.toUpperCase()));
  const dxKeys = [patient.dxKey.toLowerCase()];

  // Check 1: Sepsis / Severe Infection Consistency
  // Criteria: NEWS2 >= 5 or Temp >= 38.3 / < 36.0 with tachycardia/tachypnea, or elevated Lactate/WBC
  const score = vitals
    ? news2Score({
        rr: vitals.rr,
        spo2: vitals.spo2,
        o2: ((vitals as unknown as Record<string, unknown>).o2 as 0 | 1) ?? 0,
        sbp: vitals.sbp,
        hr: vitals.hr,
        temp: vitals.temp,
        conscious: ((vitals as unknown as Record<string, unknown>).conscious as 0 | 3) ?? 0,
      }).score
    : 0;
  const isFebrile = vitals ? vitals.temp >= 38.3 || vitals.temp < 36.0 : false;
  const isTachycardic = vitals ? vitals.hr >= 100 : false;
  const isTachypneic = vitals ? vitals.rr >= 22 : false;
  const lactateLab = patientLabs.find((l) => l.key === "lactate");
  const lactateVal = lactateLab ? parseFloat(lactateLab.value) : 0;
  const wbcLab = patientLabs.find((l) => l.key === "wbc");
  const wbcVal = wbcLab ? parseFloat(wbcLab.value) : 0;

  const hasSepsisDx =
    dxCodes.has("A41.9") ||
    dxCodes.has("A41.0") ||
    dxCodes.has("R65.20") ||
    dxKeys.some((k) => k.includes("sepsis") || k.includes("shock"));

  if (
    !hasSepsisDx &&
    (score >= 5 || (isFebrile && (isTachycardic || isTachypneic)) || lactateVal >= 2.0 || wbcVal >= 12.0)
  ) {
    const evidenceList: string[] = [];
    if (score >= 5) evidenceList.push(`NEWS2 = ${score} (عالي الخطورة / High Risk)`);
    if (vitals && isFebrile) evidenceList.push(`درجة الحرارة / Temp: ${vitals.temp}°C`);
    if (vitals && isTachycardic) evidenceList.push(`نبض القلب / HR: ${vitals.hr} bpm`);
    if (vitals && isTachypneic) evidenceList.push(`معدل التنفس / RR: ${vitals.rr} /min`);
    if (lactateLab) evidenceList.push(`حمض اللاكتيك / Lactate: ${lactateLab.value}`);
    if (wbcLab) evidenceList.push(`كريات الدم البيضاء / WBC: ${wbcLab.value}`);

    findings.push({
      id: "finding-sepsis-undocumented",
      category: "sepsis",
      severity: score >= 7 || lactateVal >= 4.0 ? "critical" : "warning",
      titleAr: "احتمال تدهور إنتاني غير موثق التشخيص (مراجعة الطبيب مطلوبة)",
      titleEn: "Potential Undocumented Sepsis / Deterioration (Physician Review Required)",
      descriptionAr:
        "العلامات الحيوية والمؤشرات المخبرية تشير إلى استجابة التهابية جهازية وتدهور سريري، دون توثيق تشخيص إنتان (Sepsis ICD-10 A41.9). يتطلب مراجعة الطبيب لتأكيد التشخيص أو تحديثه.",
      descriptionEn:
        "Physiological vitals and lab markers indicate systemic inflammatory response / sepsis risk without a documented sepsis diagnosis (ICD-10 A41.9). Physician review required to confirm or update.",
      suggestedDxCode: "A41.9",
      suggestedDxAr: "إنتان دم جرثومي غير محدد (Sepsis, unspecified organism)",
      suggestedDxEn: "Sepsis, unspecified organism",
      evidence: evidenceList,
    });
  }

  // Check 2: Metabolic Decompensation / DKA
  // Blood glucose >= 250 or Ketones elevated without DKA diagnosis
  const glucoseLab = patientLabs.find((l) => l.key === "glucose");
  const glucoseVal = glucoseLab
    ? parseFloat(glucoseLab.value)
    : vitals?.glucose ?? 0;
  const ketonesLab = patientLabs.find((l) => l.key === "ketones");
  const hasDkaDx =
    dxCodes.has("E10.1") ||
    dxCodes.has("E11.1") ||
    dxCodes.has("E10.10") ||
    dxCodes.has("E11.10") ||
    dxKeys.some((k) => k.includes("dka") || k.includes("ketoacidosis"));

  if (!hasDkaDx && (glucoseVal >= 250 || ketonesLab?.flag === "high")) {
    findings.push({
      id: "finding-dka-undocumented",
      category: "metabolic",
      severity: glucoseVal >= 350 || ketonesLab?.flag === "high" ? "critical" : "warning",
      titleAr: "ارتفاع حاد في السكر/الكيتونات دون توثيق الحماض الكيتوني (DKA)",
      titleEn: "Severe Hyperglycemia / Ketosis without Documented DKA Diagnosis",
      descriptionAr:
        "مستوى الجلوكوز والكيتونات مرتفع بشكل حاد مما يثير الاشتباه في حماض كيتوني سكري (DKA ICD-10 E11.10) غير مسجل في التشخيصات النشطة.",
      descriptionEn:
        "Significantly elevated glucose and ketones suggest diabetic ketoacidosis (ICD-10 E11.10) which is not listed in active diagnoses.",
      suggestedDxCode: "E11.10",
      suggestedDxAr: "داء السكري من النوع 2 مع حماض كيتوني بدون غيبوبة",
      suggestedDxEn: "Type 2 diabetes mellitus with ketoacidosis without coma",
      evidence: [
        glucoseVal ? `الجلوكوز / Glucose: ${glucoseVal} mg/dL` : "",
        ketonesLab ? `الكيتونات / Ketones: ${ketonesLab.value}` : "",
      ].filter(Boolean),
    });
  }

  // Check 3: Hypoxemic Respiratory Failure
  // SpO2 < 92% or supplemental O2 required without respiratory diagnosis
  const hasRespDx =
    dxCodes.has("J96.0") ||
    dxCodes.has("J18.9") ||
    dxCodes.has("J44.1") ||
    dxKeys.some((k) => k.includes("pneumonia") || k.includes("resp") || k.includes("copd"));

  if (!hasRespDx && vitals && vitals.spo2 < 92) {
    findings.push({
      id: "finding-resp-undocumented",
      category: "respiratory",
      severity: vitals.spo2 < 88 ? "critical" : "warning",
      titleAr: "نقص أكسجة حاد دون توثيق قصور تنفسي (ICD-10 J96.0)",
      titleEn: "Acute Hypoxemia without Documented Respiratory Failure (ICD-10 J96.0)",
      descriptionAr:
        "تشبع الأكسجين منخفض (أقل من 92%) بدون تشخيص تنفسي موثق يفسر نقص الأكسجة.",
      descriptionEn:
        "Oxygen saturation is persistently low (<92%) without a supporting respiratory diagnosis documented.",
      suggestedDxCode: "J96.00",
      suggestedDxAr: "قصور تنفسي حاد غير محدد بنقص التأكسج أو فرط ثاني أكسيد الكربون",
      suggestedDxEn: "Acute respiratory failure, unspecified whether with hypoxia or hypercapnia",
      evidence: [`SpO2: ${vitals.spo2}%`, `معدل التنفس / RR: ${vitals.rr}/min`],
    });
  }

  return {
    patientId: patient.id,
    evaluatedAt: new Date().toISOString(),
    hasFindings: findings.length > 0,
    findings,
  };
}
