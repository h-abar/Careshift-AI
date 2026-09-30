"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { patchJson, postJson, useNotifications } from "@/lib/api";
import { Icon } from "@/components/icons";
import type { NotificationItem } from "@/lib/types";

const DOT: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-400",
  info: "bg-sky-400",
};

function linkFor(n: NotificationItem): string {
  if (n.entityType === "handoff" && n.entityId) return `/handoffs/${n.entityId}`;
  if (n.entityType === "claim") return "/insurance";
  if (n.entityType === "intervention") return "/interventions";
  if (n.patientId) return `/patient/${n.patientId}`;
  return "/";
}

function minutesAgo(n: NotificationItem): number {
  if (n.createdAt) {
    return Math.max(
      0,
      Math.round((Date.now() - new Date(n.createdAt).getTime()) / 60000),
    );
  }
  return n.min;
}

export function NotificationCenter() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { data, refetch } = useNotifications();
  const items = data?.notifications ?? [];
  const unread = items.filter((n) => !n.read).length;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const text = (n: NotificationItem) =>
    t(n.key)
      .replace("{id}", n.entityId ?? n.patientId ?? "")
      .replace("{detail}", n.detail ?? "");

  const ack = (id: string) =>
    patchJson(`/api/notifications/${id}`, { action: "ack" })
      .then(() => refetch())
      .catch(() => {});

  const dismiss = (id: string) =>
    patchJson(`/api/notifications/${id}`, { action: "dismiss" })
      .then(() => refetch())
      .catch(() => {});

  const markAll = () =>
    postJson(`/api/notifications`, {})
      .then(() => refetch())
      .catch(() => {});

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
              onClick={markAll}
              className="text-[11px] font-medium text-[#0e9bb5] hover:underline"
            >
              {t("ntf.markAll")}
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className="group relative">
                <Link
                  href={linkFor(n)}
                  onClick={() => {
                    if (!n.read) ack(n.id);
                    setOpen(false);
                  }}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-[#f8fafc] ${!n.read ? "bg-[#0e9bb5]/[0.04]" : ""}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[n.level]}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-700">
                      {text(n)}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {minutesAgo(n)} {t("usr.minAgo")}
                    </span>
                  </span>
                </Link>
                <button
                  onClick={() => dismiss(n.id)}
                  aria-label={t("ntf.dismiss")}
                  className="absolute end-2 top-2 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-500 group-hover:opacity-100"
                >
                  ✕
                </button>
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
