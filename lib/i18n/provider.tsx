"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "@/lib/i18n/en";
import ar from "@/lib/i18n/ar";
import type { Lang } from "@/lib/types";

const dicts: Record<Lang, Record<string, string>> = { en, ar };

interface I18n {
  lang: Lang;
  dir: "ltr" | "rtl";
  t: (key: string) => string;
  setLang: (l: Lang) => void;
  toggle: () => void;
}

const Ctx = createContext<I18n>({
  lang: "en",
  dir: "ltr",
  t: (k) => k,
  setLang: () => {},
  toggle: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  const apply = useCallback((l: Lang) => {
    const dir = l === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = l;
    document.documentElement.dir = dir;
  }, []);

  useEffect(() => {
    const saved = (localStorage.getItem("careshift-lang") as Lang) || "ar";
    // Deferred — synchronous setState in an effect body triggers cascading renders.
    queueMicrotask(() => setLangState(saved));
    apply(saved);
  }, [apply]);

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      localStorage.setItem("careshift-lang", l);
      apply(l);
    },
    [apply],
  );

  const value = useMemo<I18n>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      t: (key: string) => dicts[lang][key] ?? dicts.en[key] ?? key,
      setLang,
      toggle: () => setLang(lang === "ar" ? "en" : "ar"),
    }),
    [lang, setLang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

/** Convenience: pick a localized field pair. */
export function useLoc() {
  const { lang } = useI18n();
  return useCallback(
    (pair: { en: string; ar: string }) => (lang === "ar" ? pair.ar : pair.en),
    [lang],
  );
}
