import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { handle } from "@/lib/server/json";
import { uploadDir } from "@/app/api/claims/[id]/documents/route";

/**
 * Serve an uploaded claim document — authenticated, and the file name is
 * resolved through the DB so arbitrary paths can never be requested.
 */
export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ docId: string }> }) => {
    await requirePerm("insurance_view");
    const { docId } = await ctx.params;
    const doc = await prisma.claimDocument.findUnique({ where: { id: docId } });
    if (!doc) return Response.json({ error: "not found" }, { status: 404 });

    const file = path.join(uploadDir(), doc.storedAs);
    const buf = await readFile(file).catch(() => null);
    if (!buf) return Response.json({ error: "file missing" }, { status: 404 });

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(buf.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
