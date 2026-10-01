"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import type { PermKey } from "@/lib/permissions";
import { Icon } from "@/components/icons";
import { NotificationCenter } from "@/components/notification-center";
import { UserMenu } from "@/components/user-menu";
import { LoginScreen } from "@/components/login-screen";
import { Avatar } from "@/components/ui";

const MAIN_NAV: { href: string; key: string; icon: string; perm?: PermKey }[] = [
  { href: "/", key: "nav.command", icon: "dashboard" },
  { href: "/handoff", key: "nav.handoff", icon: "handoff", perm: "handoff_view" },
  { href: "/handoffs", key: "nav.handoffs", icon: "handoffs", perm: "handoff_view" },
  { href: "/patients", key: "nav.patients", icon: "patients", perm: "patients_view" },
  { href: "/interventions", key: "nav.interventions", icon: "interventions", perm: "patients_view" },
  { href: "/insurance", key: "nav.insurance", icon: "insurance", perm: "insurance_view" },
  { href: "/reports", key: "nav.reports", icon: "reports", perm: "reports_view" },
];

const ADMIN_NAV: { href: string; key: string; icon: string; perm: PermKey }[] = [
  { href: "/users", key: "nav.users", icon: "users", perm: "users_manage" },
  { href: "/audit", key: "nav.audit", icon: "audit", perm: "audit_view" },
  { href: "/settings", key: "nav.settings", icon: "settings", perm: "settings_manage" },
];

