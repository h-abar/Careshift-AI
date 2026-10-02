"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { Card, SectionTitle, Skeleton, ErrorState } from "@/components/ui";
import { diffJson } from "@/lib/governance";

interface Ref { key: string; kind: string; value: string; titleEn: string; venue: string; year: number | null }
interface Ver {
  version: number; logic: unknown; units: Record<string, string>;
  noteEn: string; noteAr: string; approvedAt: string | null; createdAt: string;
}
interface RuleRow {
  key: string; nameEn: string; nameAr: string; status: string;
  category: string; classification: string; usedIn: string[];
  feature: string; versions: Ver[]; refs: Ref[];
}
interface KpiRow { key: string; nameEn: string; nameAr: string; unit: string; formula: unknown; status: string }
interface Proto { key: string; env: string; default: number; unit: string; effective: number }
interface Payload { rules: RuleRow[]; kpis: KpiRow[]; prototypeSettings: Proto[] }

const refHref = (r: Ref) =>
  r.kind === "pmid" ? `https://pubmed.ncbi.nlm.nih.gov/${r.value}/`
    : r.kind === "doi" ? `https://doi.org/${r.value}` : r.value;

const CLASS_STYLE: Record<string, string> = {
  validated: "bg-teal-50 text-teal-700",
  informational: "bg-blue-50 text-blue-700",
  kpi: "bg-purple-50 text-purple-700",
  prototype: "bg-amber-50 text-amber-700",
};

