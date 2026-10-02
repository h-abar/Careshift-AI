/**
 * C5 — insurer claim package: GET (JSON | ?format=fhir | ?format=pdf)
 * and POST ?verify → integrity check. Minimum-necessary content only —
 * actor roles, never names; patient identified by encounter/claim id.
 * Every access is audited (PDPL need-to-know).
 */
import { requireAnyPerm } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { assertPayerClaim } from "@/lib/server/claims";
import {
  buildPackage, verifyPackage, packageToFhirStyle, packageToPdf,
} from "@/lib/server/claim-package";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAnyPerm(["claims_view", "payer_claims"]);
    const { id } = await ctx.params;
    assertPayerClaim(
      auth,
      await prisma.insuranceClaim.findUnique({
        where: { id },
        select: { payerOrg: true },
      }),
    );
    const format = new URL(req.url).searchParams.get("format");
    const pkg = await buildPackage(id);
    if (!pkg) return Response.json({ error: "not found" }, { status: 404 });
    await audit({
      userId: auth.user.id, action: "claim.package.view",
      entityType: "claim", entityId: id,
      next: { format: format ?? "json", events: Object.keys(pkg.eventHashes).length },
      sessionId: auth.sid,
    }, req);

    if (format === "fhir") {
      return ok(packageToFhirStyle(pkg));
    }
    if (format === "pdf") {
      const pdf = packageToPdf(pkg);
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="claim-${id}-package.pdf"`,
        },
      });
    }
    return ok(pkg);
  },
);

/** Verify integrity — recomputes all hashes against the live store. */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAnyPerm(["claims_view", "payer_claims"]);
    const { id } = await ctx.params;
    assertPayerClaim(
      auth,
      await prisma.insuranceClaim.findUnique({
        where: { id },
        select: { payerOrg: true },
      }),
    );
    const result = await verifyPackage(id);
    await audit({
      userId: auth.user.id, action: "claim.package.verify",
      entityType: "claim", entityId: id,
      next: result,
      sessionId: auth.sid,
    }, req);
    return ok(result);
  },
);
