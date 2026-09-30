import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/server/prisma";

/**
 * Configurable retention purge (item 7 — PDPL/NCA-oriented). Deletes rows
 * older than RETENTION_*_DAYS and writes a `system.purge` AuditLog row
 * summarizing what was removed. Run via `npm run db:purge` (tsx
 * scripts/purge.ts) or cron/Task Scheduler.
 */

const days = (name: string, def: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : def;
};

const cutoff = (d: number) => new Date(Date.now() - d * 86_400_000);

export interface PurgeResult {
  auditLog: number;
  loginAttempt: number;
  session: number;
  notification: number;
  claimDocument: number;
  rateBucket: number;
}

export async function purgeExpired(opts?: {
  uploadDir?: string;
}): Promise<PurgeResult> {
  const result: PurgeResult = {
    auditLog: 0,
    loginAttempt: 0,
    session: 0,
    notification: 0,
    claimDocument: 0,
    rateBucket: 0,
  };

  result.rateBucket = (
    await prisma.rateBucket.deleteMany({
      where: {
        expiresAt: { lt: cutoff(days("RETENTION_RATEBUCKET_DAYS", 7)) },
      },
    })
  ).count;

  result.loginAttempt = (
    await prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: cutoff(days("RETENTION_LOGIN_DAYS", 90)) } },
    })
  ).count;

  result.session = (
    await prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { createdAt: { lt: cutoff(days("RETENTION_SESSION_DAYS", 30)) } },
        ],
      },
    })
  ).count;

  // Receipts cascade with the notification row.
  result.notification = (
    await prisma.notification.deleteMany({
      where: {
        createdAt: { lt: cutoff(days("RETENTION_NOTIFICATION_DAYS", 90)) },
      },
    })
  ).count;

  // Old claim documents: remove the file first, then the row.
  const docs = await prisma.claimDocument.findMany({
    where: {
      createdAt: { lt: cutoff(days("RETENTION_DOCUMENT_DAYS", 365)) },
    },
    select: { id: true, storedAs: true },
  });
  const dir =
    opts?.uploadDir ??
    process.env.UPLOAD_DIR ??
    path.join(process.cwd(), "uploads");
  for (const doc of docs) {
    await fs
      .unlink(path.join(dir, path.basename(doc.storedAs)))
      .catch(() => {});
  }
  if (docs.length) {
    result.claimDocument = (
      await prisma.claimDocument.deleteMany({
        where: { id: { in: docs.map((d) => d.id) } },
      })
    ).count;
  }

  // Audit itself is purged last, and the purge records a summary row —
  // the retention run is itself auditable.
  result.auditLog = (
    await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff(days("RETENTION_AUDIT_DAYS", 365)) } },
    })
  ).count;

  await prisma.auditLog.create({
    data: {
      userId: "system",
      action: "system.purge",
      entityType: "retention",
      entityId: "purge",
      nextJson: JSON.stringify(result),
    },
  });

  return result;
}
