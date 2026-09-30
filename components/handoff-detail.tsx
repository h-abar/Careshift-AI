"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { patchJson, postJson, useHandoff } from "@/lib/api";
import { useToast } from "@/components/toast";
import { buildSbar } from "@/lib/engines/sbar";
import { fmtSar } from "@/lib/format";
import { Card, ErrorState, IvStatusChip, Loading, Meter, RiskBadge, SectionTitle, Skeleton } from "@/components/ui";
import type { HandoffStatus, Sbar } from "@/lib/types";

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
  signed_off: "bg-indigo-50 text-indigo-700 border-indigo-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  partial: "bg-orange-50 text-orange-700 border-orange-200",
  escalated: "bg-purple-50 text-purple-700 border-purple-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const EVENT_LABEL: Record<string, string> = {
  created: "hftl.created",
  reviewed: "hftl.criticalReviewed",
  checklist: "hftl.criticalReviewed",
  sbar: "ho.sbarTitle",
  signed_off: "hftl.signedOff",
  accepted: "hftl.accepted",
  rejected: "hftl.rejected",
};

export function HandoffDetail({ handoffId }: { handoffId: string }) {
  const { t, lang } = useI18n();
  const { user, can } = useAuth();
  const { data, loading, error, refetch } = useHandoff(handoffId);
  const toast = useToast();

  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (loading && !data) return <Skeleton rows={5} />;
  if (error && !data) return <ErrorState onRetry={refetch} />;
  if (!data || !user) return <Loading />;
  const { handoff: h, snaps, users } = data;
  const userName = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? (lang === "ar" ? u.nameAr : u.nameEn) : id;
  };

  const isManager = can("handoff_manage");
  const isOutgoing = user.id === h.outgoingId;
  const isIncoming = user.id === h.incomingId;
  const isPending = h.status === "pending";
  const isSignedOff = h.status === "signed_off";
  const isDone = h.status === "completed" || h.status === "accepted";
  const isRejected = h.status === "rejected";

  const allReviewed = h.patientIds.every((p) => h.reviewed[p]);
  const allChecked = CHECKLIST.every((k) => h.checklist.includes(k));
  const canAct = isPending && (isManager || isOutgoing || isIncoming);

  const call = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr("");
    fn()
      .then(() => {
        refetch();
        toast(t("common.saved"), "success");
      })
      .catch(async (e) => {
        try { setErr(JSON.parse(e.message).error ?? "error"); }
        catch { setErr("error"); }
        toast(t("common.failed"), "error");
      })
      .finally(() => setBusy(false));
  };

  const setReviewed = (pid: string, v: boolean) =>
    call(() => patchJson(`/api/handoffs/${h.id}`, { reviewed: { [pid]: v } }));
  const toggleCheck = (k: string) =>
    call(() =>
      patchJson(`/api/handoffs/${h.id}`, {
        checklist: h.checklist.includes(k)
          ? h.checklist.filter((x) => x !== k)
          : [...h.checklist, k],
      }),
    );
  const signoff = () => call(() => postJson(`/api/handoffs/${h.id}/signoff`, {}));
  const accept = () => call(() => postJson(`/api/handoffs/${h.id}/accept`, {}));
  const reject = () =>
    call(() => postJson(`/api/handoffs/${h.id}/reject`, { reason: rejectReason }));

  const patients = h.patientIds
    .map((pid) => snaps.find((s) => s.patient.id === pid))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const reviewed = Object.values(h.reviewed).filter(Boolean).length;
  const criticalCount = patients.filter(
    (s) => s.risk.level === "critical" || s.risk.level === "high",
  ).length;

  const sbarFor = (pid: string): Sbar | null => {
    const row = h.patients?.find((p) => p.patientId === pid);
    const perLang = row?.sbar as { ar?: Sbar; en?: Sbar } | undefined;
    if (perLang?.[lang]) return perLang[lang]!;
    if (perLang?.en) return perLang.en;
    const snap = patients.find((s) => s.patient.id === pid);
    return snap ? buildSbar(snap.patient, snap.risk, t, lang) : null;
  };

  const events = h.events ?? [];
  const legacyTimeline = h.timeline ?? [];

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
              <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${STATUS_STYLE[h.status]}`}>
                {t(`hfst.${h.status}`)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {t(`dept.${h.dept}`)} · {t(`hf.shift.${h.shift}`)} · {h.date}
            </p>
            {isRejected && h.rejectionReason && (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t("hf.rejectedBanner")} {h.rejectionReason}
              </p>
            )}
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-400">{t("hf.outgoing")}</div>
              <div className="font-semibold text-[#13304d]">{userName(h.outgoingId)}</div>
            </div>
            <span className="text-xl text-[#0e9bb5]">→</span>
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-400">{t("hf.incoming")}</div>
              <div className="font-semibold text-[#13304d]">{userName(h.incomingId)}</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-5 border-t border-[#eef2f7] pt-3 text-sm">
          <span className="text-slate-500"><b className="text-[#13304d]">{h.patientIds.length}</b> {t("hf.patients")}</span>
          <span className="text-slate-500"><b className="text-emerald-600">{reviewed}</b> {t("hf.completed")}</span>
          <span className="text-slate-500"><b className="text-red-600">{criticalCount}</b> {t("hf.critical")}</span>
        </div>
        {err && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Patients with SBAR */}
        <div className="space-y-3 lg:col-span-2">
          <SectionTitle>{t("hf.patients")}</SectionTitle>
          {patients.map(({ patient, risk, insurance, plan }) => {
            const sbar = sbarFor(patient.id);
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
                  <div className="flex items-center gap-2">
                    {canAct && (
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <input
                          type="checkbox"
                          checked={Boolean(h.reviewed[patient.id])}
                          onChange={(e) => setReviewed(patient.id, e.target.checked)}
                          disabled={busy}
                          className="h-3.5 w-3.5 accent-[#0e9bb5]"
                        />
                        {t("hf.completed")}
                      </label>
                    )}
                    <RiskBadge level={risk.level} score={risk.score} />
                  </div>
                </div>

                <details className="mt-2.5 rounded-lg border border-[#eef2f7] bg-[#f8fafc] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-bold text-[#0e9bb5]">
                    {t("ho.sbarTitle")}
                  </summary>
                  <dl className="mt-2 space-y-1.5 text-xs">
                    {(["s", "b", "a", "r"] as const).map((k) => (
                      <div key={k}>
                        <dt className="font-bold text-slate-600">{t(`sbar.${k}`)}</dt>
                        <dd className="text-slate-500">{sbar?.[k]}</dd>
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

        {/* Sidebar: checklist + actions + timeline */}
        <div className="space-y-4">
          <Card>
            <SectionTitle>{t("hf.checklistTitle")}</SectionTitle>
            <div className="space-y-2.5">
              {CHECKLIST.map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={h.checklist.includes(k)}
                    onChange={() => toggleCheck(k)}
                    disabled={!canAct || busy}
                    className="h-4 w-4 accent-[#0e9bb5]"
                  />
                  {t(`hfc.${k}`)}
                </label>
              ))}
            </div>

            {/* Workflow actions */}
            <div className="mt-4 space-y-2">
              {isPending && (isOutgoing || isManager) && (
                <button
                  onClick={signoff}
                  disabled={!allReviewed || !allChecked || busy}
                  className={`w-full rounded-lg py-2.5 text-sm font-bold transition-colors ${
                    allReviewed && allChecked
                      ? "bg-[#13304d] text-white hover:bg-[#1b5fad]"
                      : "bg-[#f0f4f8] text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {t("hf.signoff")}
                </button>
              )}

              {(isPending || isSignedOff) && (isIncoming || isManager) && (
                <div className="space-y-2">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t("hf.rejectReason")}
                    rows={2}
                    className="w-full rounded-lg border border-[#e2e9f2] bg-[#f8fafc] px-3 py-2 text-xs text-slate-700 focus:border-[#0e9bb5] focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={accept}
                      disabled={!isSignedOff || busy}
                      className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors ${
                        isSignedOff
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-[#f0f4f8] text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      {isDone ? `✓ ${t("hf.accepted")}` : t("hf.accept")}
                    </button>
                    <button
                      onClick={reject}
                      disabled={!rejectReason.trim() || busy}
                      className={`flex-1 rounded-lg border py-2.5 text-sm font-bold transition-colors ${
                        rejectReason.trim()
                          ? "border-red-300 text-red-600 hover:bg-red-50"
                          : "border-[#e2e9f2] text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      {t("hf.reject")}
                    </button>
                  </div>
                </div>
              )}

              {isDone && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 py-2.5 text-center text-sm font-bold text-emerald-700">
                  ✓ {t("hfst.completed")}
                </div>
              )}
              {isSignedOff && !isIncoming && !isManager && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 py-2.5 text-center text-xs font-semibold text-indigo-700">
                  {t("hf.signedOff")}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <SectionTitle>{t("hf.timeline")}</SectionTitle>
            <ol className="relative space-y-3 border-s-2 border-[#d5dee9] ps-4">
              {(events.length ? events : null)?.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -start-[1.32rem] top-1 h-2.5 w-2.5 rounded-full bg-[#0e9bb5]" />
                  <div className="font-mono text-[11px] text-[#0e9bb5]">
                    {new Date(e.createdAt).toTimeString().slice(0, 5)}
                  </div>
                  <div className="text-sm text-slate-600">
                    {t(EVENT_LABEL[e.action] ?? "hftl.created")}
                    {e.detail ? ` — ${e.detail}` : ""}
                    <span className="text-slate-400"> · {userName(e.actorId)}</span>
                  </div>
                </li>
              )) ??
                legacyTimeline.map((e, i) => (
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
