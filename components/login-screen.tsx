"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/ui";

interface DemoAccount {
  id: string;
  roleAr: string;
  roleEn: string;
  nameAr: string;
  nameEn: string;
  user: string;
  pass: string;
  badge: string;
  icon: string;
  color: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "doctor",
    roleAr: "طبيب معالج",
    roleEn: "Physician",
    nameAr: "د. أحمد سالم",
    nameEn: "Dr. Ahmed Salem",
    user: "a.salem",
    pass: "Demo@1021",
    badge: "ICU / تدهور",
    icon: "👨‍⚕️",
    color: "from-blue-500/20 to-cyan-500/20 text-cyan-400 border-cyan-500/30",
  },
  {
    id: "nurse",
    roleAr: "تمريض سريري",
    roleEn: "Nurse",
    nameAr: "سارة أحمد",
    nameEn: "Sara Ahmed",
    user: "s.ahmed",
    pass: "Demo@2088",
    badge: "تنفيذ وتوثيق",
    icon: "👩‍⚕️",
    color: "from-teal-500/20 to-emerald-500/20 text-teal-400 border-teal-500/30",
  },
  {
    id: "charge",
    roleAr: "مشرف التمريض",
    roleEn: "Charge Nurse",
    nameAr: "خالد محمد",
    nameEn: "Khaled Mohammed",
    user: "k.mohammed",
    pass: "Demo@3310",
    badge: "تسليم SBAR",
    icon: "🩺",
    color: "from-indigo-500/20 to-purple-500/20 text-indigo-400 border-indigo-500/30",
  },
  {
    id: "insurance",
    roleAr: "مراجع التأمين",
    roleEn: "Insurance Reviewer",
    nameAr: "منى العتيبي",
    nameEn: "Mona Alotaibi",
    user: "m.alotaibi",
    pass: "Demo@5542",
    badge: "مطالبات ونفيس",
    icon: "📑",
    color: "from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30",
  },
  {
    id: "admin",
    roleAr: "مدير النظام",
    roleEn: "Administrator",
    nameAr: "عمر خليل",
    nameEn: "Omar Khalil",
    user: "o.khalil",
    pass: "Demo@8895",
    badge: "صلاحيات وتحكم",
    icon: "⚡",
    color: "from-rose-500/20 to-pink-500/20 text-rose-400 border-rose-500/30",
  },
];

