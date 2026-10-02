"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { Card, SectionTitle, Skeleton, ErrorState } from "@/components/ui";
import { Mermaid } from "@/components/mermaid";

interface Api { name: string; url: string; attribution: string; cache: string }
interface Payload {
  stack: { runtime: { name: string; version: string }[]; devCount: number };
  externalApis: Api[];
  codeSystems: { provider: string; version: string; entries: number }[];
  datasets: { name: string; access: string; license: string }[];
  security: { items: string[]; source: string };
  sbom: { specVersion: string | null; format: string; components: number; file: string } | null;
  audit: { generatedAt: string | null; vulnerabilities: Record<string, number>; dependencies: { total?: number } };
  licenses: { generatedAt: string | null; tool: string; passed: boolean | null; summary: Record<string, number> };
}

const ARCH = `flowchart LR
  subgraph H["Hospital systems"]
    HIS[HIS/EMR] --> EV[Event layer]
    LIS --> EV
    RIS --> EV
    PHARM[Pharmacy] --> EV
    VIT[Vital devices] --> EV
  end
  EV --> SAFE[Patient Safety]
  EV --> HAND[Clinical Handoff]
  EV --> CLAIMS[Evidence & Claims]
  CLAIMS --> NPH[NPHIES gateway]
  NPH --> PAY[Insurers / TPAs]`;

export default function TechnicalReferencesPage() {
  const { t } = useI18n();
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch("/api/references/technical")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErr(true));
  }, []);

  if (err) return <ErrorState />;
  if (!d) return <Skeleton rows={8} />;

  return (
    <div className="space-y-5">
      <SectionTitle sub={t("tech.sub")}>{t("tech.title")}</SectionTitle>

      <Card className="!p-0 overflow-x-auto">
        <h3 className="border-b border-[#eef2f7] px-4 py-3 text-sm font-bold text-slate-800">
          {t("tech.stack")}
        </h3>
        <table className="w-full min-w-[420px] text-xs">
          <tbody>
            {d.stack.runtime.map((p) => (
              <tr key={p.name} className="border-b border-[#f1f5f9]">
                <td className="px-4 py-1.5 font-mono text-slate-700">{p.name}</td>
                <td className="px-2 py-1.5 text-slate-500">{p.version}</td>
              </tr>
            ))}
            <tr>
              <td className="px-4 py-1.5 text-slate-500" colSpan={2}>
                + {d.stack.devCount} {t("tech.devDeps")}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card className="!p-0 overflow-x-auto">
        <h3 className="border-b border-[#eef2f7] px-4 py-3 text-sm font-bold text-slate-800">
          {t("tech.apis")}
        </h3>
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b border-[#e2e9f2] text-slate-500">
              <th className="px-4 py-2 text-start font-medium">{t("tech.api")}</th>
              <th className="px-2 py-2 text-start font-medium">URL</th>
              <th className="px-2 py-2 text-start font-medium">{t("tech.cache")}</th>
              <th className="px-2 py-2 text-start font-medium">{t("tech.attr")}</th>
            </tr>
          </thead>
          <tbody>
            {d.externalApis.map((a) => (
              <tr key={a.name} className="border-b border-[#f1f5f9] align-top">
                <td className="px-4 py-2 font-semibold text-slate-700">{a.name}</td>
                <td className="px-2 py-2">
                  <a href={a.url} target="_blank" rel="noreferrer"
                    className="font-mono text-[10px] text-[#1b5fad] hover:underline" dir="ltr">
                    {a.url}
                  </a>
                </td>
                <td className="px-2 py-2 text-slate-600">{a.cache}</td>
                <td className="px-2 py-2 text-slate-500">{a.attribution}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-bold text-slate-800">{t("tech.codes")}</h3>
          <ul className="space-y-1.5 text-xs text-slate-700">
            {d.codeSystems.map((c) => (
              <li key={c.provider + c.version} className="flex justify-between">
                <span className="font-mono">{c.provider}</span>
                <span className="text-slate-500">v{c.version} · {c.entries}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-bold text-slate-800">{t("tech.datasets")}</h3>
          <ul className="space-y-1.5 text-xs text-slate-700">
            {d.datasets.map((x) => (
              <li key={x.name}>
                <span className="font-semibold">{x.name}</span>
                <span className="block text-slate-500">{x.access} · {x.license}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <h3 className="mb-2 text-sm font-bold text-slate-800">{t("tech.security")}</h3>
        <ul className="list-inside list-disc space-y-1 text-xs text-slate-700">
          {d.security.items.map((s) => <li key={s}>{s}</li>)}
        </ul>
        <p className="mt-2 text-[11px] text-slate-400">{d.security.source}</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-2 text-sm font-bold text-slate-800">SBOM</h3>
          {d.sbom ? (
            <>
              <p className="text-xs text-slate-600">
                {d.sbom.format} {d.sbom.specVersion} · {d.sbom.components} {t("tech.components")}
              </p>
              <p className="mt-1 font-mono text-[10px] text-slate-400">{d.sbom.file}</p>
            </>
          ) : (
            <p className="text-xs text-slate-500">{t("tech.noArtifact")}</p>
          )}
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-bold text-slate-800">npm audit</h3>
          <p className="text-xs text-slate-600">
            {t("tech.vulns")}: {d.audit.vulnerabilities.total ?? "—"}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            {d.audit.generatedAt?.slice(0, 10) ?? "—"} · {d.audit.dependencies.total ?? "—"} {t("tech.components")}
          </p>
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-bold text-slate-800">{t("tech.licenses")}</h3>
          <p className="text-xs text-slate-600">
            {Object.entries(d.licenses.summary)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">{d.licenses.generatedAt?.slice(0, 10) ?? ""}</p>
        </Card>
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-bold text-slate-800">{t("tech.arch")}</h3>
        <Mermaid chart={ARCH} caption={t("tech.archCap")} />
      </Card>
    </div>
  );
}
