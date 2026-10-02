import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { claimEvent } from "@/lib/server/claims";
import { UPLOAD_MAX_BYTES, UPLOAD_MIME } from "@/lib/denial";
import { EVIDENCE_KEYS } from "@/lib/data/claims";
import { readFileWithCap, sniffMime } from "@/lib/server/uploads";
import { activeScanner } from "@/lib/server/avscan";
import { handle, ok } from "@/lib/server/json";
import { rateGuard } from "@/lib/server/ratelimit";

export const uploadDir = () =>
  process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

// Multipart envelope overhead allowed on top of the file cap.
const ENVELOPE_BYTES = 64 * 1024;

/**
 * Upload a claim document — files land in a local uploads dir (never under
 * /public); only metadata reaches the client.
 *
 * Enforced before the file is marked available:
 *  1. Content-Length cap checked BEFORE the body is buffered (413 early).
 *  2. Declared MIME must be an allowed type.
 *  3. Bytes are streamed with a hard cap — a lying file.size cannot bypass it.
 *  4. Magic bytes must match the declared MIME (spoofed types rejected).
 *  5. AV scan (pluggable: ClamAV via CLAMAV_HOST, no-op default) — infected
 *     files are deleted and rejected.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("appeal_approve");
    const rg = await rateGuard(auth.user.id, "upload");
    if (rg) return rg;
    const { id } = await ctx.params;

    const claim = await prisma.insuranceClaim.findUnique({ where: { id } });
    if (!claim) return Response.json({ error: "not found" }, { status: 404 });

    // (1) Reject oversized requests before parsing/buffering anything.
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > UPLOAD_MAX_BYTES + ENVELOPE_BYTES) {
      return Response.json(
        { error: "request too large", code: "too_large" },
        { status: 413 },
      );
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const kind = form?.get("kind");
    if (!form || !(file instanceof File)) {
      return Response.json(
        { error: "multipart 'file' field is required", code: "file_required" },
        { status: 400 },
      );
    }
    // (2) Declared type gate.
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
        { status: 413 },
      );
    }

    // (3) Streamed read with a hard cap — cannot be bypassed by a fake size.
    const read = await readFileWithCap(file, UPLOAD_MAX_BYTES);
    if ("tooLarge" in read) {
      return Response.json(
        { error: "file exceeds 5 MB", code: "too_large" },
        { status: 413 },
      );
    }
    const buf = read.buf;

    // (4) Magic bytes must agree with the declared MIME type.
    if (sniffMime(buf) !== file.type) {
      return Response.json(
        { error: "file content does not match declared type", code: "mime_mismatch" },
        { status: 400 },
      );
    }

    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    const storedAs = `${id}-${crypto.randomUUID()}${ext}`;
    const filePath = path.join(dir, storedAs);
    await writeFile(filePath, buf);

    const doc = await prisma.claimDocument.create({
      data: {
        claimId: id,
        fileName: file.name.slice(0, 200),
        mimeType: file.type,
        sizeBytes: buf.length,
        storedAs,
        uploadedBy: auth.user.id,
        scanStatus: "pending",
      },
    });

    // (5) AV scan before the document is marked available. Fail closed:
    //     an unreachable scanner or an infected verdict removes the file.
    const scanner = activeScanner();
    const verdict = await scanner.scan(buf, file.name).catch((err) => ({
      clean: false,
      signature: `scan error: ${String(err)}`,
      engine: scanner.name,
    }));
    if (!verdict.clean) {
      await unlink(filePath).catch(() => undefined);
      await prisma.claimDocument.update({
        where: { id: doc.id },
        data: { scanStatus: "infected", scanEngine: verdict.engine },
      });
      await audit(
        {
          userId: auth.user.id,
          action: "claim.upload_blocked",
          entityType: "claim",
          entityId: id,
          next: { file: doc.fileName, signature: verdict.signature },
          sessionId: auth.sid,
        },
        req,
      );
      return Response.json(
        { error: "file rejected by antivirus scan", code: "av_infected" },
        { status: 422 },
      );
    }
    await prisma.claimDocument.update({
      where: { id: doc.id },
      data: { scanStatus: "clean", scanEngine: verdict.engine },
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
