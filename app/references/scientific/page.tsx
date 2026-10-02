"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { Card, SectionTitle, Skeleton, ErrorState } from "@/components/ui";

interface RefRow {
  key: string; kind: string; value: string;
  titleEn: string; venue: string; year: number | null;
  rules: { key: string; nameEn: string; nameAr: string }[];
}
interface Group { feature: string; refs: RefRow[] }

const refHref = (r: RefRow) =>
  r.kind === "pmid" ? `https://pubmed.ncbi.nlm.nih.gov/${r.value}/`
    : r.kind === "doi" ? `https://doi.org/${r.value}` : r.value;

const KIND_LABEL: Record<string, string> = {
  pmid: "ref.kind.pmid",
  doi: "ref.kind.doi",
  url: "ref.kind.url",
};

export default function ScientificReferencesPage() {
  const { t, lang } = useI18n();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [feat, setFeat] = useState<string>("");

  useEffect(() => {
    fetch("/api/references/scientific")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setGroups(d.groups))
      .catch(() => setErr(true));
  }, []);

  const shown = useMemo(() => {
    if (!groups) return null;
    const needle = q.trim().toLowerCase();
    return groups
      .filter((g) => !feat || g.feature === feat)
      .map((g) => ({
        ...g,
        refs: g.refs.filter(
          (r) =>
            !needle ||
            r.titleEn.toLowerCase().includes(needle) ||
            r.venue.toLowerCase().includes(needle) ||
            r.key.toLowerCase().includes(needle) ||
            r.value.toLowerCase().includes(needle),
        ),
      }))
      .filter((g) => g.refs.length > 0);
  }, [groups, q, feat]);

  if (err) return <ErrorState />;
  if (!groups || !shown) return <Skeleton rows={8} />;

  return (
    <div className="space-y-5">
      <SectionTitle sub={t("refsci.sub")}>{t("refsci.title")}</SectionTitle>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("common.search")}
          aria-label={t("common.search")}
          className="w-56 rounded-lg border border-[#e2e9f2] bg-white px-3 py-2 text-sm outline-none focus:border-[#0e9bb5]/50"
        />
        <button
          onClick={() => setFeat("")}
          className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${!feat ? "bg-[#0b7a8d] text-white" : "border border-[#e2e9f2] text-slate-600"}`}
        >
          {t("refsci.all")}
        </button>
        {groups.map((g) => (
          <button
            key={g.feature}
            onClick={() => setFeat(feat === g.feature ? "" : g.feature)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${feat === g.feature ? "bg-[#0b7a8d] text-white" : "border border-[#e2e9f2] text-slate-600"}`}
          >
            {t(`feat.${g.feature}`)}
          </button>
        ))}
        <span className="ms-auto flex gap-1.5">
          {(["pdf", "bib", "ris"] as const).map((f) => (
            <a
              key={f}
              href={`/api/references/scientific/export?fmt=${f}`}
              className="rounded-lg border border-[#e2e9f2] bg-white px-3 py-2 text-xs font-bold text-[#0b7a8d] hover:bg-teal-50"
            >
              ⬇ {f.toUpperCase()}
            </a>
          ))}
        </span>
      </div>

      {shown.map((g) => (
        <Card key={g.feature} className="!p-0">
          <h3 className="border-b border-[#eef2f7] px-4 py-3 text-sm font-bold text-slate-800">
            {t(`feat.${g.feature}`)}
            <span className="ms-2 text-[11px] font-medium text-slate-400">
              {g.refs.length}
            </span>
          </h3>
          <ul className="divide-y divide-[#f1f5f9]">
            {g.refs.map((r) => (
              <li key={r.key} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <a
                    href={refHref(r)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-[#1b5fad] hover:underline"
                  >
                    {r.titleEn}
                  </a>
                  <span className="text-[11px] text-slate-500">
                    {r.venue}
                    {r.year ? ` · ${r.year}` : ""}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    {t(KIND_LABEL[r.kind] ?? "ref.kind.url")}
                  </span>
                  {r.kind === "pmid" && (
                    <span className="font-mono text-[10px] text-slate-400">
                      PMID {r.value}
                    </span>
                  )}
                  {r.kind === "doi" && (
                    <span className="font-mono text-[10px] text-slate-400">
                      DOI {r.value}
                    </span>
                  )}
                </div>
                {r.rules.length > 0 && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {t("refsci.usedBy")}:{" "}
                    {r.rules
                      .map((x) => (lang === "ar" ? x.nameAr : x.nameEn))
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <Card className="border-amber-200 bg-amber-50/50">
        <h3 className="mb-2 text-sm font-bold text-amber-800">
          {t("refsci.limTitle")}
        </h3>
        <ul className="list-inside list-disc space-y-1 text-xs leading-5 text-slate-700">
          <li>{t("refsci.lim.nphies")}</li>
          <li>{t("refsci.lim.mimic")}</li>
          <li>{t("refsci.lim.codes")}</li>
        </ul>
      </Card>
    </div>
  );
}