// Mobile bottom bar — Home | Handoff | Patients | Actions | Profile(menu)
const MOBILE_NAV = [
  { href: "/", key: "nav.command", icon: "home" },
  { href: "/handoff", key: "nav.handoff", icon: "handoff", perm: "handoff_view" as PermKey },
  { href: "/patients", key: "nav.patients", icon: "patients", perm: "patients_view" as PermKey },
  { href: "/interventions", key: "nav.interventions", icon: "check", perm: "patients_view" as PermKey },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { t, lang, toggle } = useI18n();
  const { user, impersonator, stopSwitch, consent, can } = useAuth();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const visibleMain = MAIN_NAV.filter((n) => !n.perm || can(n.perm));
  const visibleAdmin = ADMIN_NAV.filter((n) => can(n.perm));
  const visibleMobile = MOBILE_NAV.filter((n) => !("perm" in n) || !n.perm || can(n.perm));

  // Gate the whole workspace behind the login screen — except the public demo.
  if (!user) {
    if (pathname === "/demo")
      return (
        <main className="min-h-screen bg-[#f4f7fa] px-4 py-6 sm:px-6">{children}</main>
      );
    return <LoginScreen />;
  }

  const navLink = (
    n: { href: string; key: string; icon: string },
    onClick?: () => void,
  ) => (
    <Link
      key={n.href}
      href={n.href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive(n.href)
          ? "bg-[#0e9bb5]/10 text-[#075e6e]"
          : "text-slate-600 hover:bg-[#f4f7fa] hover:text-[#13304d]"
      }`}
    >
      <Icon name={n.icon as never} className="h-5 w-5 shrink-0" />
      {t(n.key)}
    </Link>
  );

  const sidebarBody = (
    <>
      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
        {t("nav.main")}
      </div>
      <nav className="space-y-0.5 px-3">{visibleMain.map((n) => navLink(n, () => setDrawer(false)))}</nav>
      {visibleAdmin.length > 0 && (
        <>
          <div className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-600">
            {t("nav.admin")}
          </div>
          <nav className="space-y-0.5 px-3">{visibleAdmin.map((n) => navLink(n, () => setDrawer(false)))}</nav>
        </>
      )}
      <div className="mt-auto border-t border-[#eef2f7] p-3">
        <div className="flex items-center gap-2.5">
          <Avatar name={lang === "ar" ? user.nameAr : user.nameEn} />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-[#13304d]">
              {lang === "ar" ? user.nameAr : user.nameEn}
            </div>
            <div className="truncate text-[10px] text-slate-600">
              {t(`userRole.${user.role}`)} · {t(`dept.${user.dept}`)}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-[#f4f7fa]">
      {/* ── Desktop sidebar (inline-start = right side in RTL) ── */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-60 flex-col border-e border-[#e2e9f2] bg-white lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-[#eef2f7] px-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Careshift AI" className="h-full w-full object-cover" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-bold text-[#13304d]">{t("app.name")}</span>
            <span className="block text-[10px] font-semibold text-[#0b7a8d]">
              {t("app.tagline")}
            </span>
          </span>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto pb-2 pt-2">{sidebarBody}</div>
      </aside>

      {/* ── Drawer (mobile / tablet) ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-[#13304d]/40"
            onClick={() => setDrawer(false)}
          />
          <aside className="absolute inset-y-0 start-0 flex w-64 flex-col bg-white shadow-2xl">
            <div className="flex h-16 items-center gap-3 border-b border-[#eef2f7] px-4">
              <span className="flex h-9 w-9 overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="" className="h-full w-full object-cover" />
              </span>
              <span className="text-sm font-bold text-[#13304d]">{t("app.name")}</span>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto pb-2 pt-2">{sidebarBody}</div>
          </aside>
        </div>
      )}

      {/* ── PDPL demo-data consent — blocks the workspace until acknowledged.
           Skipped during admin view-as: the impersonator already consented. ── */}
      {!user.consentAt && !impersonator && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="consent-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#13304d]/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="consent-title" className="text-base font-bold text-[#13304d]">
              {t("consent.title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("consent.body")}
            </p>
            <button
              onClick={consent}
              className="mt-5 w-full rounded-xl bg-[#0b7a8d] py-2.5 text-sm font-bold text-white hover:bg-[#075e6e]"
            >
              {t("consent.accept")}
            </button>
          </div>
        </div>
      )}

      {/* ── Main column ── */}
      <div className="flex min-h-screen flex-1 flex-col lg:ps-60">
        {/* Impersonation banner — persistent while an admin views as a user */}
        {impersonator && (
          <div className="sticky top-0 z-40 flex h-8 items-center justify-center gap-3 bg-purple-700 px-4 text-xs font-semibold text-white">
            <span>
              {t("usr.viewingAs")}: {lang === "ar" ? user.nameAr : user.nameEn}
              <span className="mx-2 opacity-50">·</span>
              {t(`userRole.${user.role}`)}
            </span>
            <button
              onClick={stopSwitch}
              className="rounded-md bg-white/15 px-2.5 py-1 font-bold hover:bg-white/25"
            >
              ← {t("usr.returnAdmin")}
            </button>
          </div>
        )}
        {/* Header */}
        <header className={`sticky ${impersonator ? "top-8" : "top-0"} z-30 flex h-16 items-center gap-3 border-b border-[#e2e9f2] bg-white/95 px-4 backdrop-blur sm:px-6`}>
          <button
            onClick={() => setDrawer(true)}
            className="rounded-lg border border-[#e2e9f2] p-2 text-slate-600 lg:hidden"
            aria-label="menu"
          >
            <Icon name="menu" />
          </button>

          {/* Facility / department */}
          <div className="hidden items-center gap-2 rounded-lg border border-[#e2e9f2] bg-[#f8fafc] px-3 py-1.5 md:flex">
            <Icon name="home" className="h-4 w-4 text-[#0b7a8d]" />
            <span className="text-xs font-semibold text-[#13304d]">
              {t("dept.hospital")}
            </span>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-slate-600">{t(`dept.${user.dept}`)}</span>
          </div>

          {/* Search */}
          <div className="relative ms-auto hidden sm:block">
            <Icon
              name="search"
              className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
            />
            <input
              aria-label={t("common.search")}
              placeholder={t("common.search")}
              className="w-44 rounded-lg border border-[#e2e9f2] bg-[#f8fafc] py-2 ps-9 pe-3 text-sm outline-none transition-all placeholder:text-slate-400 focus:w-64 focus:border-[#0e9bb5]/50 focus:bg-white xl:w-56"
            />
          </div>
          <div className="ms-auto sm:ms-0" />

          <NotificationCenter />
          <Link
            href="/demo"
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-l from-[#1b5fad] to-[#0b7a8d] px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"
          >
            ▶ {t("demo.mode")}
          </Link>
          <button
            onClick={toggle}
            className="rounded-lg border border-[#e2e9f2] bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-[#0e9bb5]/40 hover:text-[#0b7a8d]"
          >
            {lang === "ar" ? "EN" : "ع"}
          </button>
          <UserMenu />
        </header>

        {/* Content */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
          {children}
        </main>

        {/* Disclaimer + reference-data freshness (A4) */}
        <footer className="border-t border-[#e2e9f2] bg-white">
          <p className="mx-auto max-w-7xl px-4 py-2.5 text-center text-[11px] text-slate-600 sm:px-6">
            {t("app.disclaimer")}
          </p>
          <DataFreshness />
        </footer>
      </div>

      {/* ── Mobile bottom navigation ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-[#e2e9f2] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {visibleMobile.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
              isActive(n.href) ? "text-[#0b7a8d]" : "text-slate-600"
            }`}
          >
            <Icon name={n.icon as never} className="h-5 w-5" />
            {t(n.key)}
          </Link>
        ))}
        <button
          onClick={() => setDrawer(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-slate-600"
        >
          <Icon name="user" className="h-5 w-5" />
          {t("usr.profile")}
        </button>
      </nav>
    </div>
  );
}

/** Oldest fetch date across synced providers → "data as of" (A4). */
function DataFreshness() {
  const { t } = useI18n();
  const [asOf, setAsOf] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch("/api/freshness")
      .then((r) => r.json())
      .then((j) => live && setAsOf(j.asOf ?? null))
      .catch(() => live && setAsOf(null));
    return () => {
      live = false;
    };
  }, []);
  if (asOf === undefined) return null;
  return (
    <p className="pb-2 text-center text-[10px] text-slate-500">
      {asOf ? t("data.asof").replace("{d}", asOf) : t("data.unsynced")}
      {" · "}
      <Link href="/references" className="text-[#1b5fad] underline">
        {t("data.sources")}
      </Link>
      {" — NLM · openFDA · WHO ICD-11 (CC BY-ND 3.0 IGO) · MedlinePlus · NPHIES · PhysioNet/MIMIC"}
    </p>
  );
}
