"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth";
import { TERMS_VERSION, TERMS_SECTIONS } from "@/lib/terms";
import { Card, SectionTitle } from "@/components/ui";

export default function TermsPage() {
  const { t, lang, toggle } = useI18n();
  const { user, acceptTerms } = useAuth();
  const [done, setDone] = useState(false);
  const accepted = !!user && user.termsVersion === TERMS_VERSION;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle sub={t("terms.sub")}>{t("terms.title")}</SectionTitle>
        <button
          onClick={toggle}
          className="rounded-lg border border-[#e2e9f2] bg-white px-3 py-2 text-xs font-bold text-slate-600"
        >
          {lang === "ar" ? "EN" : "ع"}
        </button>
      </div>

      <Card className="border-amber-200 bg-amber-50/60">
        <p className="text-xs font-bold text-amber-800">{t("terms.draft")}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          {t("terms.version")}: {TERMS_VERSION}
        </p>
      </Card>

      {TERMS_SECTIONS.map((s) => (
        <Card key={s}>
          <h3 className="mb-2 text-sm font-bold text-[#13304d]">
            {t(`terms.s.${s}.title`)}
          </h3>
          <p className="whitespace-pre-line text-sm leading-7 text-slate-700">
            {t(`terms.s.${s}.body`)}
          </p>
        </Card>
      ))}

      {user && !accepted && !done && (
        <button
          onClick={async () => setDone(await acceptTerms())}
          className="w-full rounded-xl bg-[#0b7a8d] py-3 text-sm font-bold text-white hover:bg-[#075e6e]"
        >
          {t("terms.accept")}
        </button>
      )}
      {user && (accepted || done) && (
        <p className="rounded-xl bg-teal-50 px-4 py-3 text-center text-sm font-semibold text-teal-800">
          {t("terms.accepted")} — v{TERMS_VERSION}
        </p>
      )}
      {!user && (
        <p className="text-center">
          <Link href="/" className="text-sm font-semibold text-[#1b5fad] underline">
            ← {t("terms.back")}
          </Link>
        </p>
      )}
    </div>
  );
}
