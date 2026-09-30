"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { getPatient } from "@/lib/data/patients";
import { assessClinicalRisk } from "@/lib/engines/clinical-risk";
import { assessInsuranceRisk } from "@/lib/engines/insurance-risk";
import { Meter, RiskBadge } from "@/components/ui";
import { fmtSar } from "@/lib/format";

const STEP_MS = 4200;
const TOTAL = 7; // steps 0..6, then finale

// animated counter that eases toward a target
function useAnimatedNumber(target: number, duration = 900) {
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
  const { t, lang } = useI18n();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  const p = getPatient("P-1042")!;
  const risk = assessClinicalRisk(p);
  const ins = assessInsuranceRisk(p, risk);

  useEffect(() => {
    if (!playing || step >= TOTAL) return;
    const id = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [step, playing]);

  const riskNow = useAnimatedNumber(step >= 6 ? 18 : step >= 5 ? 42 : step >= 1 ? 87 : 22);
  const evidenceNow = useAnimatedNumber(step >= 6 ? 96 : step >= 4 ? 68 : 34);

  const finale = step >= TOTAL;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#13304d]">{t("demo.title")}</h1>
          <p className="text-xs text-slate-500">{t("demo.simNotice")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="rounded-lg bg-[#13304d] px-4 py-2 text-sm font-semibold text-white"
          >
            {playing ? `⏸ ${t("demo.pause")}` : `▶ ${t("demo.play")}`}
          </button>
          <button
            onClick={() => { setStep(0); setPlaying(true); }}
            className="rounded-lg border border-[#e2e9f2] bg-white px-4 py-2 text-sm font-semibold text-slate-600"
          >
            ↺ {t("demo.restart")}
          </button>
          <Link
            href="/handoff"
            className="rounded-lg border border-[#e2e9f2] bg-white px-4 py-2 text-sm font-semibold text-[#0e9bb5]"
          >
            {t("demo.exit")}
          </Link>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: TOTAL + 1 }).map((_, i) => (
          <button
            key={i}
            onClick={() => { setStep(i); setPlaying(false); }}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < step ? "bg-[#0e9bb5]" : i === step ? "bg-[#13304d]" : "bg-[#e2e9f2]"
            }`}
          />
        ))}
      </div>

      {!finale ? (
        /* ── Live patient card ── */
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#e2e9f2] bg-white p-6 shadow-[0_2px_12px_rgba(19,48,77,0.08)]">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-sm text-slate-500">{p.id}</span>
                <h2 className="text-2xl font-bold text-[#13304d]">
                  {lang === "ar" ? p.nameAr : p.nameEn}
                </h2>
                <p className="text-sm text-slate-500">
                  {p.age} {t("common.years")} · {p.room} · {t(`dx.${p.dxKey}`)}
                </p>
              </div>
              {step >= 1 && <RiskBadge level={risk.level} />}
            </div>

            {/* Risk number */}
            <div className="mt-6 flex items-end justify-center gap-3">
              <div className="text-center">
                <div
                  className={`font-mono text-7xl font-bold tabular-nums transition-colors duration-500 ${
                    riskNow >= 60 ? "text-red-600" : riskNow >= 30 ? "text-amber-500" : "text-emerald-600"
                  }`}
                >
                  {riskNow}
                </div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {t("demo.risk")} %
                </div>
              </div>
            </div>

            {/* WHY factors — appear from step 1 */}
            <div className={`mt-5 space-y-2 transition-opacity duration-700 ${step >= 1 ? "opacity-100" : "opacity-20"}`}>
              {risk.factors.slice(0, 5).map((f) => (
                <div key={f.key} className="flex items-center gap-3">
                  <span className="w-8 text-end font-mono text-xs text-slate-500">{f.weight}%</span>
                  <div className="flex-1"><Meter pct={f.weight} color="bg-[#1b5fad]" /></div>
                  <span className="w-36 truncate text-xs text-slate-600">{t(`factor.${f.key}`)}</span>
                </div>
              ))}
              <p className="pt-1 text-center text-[10px] text-slate-500">{t("why.note")}</p>
            </div>
          </div>

          {/* Stage caption + intervention timer */}
          <div className="rounded-xl border border-[#0e9bb5]/25 bg-[#0e9bb5]/5 px-5 py-4 text-center">
            <p className="text-sm font-semibold text-[#13304d]">{t(`demo.step${step}`)}</p>
            {step >= 3 && step < 5 && (
              <p className="mt-1 font-mono text-2xl font-bold text-[#0e9bb5]">29:5{7 - (step - 3) * 3}</p>
            )}
            {step >= 4 && (
              <p className="mt-1 text-sm font-bold text-emerald-600">✓ {t("iv.done")} — 09:52</p>
            )}
          </div>

          {/* Evidence readiness — visible from step 4 */}
          {step >= 4 && (
            <div className="rounded-xl border border-[#e2e9f2] bg-white p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-600">{t("demo.evidence")}</span>
                <span className="font-mono text-lg font-bold text-[#0e9bb5]">{evidenceNow}%</span>
              </div>
              <Meter pct={evidenceNow} className="mt-2" />
              {step >= 6 && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {["ev.diagnosis", "ev.justification", "ev.intervention", "ev.clinician", "ev.timeline"].map((k) => (
                    <span key={k} className="flex items-center gap-1.5 text-slate-600">
                      <span className="text-emerald-600">✓</span> {t(k)}
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5 font-semibold text-red-600">
                    {t("common.sar")} {fmtSar(ins.exposureSar, lang)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ── Finale: the value chain ── */
        <div className="rounded-2xl border border-[#0e9bb5]/25 bg-gradient-to-b from-white to-[#f0fafb] p-8 text-center shadow-[0_2px_16px_rgba(19,48,77,0.08)]">
          {[
            "demo.one.patient",
            "demo.one.risk",
            "demo.one.intervention",
            "demo.one.loop",
            "demo.one.trail",
            "demo.one.value",
          ].map((k, i) => (
            <div key={k}>
              <div
                className={`mx-auto inline-block rounded-xl px-6 py-3 font-bold ${
                  i === 5
                    ? "bg-[#13304d] text-white text-lg shadow-lg"
                    : "border border-[#e2e9f2] bg-white text-[#13304d]"
                }`}
              >
                {t(k)}
              </div>
              {i < 5 && <div className="my-1.5 text-[#0e9bb5]">↓</div>}
            </div>
          ))}
          <p className="mt-6 text-xs text-slate-500">{t("app.tagline")} · {t("demo.simNotice")}</p>
        </div>
      )}
    </div>
  );
}
