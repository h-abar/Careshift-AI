"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import { useUser } from "@/lib/api";
import { PERMISSION_KEYS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { Avatar, Card, ErrorState, Loading, SectionTitle, Skeleton } from "@/components/ui";

export function UserProfile({ userId }: { userId: string }) {
  const { t, lang } = useI18n();
  const { data, loading, error, refetch } = useUser(userId);
  if (loading && !data) return <Skeleton rows={4} />;
  if (error && !data) return <ErrorState onRetry={refetch} />;
  if (!data) return <Loading />;
  const u = data.user;
  const perms = ROLE_PERMISSIONS[u.role];

  const info: [string, string][] = [
    [t("usr.employeeId"), u.employeeId],
    [t("usr.email"), u.email],
    [t("usr.phone"), u.phone],
    [t("usr.dept"), t(`dept.${u.dept}`)],
    [t("usr.specialty"), lang === "ar" ? u.specialty.ar : u.specialty.en],
    [t("usr.createdAt"), u.createdAt],
  ];

  return (
    <div className="space-y-5">
      <Link href="/users" className="text-xs text-slate-600 hover:text-[#0b7a8d]">
        ← {t("common.back")}
      </Link>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={lang === "ar" ? u.nameAr : u.nameEn} size="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-[#13304d]">
              {lang === "ar" ? u.nameAr : u.nameEn}
            </h1>
            <p className="text-sm text-slate-600">
              {t(`userRole.${u.role}`)} · {t(`dept.${u.dept}`)}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              u.status === "active"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            {t(`ustatus.${u.status}`)}
          </span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>{t("usr.info")}</SectionTitle>
          <dl className="space-y-3">
            {info.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <dt className="text-slate-600">{k}</dt>
                <dd className="font-medium text-[#13304d]">{v}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm">
              <dt className="text-slate-600">{t("usr.lastLogin")}</dt>
              <dd className="font-medium text-[#13304d]">
                {u.lastLoginMin === null
                  ? t("usr.never")
                  : u.lastLoginMin < 60
                    ? `${u.lastLoginMin} ${t("usr.minAgo")}`
                    : u.lastLoginMin < 1440
                      ? `${Math.floor(u.lastLoginMin / 60)} ${t("usr.hrAgo")}`
                      : `${Math.floor(u.lastLoginMin / 1440)} ${t("usr.dayAgo")}`}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <SectionTitle sub={t(`userRole.${u.role}`)}>{t("usr.permissions")}</SectionTitle>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {PERMISSION_KEYS.map((k) => (
              <li key={k} className="flex items-center gap-2 text-xs">
                <span className={perms[k] ? "text-emerald-700" : "text-slate-500"}>
                  {perms[k] ? "✓" : "✗"}
                </span>
                <span className={perms[k] ? "text-slate-700" : "text-slate-600"}>
                  {t(`perm.${k}`)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
