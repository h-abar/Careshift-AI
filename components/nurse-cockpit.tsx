"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import type { PatientSnapshot } from "@/lib/aggregate";
import type { Assignment, HandoffRecord } from "@/lib/types";
import { news2Score, news2Tier } from "@/lib/engines/priority";
import { useToast } from "@/components/toast";
import { Card, SectionTitle } from "@/components/ui";
import { StoryRibbon } from "@/components/story-ribbon";

interface NurseCockpitProps {
  snaps: PatientSnapshot[];
  assignments: Assignment[];
  handoffs: HandoffRecord[];
  refetch: () => void;
}

export function NurseCockpit({
  snaps,
  assignments,
  handoffs,
  refetch,
}: NurseCockpitProps) {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";
  const { user } = useAuth();
  const toast = useToast();

  // State for modals
  const [vitalsPatient, setVitalsPatient] = useState<PatientSnapshot | null>(null);
  const [escalatePatient, setEscalatePatient] = useState<PatientSnapshot | null>(null);
  const [completingStepId, setCompletingStepId] = useState<string | null>(null);

  // My assigned patients
  const myAssignedIds = useMemo(() => {
    if (!user) return new Set<string>();
    return new Set(
      assignments.filter((a) => a.nurseId === user.id).map((a) => a.patientId),
    );
  }, [assignments, user]);

  const myPatients = useMemo(() => {
    return snaps
      .filter((s) => myAssignedIds.has(s.patient.id))
      .sort((a, b) => (a.priority?.sortKey ?? 0) - (b.priority?.sortKey ?? 0));
  }, [snaps, myAssignedIds]);

  const criticalPatients = useMemo(() => {
    return myPatients.filter(
      (s) => (s.priority?.news2 ?? 0) >= 5 || s.risk.level === "critical" || s.risk.level === "high",
    );
  }, [myPatients]);

  // All open intervention steps for my patients
  const mySteps = useMemo(() => {
    return myPatients.flatMap((s) =>
      s.plan.map((st) => ({
        step: st,
        patient: s.patient,
        snap: s,
        isOverdue: (s.priority?.info.overdueTasks ?? 0) > 0 && st.status !== "done",
      })),
    );
  }, [myPatients]);

  const pendingSteps = useMemo(() => {
    return mySteps.filter((x) => x.step.status !== "done");
  }, [mySteps]);

  const overdueSteps = useMemo(() => {
    return pendingSteps.filter((x) => x.isOverdue || x.step.status === "overdue");
  }, [pendingSteps]);

  // Incoming I-PASS handoffs awaiting this nurse
  const incomingHandoffs = useMemo(() => {
    if (!user) return [];
    return handoffs.filter(
      (h) => h.incomingId === user.id && !["accepted", "completed", "rejected"].includes(h.status),
    );
  }, [handoffs, user]);

  // Quick Complete handler (one-tap execution)
  const handleQuickComplete = async (patientId: string, stepId: string, actionLabel: string) => {
    if (completingStepId) return;
    setCompletingStepId(stepId);
    try {
      const res = await fetch(`/api/interventions/${stepId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, status: "done" }),
      });
      if (!res.ok) {
        throw new Error("Failed to complete task");
      }
      toast(
        isAr
          ? `✅ تم توثيق تنفيذ «${actionLabel}» وتسجيل الحدث المشفر بنجاح`
          : `✅ Completed «${actionLabel}» & recorded hash-chained event`,
        "success",
      );
      refetch();
    } catch {
      toast(isAr ? "تعذر حفظ التوثيق — حاول مجدداً" : "Failed to record task completion", "error");
    } finally {
      setCompletingStepId(null);
    }
  };

  // Rooms list string
  const roomsStr = myPatients.map((s) => `${s.patient.room}`).join("، ");

  return (
    <div className="space-y-6">
      {/* Story Ribbon */}
      <StoryRibbon activeStep="alert" patientId="P-1042" patientName="نورة القحطاني" />

      {/* ══ 1. My Active Shift Bar ══ */}
      <div className="rounded-3xl border border-teal-500/20 bg-gradient-to-r from-[#0d2a4d] via-[#0b2440] to-[#081a2e] p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-500/20 border border-teal-400/30 text-2xl shadow-inner">
              👩‍⚕️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white">
                  {lang === "ar" ? user?.nameAr : user?.nameEn}
                </span>
                <span className="rounded-full bg-teal-400/20 border border-teal-400/30 px-2.5 py-0.5 text-xs font-semibold text-teal-300">
                  {isAr ? "تمريض سريري نشط" : "Active Ward Nurse"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                {isAr ? "الوردية النشطة" : "Active Shift"}: <span className="font-semibold text-white">{isAr ? "وردية النهار (07:00 - 19:00)" : "Day Shift (07:00 - 19:00)"}</span> ·{" "}
                {isAr ? "القسم" : "Ward"}: <span className="font-semibold text-teal-200">{t(`dept.${user?.dept ?? "icu"}`)}</span>
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
                <span>🛏️ {isAr ? "أسرّة ورديتي" : "Assigned Rooms"}:</span>
                <span className="font-semibold text-slate-200">{roomsStr || (isAr ? "لا توجد أسرّة محددة" : "None")}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center backdrop-blur-sm">
              <div className="text-[11px] text-slate-400">{isAr ? "مرضاي" : "My Patients"}</div>
              <div className="text-xl font-bold text-white">{myPatients.length}</div>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-center backdrop-blur-sm">
              <div className="text-[11px] text-rose-300">{isAr ? "حالات حرجة" : "Critical"}</div>
              <div className="text-xl font-bold text-rose-400">{criticalPatients.length}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center backdrop-blur-sm">
              <div className="text-[11px] text-slate-400">{isAr ? "مهام معلقة" : "Pending Tasks"}</div>
              <div className="text-xl font-bold text-cyan-300">{pendingSteps.length}</div>
            </div>
            <div className={`rounded-xl border px-4 py-2.5 text-center backdrop-blur-sm ${
              overdueSteps.length > 0
                ? "border-red-500/40 bg-red-500/20 text-red-200 animate-pulse"
                : "border-white/10 bg-white/5 text-slate-400"
            }`}>
              <div className="text-[11px] font-semibold">{isAr ? "مهام متأخرة" : "Overdue"}</div>
              <div className="text-xl font-bold text-red-400">{overdueSteps.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ 2. Incoming I-PASS Handoff Banner ══ */}
      {incomingHandoffs.length > 0 && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-50 p-4.5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <div className="text-sm font-bold text-amber-900">
                  {isAr ? "تسليم وردية I-PASS وارد بانتظار استلامك" : "Incoming I-PASS Handoff Awaiting Acceptance"}
                </div>
                <div className="text-xs text-amber-800">
                  {isAr
                    ? `لديك ${incomingHandoffs.length} تسليم وردية موجّه إليك بمعيار I-PASS يتطلب المراجعة والإقرار.`
                    : `You have ${incomingHandoffs.length} handoff(s) waiting for your sign-off and receipt.`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {incomingHandoffs.map((h) => (
                <Link
                  key={h.id}
                  href={`/handoffs/${h.id}`}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition-colors"
                >
                  {isAr ? "مراجعة واستلام I-PASS" : "Review I-PASS"} →
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ 3. Assigned Patients (with NEWS2 & Quick Actions) ══ */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle sub={isAr ? "مرتبة تلقائياً حسب درجة NEWS2 ومؤشرات الخطورة السريرية" : "Ordered by NEWS2 priority and risk signals"}>
            {isAr ? "مرضاي المسندين بالوردية" : "My Assigned Patients"} ({myPatients.length})
          </SectionTitle>
        </div>

        {myPatients.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            {isAr ? "لا يوجد مرضى مسندين إليك في هذه الوردية." : "No patients assigned to you on this shift."}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
            {myPatients.map((snap) => {
              const p = snap.patient;
              const n2 = snap.priority?.news2 ?? 0;
              const isUrgent = n2 >= 5 || snap.risk.level === "critical" || snap.risk.level === "high";
              const isEmergency = n2 >= 7;

              return (
                <div
                  key={p.id}
                  className={`flex flex-col justify-between rounded-2xl border p-4.5 transition-all ${
                    isEmergency
                      ? "border-red-300 bg-red-50/50 shadow-sm shadow-red-100 ring-2 ring-red-400/30"
                      : isUrgent
                        ? "border-amber-300 bg-amber-50/30"
                        : "border-slate-200 bg-white hover:border-teal-500/40"
                  }`}
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-slate-900">
                            {lang === "ar" ? p.nameAr : p.nameEn}
                          </span>
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                            {isAr ? "غرفة" : "Rm"} {p.room}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {p.id} · {t(`dx.${p.dxKey}`)}
                        </div>
                      </div>

                      {/* NEWS2 Score Badge */}
                      <div className="text-end">
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                            isEmergency
                              ? "bg-red-600 text-white animate-pulse"
                              : isUrgent
                                ? "bg-amber-500 text-white"
                                : "bg-emerald-600 text-white"
                          }`}
                        >
                          <span>NEWS2:</span>
                          <span className="font-mono text-sm">{n2}</span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {isEmergency
                            ? (isAr ? "طارئ (Emergency)" : "Emergency")
                            : isUrgent
                              ? (isAr ? "عاجل (Urgent)" : "Urgent")
                              : (isAr ? "مستقر (Routine)" : "Routine")}
                        </div>
                      </div>
                    </div>

                    {/* Vitals Summary Pill */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                      {p.vitals[p.vitals.length - 1] && (
                        <>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5">
                            HR: <b>{p.vitals[p.vitals.length - 1].hr}</b>
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5">
                            BP: <b>{p.vitals[p.vitals.length - 1].sbp}</b>
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5">
                            SpO2: <b>{p.vitals[p.vitals.length - 1].spo2}%</b>
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5">
                            RR: <b>{p.vitals[p.vitals.length - 1].rr}</b>
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5">
                            T: <b>{p.vitals[p.vitals.length - 1].temp}°C</b>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setVitalsPatient(snap)}
                        className="flex items-center gap-1.5 rounded-xl border border-teal-600 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100 transition-colors"
                      >
                        <span>📝</span>
                        <span>{isAr ? "تسجيل علامات حيوية" : "Quick Vitals"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEscalatePatient(snap)}
                        className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
                      >
                        <span>🚨</span>
                        <span>{isAr ? "تصعيد للطبيب" : "Escalate to Doctor"}</span>
                      </button>
                    </div>

                    <Link
                      href={`/patient/${p.id}`}
                      className="text-xs font-semibold text-slate-600 hover:text-teal-700 transition-colors"
                    >
                      {isAr ? "الملف الكامل" : "Chart"} →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ══ 4. Timeline Checklist (Tasks by Time with 1-Click Quick Complete) ══ */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <SectionTitle sub={isAr ? "مهام الوردية المجدولة زمنياً — التوثيق بنقرة واحدة يسجل فوراً في السجل المشفر" : "Scheduled shift tasks — 1-click execution writes to hash-chained events"}>
              {isAr ? "قائمة مهام الوردية (Timeline Checklist)" : "Shift Tasks Timeline"}
            </SectionTitle>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {pendingSteps.length} {isAr ? "مهمة معلقة" : "Pending Tasks"}
          </span>
        </div>

        {pendingSteps.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            {isAr ? "🎉 جميع مهام ورديتك مكتملة بنجاح!" : "All shift tasks completed!"}
          </div>
        ) : (
          <div className="space-y-2.5">
            {pendingSteps.map(({ step, patient, isOverdue }) => {
              const actionLabel = t(`action.${step.actionKey}`);
              const isBusy = completingStepId === step.id;

              return (
                <div
                  key={step.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3.5 transition-all ${
                    isOverdue || step.status === "overdue"
                      ? "border-red-300 bg-red-50/70"
                      : "border-slate-200 bg-slate-50/60 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold ${
                      isOverdue || step.status === "overdue"
                        ? "bg-red-200 text-red-800"
                        : "bg-teal-100 text-teal-800"
                    }`}>
                      {step.actionKey.includes("med") || step.actionKey.includes("abx") ? "💊" : step.actionKey.includes("lab") || step.actionKey.includes("blood") ? "🧪" : "🩺"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {actionLabel}
                        </span>
                        {(isOverdue || step.status === "overdue") && (
                          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            {isAr ? "متأخر (Overdue)" : "Overdue"}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">
                          {lang === "ar" ? patient.nameAr : patient.nameEn}
                        </span>{" "}
                        · {isAr ? "غرفة" : "Rm"} {patient.room} · {isAr ? "استحقاق خلال" : "Due in"}:{" "}
                        <span className="font-mono font-semibold text-slate-700">
                          {step.dueInMin || 15} {isAr ? "دقيقة" : "min"}
                        </span>
                        {" · "}
                        <span className="font-semibold text-cyan-800 bg-cyan-100/80 px-2 py-0.5 rounded text-[10px]">
                          {isAr ? "أمر من د. أحمد سالم 02:25" : "from Dr. Ahmed Salem 02:25"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 1-Tap Quick Complete Button */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleQuickComplete(patient.id, step.id, actionLabel)}
                      className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition-all active:scale-95 disabled:opacity-50 ${
                        isOverdue || step.status === "overdue"
                          ? "bg-red-600 hover:bg-red-700 shadow-red-500/20"
                          : "bg-teal-600 hover:bg-teal-700 shadow-teal-500/20"
                      }`}
                    >
                      {isBusy ? (
                        <span>{isAr ? "جارٍ التوثيق..." : "Documenting..."}</span>
                      ) : (
                        <>
                          <span>✓</span>
                          <span>{isAr ? "توثيق التنفيذ الآن" : "Quick Complete"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ══ Modal 1: Quick Vitals Entry Modal (Instant NEWS2 Calculation) ══ */}
      {vitalsPatient && (
        <QuickVitalsModal
          snap={vitalsPatient}
          isAr={isAr}
          onClose={() => setVitalsPatient(null)}
          onSuccess={() => {
            setVitalsPatient(null);
            refetch();
          }}
        />
      )}

      {/* ══ Modal 2: Escalate to Doctor Modal (Nurse Concern Mandatory Reason) ══ */}
      {escalatePatient && (
        <EscalateToDoctorModal
          snap={escalatePatient}
          isAr={isAr}
          onClose={() => setEscalatePatient(null)}
          onSuccess={() => {
            setEscalatePatient(null);
            refetch();
          }}
        />
      )}
      {/* ══ Floating + Vitals Action Button (G4) ══ */}
      <button
        type="button"
        onClick={() => setVitalsPatient(myPatients[0] ?? snaps[0] ?? null)}
        className="fixed bottom-6 start-6 z-40 flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-600 px-5 py-3.5 text-sm font-black text-white shadow-2xl hover:scale-105 hover:from-teal-500 hover:to-emerald-500 transition-all border border-white/20 active:scale-95 cursor-pointer ring-4 ring-teal-500/20"
      >
        <span className="text-xl">🫀</span>
        <span>{isAr ? "+ تسجيل علامات حيوية (NEWS2)" : "+ Record Vitals (NEWS2)"}</span>
      </button>
    </div>
  );
}

// ── Sub-Component: Quick Vitals Modal with Live Real-Time NEWS2 Preview ──
function QuickVitalsModal({
  snap,
  isAr,
  onClose,
  onSuccess,
}: {
  snap: PatientSnapshot;
  isAr: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const latest = snap.patient.vitals[snap.patient.vitals.length - 1];

  const [rr, setRr] = useState(latest?.rr ?? 18);
  const [spo2, setSpo2] = useState(latest?.spo2 ?? 98);
  const [o2, setO2] = useState<0 | 1>(0); // 0 = air, 1 = oxygen
  const [sbp, setSbp] = useState(latest?.sbp ?? 120);
  const [hr, setHr] = useState(latest?.hr ?? 75);
  const [conscious, setConscious] = useState<0 | 3>(0); // 0 = Alert, 3 = Confusion/Voice/Pain/Unresponsive
  const [temp, setTemp] = useState(latest?.temp ?? 37.0);
  const [submitting, setSubmitting] = useState(false);

  // Live real-time NEWS2 calculation
  const { score: computedScore, maxSingle } = useMemo(() => {
    return news2Score({
      rr: Number(rr) || 0,
      spo2: Number(spo2) || 0,
      o2,
      sbp: Number(sbp) || 0,
      hr: Number(hr) || 0,
      conscious,
      temp: Number(temp) || 0,
    });
  }, [rr, spo2, o2, sbp, hr, conscious, temp]);

  const tier = news2Tier(computedScore, maxSingle);
  void tier;
  const isEmergency = computedScore >= 7;
  const isUrgent = computedScore >= 5 || maxSingle >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const newVitalsList = [
        ...snap.patient.vitals,
        {
          t: timeStr,
          rr: Number(rr),
          spo2: Number(spo2),
          o2,
          sbp: Number(sbp),
          hr: Number(hr),
          conscious,
          temp: Number(temp),
        },
      ];

      const res = await fetch(`/api/patients/${snap.patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vitals: newVitalsList }),
      });

      if (!res.ok) {
        throw new Error("Failed to save vitals");
      }

      const resJson = await res.json();
      if (resJson.crossedUp || isUrgent || isEmergency) {
        toast(
          isAr
            ? `⚠️ تم تسجيل العلامات وحساب NEWS2 = ${computedScore} — تم إشعار الطبيب المعالج تلقائياً: د. أحمد سالم (فتح تكليف عاجل)`
            : `⚠️ Recorded vitals: NEWS2 = ${computedScore} — Doctor notified: Dr. Ahmed Salem (Urgent Decision Task opened)`,
          "error",
        );
      } else {
        toast(
          isAr
            ? `✅ تم تسجيل العلامات الحيوية وحساب NEWS2 = ${computedScore}`
            : `✅ Vitals recorded: NEWS2 = ${computedScore}`,
          "success",
        );
      }
      onSuccess();
    } catch {
      toast(isAr ? "تعذر حفظ العلامات الحيوية" : "Failed to record vitals", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              📝 {isAr ? "تسجيل العلامات الحيوية وحساب NEWS2" : "Quick Vitals Entry & NEWS2"}
            </h3>
            <p className="text-xs text-slate-500">
              {snap.patient.nameAr} · {isAr ? "غرفة" : "Room"} {snap.patient.room}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Live NEWS2 Gauge Banner */}
          <div
            className={`rounded-2xl border p-4 text-center transition-all ${
              isEmergency
                ? "border-red-400 bg-red-50 text-red-900 ring-2 ring-red-400/40"
                : isUrgent
                  ? "border-amber-400 bg-amber-50 text-amber-900"
                  : "border-emerald-300 bg-emerald-50 text-emerald-900"
            }`}
          >
            <div className="text-xs font-semibold uppercase tracking-wider">
              {isAr ? "حساب NEWS2 اللحظي المباشر" : "Instant NEWS2 Real-Time Calculation"}
            </div>
            <div className="mt-1 flex items-baseline justify-center gap-2">
              <span className="font-mono text-4xl font-black">{computedScore}</span>
              <span className="text-sm font-bold">
                {isEmergency
                  ? (isAr ? "· طارئ (Tier 3: Emergency)" : "· Tier 3: Emergency")
                  : isUrgent
                    ? (isAr ? "· عاجل (Tier 2: Urgent)" : "· Tier 2: Urgent")
                    : (isAr ? "· روتيني / مستقر (Tier 0-1: Routine)" : "· Tier 0-1: Routine")}
              </span>
            </div>

            {(isEmergency || isUrgent) && (
              <div className="mt-2 text-xs font-semibold text-red-700 bg-red-100/70 rounded-lg py-1 px-2.5">
                ⚠️ {isAr
                  ? "تنبيه حرج: يتجاوز عتبة الأمان السريري؛ سيتم فتح تكليف طبي عاجل للطبيب المعالج (E6 Doctor Task) تلقائياً فور الحفظ."
                  : "Critical Alert: Crosses clinical threshold; will open Doctor Action Task upon submit."}
              </div>
            )}
          </div>

          {/* Form Inputs Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Respiratory Rate */}
            <div>
              <label className="block text-xs font-bold text-slate-700">
                {isAr ? "معدل التنفس (RR)" : "Resp Rate (RR)"}
              </label>
              <input
                type="number"
                value={rr}
                onChange={(e) => setRr(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                required
              />
              <span className="text-[10px] text-slate-400">breaths/min</span>
            </div>

            {/* SpO2 */}
            <div>
              <label className="block text-xs font-bold text-slate-700">
                {isAr ? "تشبع الأكسجين (SpO2)" : "SpO2 (%)"}
              </label>
              <input
                type="number"
                value={spo2}
                onChange={(e) => setSpo2(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                required
              />
              <span className="text-[10px] text-slate-400">%</span>
            </div>

            {/* O2 Therapy */}
            <div>
              <label className="block text-xs font-bold text-slate-700">
                {isAr ? "الأكسجين (O2)" : "Oxygen"}
              </label>
              <div className="mt-1 flex rounded-xl border border-slate-300 p-0.5 bg-slate-50 text-xs">
                <button
                  type="button"
                  onClick={() => setO2(0)}
                  className={`flex-1 rounded-lg py-1.5 font-bold transition-colors ${
                    o2 === 0 ? "bg-white text-teal-800 shadow-sm" : "text-slate-500"
                  }`}
                >
                  {isAr ? "هواء" : "Air"}
                </button>
                <button
                  type="button"
                  onClick={() => setO2(1)}
                  className={`flex-1 rounded-lg py-1.5 font-bold transition-colors ${
                    o2 === 1 ? "bg-teal-600 text-white shadow-sm" : "text-slate-500"
                  }`}
                >
                  {isAr ? "أكسجين" : "O2"}
                </button>
              </div>
              <span className="text-[10px] text-slate-400">+2 pts if on O2</span>
            </div>

            {/* SBP */}
            <div>
              <label className="block text-xs font-bold text-slate-700">
                {isAr ? "الضغط الانقباضي (SBP)" : "Systolic BP (SBP)"}
              </label>
              <input
                type="number"
                value={sbp}
                onChange={(e) => setSbp(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                required
              />
              <span className="text-[10px] text-slate-400">mmHg</span>
            </div>

            {/* Heart Rate */}
            <div>
              <label className="block text-xs font-bold text-slate-700">
                {isAr ? "النبض (HR)" : "Heart Rate (HR)"}
              </label>
              <input
                type="number"
                value={hr}
                onChange={(e) => setHr(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                required
              />
              <span className="text-[10px] text-slate-400">bpm</span>
            </div>

            {/* Temperature */}
            <div>
              <label className="block text-xs font-bold text-slate-700">
                {isAr ? "الحرارة (Temp)" : "Temp (°C)"}
              </label>
              <input
                type="number"
                step="0.1"
                value={temp}
                onChange={(e) => setTemp(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                required
              />
              <span className="text-[10px] text-slate-400">°C</span>
            </div>
          </div>

          {/* ACVPU Consciousness */}
          <div>
            <label className="block text-xs font-bold text-slate-700">
              {isAr ? "مستوى الوعي (Consciousness / ACVPU)" : "Consciousness (ACVPU)"}
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setConscious(0)}
                className={`rounded-xl border p-2.5 text-start font-semibold transition-colors ${
                  conscious === 0
                    ? "border-teal-600 bg-teal-50 text-teal-900 ring-2 ring-teal-500/20"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className="font-bold">A · {isAr ? "مستيقظ وواعٍ (Alert)" : "Alert"}</div>
                <div className="text-[10px] text-slate-500">{isAr ? "وعي طبيعي كامل" : "Normal mentation (0 pts)"}</div>
              </button>
              <button
                type="button"
                onClick={() => setConscious(3)}
                className={`rounded-xl border p-2.5 text-start font-semibold transition-colors ${
                  conscious === 3
                    ? "border-red-500 bg-red-50 text-red-900 ring-2 ring-red-500/20"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className="font-bold text-red-700">CVPU · {isAr ? "ارتباك أو استجابة غير طبيعية" : "Altered / CVPU"}</div>
                <div className="text-[10px] text-slate-500">{isAr ? "تشوش جديد / ألم / فاقد الوعي" : "New confusion / Voice / Pain / Unresp (+3 pts)"}</div>
              </button>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-teal-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-teal-700 disabled:opacity-50"
            >
              {submitting ? (isAr ? "جارٍ الحفظ والتقييم..." : "Saving & Evaluating...") : (isAr ? "حفظ القراءات وإصدار التقييم" : "Save & Reassess")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sub-Component: Escalate to Doctor Modal (Mandatory Nurse Concern) ──
function EscalateToDoctorModal({
  snap,
  isAr,
  onClose,
  onSuccess,
}: {
  snap: PatientSnapshot;
  isAr: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [category, setCategory] = useState("respiratory");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const CONCERN_CATEGORIES = [
    { key: "respiratory", ar: "صعوبة أو تسارع تنفس", en: "Respiratory difficulty / Tachypnea" },
    { key: "hemodynamic", ar: "انخفاض ضغط / تسارع نبض غير مستقر", en: "Hemodynamic instability / Tachycardia" },
    { key: "neurological", ar: "تغير في مستوى الوعي أو استجابة المريض", en: "Altered mentation / Neurological" },
    { key: "pain", ar: "ألم حاد مفاجئ غير مستجيب للمسكنات", en: "Severe sudden refractory pain" },
    { key: "clinical_concern", ar: "قلق سريري حدسي من تدهور وشيك (Nurse Concern)", en: "Clinical intuition / Impending deterioration" },
    { key: "general", ar: "أخرى (يرجى التوضيح)", en: "Other clinical concern" },
  ];

  const handleEscalate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast(isAr ? "يرجى كتابة سبب القلق السريري للتصعيد" : "Please provide concern details", "error");
      return;
    }
    setSubmitting(true);

    try {
      const res = await fetch("/api/doctor-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: snap.patient.id,
          category,
          reason,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to escalate");
      }

      toast(
        isAr
          ? `🚨 تم تصعيد الحالة للطبيب المعالج وفتح تكليف طارئ بنجاح!`
          : `🚨 Escalated to physician: Critical Doctor Task opened!`,
        "success",
      );
      onSuccess();
    } catch {
      toast(isAr ? "تعذر إرسال التصعيد للطبيب" : "Failed to escalate to doctor", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="text-lg font-bold text-rose-700 flex items-center gap-2">
              <span>🚨</span>
              <span>{isAr ? "تصعيد سريري للطبيب المعالج (Nurse Concern)" : "Escalate to Physician"}</span>
            </h3>
            <p className="text-xs text-slate-500">
              {snap.patient.nameAr} · {isAr ? "غرفة" : "Room"} {snap.patient.room}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleEscalate} className="mt-4 space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            ℹ️ {isAr
              ? "سيقوم هذا الإجراء بفتح تكليف طبي فوري عالي الأولوية (Doctor Action Task) في شاشة الطبيب مع تشغيل عداد سلم التصعيد (Escalation Ladder)."
              : "This action will immediately open a critical Doctor Action Task on the physician's console with a response timer."}
          </div>

          {/* Category Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700">
              {isAr ? "تصنيف سبب القلق السريري (إلزامي)" : "Clinical Concern Category (Mandatory)"}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs font-medium focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            >
              {CONCERN_CATEGORIES.map((cat) => (
                <option key={cat.key} value={cat.key}>
                  {isAr ? cat.ar : cat.en}
                </option>
              ))}
            </select>
          </div>

          {/* Reason Text */}
          <div>
            <label className="block text-xs font-bold text-slate-700">
              {isAr ? "وصف الملاحظات السريرية وسبب القلق (إلزامي)" : "Detailed Clinical Observation (Mandatory)"}
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isAr ? "اكتب هنا تفاصيل حالة المريض والأعراض التي لاحظتها وتستدعي تدخل الطبيب..." : "Describe patient symptoms and reasons for escalation..."}
              className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-xs font-medium focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              required
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-rose-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50"
            >
              {submitting ? (isAr ? "جارٍ إرسال الإنذار..." : "Escalating...") : (isAr ? "إرسال التصعيد للطبيب فوراً" : "Send Urgent Escalation")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
