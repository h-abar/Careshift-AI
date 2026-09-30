"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { Icon } from "@/components/icons";

const STEPS = [
  { icon: "magnify", en: "login.detect", sub: "login.detectSub" },
  { icon: "users", en: "login.intervene", sub: "login.interveneSub" },
  { icon: "reports", en: "login.prove", sub: "login.proveSub" },
] as const;

export function LoginScreen() {
  const { t, lang, toggle } = useI18n();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<"" | "invalid" | "locked" | "captcha">("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const res = await login(username, password, captchaToken || undefined);
    setBusy(false);
    if (res !== "ok") {
      setError(res);
      setShake((s) => s + 1);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#fafbfd]">
      {/* ══ Brand panel — dark navy + hero art, right side in RTL ══ */}
      <div className="relative hidden flex-1 overflow-hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login-hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full scale-105 object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071a34]/95 via-[#0d2a4d]/55 to-[#0d2a4d]/30" />

        <div className="relative flex h-full flex-col p-10 xl:p-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 overflow-hidden rounded-2xl shadow-lg shadow-black/30 ring-1 ring-white/25">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Careshift AI" className="h-full w-full object-cover" />
            </span>
            <div>
              <div className="text-xl font-bold tracking-tight text-white">
                Careshift <span className="text-teal-300">AI</span>
              </div>
              <div className="text-[10px] font-medium tracking-[0.25em] text-teal-200/80">
                PREDICT. INTERVENE. PROVE.
              </div>
            </div>
          </div>

          {/* Headline — upper area like the reference */}
          <div className="mt-16">
            <h2 className="max-w-lg text-4xl font-bold leading-[1.35] text-white xl:text-[2.75rem]">
              {t("login.tagline")}
            </h2>
            <div className="mt-4 flex items-center gap-3">
              <span className="h-px w-10 bg-teal-400/70" />
              <span className="text-base font-medium tracking-wide text-teal-100">
                {t("login.platform")}
              </span>
            </div>
          </div>

          {/* Floating glass chips — right edge */}
          <div className="absolute end-8 top-40 rounded-2xl border border-white/15 bg-[#0d2a4d]/70 px-5 py-3.5 shadow-xl shadow-black/25 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-teal-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-300" />
              AI Risk
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-white" dir="ltr">
              87 → 42 → 18
            </div>
          </div>
          <div className="absolute end-8 top-64 rounded-2xl border border-white/15 bg-[#0d2a4d]/70 px-5 py-3 shadow-xl shadow-black/25 backdrop-blur-xl">
            <div className="text-[10px] font-bold uppercase tracking-widest text-teal-300">
              Evidence
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm font-bold text-emerald-300">
              <Icon name="check" className="h-4 w-4" /> Complete · 100%
            </div>
          </div>
          <div className="absolute end-8 top-88 rounded-2xl border border-white/15 bg-[#0d2a4d]/70 px-5 py-3 shadow-xl shadow-black/25 backdrop-blur-xl">
            <div className="text-[10px] font-bold uppercase tracking-widest text-teal-300">
              Insurance Value
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-white" dir="ltr">
              Claim Readiness 96%
            </div>
          </div>

          {/* Bottom: Detect → Intervene → Prove + values */}
          <div className="mt-auto">
            <div className="flex items-center gap-5">
              {STEPS.map((s, i) => (
                <div key={s.en} className="flex items-center gap-5">
                  <div className="flex flex-col items-center gap-2">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full border border-teal-300/40 bg-white/10 text-teal-300 shadow-lg shadow-black/20 backdrop-blur">
                      <Icon name={s.icon as never} className="h-6 w-6" />
                    </span>
                    <span className="text-sm font-bold text-white">{t(s.en)}</span>
                    <span className="text-[11px] text-teal-200/80">{t(s.sub)}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <span className="mb-9 text-lg text-teal-300/60 rtl:rotate-180">→</span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-9 border-t border-white/10 pt-5 text-[11px] tracking-wide text-white/50">
              {t("login.values")}
            </p>
          </div>
        </div>
      </div>

      {/* ══ Form panel — white, left side in RTL ══ */}
      <div className="flex flex-1 flex-col px-6 py-6 sm:px-12 lg:max-w-[46%] lg:px-14">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size="h-10 w-10" />
            <span className="leading-tight">
              <span className="block text-base font-bold text-[#13304d]">
                Careshift <span className="text-[#0e9bb5]">AI</span>
              </span>
              <span className="block text-[10px] font-medium tracking-wide text-slate-500">
                Predict. Intervene. Prove.
              </span>
            </span>
          </div>
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-full border border-[#e2e9f2] bg-white px-4 py-2 text-xs font-semibold text-slate-500 transition-colors hover:border-[#0e9bb5]/50 hover:text-[#0e9bb5]"
          >
            🌐 {lang === "ar" ? "English" : "العربية"} ▾
          </button>
        </div>

        {/* Form card */}
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          <h1 className="text-3xl font-bold text-[#13304d]">{t("login.title")}</h1>
          <p className="mt-1.5 text-base text-slate-500">{t("login.sub")}</p>
          <p className="mt-0.5 text-sm text-slate-500">{t("login.access")}</p>

          <div className="mt-8 rounded-3xl border border-[#eef2f7] bg-white p-7 shadow-[0_8px_40px_rgba(19,48,77,0.07)]">
            <form
              key={shake}
              className={error ? "space-y-5 motion-safe:animate-[shake_.3s]" : "space-y-5"}
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div>
                <label className="mb-2 block text-sm font-semibold text-[#13304d]">
                  {t("login.username")}
                </label>
                <div className="relative">
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder={t("login.userPlaceholder")}
                    className={`w-full rounded-2xl border bg-[#f7fafc] py-3.5 ps-4 pe-12 text-base text-[#13304d] outline-none transition-all placeholder:text-slate-400 focus:border-[#0e9bb5] focus:bg-white focus:ring-4 focus:ring-[#0e9bb5]/10 ${
                      error ? "border-red-300" : "border-[#e9eef5]"
                    }`}
                  />
                  <Icon
                    name="user"
                    className="absolute end-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#13304d]">
                  {t("login.password")}
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder={t("login.pwPlaceholder")}
                    className={`w-full rounded-2xl border bg-[#f7fafc] py-3.5 ps-4 pe-12 text-base text-[#13304d] outline-none transition-all placeholder:text-slate-400 focus:border-[#0e9bb5] focus:bg-white focus:ring-4 focus:ring-[#0e9bb5]/10 ${
                      error ? "border-red-300" : "border-[#e9eef5]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute end-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-[#0e9bb5]"
                    aria-label={showPw ? t("login.hide") : t("login.show")}
                  >
                    <Icon name={showPw ? "eyeOff" : "eye"} className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-slate-500">
                  {t("login.remember")}
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-[#e2e9f2] accent-[#0e9bb5]"
                  />
                </label>
                <button
                  type="button"
                  className="font-semibold text-[#0e9bb5] hover:underline"
                >
                  {t("login.forgot")}
                </button>
              </div>

              {error === "captcha" && (
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#13304d]">
                    {t("login.captcha")}
                  </label>
                  <input
                    value={captchaToken}
                    onChange={(e) => setCaptchaToken(e.target.value)}
                    autoComplete="off"
                    placeholder={t("login.captchaPlaceholder")}
                    className="w-full rounded-2xl border border-[#e9eef5] bg-[#f7fafc] py-3.5 px-4 text-base text-[#13304d] outline-none transition-all placeholder:text-slate-400 focus:border-[#0e9bb5] focus:bg-white focus:ring-4 focus:ring-[#0e9bb5]/10"
                  />
                </div>
              )}

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                  ⚠ {error === "locked" || error === "captcha" ? t("login.locked") : t("login.error")}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-[#1d6ae5] to-[#38bdf8] py-4 text-base font-bold text-white shadow-lg shadow-[#1d6ae5]/25 transition-all hover:shadow-xl hover:shadow-[#1d6ae5]/30 hover:brightness-105 disabled:opacity-60"
              >
                {busy ? "…" : t("login.signin")}{" "}
                <span className="rtl:rotate-180">→</span>
              </button>
            </form>

            {/* Divider */}
            <div className="mt-7 flex items-center gap-3">
              <span className="h-px flex-1 bg-[#eef2f7]" />
              <span className="text-xs font-semibold text-slate-500">{t("login.orDemo")}</span>
              <span className="h-px flex-1 bg-[#eef2f7]" />
            </div>

            {/* Demo mode card → /demo */}
            <Link
              href="/demo"
              className="group mt-5 flex items-center gap-4 rounded-2xl border border-[#eef2f7] bg-white px-5 py-4 transition-all hover:border-[#0e9bb5]/50 hover:shadow-lg hover:shadow-[#0e9bb5]/10"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="" className="h-full w-full object-cover" />
              </span>
              <span className="flex-1">
                <span className="block text-base font-bold text-[#13304d] transition-colors group-hover:text-[#0e9bb5]">
                  {t("login.runDemo")}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {t("login.demoSub")}
                </span>
              </span>
              <span className="text-xl text-slate-300 transition-transform group-hover:-translate-x-1.5 rtl:rotate-180 rtl:group-hover:translate-x-1.5">
                →
              </span>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">🛡 {t("login.secure")}</span>
          <span className="text-end leading-tight">
            <span dir="ltr" className="block">{t("login.version")}</span>
            <span className="block text-[10px] text-slate-500">{t("login.tags")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