const WORKFLOW_STEPS = [
  {
    step: "01",
    en: "Detect",
    ar: "تنبّأ بالخطر",
    subEn: "Early Deterioration",
    subAr: "كشف مبكر لدرجات NEWS2",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    step: "02",
    en: "Intervene",
    ar: "تدخّل سريرياً",
    subEn: "Closed Loop Care",
    subAr: "تسليم SBAR وأوامر الأطباء",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    step: "03",
    en: "Prove",
    ar: "أثبت بالأدلة",
    subEn: "Claim Ready (NPHIES)",
    subAr: "مطالبات مدعومة بأحداث حقيقية",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
];

export function LoginScreen() {
  const { t, lang, toggle } = useI18n();
  const isAr = lang === "ar";
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<"" | "invalid" | "locked" | "captcha">("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selectedDemoId, setSelectedDemoId] = useState<string | null>(null);

  const applyDemoRole = (role: DemoAccount) => {
    setSelectedDemoId(role.id);
    setUsername(role.user);
    setPassword(role.pass);
    setError("");
  };

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
    <div className="flex min-h-screen bg-[#071322] lg:bg-[#f6f9fc]">
      {/* ══════════════════════════════════════════════════════════════════
          1. Brand / Visual Showcase Panel (Right in RTL, Left in LTR)
          ══════════════════════════════════════════════════════════════════ */}
      <div className="relative hidden flex-1 overflow-hidden bg-[#051120] text-white lg:flex lg:flex-col justify-between p-10 xl:p-14">
        {/* Background Decorative Mesh & Gradients */}
        <div className="pointer-events-none absolute -end-24 -top-24 h-96 w-96 rounded-full bg-teal-500/15 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-32 -start-32 h-[30rem] w-[30rem] rounded-full bg-blue-600/20 blur-[140px]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#1e3a5f_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />

        {/* Subtle hospital image overlay */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login-hero.jpg"
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-luminosity"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#040c17] via-[#051120]/80 to-[#07172c]/90" />

        {/* Top: Logo & System Identity */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-teal-400 to-blue-600 p-[1px] shadow-xl shadow-teal-500/20">
              <div className="flex h-full w-full items-center justify-center rounded-[15px] bg-[#071629]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="Careshift AI" className="h-8 w-8 object-contain" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight text-white">
                  Careshift <span className="bg-gradient-to-r from-teal-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">AI</span>
                </span>
                <span className="rounded-full border border-teal-400/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-300">
                  2.0 Enterprise
                </span>
              </div>
              <div className="text-[11px] font-medium tracking-wider text-slate-400">
                {isAr ? "منصة الذكاء السريري والتأميني الموحدة" : "Clinical & Insurance Intelligence Platform"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-md">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-[11px] font-semibold text-slate-300">
              {isAr ? "متصل بمنظومة نَفيس" : "NPHIES Connected"}
            </span>
          </div>
        </div>

        {/* Center: Main Value Statement & Live Clinical Metric Cards */}
        <div className="relative z-10 my-auto py-8">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/20 bg-teal-400/10 px-3.5 py-1 text-xs font-semibold text-teal-300 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-ping" />
              <span>{isAr ? "منظومة الحلقات المغلقة (Closed Loop)" : "Closed-Loop Care Architecture"}</span>
            </div>

            <h1 className="mt-4 text-3xl font-extrabold leading-snug text-white xl:text-4xl">
              {isAr ? (
                <>
                  تنبّأ بالخطر. تدخّل مبكرًا. <br />
                  <span className="bg-gradient-to-r from-teal-300 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
                    وأثبت القيمة التأمينية بالأدلة.
                  </span>
                </>
              ) : (
                <>
                  Predict deterioration. Intervene early. <br />
                  <span className="bg-gradient-to-r from-teal-300 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
                    Prove digital clinical evidence.
                  </span>
                </>
              )}
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-slate-300 xl:text-base">
              {isAr
                ? "تحويل إدارة المرضى من ردود أفعال متأخرة إلى رعاية تنبؤية استباقية؛ كل تدخل سريري موثق زمنياً يشكل دليلاً غير قابل للرفض أمام شركات التأمين."
                : "A proactive care engine turning clinical intervention into immutable, claim-ready digital evidence with zero unbacked exposure."}
            </p>
          </div>

          {/* Interactive Floating Clinical Metrics */}
          <div className="mt-8 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {/* Metric 1 */}
            <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl transition-all hover:border-teal-400/40 hover:bg-white/[0.08]">
              <div className="flex items-center justify-between text-xs text-teal-300">
                <span className="font-semibold">{isAr ? "كشف التدهور (NEWS2)" : "AI Risk Signal"}</span>
                <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight text-white" dir="ltr">
                87 <span className="text-sm font-normal text-slate-400">→</span> 42 <span className="text-sm font-normal text-slate-400">→</span> 18
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                <span>{isAr ? "حالة DKA تداركت مبكراً" : "DKA Case Avoided"}</span>
                <svg className="h-4 w-12 text-teal-400" viewBox="0 0 60 16" fill="none">
                  <path d="M0 8h15l3-6 4 12 3-8 3 4 4-2h28" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {/* Metric 2 */}
            <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl transition-all hover:border-emerald-400/40 hover:bg-white/[0.08]">
              <div className="flex items-center justify-between text-xs text-emerald-300">
                <span className="font-semibold">{isAr ? "سلسلة الأدلة" : "Evidence Chain"}</span>
                <span className="text-emerald-400">✓</span>
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight text-white">
                100%
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                {isAr ? "مشفرة بسلاسل SHA-256" : "Immutable & SHA-256"}
              </div>
            </div>

            {/* Metric 3 */}
            <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl transition-all hover:border-cyan-400/40 hover:bg-white/[0.08]">
              <div className="flex items-center justify-between text-xs text-cyan-300">
                <span className="font-semibold">{isAr ? "جاهزية المطالبة" : "Claim Readiness"}</span>
                <span className="text-cyan-400">96%</span>
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight text-white">
                0% <span className="text-xs font-medium text-emerald-400">{isAr ? "رفوضات" : "Denials"}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                {isAr ? "مبرر سريري مكتمل" : "Event-backed lines"}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: 3-Step Closed Loop Visual Tracker */}
        <div className="relative z-10 border-t border-white/10 pt-6">
          <div className="grid grid-cols-3 gap-4">
            {WORKFLOW_STEPS.map((step) => (
              <div key={step.step} className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-400/30 bg-teal-500/10 text-teal-300 shadow-inner">
                  {step.icon}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold tracking-wider text-teal-400">{step.step}</span>
                    <span className="text-xs font-bold text-white">{isAr ? step.ar : step.en}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {isAr ? step.subAr : step.subEn}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="text-emerald-400">●</span> {isAr ? "ضوابط PDPL السعودية" : "Saudi PDPL"}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span className="text-blue-400">●</span> {isAr ? "معايير NCA ECC للأمن" : "NCA ECC Controls"}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span className="text-teal-400">●</span> {isAr ? "مواصفات نَفيس (NPHIES)" : "NPHIES FHIR"}
              </span>
            </div>
            <span dir="ltr" className="text-slate-400">v2.0.4-rc</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          2. Form Panel (Left in RTL, Right in LTR)
          ══════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 flex-col justify-between overflow-y-auto px-6 py-6 sm:px-10 lg:max-w-[48%] xl:max-w-[44%] xl:px-14">
        {/* Top Bar inside form column */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 lg:hidden">
            <Logo size="h-9 w-9" />
            <div>
              <span className="text-base font-bold text-white lg:text-[#0b2440]">
                Careshift <span className="text-teal-500">AI</span>
              </span>
              <span className="block text-[10px] text-slate-400 lg:text-slate-500">
                Predict. Intervene. Prove.
              </span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {isAr ? "بوابة المستشفيات المعتمدة" : "Hospital Gateway Live"}
            </span>
          </div>

          {/* Bilingual Switcher */}
          <button
            onClick={toggle}
            type="button"
            className="group flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-200 shadow-sm transition-all hover:border-teal-500/50 hover:bg-slate-800 hover:text-teal-300 lg:border-slate-200 lg:bg-white lg:text-slate-700 lg:hover:border-teal-600/50 lg:hover:text-teal-700"
          >
            <span className="text-sm">🌐</span>
            <span>{isAr ? "English" : "العربية"}</span>
            <span className="text-slate-400 transition-transform group-hover:translate-x-0.5">▾</span>
          </button>
        </div>

        {/* Center: Main Form Card */}
        <div className="my-auto w-full max-w-md self-center py-6">
          <div className="mb-6">
            <h2 className="text-2xl font-black tracking-tight text-white lg:text-[#0b2440] sm:text-3xl">
              {t("login.title")}
            </h2>
            <p className="mt-1.5 text-sm text-slate-300 lg:text-slate-600">
              {isAr
                ? "أدخل بيانات حسابك المعتمد أو اختر دوراً للتجربة الفورية"
                : "Sign in with your clinical credentials or test with a demo role"}
            </p>
          </div>

          {/* Quick Role Fast-Selector (Interactive Demo Accounts) */}
          <div className="mb-6 rounded-2xl border border-slate-700/60 bg-slate-800/50 p-3.5 backdrop-blur-sm lg:border-slate-200/80 lg:bg-slate-50/80">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 lg:text-slate-700">
                ⚡ {isAr ? "تجربة سريعة بأحد الأدوار (Demo Roles)" : "Instant Demo Role Selector"}
              </span>
              <span className="text-[10px] text-teal-400 lg:text-teal-700 font-medium">
                {isAr ? "تعبئة تلقائية بنقرة واحدة" : "1-Click Auto-Fill"}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {DEMO_ACCOUNTS.map((role) => {
                const isSelected = selectedDemoId === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => applyDemoRole(role)}
                    className={`group relative flex flex-col items-center rounded-xl p-2 text-center transition-all ${
                      isSelected
                        ? "bg-teal-600 text-white shadow-md shadow-teal-600/30 ring-2 ring-teal-400"
                        : "bg-slate-700/40 text-slate-300 hover:bg-slate-700 hover:text-white lg:bg-white lg:text-slate-700 lg:hover:bg-teal-50 lg:hover:text-teal-800 border border-slate-600/30 lg:border-slate-200/80"
                    }`}
                    title={`${isAr ? role.nameAr : role.nameEn} (${isAr ? role.roleAr : role.roleEn})`}
                  >
                    <span className="text-lg transition-transform group-hover:scale-110">
                      {role.icon}
                    </span>
                    <span className="mt-1 block text-[10px] font-bold leading-tight line-clamp-1">
                      {isAr ? role.roleAr.split(" ")[0] : role.roleEn.split(" ")[0]}
                    </span>
                    <span className={`mt-0.5 block text-[8px] font-medium leading-none ${isSelected ? "text-teal-100" : "text-slate-400 lg:text-slate-500"}`}>
                      {role.badge.split(" ")[0]}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedDemoId && (
              <div className="mt-2.5 flex items-center justify-between rounded-lg bg-teal-500/10 px-2.5 py-1 text-[11px] text-teal-300 lg:text-teal-800 border border-teal-500/20">
                <span className="font-semibold">
                  {isAr ? "تم اختيار:" : "Selected:"}{" "}
                  {DEMO_ACCOUNTS.find((d) => d.id === selectedDemoId)?.nameAr}
                </span>
                <span className="font-mono text-[10px]" dir="ltr">
                  @{DEMO_ACCOUNTS.find((d) => d.id === selectedDemoId)?.user}
                </span>
              </div>
            )}
          </div>

          {/* Form Card */}
          <div className="rounded-3xl border border-slate-700/70 bg-slate-800/80 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl lg:border-slate-200/80 lg:bg-white lg:p-7 lg:shadow-[0_12px_40px_rgba(15,35,60,0.08)]">
            <form
              key={shake}
              className={error ? "space-y-4 motion-safe:animate-[shake_.3s]" : "space-y-4"}
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {/* Username Input */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300 lg:text-slate-700">
                  {t("login.username")}
                </label>
                <div className="relative">
                  <input
                    id="username-input"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setSelectedDemoId(null);
                    }}
                    autoComplete="username"
                    placeholder={t("login.userPlaceholder")}
                    className={`w-full rounded-2xl border bg-slate-900/60 py-3.5 ps-4 pe-11 text-sm font-medium text-white outline-none transition-all placeholder:text-slate-500 focus:bg-slate-900 focus:ring-4 lg:bg-slate-50 lg:text-slate-900 lg:placeholder:text-slate-400 lg:focus:bg-white ${
                      error
                        ? "border-rose-400/80 focus:border-rose-500 focus:ring-rose-500/10"
                        : "border-slate-700 focus:border-teal-500 focus:ring-teal-500/15 lg:border-slate-200"
                    }`}
                  />
                  <div className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Password Input */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 lg:text-slate-700">
                    {t("login.password")}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      alert(
                        isAr
                          ? "لاستعادة كلمة المرور، يرجى التواصل مع قسم تقنية المعلومات بالمنشأة الصحية: support@careshift.health"
                          : "For password reset, please contact hospital IT department: support@careshift.health"
                      );
                    }}
                    className="text-xs font-semibold text-teal-400 hover:underline lg:text-teal-700"
                  >
                    {t("login.forgot")}
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password-input"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setSelectedDemoId(null);
                    }}
                    autoComplete="current-password"
                    placeholder={t("login.pwPlaceholder")}
                    className={`w-full rounded-2xl border bg-slate-900/60 py-3.5 ps-4 pe-11 text-sm font-medium text-white outline-none transition-all placeholder:text-slate-500 focus:bg-slate-900 focus:ring-4 lg:bg-slate-50 lg:text-slate-900 lg:placeholder:text-slate-400 lg:focus:bg-white ${
                      error
                        ? "border-rose-400/80 focus:border-rose-500 focus:ring-rose-500/10"
                        : "border-slate-700 focus:border-teal-500 focus:ring-teal-500/15 lg:border-slate-200"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute end-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-teal-400 lg:hover:text-teal-700"
                    aria-label={showPw ? t("login.hide") : t("login.show")}
                  >
                    {showPw ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Remember checkbox */}
              <div className="flex items-center">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-300 lg:text-slate-600">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 accent-teal-600 lg:border-slate-300"
                  />
                  <span>{t("login.remember")}</span>
                </label>
              </div>

              {/* Captcha Token (if locked/rate-limited) */}
              {error === "captcha" && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-amber-300 lg:text-amber-800">
                    {t("login.captcha")}
                  </label>
                  <input
                    value={captchaToken}
                    onChange={(e) => setCaptchaToken(e.target.value)}
                    autoComplete="off"
                    placeholder={t("login.captchaPlaceholder")}
                    className="w-full rounded-2xl border border-amber-500/50 bg-amber-500/10 py-3 px-4 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 lg:text-slate-900"
                  />
                </div>
              )}

              {/* Error Message Alert */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs font-semibold text-rose-300 lg:border-rose-200 lg:bg-rose-50 lg:text-rose-700">
                  <span className="text-base leading-none">⚠️</span>
                  <div className="flex-1">
                    {error === "locked" || error === "captcha"
                      ? t("login.locked")
                      : t("login.error")}
                  </div>
                </div>
              )}

              {/* Submit CTA */}
              <button
                type="submit"
                id="login-submit-btn"
                disabled={busy}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-teal-500 via-cyan-600 to-blue-600 py-4 text-sm font-bold text-white shadow-xl shadow-teal-500/25 transition-all hover:brightness-110 hover:shadow-2xl hover:shadow-teal-500/35 active:scale-[0.99] disabled:opacity-60"
              >
                <span className="relative z-10 flex items-center gap-2">
                  {busy ? (
                    <>
                      <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>{isAr ? "جارٍ تسجيل الدخول..." : "Authenticating..."}</span>
                    </>
                  ) : (
                    <>
                      <span>{t("login.signin")}</span>
                      <span className="transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                        {isAr ? "←" : "→"}
                      </span>
                    </>
                  )}
                </span>
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
              </button>
            </form>

            {/* Divider */}
            <div className="mt-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-700 lg:bg-slate-200" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 lg:text-slate-500">
                {t("login.orDemo")}
              </span>
              <span className="h-px flex-1 bg-slate-700 lg:bg-slate-200" />
            </div>

            {/* Direct Public Interactive Demo (/demo) */}
            <Link
              href="/demo"
              className="group mt-4 flex items-center gap-3.5 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-3.5 transition-all hover:border-teal-500/50 hover:bg-slate-900/80 lg:border-slate-200 lg:bg-slate-50/70 lg:hover:border-teal-500/50 lg:hover:bg-white lg:hover:shadow-md"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 text-white shadow-md">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white transition-colors group-hover:text-teal-400 lg:text-slate-800 lg:group-hover:text-teal-700">
                    {t("login.runDemo")}
                  </span>
                  <span className="rounded bg-teal-500/20 px-1.5 py-0.2 text-[9px] font-bold text-teal-300 lg:text-teal-700">
                    P-1042
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 lg:text-slate-500">
                  {t("login.demoSub")} · {isAr ? "بدون كلمة مرور" : "No login needed"}
                </div>
              </div>
              <span className="text-slate-400 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1 lg:text-slate-500">
                {isAr ? "←" : "→"}
              </span>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4 text-[11px] text-slate-400 lg:border-slate-200/80 lg:text-slate-500">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 lg:text-emerald-600">🛡️</span>
            <span>{isAr ? "تشفير آمن 256-bit AES · متوافق مع PDPL" : "256-bit AES · PDPL Compliant"}</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/terms"
              className="font-medium text-teal-400 underline underline-offset-2 hover:text-teal-300 lg:text-teal-700 lg:hover:text-teal-800"
            >
              {t("terms.title")}
            </Link>
            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300 lg:bg-slate-100 lg:text-slate-600">
              Careshift v2.0
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

