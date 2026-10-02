/**
 * C5 — insurer-facing verifiable claim package (minimum necessary).
 *
 * The package carries claim lines + per-line supporting event
 * summaries (type, timestamp, actor ROLE, coded value — never names),
 * the full event hash table, and a package hash covering the lot.
 * verifyPackage() recomputes everything from the immutable store —
 * detects tampering, missing events and unsupported lines.
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/server/prisma";
import { verifyChain } from "@/lib/server/events";
import { textPdf } from "@/lib/pdf";

if (typeof window !== "undefined") {
  throw new Error("lib/server/claim-package.ts is server-only");
}

export const PACKAGE_LABEL =
  "Simulated claim package — minimum necessary (not a real submission)";

export interface PackageEvent {
  id: string;
  type: string;
  occurredAt: string;
  actorRole: string;
  codedValue: string | null; // LOINC/code + value only — never names
  hash: string;
}

export interface ClaimPackage {
  label: string;
  claimId: string;
  encounterId: string;
  status: string;
  dxKey: string;
  generatedAt: string;
  lines: {
    seq: number; kind: string; code: string; codeSystem: string;
    codeVersion: string; quantity: number;
    unitPriceSar: number | null; simulatedPrice: boolean;
    serviceStart: string | null; serviceEnd: string | null;
    eventBacked: boolean; flags: string[];
    events: PackageEvent[];
  }[];
  eventHashes: Record<string, string>;
  packageHash: string;
}

/** Coded value shown to the insurer — codes/values only, no notes. */
function codedValueOf(payload: Record<string, unknown>): string | null {
  if (Array.isArray(payload.measurements)) {
    return (payload.measurements as { loinc: string; value: number; unit: string }[])
      .map((m) => `LOINC:${m.loinc}=${m.value}${m.unit}`)
      .join("; ");
  }
  if (payload.loinc || payload.code)
    return `${payload.loinc ? `LOINC:${payload.loinc}` : `code:${payload.code}`}=${payload.value ?? ""}`;
  if (payload.medKey) return `med:${payload.medKey}`;
  if (payload.key) return `${payload.key}=${payload.value ?? ""}`;
  return null;
}

function packageCanonical(p: Omit<ClaimPackage, "packageHash">): string {
  return JSON.stringify({
    claimId: p.claimId,
    lines: p.lines.map((l) => ({
      kind: l.kind, code: l.code, quantity: l.quantity,
      eventIds: l.events.map((e) => e.id).sort(),
    })),
    eventHashes: Object.fromEntries(
      Object.entries(p.eventHashes).sort(([a], [b]) => a.localeCompare(b)),
    ),
  });
}

export function packageHash(p: Omit<ClaimPackage, "packageHash">): string {
  return createHash("sha256").update(packageCanonical(p)).digest("hex");
}

export async function buildPackage(claimId: string): Promise<ClaimPackage | null> {
  const claim = await prisma.insuranceClaim.findUnique({
    where: { id: claimId }, include: { lines: { orderBy: { seq: "asc" } } },
  });
  if (!claim) return null;

  const eventIds = claim.lines.flatMap((l) => JSON.parse(l.eventIdsJson) as string[]);
  const evRows = eventIds.length
    ? await prisma.clinicalEvent.findMany({ where: { id: { in: eventIds } } })
    : [];
  const evMap = new Map(evRows.map((e) => [e.id, e]));

  const base: Omit<ClaimPackage, "packageHash"> = {
    label: PACKAGE_LABEL,
    claimId: claim.id,
    encounterId: claim.patientId ? `enc-${claim.patientId}` : "",
    status: claim.status,
    dxKey: claim.dxKey,
    generatedAt: new Date().toISOString(),
    lines: claim.lines.map((l) => ({
      seq: l.seq, kind: l.kind, code: l.code, codeSystem: l.codeSystem,
      codeVersion: l.codeVersion, quantity: l.quantity,
      unitPriceSar: l.unitPriceSar, simulatedPrice: l.simulatedPrice,
      serviceStart: l.serviceStart?.toISOString() ?? null,
      serviceEnd: l.serviceEnd?.toISOString() ?? null,
      eventBacked: l.eventBacked,
      flags: JSON.parse(l.flagsJson) as string[],
      events: (JSON.parse(l.eventIdsJson) as string[])
        .map((eid) => evMap.get(eid))
        .filter(Boolean)
        .map((e) => ({
          id: e!.id,
          type: e!.type,
          occurredAt: e!.occurredAt.toISOString(),
          actorRole: e!.actorRole,
          codedValue: codedValueOf(JSON.parse(e!.payloadJson)),
          hash: e!.hash,
        })),
    })),
    eventHashes: Object.fromEntries(evRows.map((e) => [e.id, e.hash])),
  };
  return { ...base, packageHash: packageHash(base) };
}

