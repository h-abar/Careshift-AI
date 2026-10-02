import { prisma } from "@/lib/server/prisma";
import { requireAuth } from "@/lib/server/session";
import { handle, ok } from "@/lib/server/json";
import { FEATURE_OF_RULE, FEATURES } from "@/lib/governance";

/**
 * B4 — GET /api/references/scientific: references grouped by the
 * product feature that cites them. Grouping derives from rule→feature
 * mapping in the knowledge base — no hand-assigned citations.
 */
export const GET = handle(async () => {
  await requireAuth();
  const rules = await prisma.rule.findMany({
    include: { refs: { include: { reference: true } } },
    orderBy: { key: "asc" },
  });

  // reference key → features/rules that cite it
  const cited = new Map<string, { features: Set<string>; rules: { key: string; nameEn: string; nameAr: string }[] }>();
  for (const r of rules) {
    const feature = FEATURE_OF_RULE[r.key] ?? "other";
    for (const rr of r.refs) {
      const cur = cited.get(rr.reference.key) ?? { features: new Set<string>(), rules: [] };
      cur.features.add(feature);
      cur.rules.push({ key: r.key, nameEn: r.nameEn, nameAr: r.nameAr });
      cited.set(rr.reference.key, cur);
    }
  }

  const groups = FEATURES.map((f) => ({ feature: f, refs: [] as unknown[] }));
  const byFeature = new Map(groups.map((g) => [g.feature, g.refs]));

  const all = await prisma.reference.findMany({ orderBy: { key: "asc" } });
  for (const ref of all) {
    const c = cited.get(ref.key);
    // single deterministic group: first citing feature in FEATURES order;
    // `rules` still lists every citing rule for cross-feature citations.
    const feature =
      FEATURES.find((f) => c?.features.has(f)) ?? "other";
    const row = {
      key: ref.key, kind: ref.kind, value: ref.value,
      titleEn: ref.titleEn, venue: ref.venue, year: ref.year,
      rules: c?.rules ?? [],
    };
    byFeature.get(feature)?.push(row);
  }

  return ok({
    groups: groups.filter((g) => g.refs.length > 0),
    total: all.length,
  });
});
