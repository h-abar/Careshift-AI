import { prisma } from "@/lib/server/prisma";
import { requireAuth } from "@/lib/server/session";
import { handle, ok } from "@/lib/server/json";
import {
  RXNAV_ATTRIBUTION,
} from "@/lib/server/ext/rxnav";
import { OPENFDA_ATTRIBUTION } from "@/lib/server/ext/openfda";
import { DAILYMED_ATTRIBUTION } from "@/lib/server/ext/dailymed";
import { CLINICALTABLES_ATTRIBUTION } from "@/lib/server/ext/clinicaltables";
import { ICD11_ATTRIBUTION } from "@/lib/server/ext/icd11";
import {
  MEDLINEPLUS_ARABIC_HUB,
  MEDLINEPLUS_ATTRIBUTION,
} from "@/lib/server/ext/medlineplus";
import { NPHIES_ATTRIBUTION, NPHIES_SOURCE_URL } from "@/lib/server/ext/nphies";

/**
 * GET /api/references — provenance for the evidence engine (A5).
 * Authenticated; contains no patient data.
 */
export const GET = handle(async () => {
  await requireAuth();
  const [rules, refs] = await Promise.all([
    prisma.rule.findMany({
      include: {
        refs: { include: { reference: true } },
        versions: { orderBy: { version: "desc" }, take: 1 },
      },
      orderBy: { key: "asc" },
    }),
    prisma.reference.findMany({ orderBy: { key: "asc" } }),
  ]);
  return ok({
    attributions: {
      nlm: [RXNAV_ATTRIBUTION, DAILYMED_ATTRIBUTION, CLINICALTABLES_ATTRIBUTION],
      fda: OPENFDA_ATTRIBUTION,
      whoIcd11: ICD11_ATTRIBUTION,
      medlineplus: MEDLINEPLUS_ATTRIBUTION,
      medlineplusArabic: MEDLINEPLUS_ARABIC_HUB,
      mimic: "MIMIC-IV — PhysioNet (Johnson et al., PMID 36596836); planned validation dataset",
      nphies: NPHIES_ATTRIBUTION,
      nphiesSource: NPHIES_SOURCE_URL,
    },
    rules: rules.map((r) => ({
      key: r.key,
      nameEn: r.nameEn,
      nameAr: r.nameAr,
      status: r.status,
      version: r.versions[0]?.version ?? null,
      refs: r.refs.map((rr) => ({
        key: rr.reference.key,
        kind: rr.reference.kind,
        value: rr.reference.value,
        titleEn: rr.reference.titleEn,
        venue: rr.reference.venue,
        year: rr.reference.year,
      })),
    })),
    references: refs,
  });
});
