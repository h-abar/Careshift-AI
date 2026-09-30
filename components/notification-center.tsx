"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useNotifications } from "@/lib/api";
import { Icon } from "@/components/icons";

const DOT: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-400",
  info: "bg-sky-400",
};

export function NotificationCenter() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const items = (data?.notifications ?? []).map((n) => ({
    ...n,
    read: n.read || readIds.has(n.id),
  }));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg border border-[#e2e9f2] bg-white p-2 text-slate-500 hover:text-[#0e9bb5] hover:border-[#0e9bb5]/40 transition-colors"
        aria-label={t("ntf.title")}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span className="absolute -top-1 -end-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[#e2e9f2] bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-[#eef2f7] px-4 py-2.5">
            <span className="text-sm font-bold text-[#13304d]">{t("ntf.title")}</span>
            <button
              onClick={() =>
                setReadIds(new Set(items.map((n) => n.id)))
              }
              className="text-[11px] font-medium text-[#0e9bb5] hover:underline"
            >
              {t("ntf.markAll")}
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.patientId ? `/patient/${n.patientId}` : "/handoffs"}
                  onClick={() => setOpen(false)}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-[#f8fafc] ${!n.read ? "bg-[#0e9bb5]/[0.04]" : ""}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[n.level]}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-700">
                      {t(n.key)}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {n.min} {t("usr.minAgo")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">
                {t("ntf.empty")}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
