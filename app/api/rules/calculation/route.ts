import { prisma } from "@/lib/server/prisma";
import { requireAuth } from "@/lib/server/session";
import { handle, ok } from "@/lib/server/json";
import { RULE_CLASS, USED_IN, PROTOTYPE_SETTINGS, FEATURE_OF_RULE } from "@/lib/governance";

/**
 * B1 — GET /api/rules/calculation: every score/flag/tier/KPI straight
 * from the knowledge base, so the page always matches what the engine
 * runs. Read-only for all signed-in roles.
 */
export const GET = handle(async () => {
  await requireAuth();
  const [rules, kpis] = await Promise.all([
    prisma.rule.findMany({
      include: {
        refs: { include: { reference: true } },
        versions: { orderBy: { version: "desc" } },
      },
      orderBy: { key: "asc" },
    }),
    prisma.kpiDefinition.findMany({ orderBy: { key: "asc" } }),
  ]);

  return ok({
    rules: rules.map((r) => ({
      key: r.key,
      nameEn: r.nameEn,
      nameAr: r.nameAr,
      status: r.status,
      category: r.category,
      classification: RULE_CLASS[r.category] ?? "informational",
      usedIn: USED_IN[r.category] ?? [],
      feature: FEATURE_OF_RULE[r.key] ?? "other",
      versions: r.versions.map((v) => ({
        version: v.version,
        logic: JSON.parse(v.logicJson) as unknown,
        units: JSON.parse(v.unitsJson) as Record<string, string>,
        noteEn: v.noteEn,
        noteAr: v.noteAr,
        approvedAt: v.approvedAt?.toISOString() ?? null,
        createdAt: v.createdAt.toISOString(),
      })),
      refs: r.refs.map((rr) => ({
        key: rr.reference.key, kind: rr.reference.kind,
        value: rr.reference.value, titleEn: rr.reference.titleEn,
        venue: rr.reference.venue, year: rr.reference.year,
      })),
    })),
    kpis: kpis.map((k) => ({
      key: k.key, nameEn: k.nameEn, nameAr: k.nameAr, unit: k.unit,
      formula: JSON.parse(k.formulaJson) as unknown, status: k.status,
      classification: "kpi",
    })),
    prototypeSettings: PROTOTYPE_SETTINGS.map((s) => ({
      ...s, classification: "prototype",
      effective: Number(process.env[s.env] ?? s.default),
    })),
  });
});
