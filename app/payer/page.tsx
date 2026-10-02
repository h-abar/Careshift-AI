"use client";

import { Fragment } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useClaims } from "@/lib/api";
import { ClaimDetail } from "@/components/claim-detail";
import { fmtSar } from "@/lib/format";
import {
  Card,
  Empty,
  ErrorState,
  Loading,
  Meter,
  SectionTitle,
  Skeleton,
} from "@/components/ui";

import { ClaimBornVisual } from "@/components/claim-born-visual";
import { StoryRibbon } from "@/components/story-ribbon";

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-slate-100 text-slate-600 border-slate-200",
  review: "bg-amber-50 text-amber-700 border-amber-200",
  denied: "bg-red-50 text-red-700 border-red-200",
  draft: "bg-violet-50 text-violet-700 border-violet-200",
  exception: "bg-orange-50 text-orange-700 border-orange-200",
};

/**
 * E7 — external payer portal. Payer role is tenant-scoped server-side:
 * /api/claims already returns ONLY this payer's claims, and every field
 * shown here is minimum-necessary (claim id, member ref, status, amount,
 * evidence readiness) — no vitals, notes, or patient lists.
 */
export default function PayerPortal() {
  const { t, lang } = useI18n();
  const { data, loading, error, refetch } = useClaims({ pageSize: 50 });
  if (loading && !data) return <Skeleton rows={6} />;
  if (error && !data) return <ErrorState onRetry={refetch} />;
  if (!data) return <Loading />;
  const claims = data.claims;

  return (
    <div className="space-y-6">
      {/* Story Ribbon */}
      <StoryRibbon activeStep="claim" patientId="P-1042" patientName="نورة القحطاني" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#13304d] sm:text-2xl">
            {t("payer.title")}
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">{t("payer.subtitle")}</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-dashed border-[#c4cfdd] px-3 py-1 text-xs font-semibold text-slate-500">
          {t("ev.simulated")}
        </span>
      </div>

      {/* Visual verified evidence chain for P-1042 with big verify button */}
      <ClaimBornVisual showPayerVerifyButton={true} />

      <Card>
        <SectionTitle sub={t("payer.scopeNote")}>
          {t("payer.claims")} ({data.total})
        </SectionTitle>
        {claims.length === 0 ? (
          <Empty title={t("payer.empty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#eef2f7] text-start text-xs text-slate-500">
                  <th className="px-3 py-2 text-start font-semibold">
                    {t("payer.claimId")}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">
                    {t("payer.memberId")}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">
                    {t("payer.dx")}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">
                    {t("payer.status")}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">
                    {t("payer.readiness")}
                  </th>
                  <th className="px-3 py-2 text-end font-semibold">
                    {t("payer.amount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <Fragment key={c.id}>
                  <tr
                    className="border-b border-[#f4f7fa] last:border-0"
                  >
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-[#0b7a8d]">
                      {c.id}
                      {c.version && c.version > 1 ? (
                        <span className="ms-1 text-slate-500">v{c.version}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                      {c.patientId ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {t(`dx.${c.dxKey}`)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[c.status] ?? STATUS_STYLE.pending}`}
                      >
                        {t(`claim.${c.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex w-24 items-center gap-2">
                        <Meter pct={c.readiness.score} color="bg-[#0e9bb5]" />
                        <span className="text-[11px] font-mono text-slate-600">
                          {c.readiness.score}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-sm font-bold text-[#13304d]">
                      {fmtSar(c.amountSar, lang)}
                      {c.autoSubmitted && (
                        <span className="ms-2 rounded-full bg-[#0e9bb5]/10 px-1.5 py-px text-[9px] font-bold text-[#075e6e]">
                          {t("claim.autoSubmitted")}
                        </span>
                      )}
                    </td>
                  </tr>
                  {/* E7 — adjudication actions: verify package, accept,
                      deny with coded reason, request evidence */}
                  <tr className="border-b border-[#f4f7fa] last:border-0">
                    <td colSpan={6} className="px-3 pb-2">
                      <ClaimDetail claim={c} onChanged={refetch} />
                    </td>
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
