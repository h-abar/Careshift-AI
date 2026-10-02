"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { Card, SectionTitle, Skeleton, ErrorState } from "@/components/ui";

interface Payload {
  prioritization: { order: string[]; informational: string[]; rule: string };
  alerting: {
    tiers: { tier: number; when: string; action: string }[];
    ackMinutes: number; seenMinutes: number; label: string;
  };
  handoff: { framework: string; required: string[]; escalation: string };
  data: { syntheticLabel: string; datasets: string[]; freshnessEndpoint: string };
  rbac: { roles: string[]; permissions: string[]; matrix: Record<string, Record<string, boolean>> };
  audit: {
    retentionDays: Record<string, number>;
    rateLimits: Record<string, number>;
    lateEntryMinutes: number;
  };
}

export default function GeneralRulesPage() {
  const { t } = useI18n();
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch("/api/rules/general")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErr(true));
  }, []);

  if (err) return <ErrorState />;
  if (!d) return <Skeleton rows={8} />;

  return (
    <div className="space-y-5">
      <SectionTitle sub={t("gen.sub")}>{t("gen.title")}</SectionTitle>

      <Card>
        <h3 className="mb-2 text-sm font-bold text-slate-800">{t("gen.prio")}</h3>
        <p className="mb-2 text-[11px] text-slate-500">{t("gen.prioNote")}</p>
        <ol className="list-inside list-decimal space-y-1 text-xs text-slate-700">
          {d.prioritization.order.map((o) => <li key={o}>{o}</li>)}
        </ol>
        <p className="mt-2 text-[11px] text-slate-500">
          {t("gen.infoOnly")}: {d.prioritization.informational.join(" · ")}
        </p>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-bold text-slate-800">{t("gen.alert")}</h3>
        <table className="w-full text-start text-xs">
          <thead>
            <tr className="border-b border-[#e2e9f2] text-slate-500">
              <th className="py-1.5 pe-3 text-start font-medium">Tier</th>
              <th className="py-1.5 pe-3 text-start font-medium">{t("gen.when")}</th>
              <th className="py-1.5 text-start font-medium">{t("gen.action")}</th>
            </tr>
          </thead>
          <tbody>
            {d.alerting.tiers.map((r) => (
              <tr key={r.tier} className="border-b border-[#f1f5f9]">
                <td className="py-1.5 pe-3 font-bold">{r.tier}</td>
                <td className="py-1.5 pe-3">{r.when}</td>
                <td className="py-1.5">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-amber-700">
          {t("gen.timers")}: ack ≤ {d.alerting.ackMinutes} min · seen ≤ {d.alerting.seenMinutes} min — {t("calc.class.prototype")}
        </p>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-bold text-slate-800">{t("gen.handoff")}</h3>
        <p className="mb-2 text-xs text-slate-600">
          {d.handoff.framework} · {t("gen.escalation")}: {d.handoff.escalation}
        </p>
        <ul className="list-inside list-disc space-y-1 text-xs text-slate-700">
          {d.handoff.required.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-bold text-slate-800">{t("gen.data")}</h3>
        <ul className="list-inside list-disc space-y-1 text-xs text-slate-700">
          <li>{t("gen.synthetic")}: <b>{d.data.syntheticLabel}</b></li>
          {d.data.datasets.map((x) => <li key={x}>{x}</li>)}
          <li>{t("data.asof").replace("{d}", "")} <code className="text-[10px]">{d.data.freshnessEndpoint}</code></li>
        </ul>
      </Card>

      <Card className="!p-0 overflow-x-auto">
        <div className="px-4 pt-4">
          <h3 className="text-sm font-bold text-slate-800">{t("gen.rbac")}</h3>
        </div>
        <table className="w-full min-w-[860px] text-xs">
          <thead>
            <tr className="border-b border-[#e2e9f2] text-slate-600">
              <th className="px-4 py-2.5 text-start font-medium">{t("gen.perm")}</th>
              {d.rbac.roles.map((r) => (
                <th key={r} className="px-2 py-2.5 text-center font-medium">{t(`userRole.${r}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rbac.permissions.map((p) => (
              <tr key={p} className="border-b border-[#f1f5f9]">
                <td className="px-4 py-2 font-mono text-[10px] text-slate-700">{p}</td>
                {d.rbac.roles.map((r) => (
                  <td key={r} className="px-2 py-2 text-center">
                    {d.rbac.matrix[r]?.[p]
                      ? <span className="text-teal-600">✓</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-bold text-slate-800">{t("gen.audit")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="text-xs font-bold text-slate-700">{t("gen.retention")}</h4>
            <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-slate-600">
              {Object.entries(d.audit.retentionDays).map(([k, v]) => (
                <li key={k}>{k}: {v} {t("gen.days")}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-700">{t("gen.rl")}</h4>
            <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-slate-600">
              {Object.entries(d.audit.rateLimits).map(([k, v]) => (
                <li key={k}>{k}: {v}/min</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-600">
              {t("gen.lateEntry")}: {d.audit.lateEntryMinutes} min
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
