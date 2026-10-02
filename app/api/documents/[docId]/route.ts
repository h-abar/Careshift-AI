import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/server/prisma";
import { requireAnyPerm } from "@/lib/server/session";
import { assertPayerClaim } from "@/lib/server/claims";
import { handle } from "@/lib/server/json";
import { uploadDir } from "@/app/api/claims/[id]/documents/route";

/**
 * Serve an uploaded claim document — authenticated, scanned-clean only, and
 * the file name is resolved through the DB so arbitrary paths can never be
 * requested. Downloads are forced via Content-Disposition: attachment with
 * nosniff + a restrictive CSP on the response itself.
 */
export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ docId: string }> }) => {
    const auth = await requireAnyPerm(["claims_view", "payer_claims"]);
    const { docId } = await ctx.params;
    const doc = await prisma.claimDocument.findUnique({
      where: { id: docId },
      include: { claim: { select: { payerOrg: true } } },
    });
    if (!doc || doc.scanStatus !== "clean") {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    assertPayerClaim(auth, doc.claim);

    const file = path.join(uploadDir(), doc.storedAs);
    const buf = await readFile(file).catch(() => null);
    if (!buf) return Response.json({ error: "file missing" }, { status: 404 });

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(buf.length),
        // Always download — never render attacker-controlled bytes inline.
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  },
);
