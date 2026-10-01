import { z } from "zod";
import jsonLogic from "json-logic-js";
import { prisma } from "@/lib/server/prisma";

/**
 * Knowledge-base engine (PROMPT A / A1).
 *
 * Clinical logic lives in the DB as versioned JSON-logic payloads seeded
 * from knowledge/seed/*.json. At execution time we:
 *   1. load the rule's LATEST approved RuleVersion (draft/retired never run),
 *   2. re-validate the payload with zod (rules are data — data can be wrong),
 *   3. evaluate each declared output with json-logic-js,
 *   4. persist a RuleExecution row (rule id + version + inputs + output)
 *      so every displayed number is reproducible.
 */

/** json-logic operand: expression object, literal, or nested array. */
const exprSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.record(z.string(), z.unknown()),
    z.array(exprSchema),
    z.number(),
    z.string(),
    z.boolean(),
    z.null(),
  ]),
);

export const ruleLogicSchema = z
  .object({
    outputs: z.record(z.string(), exprSchema),
  })
  .strict();

const refSchema = z
  .object({
    key: z.string().min(1),
    kind: z.enum(["pmid", "doi", "url"]),
    value: z.string().min(1),
    titleEn: z.string().min(1),
    venue: z.string().default(""),
    year: z.number().int().nullable().optional(),
  })
  .strict();

const ruleSeedSchema = z
  .object({
    key: z.string().min(1),
    nameEn: z.string().min(1),
    nameAr: z.string().min(1),
    status: z.enum(["draft", "approved", "retired"]),
    category: z.string().min(1),
    version: z.number().int().positive(),
    units: z.record(z.string(), z.string()).default({}),
    noteEn: z.string().default(""),
    noteAr: z.string().default(""),
    refs: z.array(z.string()).min(1, "every rule needs >=1 verified reference"),
    logic: ruleLogicSchema,
  })
  .strict();

const kpiSeedSchema = z
  .object({
    key: z.string().min(1),
    nameEn: z.string().min(1),
    nameAr: z.string().min(1),
    unit: z.string().min(1),
    formula: ruleLogicSchema,
    noteEn: z.string().default(""),
  })
  .strict();

export const kbFileSchema = z
  .object({
    kbVersion: z.string(),
    note: z.string().optional(),
    references: z.array(refSchema).optional(),
    rules: z.array(ruleSeedSchema).optional(),
    kpis: z.array(kpiSeedSchema).optional(),
  })
  .strict();

export type KbFile = z.infer<typeof kbFileSchema>;

export class KbError extends Error {}

/** Evaluate one rule-version payload against inputs (pure — no DB). */
export function evalLogic(
  logicJson: string,
  inputs: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = ruleLogicSchema.safeParse(JSON.parse(logicJson));
  if (!parsed.success) {
    throw new KbError(`invalid rule payload: ${parsed.error.message}`);
  }
  const out: Record<string, unknown> = {};
  for (const [name, expr] of Object.entries(parsed.data.outputs)) {
    out[name] = jsonLogic.apply(expr as Parameters<typeof jsonLogic.apply>[0], inputs);
  }
  return out;
}

/**
 * Run an approved rule by key. Throws KbError when the rule is missing or
 * has no approved version — callers must treat "no rule" as a hard failure,
 * not a silent zero. Persists a RuleExecution for every computation.
 */
export async function runRule(
  key: string,
  inputs: Record<string, unknown>,
  opts: { patientId?: string; persist?: boolean } = {},
): Promise<Record<string, unknown>> {
  const rule = await prisma.rule.findUnique({
    where: { key, status: "approved" },
    include: {
      versions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  const version = rule?.versions[0];
  if (!rule || !version) {
    throw new KbError(`no approved version for rule "${key}"`);
  }
  const t0 = performance.now();
  const output = evalLogic(version.logicJson, inputs);
  const durationMs = Math.max(0, Math.round(performance.now() - t0));
  if (opts.persist !== false) {
    await prisma.ruleExecution.create({
      data: {
        ruleId: rule.id,
        ruleVersion: version.version,
        patientId: opts.patientId ?? null,
        inputsJson: JSON.stringify(inputs),
        outputJson: JSON.stringify(output),
        durationMs,
      },
    });
  }
  return output;
}

/** Bulk-load a parsed seed file into the DB (idempotent upsert). */
export async function loadKbFile(file: KbFile) {
  const refIds = new Map<string, string>();
  for (const r of file.references ?? []) {
    const row = await prisma.reference.upsert({
      where: { key: r.key },
      update: {
        kind: r.kind, value: r.value, titleEn: r.titleEn,
        venue: r.venue, year: r.year ?? null,
      },
      create: {
        key: r.key, kind: r.kind, value: r.value, titleEn: r.titleEn,
        venue: r.venue, year: r.year ?? null,
      },
    });
    refIds.set(r.key, row.id);
  }

  for (const r of file.rules ?? []) {
    // Enforce the citation rule at LOAD time, not just in tests — refs may
    // live in a sibling seed file, so fall back to a DB lookup by key.
    for (const rk of r.refs) {
      if (!refIds.has(rk)) {
        const row = await prisma.reference.findUnique({ where: { key: rk } });
        if (!row) {
          throw new KbError(`rule "${r.key}" references unknown key "${rk}"`);
        }
        refIds.set(rk, row.id);
      }
    }
    const rule = await prisma.rule.upsert({
      where: { key: r.key },
      update: {
        nameEn: r.nameEn, nameAr: r.nameAr, status: r.status,
        category: r.category,
      },
      create: {
        key: r.key, nameEn: r.nameEn, nameAr: r.nameAr,
        status: r.status, category: r.category,
      },
    });
    const version = await prisma.ruleVersion.upsert({
      where: { ruleId_version: { ruleId: rule.id, version: r.version } },
      update: {
        logicJson: JSON.stringify(r.logic),
        unitsJson: JSON.stringify(r.units),
        noteEn: r.noteEn, noteAr: r.noteAr,
        approvedAt: r.status === "approved" ? new Date() : null,
      },
      create: {
        ruleId: rule.id, version: r.version,
        logicJson: JSON.stringify(r.logic),
        unitsJson: JSON.stringify(r.units),
        noteEn: r.noteEn, noteAr: r.noteAr,
        approvedAt: r.status === "approved" ? new Date() : null,
      },
    });
    for (const rk of r.refs) {
      await prisma.ruleReference.upsert({
        where: {
          ruleId_referenceId: { ruleId: rule.id, referenceId: refIds.get(rk)! },
        },
        update: {},
        create: { ruleId: rule.id, referenceId: refIds.get(rk)! },
      });
    }
    void version;
  }

  for (const k of file.kpis ?? []) {
    await prisma.kpiDefinition.upsert({
      where: { key: k.key },
      update: {
        nameEn: k.nameEn, nameAr: k.nameAr, unit: k.unit,
        formulaJson: JSON.stringify(k.formula), status: "approved",
      },
      create: {
        key: k.key, nameEn: k.nameEn, nameAr: k.nameAr, unit: k.unit,
        formulaJson: JSON.stringify(k.formula), status: "approved",
      },
    });
  }
}
