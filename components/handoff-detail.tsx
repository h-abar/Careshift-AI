"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { getHandoff } from "@/lib/data/handoffs";
import { userName } from "@/lib/data/users";
import { getPatient } from "@/lib/data/patients";
import { buildSnapshots } from "@/lib/aggregate";
import { buildSbar } from "@/lib/engines/sbar";
import { fmtSar } from "@/lib/format";
import { Card, IvStatusChip, Meter, RiskBadge, SectionTitle } from "@/components/ui";
import type { HandoffStatus } from "@/lib/types";

const CHECKLIST = [
  "criticalReviewed",
  "pendingReviewed",
  "escalationsReviewed",
  "recommendationsReviewed",
];

const STATUS_STYLE: Record<HandoffStatus, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-sky-50 text-sky-700 border-sky-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial: "bg-orange-50 text-orange-700 border-orange-200",
  escalated: "bg-purple-50 text-purple-700 border-purple-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function HandoffDetail({ handoffId }: { handoffId: string }) {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const h = getHandoff(handoffId)!;
  const snaps = buildSnapshots();

  const [checked, setChecked] = useState<string[]>(h.checklist);
  const [accepted, setAccepted] = useState(
    h.status === "accepted" || h.status === "completed",
  );
  const [timeline, setTimeline] = useState(h.timeline);

  const toggleCheck = (k: string) =>
    setChecked((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  const allChecked = CHECKLIST.every((k) => checked.includes(k));

  const accept = () => {
    setAccepted(true);
    setTimeline((tl) => [
      ...tl,
      { t: new Date().toTimeString().slice(0, 5), key: "hftl.accepted" },
    ]);
  };

  const patients = h.patientIds
    .map((pid) => snaps.find((s) => s.patient.id === pid))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const reviewed = Object.values(h.reviewed).filter(Boolean).length;
  const criticalCount = patients.filter(
    (s) => s.risk.level === "critical" || s.risk.level === "high",
  ).length;

  return (
    <div className="space-y-5">
      <Link href="/handoffs" className="text-xs text-slate-500 hover:text-[#0e9bb5]">
        ← {t("common.back")}
      </Link>

      {/* Header */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-lg font-bold text-[#13304d]">{h.id}</h1>
              <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${STATUS_STYLE[accepted ? "accepted" : h.status]}`}>
                {t(`hfst.${accepted ? "accepted" : h.status}`)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {t(`dept.${h.dept}`)} · {t(`hf.shift.${h.shift}`)} · {h.date}
            </p>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-400">{t("hf.outgoing")}</div>
              <div className="font-semibold text-[#13304d]">{userName(h.outgoingId, lang)}</div>
            </div>
            <span className="text-xl text-[#0e9bb5]">→</span>
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-400">{t("hf.incoming")}</div>
              <div className="font-semibold text-[#13304d]">{userName(h.incomingId, lang)}</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-5 border-t border-[#eef2f7] pt-3 text-sm">
          <span className="text-slate-500"><b className="text-[#13304d]">{h.patientIds.length}</b> {t("hf.patients")}</span>
          <span className="text-slate-500"><b className="text-emerald-600">{reviewed + (accepted ? patients.length - reviewed : 0)}</b> {t("hf.completed")}</span>
          <span className="text-slate-500"><b className="text-red-600">{criticalCount}</b> {t("hf.critical")}</span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Patients with SBAR */}
        <div className="space-y-3 lg:col-span-2">
          <SectionTitle>{t("hf.patients")}</SectionTitle>
          {patients.map(({ patient, risk, insurance, plan }) => {
            const sbar = buildSbar(patient, risk, t, lang);
            const pending = plan.filter((s) => s.status !== "done");
            return (
              <Card key={patient.id} className="!p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Link href={`/patient/${patient.id}`} className="font-mono text-xs font-bold text-[#0e9bb5] hover:underline">
                      {patient.id}
                    </Link>
                    <span className="text-sm font-semibold text-[#13304d]">
                      {lang === "ar" ? patient.nameAr : patient.nameEn}
                    </span>
                  </div>
                  <RiskBadge level={risk.level} score={risk.score} />
                </div>

                <details className="mt-2.5 rounded-lg border border-[#eef2f7] bg-[#f8fafc] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-bold text-[#0e9bb5]">
                    {t("ho.sbarTitle")}
                  </summary>
                  <dl className="mt-2 space-y-1.5 text-xs">
                    {(["s", "b", "a", "r"] as const).map((k) => (
                      <div key={k}>
                        <dt className="font-bold text-slate-600">{t(`sbar.${k}`)}</dt>
                        <dd className="text-slate-500">{sbar[k]}</dd>
                      </div>
                    ))}
                  </dl>
                </details>

                <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-lg bg-[#f8fafc] border border-[#eef2f7] p-2">
                    <div className="font-bold text-slate-400">{t("hf.pendingIv")}</div>
                    <div className="mt-0.5 text-sm font-bold text-[#13304d]">{pending.length}</div>
                  </div>
                  <div className="rounded-lg bg-[#f8fafc] border border-[#eef2f7] p-2">
                    <div className="font-bold text-slate-400">{t("hf.insDocs")}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Meter pct={insurance.docCompleteness} className="!h-1.5 flex-1" />
                      <span className="font-mono text-xs font-bold text-[#13304d]">{insurance.docCompleteness}%</span>
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#f8fafc] border border-[#eef2f7] p-2">
                    <div className="font-bold text-slate-400">{t("common.exposure")}</div>
                    <div className="mt-0.5 font-mono text-sm font-bold text-red-600">
                      {fmtSar(insurance.exposureSar)}
                    </div>
                  </div>
                </div>

                {pending.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pending.slice(0, 3).map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700">
                        {t(`action.${s.actionKey}`)}
                        <IvStatusChip status={s.status} />
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* Sidebar: accept checklist + timeline */}
        <div className="space-y-4">
          <Card>
            <SectionTitle>{t("hf.checklistTitle")}</SectionTitle>
            <div className="space-y-2.5">
              {CHECKLIST.map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={checked.includes(k)}
                    onChange={() => toggleCheck(k)}
                    disabled={accepted}
                    className="h-4 w-4 accent-[#0e9bb5]"
                  />
                  {t(`hfc.${k}`)}
                </label>
              ))}
            </div>
            <button
              onClick={accept}
              disabled={!allChecked || accepted || !can("handoff_accept")}
              className={`mt-4 w-full rounded-lg py-2.5 text-sm font-bold transition-colors ${
                accepted
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : allChecked && can("handoff_accept")
                    ? "bg-[#13304d] text-white hover:bg-[#1b5fad]"
                    : "bg-[#f0f4f8] text-slate-400 cursor-not-allowed"
              }`}
            >
              {accepted ? `✓ ${t("hf.accepted")}` : t("hf.accept")}
            </button>
          </Card>

          <Card>
            <SectionTitle>{t("hf.timeline")}</SectionTitle>
            <ol className="relative space-y-3 border-s-2 border-[#d5dee9] ps-4">
              {timeline.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -start-[1.32rem] top-1 h-2.5 w-2.5 rounded-full bg-[#0e9bb5]" />
                  <div className="font-mono text-[11px] text-[#0e9bb5]">{e.t}</div>
                  <div className="text-sm text-slate-600">{t(e.key)}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