export interface VerifyPackageResult {
  ok: boolean;
  chainOk: boolean;
  checkedEvents: number;
  missingEvents: string[];
  unsupportedLines: string[];
  hashMismatch: string[];
  packageHashOk: boolean;
}

/** Re-verify the whole package from the live immutable store. */
export async function verifyPackage(claimId: string): Promise<VerifyPackageResult> {
  const pkg = await buildPackage(claimId);
  if (!pkg) throw new Error("claim not found");

  // re-fetch events and recompute hashes against stored content
  const ids = Object.keys(pkg.eventHashes);
  const rows = ids.length
    ? await prisma.clinicalEvent.findMany({ where: { id: { in: ids } } })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  const missingEvents = ids.filter((id) => !byId.has(id));
  const hashMismatch: string[] = [];
  for (const [id, hash] of Object.entries(pkg.eventHashes)) {
    const r = byId.get(id);
    if (r && r.hash !== hash) hashMismatch.push(id);
  }
  const unsupportedLines = pkg.lines
    .filter((l) => l.eventBacked && l.events.length === 0)
    .map((l) => `${l.seq}`);

  // hash-chain integrity across the patient's whole chain
  const claim = await prisma.insuranceClaim.findUnique({
    where: { id: claimId }, select: { patientId: true },
  });
  const chain = claim?.patientId ? await verifyChain(claim.patientId) : null;

  const ok =
    missingEvents.length === 0 && hashMismatch.length === 0 &&
    unsupportedLines.length === 0 && (chain?.ok ?? false);

  return {
    ok,
    chainOk: chain?.ok ?? false,
    checkedEvents: rows.length,
    missingEvents,
    unsupportedLines,
    hashMismatch,
    packageHashOk: pkg.packageHash === packageHash(pkg),
  };
}

/** C5 export — FHIR-style JSON (NOT the full NPHIES IG bundle; that is
 *  C10). Claim resource + supportingInfo referencing event ids. */
export function packageToFhirStyle(pkg: ClaimPackage) {
  return {
    resourceType: "Bundle",
    type: "collection",
    meta: { tag: [{ code: "Simulated", display: PACKAGE_LABEL }] },
    entry: [
      {
        resource: {
          resourceType: "Claim",
          id: pkg.claimId,
          status: "active",
          encounter: { reference: `Encounter/${pkg.encounterId}` },
          item: pkg.lines.map((l) => ({
            sequence: l.seq,
            productOrService: {
              coding: l.code
                ? [{ system: l.codeSystem, code: l.code, version: l.codeVersion }]
                : [],
            },
            quantity: { value: l.quantity },
            servicedPeriod:
              l.serviceStart && l.serviceEnd
                ? { start: l.serviceStart, end: l.serviceEnd }
                : undefined,
          })),
          supportingInfo: pkg.lines.flatMap((l) =>
            l.events.map((e) => ({
              category: { text: "clinical-event" },
              sequence: undefined,
              valueReference: {
                reference: `ClinicalEvent/${e.id}`,
                display: `${e.type} @ ${e.occurredAt} (${e.actorRole})`,
              },
            })),
          ),
        },
      },
      ...pkg.lines.flatMap((l) =>
        l.events.map((e) => ({
          resource: {
            resourceType: "Basic",
            id: e.id,
            code: { text: e.type },
            extension: [
              { url: "event-occurredAt", valueDateTime: e.occurredAt },
              { url: "event-actorRole", valueString: e.actorRole },
              { url: "event-hash", valueString: e.hash },
            ],
          },
        })),
      ),
    ],
  };
}

/** Minimal PDF writer — shared implementation in lib/pdf.ts. */
export function packageToPdf(pkg: ClaimPackage): Buffer {
  const text: string[] = [
    `Claim: ${pkg.claimId}   Encounter: ${pkg.encounterId}   Status: ${pkg.status}`,
    `Diagnosis key: ${pkg.dxKey}`,
    `Generated: ${pkg.generatedAt}`,
    `Package hash: ${pkg.packageHash}`,
    "",
    "Lines:",
    ...pkg.lines.map((l) =>
      `  #${l.seq} ${l.kind}  code=${l.code || "-"}  qty=${l.quantity}` +
      `  events=${l.events.length}${l.eventBacked ? "" : "  [not event-backed]"}`
    ),
    "",
    "Supporting events:",
    ...pkg.lines.flatMap((l) =>
      l.events.map((e) => `  ${e.occurredAt}  ${e.type}  ${e.actorRole}  ${e.hash.slice(0, 16)}`)
    ),
    "",
    PACKAGE_LABEL,
  ];
  return textPdf("Careshift AI — Claim Evidence Package (Simulated)", text);
}
