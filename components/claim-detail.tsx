"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { patchJson, postJson, useApi } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/ui";
import { DENIAL_CODES } from "@/lib/denial";
import { ClaimLines } from "@/components/claim-lines";
import { EVIDENCE_KEYS } from "@/lib/data/claims";
import type { Claim, ClaimStatus } from "@/lib/types";

interface ClaimDetailData {
  claim: Claim & { denialCode?: string | null };
  readiness: { score: number; checklist: { key: string; ok: boolean }[] } | null;
  documents: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  }[];
  events: {
    id: string;
    action: string;
    detail: string;
    createdAt: string;
    actorId: string;
  }[];
}

const NEXT_STATUS: Record<ClaimStatus, ClaimStatus[]> = {
  pending: ["review", "approved", "denied"],
  review: ["approved", "denied"],
  denied: ["review"],
  approved: [],
};

/**
 * Expandable claim panel. E4 splits capabilities to match the server:
 * - payer_claims  → adjudication only: accept / deny with coded reason.
 * - appeal_approve → hospital side: appeal/resubmit + evidence upload.
 * There is no internal "submit claim" button — assembly/submission is
 * automatic (E7); hospital_admin monitors and fixes exceptions.
 */
export function ClaimDetail({
  claim,
  onChanged,
}: {
  claim: Claim & { denialCode?: string | null };
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { can } = useAuth();
  const canAdjudicate = can("payer_claims");
  const canFixEvidence = can("appeal_approve");
  const [open, setOpen] = useState(false);
  const [pendingDenied, setPendingDenied] = useState(false);
  const [denialCode, setDenialCode] = useState("");
  const [appealMode, setAppealMode] = useState<"appeal" | "resubmit" | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("");
  const { data: detail, error: detailErr, refetch } = useApi<ClaimDetailData>(
    open ? `/api/claims/${claim.id}` : null,
    [claim.id, open],
  );
  // C6 — appeal evidence for denied claims (existing events only)
  const { data: appealEv } = useApi<{
    code: string | null; codeLabel: string | null;
    missingEventTypes: string[];
    answeringEvents: { id: string; type: string; occurredAt: string }[];
  }>(
    open && claim.status === "denied"
      ? `/api/claims/${claim.id}/appeal-evidence`
      : null,
    [claim.id, open, claim.status],
  );

  const run = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
      setPendingDenied(false);
      setAppealMode(null);
      setReason("");
      await refetch();
      onChanged();
      toast(t("common.saved"), "success");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      toast(t("common.failed"), "error");
    }
  };

  const changeStatus = (status: ClaimStatus) =>
    run(() =>
      patchJson(`/api/claims/${claim.id}`, {
        status,
        ...(status === "denied" ? { denialCode } : {}),
      }),
    );

  const upload = (f: File) =>
    run(async () => {
      const fd = new FormData();
      fd.append("file", f);
      if (kind) fd.append("kind", kind);
      const r = await fetch(`/api/claims/${claim.id}/documents`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok)
        throw new Error(
          (await r.json().catch(() => ({})))?.error ?? `${r.status}`,
        );
    });

  const inputCls =
    "rounded-md border border-[#e2e9f2] bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-600";
  const btnCls =
    "rounded-lg border px-2.5 py-1 text-xs font-semibold";

  return (
    <div className="mt-3 border-t border-[#e2e9f2] pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-semibold text-[#0b7a8d] hover:underline"
      >
        {open ? "▾" : "▸"} {t("claim.detail")}
      </button>
      {claim.denialCode && (
        <span className="ms-3 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] text-red-700">
          {t(`deny.${claim.denialCode}`)}
        </span>
      )}
      {claim.nphiesCode && (
        <span className="ms-2 rounded-full bg-slate-100 border border-slate-300 px-2 py-0.5 font-mono text-[10px] text-slate-700">
          {t("claim.nphiesCode")}: {claim.nphiesCode}
        </span>
      )}
      {err && <span className="ms-3 text-[11px] text-red-600">{err}</span>}

      {!open ? null : detailErr ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-xs text-red-600">{t("common.loadError")}</span>
          <button
            onClick={() => refetch()}
            className="text-xs font-semibold text-[#0b7a8d] hover:underline"
          >
            {t("common.retry")}
          </button>
        </div>
      ) : !detail ? (
        <Skeleton rows={3} className="mt-2" />
      ) : (
        <div className="mt-3 space-y-3">
          {/* lifecycle actions — payer adjudicates; hospital appeals */}
          {(canAdjudicate || canFixEvidence) && (
            <div className="flex flex-wrap items-center gap-2">
              {canAdjudicate && (!pendingDenied ? (
                <select
                  value={claim.status}
                  title={t("claim.changeStatus")}
                  onChange={(e) => {
                    const v = e.target.value as ClaimStatus;
                    if (v === "denied") setPendingDenied(true);
                    else if (v !== claim.status) changeStatus(v);
                  }}
                  className={inputCls}
                >
                  <option value={claim.status}>
                    {t(`claim.${claim.status}`)}
                  </option>
                  {(NEXT_STATUS[claim.status] ?? []).map((s) => (
                    <option key={s} value={s}>
                      → {t(`claim.${s}`)}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <select
                    value={denialCode}
                    title={t("claim.denialCode")}
                    onChange={(e) => setDenialCode(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{t("claim.selectDenial")}</option>
                    {DENIAL_CODES.map((c) => (
                      <option key={c} value={c}>
                        {t(`deny.${c}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!denialCode}
                    onClick={() => changeStatus("denied")}
                    className={`${btnCls} bg-red-50 border-red-200 text-red-700 disabled:opacity-40`}
                  >
                    {t("claim.denied")}
                  </button>
                  <button
                    onClick={() => setPendingDenied(false)}
                    className={`${btnCls} border-[#e2e9f2] text-slate-600`}
                  >
                    {t("usr.cancel")}
                  </button>
                </>
              ))}
              {canFixEvidence && claim.status === "denied" && (
                <>
                  <button
                    onClick={() => setAppealMode("appeal")}
                    className={`${btnCls} bg-amber-50 border-amber-200 text-amber-700`}
                  >
                    {t("claim.appeal")}
                  </button>
                  <button
                    onClick={() => setAppealMode("resubmit")}
                    className={`${btnCls} bg-sky-50 border-sky-200 text-sky-700`}
                  >
                    {t("claim.resubmit")}
                  </button>
                </>
              )}
            </div>
          )}

          {/* C6 — what events answer the denial code */}
          {appealEv?.code && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px]">
              <span className="font-semibold text-amber-900">
                {t("claim.appealEvidence")}: {appealEv.code}
                {appealEv.codeLabel ? ` — ${appealEv.codeLabel}` : ""}
              </span>
              <p className="mt-1 text-slate-700">
                {t("claim.evidenceFound")}: {appealEv.answeringEvents.length}
                {appealEv.missingEventTypes.length > 0 &&
                  ` · ${t("claim.missingEvidence")}: ${appealEv.missingEventTypes.map((mt) => t(`ev.t.${mt}`)).join(", ")}`}
              </p>
            </div>
          )}

          {appealMode && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label={t("claim.appealReason")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t(
                  appealMode === "appeal"
                    ? "claim.appealReason"
                    : "claim.resubmitNote",
                )}
                className={`${inputCls} min-w-56 flex-1`}
              />
              <button
                disabled={!reason.trim()}
                onClick={() =>
                  run(() =>
                    postJson(`/api/claims/${claim.id}/${appealMode}`, {
                      [appealMode === "appeal" ? "reason" : "note"]: reason,
                      ...(appealMode === "appeal" && appealEv
                        ? { eventIds: appealEv.answeringEvents.map((e) => e.id) }
                        : {}),
                    }),
                  )
                }
                className={`${btnCls} bg-[#0e9bb5]/10 border-[#0e9bb5]/30 text-[#075e6e] disabled:opacity-40`}
              >
                {t(appealMode === "appeal" ? "claim.appeal" : "claim.resubmit")}
              </button>
              <button
                onClick={() => setAppealMode(null)}
                className={`${btnCls} border-[#e2e9f2] text-slate-600`}
              >
                {t("usr.cancel")}
              </button>
            </div>
          )}

          {/* C3 — event-backed claim lines */}
          <ClaimLines claimId={claim.id} canEdit={canFixEvidence} />

          {/* documents */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-600">
                {t("claim.documents")} ({detail.documents.length})
              </span>
              {canFixEvidence && (
                <span className="flex items-center gap-2">
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                    title={t("claim.evidenceKind")}
                    className={inputCls}
                  >
                    <option value="">{t("claim.evidenceKind")}</option>
                    {EVIDENCE_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {t(`ev.${k}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className={`${btnCls} bg-[#0e9bb5]/10 border-[#0e9bb5]/30 text-[#075e6e]`}
                  >
                    {t("claim.upload")}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                      e.target.value = "";
                    }}
                  />
                </span>
              )}
            </div>
            {detail.documents.map((d) => (
              <a
                key={d.id}
                href={`/api/documents/${d.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md border border-[#e2e9f2] bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:border-[#0e9bb5]/40"
              >
                <span className="truncate">{d.fileName}</span>
                <span className="ms-2 shrink-0 font-mono text-[10px] text-slate-600">
                  {Math.ceil(d.sizeBytes / 1024)} KB
                </span>
              </a>
            ))}
            {detail.documents.length === 0 && (
              <p className="text-[11px] text-slate-600">—</p>
            )}
          </div>

          {/* history */}
          <div>
            <span className="text-[11px] font-semibold text-slate-600">
              {t("claim.history")}
            </span>
            <ul className="mt-1 space-y-1">
              {detail.events.map((e) => (
                <li
                  key={e.id}
                  className="flex items-baseline gap-2 text-[11px] text-slate-600"
                >
                  <span className="font-mono text-[10px] text-slate-600">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                  <span className="font-semibold text-[#13304d]">
                    {e.action}
                  </span>
                  <span className="truncate">{e.detail}</span>
                </li>
              ))}
              {detail.events.length === 0 && (
                <li className="text-[11px] text-slate-600">—</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
