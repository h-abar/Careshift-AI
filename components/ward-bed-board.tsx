"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/lib/i18n/provider";
import type { PatientSnapshot } from "@/lib/aggregate";
import type { Assignment, HandoffRecord } from "@/lib/types";
import { Card, SectionTitle } from "@/components/ui";

interface WardBedBoardProps {
  snaps: PatientSnapshot[];
  assignments: Assignment[];
  handoffs: HandoffRecord[];
  refetch: () => void;
}

export function WardBedBoard({ snaps, assignments, handoffs: _handoffs }: WardBedBoardProps) {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";

  // Map patient assignments
  const assignmentByPatient = useMemo(() => {
    return new Map(assignments.map((a) => [a.patientId, a]));
  }, [assignments]);

  // Compute workload per nurse
  const nurseWorkload = useMemo(() => {
    const map = new Map<string, { nurseId: string; patients: PatientSnapshot[]; criticalCount: number }>();

    for (const snap of snaps) {
      const a = assignmentByPatient.get(snap.patient.id);
      const nurseId = a?.nurseId ?? "unassigned";
      if (!map.has(nurseId)) {
        map.set(nurseId, { nurseId, patients: [], criticalCount: 0 });
      }
      const entry = map.get(nurseId)!;
      entry.patients.push(snap);
      if ((snap.priority?.news2 ?? 0) >= 5 || snap.risk.level === "critical") {
        entry.criticalCount += 1;
      }
    }
    return Array.from(map.values());
  }, [snaps, assignmentByPatient]);

  return (
    <div className="space-y-6">
      {/* ══ 1. Staff Workload Balance ══ */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle sub={isAr ? "موازنة أعداد المرضى ودرجات الخطورة لكل ممرض (المعيار الآمن: 4-6 مرضى)" : "Nurse-to-patient ratio & acuity distribution (Safe target: 4-6 patients)"}>
            {isAr ? "توازن عبء العمل التمريضي (Staff Workload Balance)" : "Staff Workload Balance"}
          </SectionTitle>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {nurseWorkload.map((w) => {
            const count = w.patients.length;
            const isBalanced = count >= 3 && count <= 6;
            const isHigh = count > 6;

            return (
              <div
                key={w.nurseId}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-all hover:bg-white hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 font-bold text-teal-800">
                      👩‍⚕️
                    </span>
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {w.nurseId === "s.ahmed" ? (isAr ? "سارة أحمد" : "Sara Ahmed") : w.nurseId}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {isAr ? "تمريض سريري" : "Ward Nurse"}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      isHigh
                        ? "bg-red-100 text-red-800 border border-red-200"
                        : isBalanced
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {isHigh ? (isAr ? "عبء مرتفع" : "High") : isBalanced ? (isAr ? "متوازن" : "Balanced") : (isAr ? "منخفض" : "Low")}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2.5 text-xs text-slate-600">
                  <span>
                    {isAr ? "المرضى المسندين" : "Patients"}: <b className="text-slate-900">{count}</b>
                  </span>
                  {w.criticalCount > 0 && (
                    <span className="font-semibold text-rose-600">
                      ⚠️ {w.criticalCount} {isAr ? "حالات حرجة" : "critical"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ══ 2. Ward Bed Map Grid ══ */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle sub={isAr ? "نظرة بصرية شاملة على أسرّة الجناح وحالة استقرار كل مريض ملونة حسب NEWS2" : "Visual layout of all ward beds colored by NEWS2 acuity"}>
            {isAr ? "خريطة أسرّة الجناح (Ward Bed Map)" : "Ward Bed Map"}
          </SectionTitle>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-md bg-emerald-500" /> {isAr ? "مستقر (0-4)" : "Stable"}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-md bg-amber-500" /> {isAr ? "عاجل (5-6)" : "Urgent"}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-md bg-red-600 animate-pulse" /> {isAr ? "طارئ (7+)" : "Emergency"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {snaps.map((snap) => {
            const p = snap.patient;
            const n2 = snap.priority?.news2 ?? 0;
            const isEmergency = n2 >= 7;
            const isUrgent = n2 >= 5 || (snap.priority?.maxSingle ?? 0) >= 3;

            return (
              <Link
                key={p.id}
                href={`/patient/${p.id}`}
                className={`group flex flex-col justify-between rounded-2xl border p-3.5 transition-all hover:scale-[1.02] hover:shadow-md ${
                  isEmergency
                    ? "border-red-400 bg-red-50 text-red-950 shadow-sm shadow-red-200 ring-2 ring-red-400/40"
                    : isUrgent
                      ? "border-amber-300 bg-amber-50 text-amber-950"
                      : "border-slate-200 bg-slate-50/50 hover:border-teal-500/50 hover:bg-white"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-white/80 px-2 py-0.5 font-mono text-xs font-bold text-slate-800 shadow-xs">
                      {isAr ? "غرفة" : "Rm"} {p.room}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-xs font-black ${
                        isEmergency
                          ? "bg-red-600 text-white animate-pulse"
                          : isUrgent
                            ? "bg-amber-500 text-white"
                            : "bg-emerald-600 text-white"
                      }`}
                    >
                      N2: {n2}
                    </span>
                  </div>

                  <div className="mt-2.5">
                    <div className="text-xs font-bold truncate text-slate-900">
                      {lang === "ar" ? p.nameAr : p.nameEn}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500 truncate">
                      {p.id} · {t(`dx.${p.dxKey}`)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 border-t border-slate-200/50 pt-2 text-[10px] text-slate-500 flex items-center justify-between">
                  <span>👩‍⚕️ {assignmentByPatient.get(p.id)?.nurseId ?? "—"}</span>
                  <span className="font-semibold group-hover:text-teal-700">→</span>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
