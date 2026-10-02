import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/server/prisma";
import { requireAuth } from "@/lib/server/session";
import { handle, ok } from "@/lib/server/json";
import { RXNAV_ATTRIBUTION } from "@/lib/server/ext/rxnav";
import { OPENFDA_ATTRIBUTION } from "@/lib/server/ext/openfda";
import { DAILYMED_ATTRIBUTION } from "@/lib/server/ext/dailymed";
import { CLINICALTABLES_ATTRIBUTION } from "@/lib/server/ext/clinicaltables";
import { ICD11_ATTRIBUTION } from "@/lib/server/ext/icd11";
import { MEDLINEPLUS_ATTRIBUTION } from "@/lib/server/ext/medlineplus";
import { NPHIES_ATTRIBUTION } from "@/lib/server/ext/nphies";

const readJson = (p: string) => {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), p), "utf-8"));
  } catch {
    return null; // artifact not generated / not shipped — degrade honestly
  }
};

/**
 * B5 — GET /api/references/technical: stack, external APIs, code
 * systems, datasets, security posture and SBOM/audit summaries —
 * all generated from package.json, docs/*.json artifacts and the
 * Terminology table, never hand-typed.
 */
export const GET = handle(async () => {
  await requireAuth();

  const pkg = readJson("package.json") ?? { dependencies: {}, devDependencies: {} };
  const sbom = readJson("docs/sbom.json") ?? {};
  const auditSummary = readJson("docs/audit-summary.json") ?? {
    generatedAt: null, vulnerabilities: {}, dependencies: {},
  };
  const licenses = readJson("docs/license-summary.json") ?? {
    generatedAt: null, tool: "license-checker-rseidelsohn", passed: null,
    summary: {},
  };

  const terms = await prisma.terminology.groupBy({
    by: ["provider", "version"],
    _count: { _all: true },
    orderBy: { provider: "asc" },
  });

  return ok({
    stack: {
      runtime: Object.entries(pkg.dependencies as Record<string, string>).map(
        ([name, version]) => ({ name, version }),
      ),
      devCount: Object.keys(pkg.devDependencies ?? {}).length,
    },
    externalApis: [
      { name: "NLM RxNav/RxNorm", url: "https://rxnav.nlm.nih.gov/REST", attribution: RXNAV_ATTRIBUTION, cache: "ExtCache (offline fallback)" },
      { name: "openFDA drug label", url: "https://api.fda.gov/drug/label.json", attribution: OPENFDA_ATTRIBUTION, cache: "ExtCache (offline fallback)" },
      { name: "NLM DailyMed", url: "https://dailymed.nlm.nih.gov/dailymed/services/v2", attribution: DAILYMED_ATTRIBUTION, cache: "ExtCache (offline fallback)" },
      { name: "NLM Clinical Tables", url: "https://clinicaltables.nlm.nih.gov/api", attribution: CLINICALTABLES_ATTRIBUTION, cache: "ExtCache (offline fallback)" },
      { name: "WHO ICD-11", url: "https://icd.who.int/icdapi", attribution: ICD11_ATTRIBUTION, cache: "ExtCache (offline fallback)" },
      { name: "MedlinePlus Connect", url: "https://connect.medlineplus.gov/service", attribution: MEDLINEPLUS_ATTRIBUTION, cache: "ExtCache (offline fallback)" },
      { name: "NPHIES FS IG", url: "https://portal.nphies.sa/ig/", attribution: NPHIES_ATTRIBUTION, cache: "offline snapshot (package.tgz)" },
    ],
    codeSystems: terms.map((t) => ({
      provider: t.provider, version: t.version, entries: t._count._all,
    })),
    datasets: [
      {
        name: "Synthetic demo seed", access: "bundled",
        license: "project demo data — labeled Simulated",
      },
      {
        name: "MIMIC-IV demo (PhysioNet)", access: "planned validation",
        license: "PhysioNet credentialed / demo ODbL",
      },
    ],
    security: {
      // implemented controls — see docs/compliance.md for the mapping
      items: [
        "RBAC permission keys enforced server-side",
        "bcrypt password hashing + httpOnly session cookies",
        "Rate limits + lockout on auth and write routes",
        "Audit log for state-changing actions",
        "Configurable retention + audited purge",
        "Upload magic-byte validation + AV hook",
        "Immutable hash-chained clinical event store",
      ],
      source: "docs/compliance.md",
    },
    sbom: sbom.components
      ? {
          specVersion: sbom.specVersion ?? null,
          format: sbom.bomFormat ?? "CycloneDX",
          components: sbom.components.length,
          file: "docs/sbom.json",
        }
      : null,
    audit: auditSummary,
    licenses,
  });
});
