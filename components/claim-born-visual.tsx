"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

export interface BornStep {
  id: string;
  stepNumber: string;
  titleAr: string;
  titleEn: string;
  time: string;
  actorAr: string;
  actorEn: string;
  icon: string;
  hash: string;
  detailAr: string;
  detailEn: string;
  nphiesCode?: string;
  amount?: string;
}

const BORN_STEPS: BornStep[] = [
  {
    id: "event",
    stepNumber: "01",
    titleAr: "حدث سريري (Event)",
    titleEn: "Clinical Event",
    time: "02:10",
    actorAr: "الممرضة: سارة أحمد",
    actorEn: "Nurse: Sara Ahmed",
    icon: "🫀",
    hash: "sha256:7f8a9b2c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a",
    detailAr: "تسجيل علامات حيوية حرجة (معدل تنفس 24، نبض 108، حرارة 38.6°C، أكسجين 93%) ترفع مؤشر NEWS2 إلى 7 وتطلق تنبيه اشتباه إنتان فوري.",
    detailEn: "Critical vitals recorded (RR 24, HR 108, Temp 38.6°C, SpO2 93%) triggering NEWS2 score of 7 and immediate sepsis alert.",
  },
  {
    id: "order",
    stepNumber: "02",
    titleAr: "أمر طبي (Order)",
    titleEn: "Doctor Order",
    time: "02:15",
    actorAr: "د. أحمد سالم (استشاري باطنية)",
    actorEn: "Dr. Ahmed Salem (Consultant)",
    icon: "👨‍⚕️",
    hash: "sha256:8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c",
    detailAr: "إقرار فوري بالاطلاع ومعاينة سريرية وإصدار أمر حزمة الإنتان: سحب مزارع الدم، فحص لاكتات STAT، سوائل وريدية، ومضاد حيوي سيفتررياكسون 2 جم.",
    detailEn: "Instant acknowledgment and bedside review. Sepsis bundle ordered: blood cultures, STAT lactate, IV hydration, and IV Ceftriaxone 2g.",
    nphiesCode: "Order-Rx: 99223 / Rx-7721",
  },
  {
    id: "execution",
    stepNumber: "03",
    titleAr: "تنفيذ ومسح (Execution)",
    titleEn: "eMAR Execution",
    time: "02:45",
    actorAr: "الممرضة: سارة أحمد",
    actorEn: "Nurse: Sara Ahmed",
    icon: "💊",
    hash: "sha256:9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d",
    detailAr: "إعطاء المضاد الحيوي الوريدي بعد التحقق الثنائي بمسح باركود إسوارة المريضة والدواء (eMAR)، وسحب عينات المختبر بدقة ضمن الساعة الذهبية.",
    detailEn: "IV Ceftriaxone administered following 2-point barcode scan verification (eMAR) within the critical Golden Hour.",
    nphiesCode: "eMAR-BC: 628103948210",
  },
  {
    id: "claim_line",
    stepNumber: "04",
    titleAr: "بند المطالبة (Claim Line)",
    titleEn: "Claim Line Assembly",
    time: "14:02",
    actorAr: "محرك التجميع الآلي (Automated Assembly)",
    actorEn: "Automated Claim Assembly Engine",
    icon: "📑",
    hash: "sha256:0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e",
    detailAr: "توليد بنود المطالبة التلقائي: تشخيص إنتان بولي (ICD-10: A41.9)، حقن وريدي (CPT: 96365)، أدوية وإقامة عناية مركزة، بقيمة إجمالية 41,200 ر.س.",
    detailEn: "Auto-generated claim lines: ICD-10 A41.9 Sepsis, CPT 96365 IV infusion, medications and ICU stay, total SAR 41,200.",
    amount: "41,200 SAR",
  },
  {
    id: "hash_verified",
    stepNumber: "05",
    titleAr: "تدقيق السلسلة (Hash Verified)",
    titleEn: "Cryptographic Verification",
    time: "14:03",
    actorAr: "محرك سلامة الأدلة (Evidence Integrity Engine)",
    actorEn: "Evidence Integrity Engine",
    icon: "🔒",
    hash: "sha256:1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f",
    detailAr: "التحقق الرياضي من تكامل 14 حدثاً سريرياً؛ السلسلة متصلة، التواقيع الزمنية مطابقة، ولا يمكن للجهة الدافعة الطعن في الضرورة الطبية.",
    detailEn: "All 14 clinical events cryptographically verified. SHA-256 chain intact; zero evidence gaps for payer denial.",
  },
  {
    id: "submitted",
    stepNumber: "06",
    titleAr: "رفع لنفيس (Submitted)",
    titleEn: "NPHIES Auto-Submission",
    time: "14:05",
    actorAr: "بوابة الربط الوطني NPHIES Gateway",
    actorEn: "NPHIES Direct Gateway",
    icon: "🚀",
    hash: "sha256:2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a",
    detailAr: "رفع المطالبة برمجياً إلى منصة نفيس فور اعتماد خروج المريضة، مدعومة بحزمة الأدلة الرقمية الجاهزة، خلال 12 دقيقة فقط بدل 18 يوماً.",
    detailEn: "Claim submitted automatically to NPHIES 12 minutes post-discharge (vs traditional 18-day delay), attached with evidence package.",
    nphiesCode: "NPHIES-TX: 948210395721",
  },
  {
    id: "payer_accepted",
    stepNumber: "07",
    titleAr: "قبول التأمين (Payer Accepted)",
    titleEn: "First-Pass Payer Approval",
    time: "14:15",
    actorAr: "منى العتيبي (مراجع شركة التأمين)",
    actorEn: "Mona Alotaibi (Payer Reviewer)",
    icon: "✅",
    hash: "sha256:3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
    detailAr: "قبول فوري وموافقة بنسبة 100% دون أي رفض (Zero Denial)؛ الدليل السريري المرفق أثبت المعايير الطبية بدقة متناهية.",
    detailEn: "100% first-pass acceptance, zero denial. Uncontestable clinical proof of medical necessity for full SAR 41,200 payout.",
    amount: "41,200 SAR",
  },
];

