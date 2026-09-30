/**
 * i18n coverage — fails if a t() key is missing in ar or en, or if a
 * dictionary key is never referenced by any source file.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import en from "@/lib/i18n/en";
import ar from "@/lib/i18n/ar";
import { DENIAL_CODES } from "@/lib/denial";

const ROOTS = ["app", "components", "lib", "prisma", "tests"];

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === "node_modules" || e.startsWith(".")) continue;
      yield* walk(p);
    } else if (/\.(ts|tsx)$/.test(e) && !p.includes("i18n")) {
      yield p;
    }
  }
}

const sources = ROOTS.flatMap((r) => [...walk(r)]).map((p) =>
  readFileSync(p, "utf8"),
);
const corpus = sources.join("\n");

// Literal keys: t("foo.bar") / t('foo.bar')
const literalKeys = new Set(
  [...corpus.matchAll(/\bt\(\s*["'`]([\w.]+)["'`]/g)].map((m) => m[1]),
);
// Dynamic prefixes: t(`dx.${x}`) → "dx.", t(`demo.step${n}`) → "demo.step"
const dynamicPrefixes = new Set(
  [...corpus.matchAll(/\bt\(\s*`([a-z][\w.]*?)\$\{/g)].map((m) => m[1]),
);
// Bare string literals used as i18n keys elsewhere (notify("notif.x"),
// audit action names composed as auditAction.<action>, seeded keys, etc.)
const stringLiterals = new Set(
  [...corpus.matchAll(/["']([a-z]+\.[\w.]+)["']/g)].map((m) => m[1]),
);

const enKeys = Object.keys(en);
const arKeys = Object.keys(ar);

const isUsed = (key: string) =>
  literalKeys.has(key) ||
  stringLiterals.has(key) ||
  [...dynamicPrefixes].some((p) => key.startsWith(p));

describe("i18n parity + coverage", () => {
  it("en and ar have identical key sets", () => {
    expect(enKeys.sort()).toEqual(arKeys.sort());
  });

  it("every literal t() key exists in the dictionaries", () => {
    const missing = [...literalKeys].filter((k) => !(k in en) || !(k in ar));
    expect(missing).toEqual([]);
  });

  it("every dynamic t(`prefix.*`) prefix resolves to dictionary keys", () => {
    const orphans = [...dynamicPrefixes].filter(
      (p) => !enKeys.some((k) => k.startsWith(p)),
    );
    expect(orphans).toEqual([]);
  });

  it("no unused dictionary keys", () => {
    const unused = enKeys.filter((k) => !isUsed(k));
    expect(unused).toEqual([]);
  });

  it("every denial code has an ar/en label", () => {
    for (const c of DENIAL_CODES) {
      expect(en[`deny.${c}`], `deny.${c}`).toBeTruthy();
      expect(ar[`deny.${c}`], `deny.${c}`).toBeTruthy();
    }
  });

  it("every notification key emitted by the server is translated", () => {
    const notifKeys = new Set(
      [...corpus.matchAll(/["'](notif\.[\w]+)["']/g)].map((m) => m[1]),
    );
    for (const k of notifKeys) {
      expect(en[k], k).toBeTruthy();
      expect(ar[k], k).toBeTruthy();
    }
  });

  it("every audited action has an auditAction.* label", () => {
    const actions = new Set(
      [...corpus.matchAll(/\baudit(?:Once)?\(\{[\s\S]*?\}\)/g)]
        .flatMap((m) => [...m[0].matchAll(/action:\s*"([\w.]+)"/g)])
        .map((m) => m[1]),
    );
    const missing = [...actions].filter(
      (a) => !en[`auditAction.${a}`] || !ar[`auditAction.${a}`],
    );
    expect(missing).toEqual([]);
  });
});
