"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { Card, SectionTitle, Skeleton, ErrorState } from "@/components/ui";

interface Ref {
  key: string;
  kind: string;
  value: string;
  titleEn: string;
  venue: string;
  year: number | null;
}

interface RuleRow {
  key: string;
  nameEn: string;
  nameAr: string;
  status: string;
  version: number | null;
  refs: Ref[];
}

interface Payload {
  attributions: Record<string, string | string[]>;
  rules: RuleRow[];
  references: Ref[];
}

const refHref = (r: Ref) =>
  r.kind === "pmid"
    ? `https://pubmed.ncbi.nlm.nih.gov/${r.value}/`
    : r.kind === "doi"
      ? `https://doi.org/${r.value}`
      : r.value;

export default function ReferencesPage() {
  const { t, lang } = useI18n();
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch("/api/references")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErr(true));
  }, []);

  if (err) return <ErrorState />;
  if (!d) return <Skeleton rows={6} />;

  const attributionList = [
    ...d.attributions.nlm,
    String(d.attributions.fda),
    String(d.attributions.whoIcd11),
    String(d.attributions.medlineplus),
    String(d.attributions.mimic),
    String(d.attributions.nphies),
  ];

  return (
    <div className="space-y-5">
      <SectionTitle sub={t("refs.subtitle")}>{t("refs.title")}</SectionTitle>

      <Card>
        <h3 className="mb-3 text-sm font-bold text-slate-800">{t("refs.rules")}</h3>
        <div className="space-y-3">
          {d.rules.map((r) => (
            <div key={r.key} className="rounded-xl border border-[#e2e9f2] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-slate-800">
                  {lang === "ar" ? r.nameAr : r.nameEn}
                </span>
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                  {r.status} · v{r.version}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {r.refs.map((rr) => (
                  <a
                    key={rr.key}
                    href={refHref(rr)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[#e2e9f2] px-2 py-0.5 text-[10px] font-medium text-[#1b5fad] hover:bg-blue-50"
                    title={rr.titleEn}
                  >
                    {rr.kind === "pmid" ? `PMID ${rr.value}` : rr.kind === "doi" ? `DOI` : rr.venue || rr.key}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-bold text-slate-800">{t("refs.attribution")}</h3>
        <ul className="list-inside list-disc space-y-1 text-xs text-slate-600">
          {attributionList.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-slate-500">
          {lang === "ar" ? "النسخ العربية لمنشورات التثقيف: " : "Arabic patient-education handouts: "}
          <a
            href={String(d.attributions.medlineplusArabic)}
            target="_blank"
            rel="noreferrer"
            className="text-[#1b5fad] underline"
          >
            medlineplus.gov/languages/arabic.html
          </a>
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-bold text-slate-800">{t("refs.all")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead>
              <tr className="border-b border-[#e2e9f2] text-start text-slate-500">
                <th className="py-1.5 pe-3 text-start">{t("refs.col.ref")}</th>
                <th className="py-1.5 pe-3 text-start">{t("refs.col.venue")}</th>
                <th className="py-1.5 text-start">{t("refs.col.id")}</th>
              </tr>
            </thead>
            <tbody>
              {d.references.map((r) => (
                <tr key={r.key} className="border-b border-[#f1f5f9]">
                  <td className="py-1.5 pe-3 text-slate-700">{r.titleEn}</td>
                  <td className="py-1.5 pe-3 text-slate-500">
                    {r.venue} {r.year ?? ""}
                  </td>
                  <td className="py-1.5">
                    <a
                      href={refHref(r)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#1b5fad] hover:underline"
                    >
                      {r.kind === "pmid" ? `PMID ${r.value}` : r.kind === "doi" ? r.value : "URL"}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
