import type { ClinicalRisk, Lang, Patient } from "@/lib/types";

type T = (key: string) => string;

/** AI-generated SBAR summary for handoff — localized. */
export function buildSbar(p: Patient, risk: ClinicalRisk, t: T, lang: Lang) {
  const factorList = risk.factors
    .slice(0, 4)
    .map((f) => t(`factor.${f.key}`))
    .join(lang === "ar" ? "، " : ", ");

  const name = lang === "ar" ? p.nameAr : p.nameEn;
  const dx = t(`dx.${p.dxKey}`);
  const cond = t(`condition.${risk.conditionKey}`);

  return {
    s:
      lang === "ar"
        ? `${name} — ${cond}. درجة الخطر ${risk.score}/100؛ نافذة تدهور محتملة < ${risk.windowHrs} ساعة.`
        : `${name} — ${cond}. Risk score ${risk.score}/100; potential deterioration window < ${risk.windowHrs} hrs.`,
    b:
      lang === "ar"
        ? `عمر ${p.age}، دخل بـ«${dx}» الساعة ${p.admittedAt}. ${p.noteAr}`
        : `${p.age} y/o admitted at ${p.admittedAt} for ${dx}. ${p.noteEn}`,
    a:
      lang === "ar"
        ? `إشارات متقاربة: ${factorList}.`
        : `Converging risk signals: ${factorList}.`,
    r:
      lang === "ar"
        ? risk.level === "critical" || risk.level === "high"
          ? "إعادة تقييم فورية وتنفيذ خطة التدخل المحددة زمنيًا؛ تصعيد آلي عند التأخر."
          : "استمرار المراقبة؛ إعادة تقييم عند تغير الإشارات."
        : risk.level === "critical" || risk.level === "high"
          ? "Immediate reassessment + execute the time-bound intervention plan; auto-escalation on delay."
          : "Continue monitoring; reassess if signals change.",
  };
}
