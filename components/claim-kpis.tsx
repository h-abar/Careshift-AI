"use client";

/**
 * C7 — KPI panel fed by /api/kpis/claims (registry-computed values only;
 * payer figures carry the Simulated label).
 */
import { useApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n/provider";
import { Card, SectionTitle, Skeleton } from "@/components/ui";

interface ClaimKpisData {
  label: string;
  eventBackedPct: number;
  linesTotal: number;
  linesEventBacked: number;
  firstPassAcceptancePct: number | null;
  denialsByCategory: { category: string; count: number }[];
  meanReadinessPct: number | null;
  billedNotLived: number;
  livedNotBilled: number;
  lateEntryPct: number;
  lateEntryCount: number;
  eventsTotal: number;
  meanEventToClaimH: number | null;
  safety: {
    label: string;
    handoffAcceptedPct: number | null;
    openActionItems: number;
    meanAckMin: number | null;
    meanInterventionMin: number | null;
    escalationsPer100Pd: number | null;
  };
}

export function ClaimKpis() {
  const { t } = useI18n();
  const { data } = useApi<ClaimKpisData>("/api/kpis/claims", []);
  if (!data) return <Skeleton rows={2} />;

  const cell = (
    label: string, value: string | number, sim = false,
  ) => (
    <div className="rounded-xl border border-[#e2e9f2] bg-white p-4">
      <div className="text-xs text-slate-600">
        {label}{" "}
        {sim && <span className="text-[10px]">({t("common.simulated")})</span>}
      </div>
      <div className="mt-1 text-2xl font-bold text-[#13304d]">{value}</div>
    </div>
  );

  return (
    <Card>
      <SectionTitle>{t("kpi.title")}</SectionTitle>
      <p className="-mt-2 mb-3 text-[11px] text-slate-500">{data.label}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cell(t("kpi.eventBacked"), `${data.eventBackedPct}% (${data.linesEventBacked}/${data.linesTotal})`)}
        {cell(
          t("kpi.firstPass"),
          data.firstPassAcceptancePct == null ? "—" : `${data.firstPassAcceptancePct}%`,
          true,
        )}
        {cell(
          t("kpi.readiness"),
          data.meanReadinessPct == null ? "—" : `${data.meanReadinessPct}%`,
        )}
        {cell(t("kpi.lateEntry"), `${data.lateEntryPct}% (${data.lateEntryCount}/${data.eventsTotal})`)}
        {cell(t("kpi.billedNotLived"), data.billedNotLived)}
        {cell(t("kpi.livedNotBilled"), data.livedNotBilled)}
        {cell(
          t("kpi.eventToClaim"),
          data.meanEventToClaimH == null ? "—" : `${data.meanEventToClaimH}h`,
        )}
        <div className="rounded-xl border border-[#e2e9f2] bg-white p-4">
          <div className="text-xs text-slate-600">
            {t("kpi.denialsByCat")}{" "}
            <span className="text-[10px]">({t("common.simulated")})</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-[#13304d]">
            {data.denialsByCategory.length === 0
              ? "—"
              : data.denialsByCategory
                  .map((d) => `${d.category}: ${d.count}`)
                  .join(" · ")}
          </div>
        </div>
      </div>
      {/* C9 — safety-chain KPIs from the same registry */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-[#13304d]">
          {t("kpi.safetyTitle")}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {cell(
            t("kpi.handoffAccepted"),
            data.safety.handoffAcceptedPct == null
              ? "—" : `${data.safety.handoffAcceptedPct}%`,
          )}
          {cell(t("kpi.openItems"), data.safety.openActionItems)}
          {cell(
            t("kpi.meanAck"),
            data.safety.meanAckMin == null ? "—" : `${data.safety.meanAckMin}m`,
          )}
          {cell(
            t("kpi.meanIntervention"),
            data.safety.meanInterventionMin == null
              ? "—" : `${data.safety.meanInterventionMin}m`,
          )}
          {cell(
            t("kpi.escPer100"),
            data.safety.escalationsPer100Pd == null
              ? "—" : data.safety.escalationsPer100Pd,
            true,
          )}
        </div>
      </div>
    </Card>
  );
}
