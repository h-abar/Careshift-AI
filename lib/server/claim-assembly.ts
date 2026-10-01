/**
 * C3 — assemble claim lines FROM the immutable event store.
 *
 * The mapping (which event types support which line kind, where the
 * code comes from) is a versioned KB rule: "claim-line-map" —
 * category "claim-map", logic.outputs rows validated by
 * claimMapRowSchema here. Never eval'd as json-logic.
 *
 * Hard rules:
 *   - a claim line MUST reference >=1 supporting ClinicalEvent, else it
 *     is refused (manual lines are the only exception, and they require
 *     a reason and are flagged eventBacked=false — never represented
 *     as normal lines);
 *   - codes come only from event payloads — missing code = flagged
 *     "missing_code", never guessed;
 *   - prices come only from knowledge/seed/tariffs-simulated.json and
 *     every priced line is stamped simulatedPrice.
 */
import { z } from "zod";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/server/prisma";
import { ruleLogicSchema } from "@/lib/server/kb";

if (typeof window !== "undefined") {
  throw new Error("lib/server/claim-assembly.ts is server-only");
}

export class ClaimAssemblyError extends Error {}

const claimMapRowSchema = z
  .object({
    eventTypes: z.array(z.string()).min(1),
    lineKind: z.enum(["service", "procedure", "bed_day", "medication", "lab"]),
    codeFields: z.array(z.string()).default([]),
    match: z.string().optional(), // e.g. "orderKind=medication"
    qtyPer: z.enum(["event", "span_day"]).default("event"),
    tariffKey: z.string(),
  })
  .strict();
export type ClaimMapRow = z.infer<typeof claimMapRowSchema> & { key: string };

const tariffsSchema = z.object({
  label: z.literal("Simulated"),
  currency: z.string(),
  tariffs: z.record(z.string(), z.object({ unitPriceSar: z.number().int() })),
});

