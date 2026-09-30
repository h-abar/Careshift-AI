type Lang = "en" | "ar";

const locale = (lang?: Lang) => (lang === "ar" ? "ar-SA" : "en-US");

export const fmtNum = (n: number, lang?: Lang) =>
  new Intl.NumberFormat(locale(lang)).format(Math.round(n));

export const fmtSar = (n: number, lang?: Lang) => fmtNum(n, lang);

export const fmtSarK = (n: number, lang?: Lang) =>
  n >= 1000
    ? `${new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 1 }).format(n / 1000)}K`
    : fmtNum(n, lang);

export const fmtDate = (d: string | Date, lang?: Lang) =>
  new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium" }).format(
    new Date(d),
  );

export const fmtTime = (totalSec: number) => {
  const m = Math.floor(Math.abs(totalSec) / 60);
  const s = Math.abs(totalSec) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
