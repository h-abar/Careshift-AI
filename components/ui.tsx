"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { fmtTime } from "@/lib/format";
import type { InterventionStatus, RiskLevel } from "@/lib/types";

// ── Light clinical palette per risk level ────────────────────────────────────
export const LEVEL_STYLES: Record<
  RiskLevel,
  { badge: string; dot: string; text: string; ring: string; bar: string }
> = {
  critical: {
    badge: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
    text: "text-red-600",
    ring: "border-red-300",
    bar: "bg-red-500",
  },
  high: {
    badge: "bg-orange-50 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
    text: "text-orange-700",
    ring: "border-orange-300",
    bar: "bg-orange-500",
  },
  medium: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    text: "text-amber-700",
    ring: "border-amber-300",
    bar: "bg-amber-400",
  },
  low: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    ring: "border-emerald-200",
    bar: "bg-emerald-500",
  },
};

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const { t } = useI18n();
  const s = LEVEL_STYLES[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} animate-pulse`} />
      {t(`risk.${level}`)}
      {score !== undefined && <span>· {score}</span>}
    </span>
  );
}

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-[#e2e9f2] bg-white p-5 shadow-[0_1px_3px_rgba(19,48,77,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-bold text-[#13304d]">{children}</h2>
      {sub && <p className="mt-0.5 text-xs text-slate-600">{sub}</p>}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  accent = "text-[#13304d]",
  sub,
  trend,
  trendUp,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  accent?: string;
  sub?: string;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#e2e9f2] bg-white p-4 shadow-[0_1px_3px_rgba(19,48,77,0.06)]">
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className={`mt-1 text-[28px] leading-8 font-bold tabular-nums ${accent}`}>
        {value}
        {unit && (
          <span className="ms-1 text-xs font-medium text-slate-600">{unit}</span>
        )}
      </div>
      {(sub || trend) && (
        <div className="mt-1 flex items-center gap-1 text-[11px]">
          {trend && (
            <span className={`font-semibold ${trendUp ? "text-emerald-700" : "text-red-600"}`}>
              {trendUp ? "▲" : "▼"} {trend}
            </span>
          )}
          {sub && <span className="text-slate-600">{sub}</span>}
        </div>
      )}
    </div>
  );
}

export function Meter({
  pct,
  color = "bg-[#0e9bb5]",
  className = "",
}: {
  pct: number;
  color?: string;
  className?: string;
}) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-[#eef2f7] ${className}`}>
      <div
        className={`h-full rounded-full ${color} transition-all`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

export function IvStatusChip({ status }: { status: InterventionStatus }) {
  const { t } = useI18n();
  const map: Record<InterventionStatus, string> = {
    done: "bg-emerald-50 text-emerald-700 border-emerald-200",
    in_progress: "bg-sky-50 text-sky-700 border-sky-200",
    pending: "bg-slate-100 text-slate-600 border-slate-200",
    overdue: "bg-red-50 text-red-700 border-red-200",
    escalated: "bg-purple-50 text-purple-700 border-purple-200",
    resolved: "bg-teal-50 text-teal-700 border-teal-200",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${map[status]}`}
    >
      {t(`iv.${status}`)}
    </span>
  );
}

/** Live ticking countdown; calls onExpire once when it hits zero. */
export function Countdown({
  seedMin,
  onExpire,
}: {
  seedMin: number;
  onExpire?: () => void;
}) {
  const [secs, setSecs] = useState(seedMin * 60);
  const { t } = useI18n();
  const fired = useRef(false);
  const over = secs <= 0;

  useEffect(() => {
    if (over) return;
    const id = setInterval(() => setSecs((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [over]);

  useEffect(() => {
    if (over && onExpire && !fired.current) {
      fired.current = true;
      onExpire();
    }
  }, [over, onExpire]);
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-sm font-bold tabular-nums ${
        over ? "text-red-600" : secs <= 300 ? "text-amber-700" : "text-[#0b7a8d]"
      }`}
    >
      {over ? `−${fmtTime(-secs)}` : fmtTime(secs)}
      <span className="text-[10px] font-medium text-slate-600">
        {over ? t("common.overdue") : t("common.dueIn")}
      </span>
    </span>
  );
}

/** Avatar circle with initials — brand navy. */
export function Avatar({ name, size = "h-9 w-9", className = "" }: { name: string; size?: string; className?: string }) {
  const initials = name
    .replace(/^(د\.|Dr\.)\s*/, "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br from-[#1b5fad] to-[#0b7a8d] text-xs font-bold text-white ${size} ${className}`}
    >
      {initials}
    </span>
  );
}

/** Skeleton placeholder rows while a data view loads. */
export function Skeleton({
  rows = 4,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`animate-pulse space-y-3 ${className}`} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-16 rounded-xl border border-[#e2e9f2] bg-white"
        />
      ))}
    </div>
  );
}

/** Uniform empty state. */
export function Empty({ title, hint }: { title?: string; hint?: string }) {
  const { t } = useI18n();
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-semibold text-slate-600">
        {title ?? t("common.empty")}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
    </div>
  );
}

/** Uniform error state with a retry action. */
export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="py-12 text-center" role="alert">
      <p className="text-sm font-semibold text-red-600">
        {t("common.loadError")}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg border border-[#e2e9f2] px-4 py-2 text-sm font-semibold text-[#0b7a8d] hover:bg-[#0e9bb5]/5"
        >
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

/**
 * Standard data-view gate: skeleton while loading, error+retry on failure,
 * Loading as a last resort. Wrap the page body after hooks resolve.
 */
export function Gate({
  loading,
  error,
  data,
  onRetry,
  skeletonRows = 4,
  children,
}: {
  loading: boolean;
  error: string | null;
  data: unknown;
  onRetry?: () => void;
  skeletonRows?: number;
  children: ReactNode;
}) {
  if (loading && !data) return <Skeleton rows={skeletonRows} />;
  if (error && !data) return <ErrorState onRetry={onRetry} />;
  if (!data) return <Loading />;
  return <>{children}</>;
}

/** Brand logo tile — the dark "C" mark in a rounded card. */
export function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
        <span className="h-2.5 w-2.5 animate-ping rounded-full bg-[#0e9bb5]" />
        Careshift AI
      </div>
    </div>
  );
}

/** Accessible modal: dialog role, Escape to close, backdrop click, focus restore. */
export function Modal({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current
      ?.querySelector<HTMLElement>("input, select, textarea, button")
      ?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#13304d]/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full rounded-2xl bg-white shadow-2xl ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

/** Confirmation dialog for destructive / irreversible actions. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#13304d]/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-[#13304d]">{title}</h3>
        {body && <p className="mt-2 text-sm text-slate-600">{body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-[#e2e9f2] px-4 py-2 text-sm font-semibold text-slate-600"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-[#0b7a8d] hover:bg-[#1b5fad]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Logo({ size = "h-9 w-9", className = "" }: { size?: string; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-sm ${size} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Careshift AI" className="h-full w-full object-cover" />
    </span>
  );
}