export default function CalculationRulesPage() {
  const { t, lang } = useI18n();
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [cmp, setCmp] = useState<{ key: string; a: number; b: number } | null>(null);

  useEffect(() => {
    fetch("/api/rules/calculation")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErr(true));
  }, []);

  const diff = useMemo(() => {
    if (!d || !cmp) return null;
    const rule = d.rules.find((r) => r.key === cmp.key);
    const va = rule?.versions.find((v) => v.version === cmp.a);
    const vb = rule?.versions.find((v) => v.version === cmp.b);
    if (!va || !vb) return null;
    return diffJson(JSON.stringify(va.logic, null, 1), JSON.stringify(vb.logic, null, 1));
  }, [d, cmp]);

  if (err) return <ErrorState />;
  if (!d) return <Skeleton rows={8} />;

  return (
    <div className="space-y-5">
      <SectionTitle sub={t("calc.sub")}>{t("calc.title")}</SectionTitle>
      <div className="flex justify-end">
        <a
          href="/api/rules/calculation/pdf"
          className="rounded-lg border border-[#e2e9f2] bg-white px-3 py-2 text-xs font-bold text-[#0b7a8d] hover:bg-teal-50"
        >
          ⬇ {t("calc.pdf")}
        </a>
      </div>

      {d.rules.map((r) => {
        const v = r.versions[0];
        const expanded = open === r.key;
        return (
          <Card key={r.key}>
            <button
              onClick={() => setOpen(expanded ? null : r.key)}
              className="flex w-full flex-wrap items-center gap-2 text-start"
            >
              <span className="text-sm font-bold text-slate-800">
                {lang === "ar" ? r.nameAr : r.nameEn}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CLASS_STYLE[r.classification]}`}>
                {t(`calc.class.${r.classification}`)}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {r.status} · v{v?.version ?? "-"}
              </span>
              <span className="ms-auto text-[10px] text-slate-400">{expanded ? "▾" : "▸"}</span>
            </button>

            {expanded && v && (
              <div className="mt-4 space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-700">{t("calc.purpose")}</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {lang === "ar" ? v.noteAr || v.noteEn : v.noteEn}
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-700">{t("calc.formula")}</h4>
                  <pre
                    dir="ltr"
                    className="mt-1 max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] leading-4 text-slate-700"
                  >
                    {JSON.stringify(v.logic, null, 1)}
                  </pre>
                </div>

                {Object.keys(v.units).length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-700">{t("calc.inputs")}</h4>
                    <table className="mt-1 w-full text-start text-xs">
                      <tbody>
                        {Object.entries(v.units).map(([k, u]) => (
                          <tr key={k} className="border-b border-[#f1f5f9]">
                            <td className="py-1 pe-3 font-mono text-slate-700">{k}</td>
                            <td className="py-1 text-slate-500">{u}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-700">{t("calc.version")}</h4>
                    <p className="mt-1 text-xs text-slate-600">
                      v{v.version} · {v.approvedAt ? `${t("calc.approved")} ${v.approvedAt.slice(0, 10)}` : t("calc.unapproved")}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-700">{t("calc.usedin")}</h4>
                    <p className="mt-1 text-xs text-slate-600">{r.usedIn.join(" · ") || "—"}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-700">{t("calc.evidence")}</h4>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.refs.map((rr) => (
                      <a key={rr.key} href={refHref(rr)} target="_blank" rel="noreferrer"
                        className="rounded-full border border-[#e2e9f2] px-2 py-0.5 text-[10px] font-medium text-[#1b5fad] hover:bg-blue-50"
                        title={rr.titleEn}>
                        {rr.kind === "pmid" ? `PMID ${rr.value}` : rr.kind === "doi" ? "DOI" : rr.key}
                      </a>
                    ))}
                  </div>
                </div>

                {r.versions.length > 1 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-700">{t("calc.history")}</h4>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {r.versions.map((vv, i) =>
                        i + 1 < r.versions.length ? (
                          <button key={vv.version}
                            onClick={() => setCmp({ key: r.key, a: r.versions[i + 1].version, b: vv.version })}
                            className="rounded-lg border border-[#e2e9f2] px-2 py-1 text-[10px] font-medium text-[#1b5fad] hover:bg-blue-50">
                            v{r.versions[i + 1].version} → v{vv.version}
                          </button>
                        ) : null,
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {cmp && diff && (
        <Card>
          <h3 className="mb-2 text-sm font-bold text-slate-800">
            {t("calc.diff")} — {cmp.key} v{cmp.a}→v{cmp.b}
          </h3>
          <pre dir="ltr" className="max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px]">
            {diff.map((l, i) => (
              <div key={i} className={l.kind === "add" ? "text-teal-700" : l.kind === "del" ? "text-red-600" : "text-slate-500"}>
                {l.line}
              </div>
            ))}
          </pre>
        </Card>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-bold text-slate-800">{t("calc.kpis")}</h3>
        <table className="w-full text-start text-xs">
          <thead>
            <tr className="border-b border-[#e2e9f2] text-slate-500">
              <th className="py-1.5 pe-3 text-start font-medium">{t("calc.kpiName")}</th>
              <th className="py-1.5 pe-3 text-start font-medium">{t("calc.kpiUnit")}</th>
              <th className="py-1.5 text-start font-medium">{t("calc.kpiFormula")}</th>
            </tr>
          </thead>
          <tbody>
            {d.kpis.map((k) => (
              <tr key={k.key} className="border-b border-[#f1f5f9]">
                <td className="py-1.5 pe-3 text-slate-700">{lang === "ar" ? k.nameAr : k.nameEn}</td>
                <td className="py-1.5 pe-3 text-slate-500">{k.unit}</td>
                <td className="py-1.5 font-mono text-[10px] text-slate-500">{JSON.stringify(k.formula)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-bold text-slate-800">{t("calc.proto")}</h3>
        <p className="mb-2 text-[11px] text-amber-700">{t("calc.protoNote")}</p>
        <table className="w-full text-start text-xs">
          <tbody>
            {d.prototypeSettings.map((s) => (
              <tr key={s.key} className="border-b border-[#f1f5f9]">
                <td className="py-1.5 pe-3 font-mono text-slate-700">{s.env}</td>
                <td className="py-1.5 pe-3 text-slate-600">
                  {s.effective} {s.unit}
                  {s.effective !== s.default && (
                    <span className="ms-1 text-[10px] text-slate-400">({t("calc.def")} {s.default})</span>
                  )}
                </td>
                <td className="py-1.5">
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {t("calc.class.prototype")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
