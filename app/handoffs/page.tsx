"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { postJson, useHandoffs, useSnapshots } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Card, Empty, ErrorState, Loading, Modal, Skeleton, RiskBadge, SectionTitle } from "@/components/ui";
import type { HandoffStatus, StaffPicker } from "@/lib/types";

type SafeUser = StaffPicker;

const STATUS_STYLE: Record<HandoffStatus, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-sky-50 text-sky-700 border-sky-200",
  signed_off: "bg-indigo-50 text-indigo-700 border-indigo-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  partial: "bg-orange-50 text-orange-700 border-orange-200",
  escalated: "bg-purple-50 text-purple-700 border-purple-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function HandoffsPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const [wizard, setWizard] = useState(false);
  const { data, loading, error, refetch } = useHandoffs();
  const { data: snapData } = useSnapshots();
  const snaps = snapData?.snaps ?? [];
  const riskOf = (pid: string) => snaps.find((s) => s.patient.id === pid)?.risk;

  if (!can("handoff_view"))
    return <p className="py-20 text-center text-slate-500">{t("common.noAccess")}</p>;
  if (loading && !data) return <Skeleton rows={4} />;
  if (error && !data) return <ErrorState onRetry={refetch} />;
  if (!data || !snapData) return <Loading />;
  const userName = (id: string) => {
    const u = data.users.find((x) => x.id === id);
    return u ? (lang === "ar" ? u.nameAr : u.nameEn) : id;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle sub={t("ho.subtitle")}>{t("hf.title")}</SectionTitle>
        {can("handoff_manage") && (
          <button
            onClick={() => setWizard(true)}
            className="rounded-lg bg-[#13304d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b5fad] transition-colors"
          >
            + {t("hf.create")}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {data.handoffs.length === 0 && <Empty />}
        {data.handoffs.map((h) => {
          const reviewed = Object.values(h.reviewed).filter(Boolean).length;
          const criticalCount = h.patientIds.filter(
            (pid) => riskOf(pid)?.level === "critical" || riskOf(pid)?.level === "high",
          ).length;
          return (
            <Link key={h.id} href={`/handoffs/${h.id}`}>
              <Card className="!p-4 hover:border-[#0e9bb5]/40 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm font-bold text-[#0e9bb5]">{h.id}</span>
                    <div>
                      <div className="text-sm font-semibold text-[#13304d]">
                        {t(`dept.${h.dept}`)} · {t(`hf.shift.${h.shift}`)} · {h.date}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {t("hf.outgoing")}: {userName(h.outgoingId)}
                        <span className="mx-2 text-[#0e9bb5]">→</span>
                        {t("hf.incoming")}: {userName(h.incomingId)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span><b className="text-[#13304d]">{h.patientIds.length}</b> {t("hf.patients")}</span>
                      <span><b className="text-emerald-600">{reviewed}</b> {t("hf.completed")}</span>
                      {criticalCount > 0 && (
                        <span><b className="text-red-600">{criticalCount}</b> {t("hf.critical")}</span>
                      )}
                    </div>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[h.status]}`}>
                      {t(`hfst.${h.status}`)}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {wizard && (
        <HandoffWizard
          users={data.users}
          onClose={() => {
            setWizard(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

/* ── 3-step creation wizard ── */
function HandoffWizard({
  users,
  onClose,
}: {
  users: SafeUser[];
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [dept, setDept] = useState("icu");
  const [shift, setShift] = useState<"day" | "night">("day");
  const [outgoing, setOutgoing] = useState("");
  const [incoming, setIncoming] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: snapData } = useSnapshots();
  const snaps = snapData?.snaps ?? [];
  const suggested = new Set(
    snaps.filter((s) => s.risk.level !== "low").map((s) => s.patient.id),
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const staff = users.filter((u) =>
    ["physician", "nurse", "charge_nurse"].includes(u.role),
  );
  const select =
    "w-full rounded-lg border border-[#e2e9f2] bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#0e9bb5]/50";

  return (
    <Modal title={t("hf.wizard")} onClose={onClose} className="max-w-lg !p-0">
      <div>
        <div className="border-b border-[#eef2f7] px-5 py-4">
          <h3 className="font-bold text-[#13304d]">{t("hf.wizard")}</h3>
          <div className="mt-2 flex gap-1.5">
            {[t("hf.step1"), t("hf.step2"), t("hf.step3")].map((s, i) => (
              <span
                key={s}
                className={`flex-1 rounded-full py-1 text-center text-[11px] font-semibold ${
                  i === step
                    ? "bg-[#0e9bb5] text-white"
                    : i < step
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-[#f0f4f8] text-slate-500"
                }`}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto p-5">
          {done ? (
            <p className="py-8 text-center text-sm font-semibold text-emerald-600">
              ✓ {t("hf.created")}
            </p>
          ) : step === 0 ? (
            <>
              <label className="block text-xs font-semibold text-slate-500">{t("hf.selectDept")}</label>
              <select aria-label={t("hf.selectDept")} value={dept} onChange={(e) => setDept(e.target.value)} className={select}>
                {["icu", "er", "medical", "surgical"].map((d) => (
                  <option key={d} value={d}>{t(`dept.${d}`)}</option>
                ))}
              </select>
              <label className="block text-xs font-semibold text-slate-500">{t("hf.selectShift")}</label>
              <div className="flex gap-2">
                {(["day", "night"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setShift(s)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium ${
                      shift === s
                        ? "border-[#0e9bb5] bg-[#0e9bb5]/10 text-[#0e9bb5]"
                        : "border-[#e2e9f2] text-slate-500"
                    }`}
                  >
                    {t(`hf.shift.${s}`)}
                  </button>
                ))}
              </div>
            </>
          ) : step === 1 ? (
            <>
              <label className="block text-xs font-semibold text-slate-500">{t("hf.selectOutgoing")}</label>
              <select aria-label={t("hf.selectOutgoing")} value={outgoing} onChange={(e) => setOutgoing(e.target.value)} className={select}>
                <option value="">—</option>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {lang === "ar" ? u.nameAr : u.nameEn} · {t(`userRole.${u.role}`)}
                  </option>
                ))}
              </select>
              <label className="block text-xs font-semibold text-slate-500">{t("hf.selectIncoming")}</label>
              <select aria-label={t("hf.selectIncoming")} value={incoming} onChange={(e) => setIncoming(e.target.value)} className={select}>
                <option value="">—</option>
                {staff.filter((u) => u.id !== outgoing).map((u) => (
                  <option key={u.id} value={u.id}>
                    {lang === "ar" ? u.nameAr : u.nameEn} · {t(`userRole.${u.role}`)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                {t("hf.suggested")}: {suggested.size}
              </p>
              <div className="space-y-1.5">
                {snaps.map((s) => (
                  <label
                    key={s.patient.id}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 ${
                      selected.has(s.patient.id)
                        ? "border-[#0e9bb5] bg-[#0e9bb5]/5"
                        : "border-[#e2e9f2]"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        aria-label={s.patient.id}
                        checked={selected.has(s.patient.id)}
                        onChange={() => toggle(s.patient.id)}
                        className="accent-[#0e9bb5]"
                      />
                      <span className="font-mono text-xs text-slate-500">{s.patient.id}</span>
                      <span className="text-sm text-slate-700">
                        {lang === "ar" ? s.patient.nameAr : s.patient.nameEn}
                      </span>
                      {suggested.has(s.patient.id) && (
                        <span className="rounded bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700">
                          {t("hf.suggested")}
                        </span>
                      )}
                    </span>
                    <RiskBadge level={s.risk.level} score={s.risk.score} />
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-between border-t border-[#eef2f7] px-5 py-3.5">
          {done ? (
            <button onClick={onClose} className="ms-auto rounded-lg bg-[#13304d] px-4 py-2 text-sm font-semibold text-white">
              ✓
            </button>
          ) : (
            <>
              <button
                onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
                className="rounded-lg border border-[#e2e9f2] px-4 py-2 text-sm text-slate-600"
              >
                {t("hf.back")}
              </button>
              <button
                disabled={saving || (step === 2 && (!outgoing || !incoming || selected.size === 0))}
                onClick={() => {
                  if (step < 2) return setStep(step + 1);
                  setSaving(true);
                  postJson("/api/handoffs/create", {
                    dept,
                    shift,
                    outgoingId: outgoing,
                    incomingId: incoming,
                    patientIds: [...selected],
                  })
                    .then(() => setDone(true))
                    .catch(() => toast(t("common.failed"), "error"))
                    .finally(() => setSaving(false));
                }}
                className="rounded-lg bg-[#13304d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b5fad] disabled:opacity-50"
              >
                {step < 2 ? t("hf.next") : saving ? "…" : t("hf.createBtn")}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
