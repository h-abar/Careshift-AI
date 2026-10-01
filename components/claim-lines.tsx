"use client";

/**
 * C3 — claim lines assembled from clinical events. Every line shows
 * its supporting events (type, time, role, hash); flagged lines
 * (missing_code, not_event_backed) are visually distinct and manual
 * lines always carry their reason. Prices are Simulated samples.
 */
import { Fragment, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { postJson, useApi } from "@/lib/api";
import { useToast } from "@/components/toast";
import { fmtSar } from "@/lib/format";

interface LineEvent {
  id: string; type: string; occurredAt: string; actorRole: string; hash: string;
}
interface ClaimLine {
  id: string; seq: number; kind: string; code: string; codeSystem: string;
  codeVersion: string; description: string; quantity: number;
  unitPriceSar: number | null; simulatedPrice: boolean;
  serviceStart: string | null; serviceEnd: string | null;
  eventBacked: boolean; manualReason: string | null;
  flags: string[]; necessityIds: string[]; supportingEvents: LineEvent[];
}

export function ClaimLines({ claimId, canEdit }: { claimId: string; canEdit: boolean }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, refetch } = useApi<{ lines: ClaimLine[] }>(
    `/api/claims/${claimId}/lines`, [claimId],
  );
  const [manual, setManual] = useState({ kind: "service", code: "", quantity: 1, reason: "" });
  const [showManual, setShowManual] = useState(false);

  const assemble = async () => {
    setBusy(true);
    try {
      await postJson(`/api/claims/${claimId}/assemble`, {});
      await refetch();
      await refetchChecks();
      toast(t("cln.assembled"), "success");
    } catch {
      toast(t("common.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const r = await postJson<{
        ok: boolean; checkedEvents: number;
        missingEvents: string[]; unsupportedLines: string[];
      }>(`/api/claims/${claimId}/package`, {});
      toast(
        r.ok
          ? `${t("cln.verified")} (${r.checkedEvents} ${t("cln.eventsN")})`
          : t("cln.verifyFail"),
        r.ok ? "success" : "error",
      );
    } catch {
      toast(t("common.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const adjudicate = async () => {
    setBusy(true);
    try {
      const r = await postJson<{ decision: string; reasonCode: string | null }>(
        `/api/claims/${claimId}/adjudicate`, {},
      );
      toast(
        r.decision === "approved"
          ? t("cln.adjApproved")
          : `${t("cln.adjDenied")} ${r.reasonCode ?? ""}`.trim(),
        r.decision === "approved" ? "success" : "error",
      );
      await refetch();
    } catch {
      toast(t("common.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const addManual = async () => {
    setBusy(true);
    try {
      await postJson(`/api/claims/${claimId}/lines`, manual);
      await refetch();
      setShowManual(false);
      setManual({ kind: "service", code: "", quantity: 1, reason: "" });
      toast(t("common.saved"), "success");
    } catch {
      toast(t("common.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const lines = data?.lines ?? [];
  const { data: checks, refetch: refetchChecks } = useApi<{
    label: string; readiness: number;
    issues: { kind: string; seCode: string | null; detail: string; lineId?: string; eventType?: string }[];
    counts: { billedNotLived: number; livedNotBilled: number; docGaps: number; timing: number };
  }>(lines.length ? `/api/claims/${claimId}/checks` : null, [claimId, lines.length]);
  const d = (iso: string) =>
    new Date(iso).toLocaleString(lang === "ar" ? "ar-SA" : "en-GB", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className="rounded-lg border border-[#e2e9f2] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-700">{t("cln.title")}</h4>
        {canEdit && (
          <div className="flex gap-2">
            <button
              onClick={assemble}
              disabled={busy}
              className="rounded-lg bg-[#0e9bb5] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0b7a8d] disabled:opacity-50"
            >
              {busy ? "…" : t("cln.assemble")}
            </button>
            <button
              onClick={() => setShowManual((s) => !s)}
              className="rounded-lg border border-[#e2e9f2] px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {t("cln.manual")}
            </button>
          </div>
        )}
        {lines.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={verify}
              disabled={busy}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {t("cln.verify")}
            </button>
            <a
              href={`/api/claims/${claimId}/package?format=fhir`}
              className="text-xs font-semibold text-[#1b5fad] underline underline-offset-2"
            >
              {t("cln.fhir")}
            </a>
            <a
              href={`/api/claims/${claimId}/package?format=pdf`}
              className="text-xs font-semibold text-[#1b5fad] underline underline-offset-2"
            >
              {t("cln.pdf")}
            </a>
            {canEdit && (
              <button
                onClick={adjudicate}
                disabled={busy}
                className="rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                title={t("cln.adjLabel")}
              >
                {t("cln.adjudicate")}
              </button>
            )}
          </div>
        )}
      </div>

      {showManual && canEdit && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 p-2 text-xs">
          <span className="font-semibold text-amber-800">{t("cln.notEventBacked")}</span>
          <select
            value={manual.kind}
            onChange={(e) => setManual({ ...manual, kind: e.target.value })}
            className="rounded border border-[#e2e9f2] px-1.5 py-0.5"
            aria-label={t("cln.kind")}
          >
            {["service", "procedure", "bed_day", "medication", "lab"].map((k) => (
              <option key={k} value={k}>{t(`cln.k.${k}`)}</option>
            ))}
          </select>
          <input
            value={manual.code}
            onChange={(e) => setManual({ ...manual, code: e.target.value })}
            placeholder={t("cln.code")}
            className="w-24 rounded border border-[#e2e9f2] px-1.5 py-0.5 font-mono"
          />
          <input
            type="number" min={1} value={manual.quantity}
            onChange={(e) => setManual({ ...manual, quantity: Number(e.target.value) })}
            className="w-16 rounded border border-[#e2e9f2] px-1.5 py-0.5"
            aria-label={t("cln.qty")}
          />
          <input
            value={manual.reason}
            onChange={(e) => setManual({ ...manual, reason: e.target.value })}
            placeholder={t("cln.reason")}
            className="min-w-40 flex-1 rounded border border-[#e2e9f2] px-1.5 py-0.5"
          />
          <button
            onClick={addManual}
            disabled={busy || manual.reason.trim().length < 3}
            className="rounded bg-amber-600 px-2 py-0.5 font-semibold text-white disabled:opacity-50"
          >
            {t("usr.save")}
          </button>
        </div>
      )}

      {/* C4 — readiness + consistency issues */}
      {checks && (
        <div className="mb-3 rounded-md border border-[#e2e9f2] bg-slate-50 p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">
              {t("chk.readiness")}: {checks.readiness}%
            </span>
            <span className="text-[10px] italic text-slate-500">{checks.label}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-600">
            <span>{t("chk.bnl")}: {checks.counts.billedNotLived}</span>
            <span>{t("chk.lnb")}: {checks.counts.livedNotBilled}</span>
            <span>{t("chk.docGaps")}: {checks.counts.docGaps}</span>
            <span>{t("chk.timing")}: {checks.counts.timing}</span>
          </div>
          {checks.issues.slice(0, 6).map((i, n) => (
            <div key={n} className="mt-1 flex items-start gap-1.5 text-[10px]">
              <span
                className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  i.kind === "lived_not_billed" ? "bg-sky-500" : "bg-red-500"
                }`}
              />
              <span className="text-slate-600">
                {t(`chk.k.${i.kind}`)}
                {i.seCode && (
                  <span className="ms-1 rounded bg-slate-200 px-1 font-mono">{i.seCode}</span>
                )}
                {" — "}{i.detail}
              </span>
            </div>
          ))}
        </div>
      )}

      {lines.length === 0 ? (
        <p className="py-2 text-xs text-slate-500">{t("cln.empty")}</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#e2e9f2] text-start text-[10px] uppercase text-slate-500">
              <th className="py-1 text-start">{t("cln.k.kind")}</th>
              <th className="text-start">{t("cln.code")}</th>
              <th className="text-start">{t("cln.qty")}</th>
              <th className="text-start">{t("cln.price")}</th>
              <th className="text-start">{t("cln.events")}</th>
              <th className="text-start">{t("cln.flags")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <Fragment key={l.id}>
                <tr
                  onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                  className={`cursor-pointer border-b border-[#f1f5f9] ${
                    l.eventBacked ? "" : "bg-amber-50/50"
                  }`}
                >
                  <td className="py-1.5">{t(`cln.k.${l.kind}`)}</td>
                  <td className="font-mono">
                    {l.code || <span className="text-red-600">{t("cln.noCode")}</span>}
                    {l.codeSystem && (
                      <span className="ms-1 text-[10px] text-slate-400">{l.codeSystem}</span>
                    )}
                  </td>
                  <td>{l.quantity}</td>
                  <td>
                    {l.unitPriceSar != null ? fmtSar(l.unitPriceSar) : "—"}
                    {l.simulatedPrice && (
                      <span className="ms-1 rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-500">
                        {t("ev.simulated")}
                      </span>
                    )}
                  </td>
                  <td>{l.supportingEvents.length}</td>
                  <td>
                    {l.flags.map((f) => (
                      <span
                        key={f}
                        className={`me-1 rounded px-1 py-0.5 text-[9px] font-semibold ${
                          f === "missing_code"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {t(`cln.flag.${f}`)}
                      </span>
                    ))}
                  </td>
                </tr>
                {expanded === l.id && (
                  <tr key={`${l.id}-x`}>
                    <td colSpan={6} className="bg-slate-50 px-2 py-2">
                      <div className="space-y-1">
                        {l.manualReason && (
                          <p className="text-[11px] text-amber-800">
                            {t("cln.reason")}: {l.manualReason}
                          </p>
                        )}
                        {l.necessityIds.length > 0 && (
                          <p className="text-[10px] text-slate-500">
                            {t("cln.necessity")}: {l.necessityIds.length} {t("cln.eventsN")}
                          </p>
                        )}
                        {l.supportingEvents.map((e) => (
                          <div key={e.id} className="flex gap-2 font-mono text-[10px] text-slate-600">
                            <span>{d(e.occurredAt)}</span>
                            <span>{t(`ev.t.${e.type}`)}</span>
                            <span>{t(`role.${e.actorRole}`)}</span>
                            <span className="text-slate-400">{e.hash}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
