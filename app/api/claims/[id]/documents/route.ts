import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { claimEvent } from "@/lib/server/claims";
import { UPLOAD_MAX_BYTES, UPLOAD_MIME } from "@/lib/denial";
import { EVIDENCE_KEYS } from "@/lib/data/claims";
import { handle, ok } from "@/lib/server/json";

export const uploadDir = () =>
  process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

/**
 * Upload a claim document — files land in a local uploads dir (never under
 * /public); only metadata reaches the client. Size and MIME are enforced.
 * `kind` may name an evidence item the document satisfies.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("claims_edit");
    const { id } = await ctx.params;

    const claim = await prisma.insuranceClaim.findUnique({ where: { id } });
    if (!claim) return Response.json({ error: "not found" }, { status: 404 });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const kind = form?.get("kind");
    if (!form || !(file instanceof File)) {
      return Response.json(
        { error: "multipart 'file' field is required", code: "file_required" },
        { status: 400 },
      );
    }
    const ext = UPLOAD_MIME[file.type];
    if (!ext) {
      return Response.json(
        { error: `unsupported type ${file.type}`, code: "unsupported_type" },
        { status: 400 },
      );
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      return Response.json(
        { error: "file exceeds 5 MB", code: "too_large" },
        { status: 400 },
      );
    }

    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    const storedAs = `${id}-${crypto.randomUUID()}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, storedAs), buf);

    const doc = await prisma.claimDocument.create({
      data: {
        claimId: id,
        fileName: file.name.slice(0, 200),
        mimeType: file.type,
        sizeBytes: file.size,
        storedAs,
        uploadedBy: auth.user.id,
      },
    });

    // The document satisfies an evidence item → readiness recalculates from
    // actual evidence, not a static number.
    const evidence = JSON.parse(claim.evidenceJson) as string[];
    const evKey =
      typeof kind === "string" &&
      (EVIDENCE_KEYS as readonly string[]).includes(kind)
        ? kind
        : null;
    if (evKey && !evidence.includes(evKey)) {
      await prisma.insuranceClaim.update({
        where: { id },
        data: { evidenceJson: JSON.stringify([...evidence, evKey]) },
      });
    }

    await claimEvent(id, auth.user.id, "upload", file.name);
    await audit(
      {
        userId: auth.user.id,
        action: "claim.upload",
        entityType: "claim",
        entityId: id,
        next: { file: doc.fileName, size: doc.sizeBytes, kind: evKey },
        sessionId: auth.sid,
      },
      req,
    );

    return ok({
      document: {
        id: doc.id,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        createdAt: doc.createdAt,
      },
    });
  },
);
