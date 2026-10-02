"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { PERMISSION_KEYS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { Card, SectionTitle } from "@/components/ui";
import type { RoleKey } from "@/lib/types";

const ROLES: RoleKey[] = [
  "admin", "doctor", "nurse", "charge_nurse", "payer", "hospital_admin",
];
const DEPTS = ["icu", "er", "medical", "surgical", "claims", "operations", "it"];

export default function SettingsPage() {
  const { t } = useI18n();
  const { can } = useAuth();

  if (!can("settings_manage"))
    return <p className="py-20 text-center text-slate-600">{t("common.noAccess")}</p>;

  return (
    <div className="space-y-5">
      <SectionTitle>{t("set.title")}</SectionTitle>

      <Card className="!p-0 overflow-x-auto">
        <div className="px-4 pt-4">
          <SectionTitle>{t("set.roles")}</SectionTitle>
        </div>
        <table className="w-full min-w-[860px] text-xs">
          <thead>
            <tr className="border-b border-[#e2e9f2] text-slate-600">
              <th className="px-4 py-2.5 text-start font-medium">{t("set.roleCol")}</th>
              {ROLES.map((r) => (
                <th key={r} className="px-2 py-2.5 text-center font-medium">
                  {t(`userRole.${r}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_KEYS.map((p) => (
              <tr key={p} className="border-b border-[#eef2f7] last:border-0">
                <td className="px-4 py-2 text-slate-600">{t(`perm.${p}`)}</td>
                {ROLES.map((r) => (
                  <td key={r} className="px-2 py-2 text-center">
                    <span className={ROLE_PERMISSIONS[r][p] ? "text-emerald-700 font-bold" : "text-slate-500"}>
                      {ROLE_PERMISSIONS[r][p] ? "✓" : "—"}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Platform architecture — future integrations (concept only) */}
      <Card>
        <SectionTitle sub={t("arch.note")}>{t("arch.title")}</SectionTitle>
        <div className="mx-auto max-w-md">
          <div className="grid grid-cols-3 gap-2">
            {["HIS / EHR", "LIS", "Claims", "Insurance", "ADT", "Pharmacy"].map((s) => (
              <div
                key={s}
                className="rounded-lg border border-[#e2e9f2] bg-[#f8fafc] px-2 py-2 text-center text-xs font-semibold text-slate-600"
              >
                {s}
              </div>
            ))}
          </div>
          <div className="my-2 text-center text-[#0b7a8d]">
            <div className="text-[10px] text-slate-600">{t("arch.systems")}</div>
            ▼
          </div>
          <div className="rounded-xl border-2 border-[#0e9bb5]/30 bg-gradient-to-l from-[#13304d] to-[#1b5fad] px-4 py-3 text-center text-sm font-bold text-white shadow-sm">
            {t("arch.careshift")}
          </div>
          <div className="my-2 text-center text-[#0b7a8d]">▼</div>
          <div className="grid grid-cols-3 gap-2">
            {[t("cmd.clinical"), t("imp.title"), t("pt.evidence")].map((s) => (
              <div
                key={s}
                className="rounded-lg border border-teal-200 bg-teal-50 px-2 py-2 text-center text-[11px] font-semibold text-[#0b7a8d]"
              >
                {s}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>{t("set.depts")}</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {DEPTS.map((d) => (
            <span
              key={d}
              className="rounded-lg border border-[#e2e9f2] bg-[#f8fafc] px-3 py-1.5 text-sm text-slate-600"
            >
              {t(`dept.${d}`)}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
