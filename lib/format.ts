export const fmtSar = (n: number) =>
  `${new Intl.NumberFormat("en-US").format(Math.round(n))}`;

export const fmtSarK = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : `${n}`;

export const fmtTime = (totalSec: number) => {
  const m = Math.floor(Math.abs(totalSec) / 60);
  const s = Math.abs(totalSec) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
