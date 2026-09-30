"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { useUsers } from "@/lib/api";
import { Avatar, Card, Loading, SectionTitle } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { RoleKey } from "@/lib/types";

const fmtLast = (min: number, t: (k: string) => string) =>
  min < 60
    ? `${min} ${t("usr.minAgo")}`
    : min < 1440
      ? `${Math.floor(min / 60)} ${t("usr.hrAgo")}`
      : `${Math.floor(min / 1440)} ${t("usr.dayAgo")}`;

export default function UsersPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const { data } = useUsers();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");

  if (!can("users_manage"))
    return <p className="py-20 text-center text-slate-400">{t("common.noAccess")}</p>;
  if (!data) return <Loading />;
  const users = data.users;

  const filtered = users.filter((u) => {
    const name = (lang === "ar" ? u.nameAr : u.nameEn).toLowerCase();
    return (
      (!q || name.includes(q.toLowerCase()) || u.employeeId.includes(q)) &&
      (!role || u.role === role) &&
      (!dept || u.dept === dept) &&
      (!status || u.status === status)
    );
  });

  const select =
    "rounded-lg border border-[#e2e9f2] bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-[#0e9bb5]/50";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>{t("usr.title")}</SectionTitle>
        <button className="rounded-lg bg-[#13304d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b5fad] transition-colors">
          + {t("usr.add")}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Icon name="search" className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("usr.search")}
            className="w-56 rounded-lg border border-[#e2e9f2] bg-white py-2 ps-9 pe-3 text-sm outline-none focus:border-[#0e9bb5]/50"
          />
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={select}>
          <option value="">{t("usr.allRoles")}</option>
          {(["admin", "physician", "nurse", "charge_nurse", "insurance", "hospital_admin"] as RoleKey[]).map((r) => (
            <option key={r} value={r}>{t(`userRole.${r}`)}</option>
          ))}
        </select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={select}>
          <option value="">{t("usr.allDepts")}</option>
          {["icu", "er", "medical", "surgical", "claims", "operations", "it"].map((d) => (
            <option key={d} value={d}>{t(`dept.${d}`)}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={select}>
          <option value="">{t("usr.allStatus")}</option>
          <option value="active">{t("ustatus.active")}</option>
          <option value="suspended">{t("ustatus.suspended")}</option>
        </select>
      </div>

      {/* Desktop table */}
      <Card className="hidden !p-0 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e2e9f2] text-xs text-slate-500">
              {[t("usr.user"), t("usr.role"), t("usr.dept"), t("usr.status"), t("usr.lastLogin"), t("usr.actions")].map((h) => (
                <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-[#eef2f7] last:border-0 hover:bg-[#f8fafc]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={lang === "ar" ? u.nameAr : u.nameEn} />
                    <div>
                      <div className="font-semibold text-[#13304d]">
                        {lang === "ar" ? u.nameAr : u.nameEn}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400">{u.employeeId}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{t(`userRole.${u.role}`)}</td>
                <td className="px-4 py-3 text-slate-600">{t(`dept.${u.dept}`)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                    u.status === "active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-500 border-slate-200"
                  }`}>
                    {t(`ustatus.${u.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{fmtLast(u.lastLoginMin, t)}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/users/${u.id}`}
                    className="text-xs font-semibold text-[#0e9bb5] hover:underline"
                  >
                    {t("usr.profile")} →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-2.5 md:hidden">
        {filtered.map((u) => (
          <Link key={u.id} href={`/users/${u.id}`}>
            <Card className="!p-3.5 flex items-center gap-3">
              <Avatar name={lang === "ar" ? u.nameAr : u.nameEn} size="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[#13304d]">
                  {lang === "ar" ? u.nameAr : u.nameEn}
                </div>
                <div className="text-xs text-slate-500">
                  {t(`userRole.${u.role}`)} · {t(`dept.${u.dept}`)}
                </div>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                u.status === "active"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-100 text-slate-500 border-slate-200"
              }`}>
                {t(`ustatus.${u.status}`)}
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
