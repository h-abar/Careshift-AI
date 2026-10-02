/**
 * C5 — insurer verifiable claim package. Real DB (schema=test).
 * Minimum necessary (no names), hash proof, tamper detection.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { migrateUrl, schemaUrl } from "./db-url";
import { prisma } from "@/lib/server/prisma";
import {
  buildPackage, verifyPackage, packageToFhirStyle, packageToPdf,
  PACKAGE_LABEL,
} from "@/lib/server/claim-package";
import { assembleClaim } from "@/lib/server/claim-assembly";

beforeAll(async () => {
  execSync("npx tsx scripts/deallocate.ts", {
    env: { ...process.env, DATABASE_URL: schemaUrl("test") }, stdio: "ignore",
  });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: migrateUrl("test") }, stdio: "ignore",
  });
  execSync("npx tsx prisma/seed.ts", {
    env: { ...process.env, DATABASE_URL: schemaUrl("test") }, stdio: "ignore",
  });
}, 180_000);

async function assembledClaim() {
  const c = await prisma.insuranceClaim.findFirst({
    where: { patientId: { not: null } }, orderBy: { id: "asc" },
  });
  await assembleClaim(c!.id);
  return c!;
}

describe("C5 insurer claim package", () => {
  it("package carries lines + event summaries + hashes — no names", async () => {
    const c = await assembledClaim();
    const pkg = (await buildPackage(c.id))!;
    expect(pkg.label).toBe(PACKAGE_LABEL);
    expect(pkg.lines.length).toBeGreaterThan(0);
    for (const l of pkg.lines.filter((x) => x.eventBacked)) {
      expect(l.events.length).toBeGreaterThan(0);
      for (const e of l.events) {
        expect(e.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(pkg.eventHashes[e.id]).toBe(e.hash);
      }
    }
    // minimum necessary: no user names anywhere in the package
    const blob = JSON.stringify(pkg);
    const users = await prisma.user.findMany({ select: { nameEn: true } });
    for (const u of users) {
      expect(blob.includes(u.nameEn), `leaked name ${u.nameEn}`).toBe(false);
    }
    expect(blob).not.toMatch(/nameEn|nameAr/);
  });

  it("verifyPackage passes on intact data", async () => {
    const c = await assembledClaim();
    const v = await verifyPackage(c.id);
    expect(v.missingEvents).toEqual([]);
    expect(v.unsupportedLines).toEqual([]);
    expect(v.hashMismatch).toEqual([]);
    expect(v.chainOk).toBe(true);
    expect(v.ok).toBe(true);
  });

  it("verifyPackage detects tampering", async () => {
    const c = await assembledClaim();
    const { appendEvent } = await import("@/lib/server/events");
    // scratch event at chain tail — mutate it, verify fails, delete to
    // restore the chain for later tests.
    const scratch = await appendEvent({
      patientId: c.patientId!, type: "documentation_entry",
      occurredAt: new Date(), actorRole: "doctor",
      payload: { note: "scratch" },
    });
    const okBefore = await verifyPackage(c.id);
    expect(okBefore.ok).toBe(true);
    await prisma.clinicalEvent.update({
      where: { id: scratch.id },
      data: { payloadJson: JSON.stringify({ tampered: true }) },
    });
    const v = await verifyPackage(c.id);
    expect(v.ok).toBe(false);
    expect(v.chainOk).toBe(false);
    await prisma.clinicalEvent.delete({ where: { id: scratch.id } });
  });

  it("FHIR-style export: Claim + supportingInfo → event ids", async () => {
    const c = await assembledClaim();
    const pkg = (await buildPackage(c.id))!;
    const fhir = packageToFhirStyle(pkg);
    expect(fhir.resourceType).toBe("Bundle");
    expect(fhir.meta.tag[0].code).toBe("Simulated");
    const claim = fhir.entry[0].resource as {
      resourceType: string;
      supportingInfo: { valueReference: { reference: string } }[];
    };
    expect(claim.resourceType).toBe("Claim");
    for (const si of claim.supportingInfo) {
      expect(si.valueReference.reference).toMatch(/^ClinicalEvent\//);
      const eid = si.valueReference.reference.split("/")[1];
      expect(pkg.eventHashes[eid]).toBeTruthy();
    }
  });

  it("PDF export emits a valid minimal PDF", async () => {
    const c = await assembledClaim();
    const pkg = (await buildPackage(c.id))!;
    const pdf = packageToPdf(pkg);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("startxref");
    expect(pdf.toString("latin1")).toContain(pkg.claimId);
  });
});