/** Load the approved claim-map rule's mapping rows. */
export async function getClaimMap(): Promise<ClaimMapRow[]> {
  const rule = await prisma.rule.findUnique({
    where: { key: "claim-line-map", status: "approved" },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const v = rule?.versions[0];
  if (!v) throw new ClaimAssemblyError("no approved claim-line-map rule");
  const outputs = ruleLogicSchema.parse(JSON.parse(v.logicJson)).outputs;
  return Object.entries(outputs).map(([key, row]) => ({
    ...claimMapRowSchema.parse(row),
    key,
  }));
}

export function simulatedTariffs() {
  const file = path.join(process.cwd(), "knowledge/tariffs-simulated.json");
  return tariffsSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

const pick = (payload: Record<string, unknown>, dotted: string[]) => {
  for (const f of dotted) {
    const key = f.replace(/^payload\./, "");
    const v = payload[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
};

interface Ev {
  id: string; type: string; occurredAt: Date; actorRole: string;
  payload: Record<string, unknown>;
}

/** Medical-necessity evidence: nearest deterioration chain events
 *  within 24h before the first supporting event. */
function necessityChain(lineEvents: Ev[], all: Ev[]): string[] {
  if (!lineEvents.length) return [];
  const t0 = Math.min(...lineEvents.map((e) => e.occurredAt.getTime()));
  const NECESSITY_TYPES = new Set([
    "score_computed", "alert_raised", "alert_acknowledged",
    "escalation", "order",
  ]);
  return all
    .filter(
      (e) =>
        NECESSITY_TYPES.has(e.type) &&
        e.occurredAt.getTime() <= t0 &&
        t0 - e.occurredAt.getTime() <= 24 * 3600e3,
    )
    .map((e) => e.id)
    .slice(-6);
}

export interface AssembleResult {
  claimId: string;
  created: number;
  flagged: string[];
  diagnoses: { dxKey: string; supported: boolean; byEventIds: string[] }[];
}

/**
 * Rebuild a claim's event-backed lines from the patient's event store.
 * Manual lines (eventBacked=false) are preserved; prior auto lines are
 * replaced so re-assembly is idempotent.
 */
export async function assembleClaim(claimId: string): Promise<AssembleResult> {
  const claim = await prisma.insuranceClaim.findUnique({ where: { id: claimId } });
  if (!claim?.patientId) throw new ClaimAssemblyError("claim has no patient");
  const map = await getClaimMap();
  const tariffs = simulatedTariffs();

  const rows = await prisma.clinicalEvent.findMany({
    where: { patientId: claim.patientId },
    orderBy: { occurredAt: "asc" },
  });
  const events: Ev[] = rows.map((r) => ({
    id: r.id, type: r.type, occurredAt: r.occurredAt,
    actorRole: r.actorRole, payload: JSON.parse(r.payloadJson),
  }));

  await prisma.claimLine.deleteMany({
    where: { claimId, eventBacked: true },
  });

  let seq =
    (await prisma.claimLine.count({ where: { claimId } })) + 1;
  let created = 0;
  const flagged: string[] = [];

  for (const m of map) {
    const matched = events.filter((e) => {
      if (!m.eventTypes.includes(e.type)) return false;
      if (m.match) {
        const [k, v] = m.match.split("=");
        if (String(e.payload[k]) !== v) return false;
      }
      return true;
    });
    if (!matched.length) continue;

    let quantity = matched.length;
    if (m.qtyPer === "span_day") {
      const span =
        Math.max(...matched.map((e) => e.occurredAt.getTime())) -
        Math.min(...events.map((e) => e.occurredAt.getTime()));
      quantity = Math.max(1, Math.ceil(span / 86400e3));
    }

    const code = pick(matched[0].payload, m.codeFields);
    const flags = code ? [] : ["missing_code"];
    const eventIds = matched.map((e) => e.id);
    if (code === "") flagged.push(`${m.lineKind}:missing_code`);

    const t = tariffs.tariffs[m.tariffKey];
    await createLine(claimId, {
      seq: seq++,
      kind: m.lineKind,
      code, codeSystem: codeSystemFor(m.lineKind, code),
      codeVersion: "",
      description: `${m.lineKind} — ${matched.length} event(s)`,
      quantity,
      unitPriceSar: t?.unitPriceSar ?? null,
      simulatedPrice: !!t,
      serviceStart: matched[0].occurredAt,
      serviceEnd: matched[matched.length - 1].occurredAt,
      eventIds,
      necessityIds: necessityChain(matched, events),
      flags,
    });
    created++;
  }

  // Diagnoses: claim dxKey must be supported by a physician
  // documentation event carrying a diagnosis code — else flagged.
  const docEvents = events.filter(
    (e) => e.type === "documentation_entry" && e.actorRole === "physician" && e.payload.diagnosis,
  );
  const diagnoses = claim.dxKey
    ? [{
        dxKey: claim.dxKey,
        supported: docEvents.length > 0,
        byEventIds: docEvents.map((e) => e.id),
      }]
    : [];

  return { claimId, created, flagged, diagnoses };
}

function codeSystemFor(kind: string, code: string): string {
  if (!code) return "";
  if (/^\d{3,4}-\d$/.test(code)) return "LOINC";
  if (kind === "medication") return "RxNorm";
  if (kind === "procedure" || kind === "bed_day" || kind === "service")
    return "SBS";
  return "LOINC";
}

interface NewLine {
  seq: number; kind: string; code: string; codeSystem: string;
  codeVersion: string; description: string; quantity: number;
  unitPriceSar: number | null; simulatedPrice: boolean;
  serviceStart: Date | null; serviceEnd: Date | null;
  eventIds: string[]; necessityIds: string[]; flags: string[];
}

/** Hard rule — event-backed lines REQUIRE supporting event ids. */
async function createLine(
  claimId: string,
  l: NewLine,
  manual?: { reason: string },
) {
  const eventBacked = !manual;
  if (eventBacked && l.eventIds.length === 0) {
    throw new ClaimAssemblyError(
      "event-backed claim line requires >=1 supporting event",
    );
  }
  if (manual && !manual.reason.trim()) {
    throw new ClaimAssemblyError("manual claim line requires a reason");
  }
  return prisma.claimLine.create({
    data: {
      claimId, seq: l.seq, kind: l.kind, code: l.code,
      codeSystem: l.codeSystem, codeVersion: l.codeVersion,
      description: l.description, quantity: l.quantity,
      unitPriceSar: l.unitPriceSar, simulatedPrice: l.simulatedPrice,
      serviceStart: l.serviceStart, serviceEnd: l.serviceEnd,
      eventIdsJson: JSON.stringify(l.eventIds),
      necessityJson: JSON.stringify(l.necessityIds),
      eventBacked,
      manualReason: manual?.reason ?? null,
      flagsJson: JSON.stringify(
        manual ? [...l.flags, "not_event_backed"] : l.flags,
      ),
    },
  });
}

/** Manual line — reason mandatory; always flagged not_event_backed. */
export async function addManualLine(
  claimId: string,
  input: {
    kind: string; code: string; codeSystem?: string; quantity: number;
    reason: string; description?: string;
  },
) {
  const seq = (await prisma.claimLine.count({ where: { claimId } })) + 1;
  return createLine(claimId, {
    seq,
    kind: input.kind,
    code: input.code,
    codeSystem: input.codeSystem ?? "",
    codeVersion: "",
    description: input.description ?? "",
    quantity: input.quantity,
    unitPriceSar: null,
    simulatedPrice: false,
    serviceStart: null, serviceEnd: null,
    eventIds: [], necessityIds: [],
    flags: [],
  }, { reason: input.reason });
}
