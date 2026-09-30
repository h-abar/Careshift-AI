"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { auditLog } from "@/lib/data/handoffs";
import { userName } from "@/lib/data/users";
import { Card, SectionTitle } from "@/components/ui";

export default function AuditPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();

  if (!can("audit_view"))
    return <p className="py-20 text-center text-slate-400">{t("common.noAccess")}</p>;

  return (
    <div className="space-y-5">
      <SectionTitle sub="WHO · WHAT · WHEN · FROM → TO">{t("audit.title")}</SectionTitle>

      <Card className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[#e2e9f2] text-xs text-slate-500">
              {[t("audit.user"), t("audit.action"), t("audit.entity"), t("audit.time"), t("audit.session"), t("audit.prev"), t("audit.next")].map((h) => (
                <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {auditLog.map((e) => (
              <tr key={e.id} className="border-b border-[#eef2f7] last:border-0 hover:bg-[#f8fafc]">
                <td className="px-4 py-3 font-medium text-[#13304d]">{userName(e.userId, lang)}</td>
                <td className="px-4 py-3 text-slate-600">{t(e.actionKey)}</td>
                <td className="px-4 py-3 font-mono text-xs text-[#0e9bb5]">{e.entityId}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{e.at}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{e.session}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{e.prev ?? "—"}</td>
                <td className="px-4 py-3 text-xs font-medium text-slate-700">{e.next ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
