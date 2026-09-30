import en from "@/lib/i18n/en";
import ar from "@/lib/i18n/ar";
import type { Lang } from "@/lib/types";

/** Server-side translator over the shared dictionaries (SBAR, SBAR seeds). */
export function serverT(lang: Lang) {
  const dict = lang === "ar" ? ar : en;
  return (key: string) => dict[key] ?? key;
}
