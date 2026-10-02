/**
 * E0 link-check — every internal href rendered by the app must resolve to
 * a real route: "/x" maps to a page.tsx, "/api/x" to a route.ts.
 * Scans app/ + components/ for literal and template hrefs; pure
 * filesystem test — no DB, no server.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SRC_DIRS = [join(ROOT, "app"), join(ROOT, "components")];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e)) out.push(p);
  }
  return out;
}

/** Route table: filename → segment arrays (app-relative). */
function routeTable(filename: string): string[][] {
  const routes: string[][] = [];
  const scan = (dir: string, segs: string[]) => {
    if (existsSync(join(dir, filename))) routes.push(segs);
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) scan(p, [...segs, e]);
    }
  };
  scan(join(ROOT, "app"), []);
  return routes;
}

const isDyn = (s: string) => s.startsWith("[") && s.endsWith("]");

/**
 * Literal hrefs must match a route exactly. Template-derived prefixes
 * ("/patient/" from `/patient/${id}`) match as strict segment prefixes.
 */
function resolves(href: string, routes: string[][]): boolean {
  const segs = href.split("/").filter(Boolean);
  const prefix = href.length > 1 && href.endsWith("/");
  return routes.some(
    (r) =>
      (prefix ? segs.length < r.length : segs.length === r.length) &&
      segs.every((s, i) => isDyn(r[i]) || r[i] === s),
  );
}

describe("E0 link-check", () => {
  const pages = routeTable("page.tsx");
  const apis = routeTable("route.ts").filter((r) => r[0] === "api");
  const files = SRC_DIRS.flatMap((d) => walk(d));
  const hrefs = new Map<string, string[]>(); // href -> files using it

  for (const f of files) {
    const src = readFileSync(f, "utf8");
    // literal: href="/x"  ·  template: href={`/x/${id}`} (static prefix)
    for (const m of src.matchAll(/href\s*=\s*"(\/[^"#]*)"/g))
      hrefs.set(m[1], [...(hrefs.get(m[1]) ?? []), f]);
    for (const m of src.matchAll(/href\s*=\s*\{`(\/[^`$]*)\$\{/g))
      hrefs.set(m[1], [...(hrefs.get(m[1]) ?? []), f]);
  }

  it("has a sane page inventory (≥ 15 routes)", () => {
    expect(pages.length).toBeGreaterThanOrEqual(15);
  });

  it("every internal href resolves to a page or API route", () => {
    const broken: string[] = [];
    for (const [raw, usedBy] of hrefs) {
      if (raw.startsWith("//")) continue; // protocol-relative external
      const href = raw.split("?")[0].replace(/#.*$/, "");
      if (href === "#" || href === "") continue;
      const table = href.startsWith("/api/") ? apis : pages;
      if (!resolves(href, table))
        broken.push(
          `${raw}  (used in ${usedBy.map((f) => f.split(/[\\/]/).pop()).join(", ")})`,
        );
    }
    expect(broken).toEqual([]);
  });
});
