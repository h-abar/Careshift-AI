"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { useAudit } from "@/lib/api";
import { Card, Empty, ErrorState, Loading, Skeleton, SectionTitle } from "@/components/ui";

export default function AuditPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const [fUser, setFUser] = useState("");
  const [fAction, setFAction] = useState("");
  const [page, setPage] = useState(1);
  // Debounce text filters before hitting the server.
  const [applied, setApplied] = useState({ user: "", action: "" });
  useEffect(() => {
    const id = setTimeout(() => {
      setApplied({ user: fUser, action: fAction });
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [fUser, fAction]);

  const { data, loading, error, refetch } = useAudit({
    userId: applied.user || undefined,
    action: applied.action || undefined,
    page,
  });

  if (!can("audit_view"))
    return <p className="py-20 text-center text-slate-500">{t("common.noAccess")}</p>;
  if (loading && !data) return <Skeleton rows={6} />;
  if (error && !data) return <ErrorState onRetry={refetch} />;
  if (!data) return <Loading />;

  const entries = data.entries;
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const fmt = (iso: string) =>
    `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;

  const kv = (v: unknown) =>
    v == null
      ? "—"
      : typeof v === "string"
        ? v
        : Object.entries(v as Record<string, unknown>)
            .map(([k, x]) => `${k}: ${x}`)
            .join(" · ");

  return (
    <div className="space-y-5">
      <SectionTitle sub="WHO · WHAT · WHEN · FROM → TO">
        {t("audit.title")}
      </SectionTitle>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          aria-label={t("audit.filterUser")}
          value={fUser}
          onChange={(e) => setFUser(e.target.value)}
          placeholder={t("audit.filterUser")}
          className="rounded-lg border border-[#e2e9f2] bg-white px-3 py-2 text-sm outline-none focus:border-[#0e9bb5]/50"
        />
        <input
          aria-label={t("audit.filterAction")}
          value={fAction}
          onChange={(e) => setFAction(e.target.value)}
          placeholder={t("audit.filterAction")}
          className="rounded-lg border border-[#e2e9f2] bg-white px-3 py-2 text-sm outline-none focus:border-[#0e9bb5]/50"
        />
        <span className="ms-auto self-center text-xs text-slate-500">
          {data.total}
        </span>
      </div>

      <Card className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-[#e2e9f2] text-xs text-slate-500">
              {[
                t("audit.user"),
                t("audit.action"),
                t("audit.entity"),
                t("audit.time"),
                t("audit.ip"),
                t("audit.prev"),
                t("audit.next"),
              ].map((h) => (
                <th key={h} className="px-4 py-3 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className="border-b border-[#eef2f7] last:border-0 hover:bg-[#f8fafc]"
              >
                <td className="px-4 py-3 font-medium text-[#13304d]">
                  {lang === "ar" ? e.userNameAr : e.userName}
                  <div className="font-mono text-[10px] text-slate-500">
                    {e.userId}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {t(`auditAction.${e.action}`)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#0e9bb5]">
                  {e.entityType}:{e.entityId}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {fmt(e.createdAt)}
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                  {e.ip ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{kv(e.prev)}</td>
                <td className="px-4 py-3 text-xs font-medium text-slate-700">
                  {kv(e.next)}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={7}><Empty /></td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {t("common.page")} {data.page} / {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-[#e2e9f2] px-3 py-1.5 font-semibold disabled:opacity-40"
          >
            ‹ {t("common.prev")}
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-[#e2e9f2] px-3 py-1.5 font-semibold disabled:opacity-40"
          >
            {t("common.next")} ›
          </button>
        </div>
      </div>
    </div>
  );
}