export function ClaimBornVisual({
  showPayerVerifyButton = false,
}: {
  showPayerVerifyButton?: boolean;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [activeStepId, setActiveStepId] = useState<string>("execution");
  const [verifiedAll, setVerifiedAll] = useState(false);

  const active = BORN_STEPS.find((s) => s.id === activeStepId) ?? BORN_STEPS[0];

  return (
    <div className="rounded-2xl border border-[#0e9bb5]/25 bg-gradient-to-br from-slate-900 via-[#0e2238] to-slate-950 p-6 text-white shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0e9bb5]/20 text-lg">
              ✨
            </span>
            <h3 className="text-lg font-black text-cyan-200">
              {isAr
                ? "كيف تُولد المطالبة المعززة بالدليل؟ (How a Claim is Born)"
                : "How a Claim is Born: End-to-End Digital Evidence"}
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-300">
            {isAr
              ? "دراسة حالة واقعية للمريضة نورة القحطاني (P-1042) — من لحظة قياس العلامات الحيوية وحتى سداد شركة التأمين"
              : "Live case study for Noura Al-Qahtani (P-1042): from bedside vitals to 100% approved payout"}
          </p>
        </div>

        {showPayerVerifyButton && (
          <button
            onClick={() => setVerifiedAll(true)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition-all ${
              verifiedAll
                ? "bg-emerald-500 text-white shadow-lg ring-2 ring-emerald-300"
                : "bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-md"
            }`}
          >
            <span>{verifiedAll ? "✓" : "🔍"}</span>
            <span>
              {verifiedAll
                ? isAr
                  ? "تم التحقق: 14 حدثاً موثقاً وسلسلة التشفير سليمة 100%"
                  : "All 14 events verified, hash chain intact"
                : isAr
                ? "فحص وتدقيق سلامة الأدلة المشفرة (Verify Evidence)"
                : "Verify Evidence Chain"}
            </span>
          </button>
        )}
      </div>

      {/* 7-Step Horizontal Interactive Pipeline */}
      <div className="mt-6 overflow-x-auto pb-3">
        <div className="flex min-w-[760px] items-center justify-between gap-1.5">
          {BORN_STEPS.map((s, idx) => {
            const isSelected = s.id === activeStepId;

            return (
              <div key={s.id} className="flex flex-1 items-center">
                <button
                  onClick={() => setActiveStepId(s.id)}
                  className={`group relative flex w-full flex-col rounded-xl border p-2.5 text-start transition-all ${
                    isSelected
                      ? "border-cyan-400 bg-cyan-950/80 shadow-lg ring-2 ring-cyan-400/50"
                      : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-cyan-300">
                    <span>{s.stepNumber}</span>
                    <span>{s.time}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-white">
                    <span>{s.icon}</span>
                    <span className="line-clamp-1">{isAr ? s.titleAr : s.titleEn}</span>
                  </div>
                  {isSelected && (
                    <span className="mt-1.5 inline-block w-fit rounded bg-cyan-400/30 px-1.5 py-0.2 text-[9px] font-bold text-cyan-200">
                      {isAr ? "معروض الآن" : "Selected"}
                    </span>
                  )}
                </button>
                {idx < BORN_STEPS.length - 1 && (
                  <span className="mx-1 text-slate-500 font-bold shrink-0">➔</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Step Detailed Card */}
      <div className="mt-4 rounded-xl border border-cyan-500/30 bg-black/40 p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">{active.icon}</span>
            <div className="text-sm font-black text-cyan-300">
              {active.stepNumber} · {isAr ? active.titleAr : active.titleEn} ({active.time})
            </div>
          </div>
          <div className="text-xs text-slate-300">
            <span className="font-semibold text-slate-400">{isAr ? "المُنفِّذ:" : "Actor:"}</span>{" "}
            <span className="font-bold text-white">{isAr ? active.actorAr : active.actorEn}</span>
          </div>
        </div>

        <p className="mt-3 text-sm text-slate-200 leading-relaxed">
          {isAr ? active.detailAr : active.detailEn}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-[11px] font-mono">
          <div className="text-slate-400 truncate max-w-md">
            <span className="text-cyan-400 font-bold">SHA-256: </span>
            <span>{active.hash}</span>
          </div>
          {active.amount && (
            <div className="rounded bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300">
              {isAr ? "قيمة البند: " : "Value: "}
              {active.amount}
            </div>
          )}
          {active.nphiesCode && (
            <div className="rounded bg-sky-500/20 px-2 py-0.5 text-sky-300">
              {active.nphiesCode}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
