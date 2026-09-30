"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { useUsers } from "@/lib/api";
import { Avatar } from "@/components/ui";

export function UserMenu() {
  const { t, lang, toggle } = useI18n();
  const { user, impersonator, switchUser, logout } = useAuth();
  // "View as" is admin-only — /api/users 403s for other roles (data stays
  // null → section hidden), and the switch endpoint enforces + audits it.
  const { data: usersData } = useUsers();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="user menu"
        className="flex items-center gap-2 rounded-lg border border-[#e2e9f2] bg-white px-2 py-1.5 hover:border-[#0e9bb5]/40 transition-colors"
      >
        <Avatar name={lang === "ar" ? user.nameAr : user.nameEn} size="h-8 w-8" />
        <span className="hidden sm:block text-start">
          <span className="block text-xs font-semibold text-[#13304d] leading-tight">
            {lang === "ar" ? user.nameAr : user.nameEn}
          </span>
          <span className="block text-[10px] text-slate-600 leading-tight">
            {t(`userRole.${user.role}`)}
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute end-0 top-12 z-50 w-72 rounded-xl border border-[#e2e9f2] bg-white shadow-xl">
          <div className="border-b border-[#eef2f7] px-4 py-3">
            <div className="text-sm font-bold text-[#13304d]">
              {lang === "ar" ? user.nameAr : user.nameEn}
            </div>
            <div className="text-xs text-slate-600">
              {t(`userRole.${user.role}`)} · {t(`dept.${user.dept}`)}
            </div>
            {impersonator && (
              <div className="mt-1.5 rounded-md bg-purple-50 border border-purple-200 px-2 py-1 text-[10px] font-semibold text-purple-700">
                {t("usr.viewAs")}: {lang === "ar" ? impersonator.nameAr : impersonator.nameEn}
              </div>
            )}
          </div>

          {usersData && !impersonator && (
            <div className="px-4 py-2.5">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                {t("usr.viewAs")} (admin)
              </div>
              <div className="max-h-44 space-y-0.5 overflow-y-auto">
                {usersData.users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      switchUser(u.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs ${
                      u.id === user.id
                        ? "bg-[#0e9bb5]/10 text-[#075e6e] font-semibold"
                        : "text-slate-600 hover:bg-[#f4f7fa]"
                    }`}
                  >
                    <Avatar name={lang === "ar" ? u.nameAr : u.nameEn} size="h-6 w-6" />
                    <span className="flex-1 truncate">
                      {lang === "ar" ? u.nameAr : u.nameEn}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      {t(`userRole.${u.role}`)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-[#eef2f7] px-4 py-2.5 space-y-1.5">
            <button
              onClick={toggle}
              className="w-full rounded-lg border border-[#e2e9f2] px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-[#f4f7fa]"
            >
              {lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
            </button>
            <button
              onClick={logout}
              className="w-full rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              {t("login.logout")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
