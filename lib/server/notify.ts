import { prisma } from "@/lib/server/prisma";

/**
 * Create a per-user notification. `key` is an i18n template that may embed
 * `{id}` (entityId / patientId) and `{detail}` placeholders — resolved in
 * the client so one key serves every language.
 */
export async function notify(
  userId: string | null,
  key: string,
  level: "critical" | "warning" | "info",
  opts?: {
    patientId?: string;
    entityType?: string;
    entityId?: string;
    detail?: string;
  },
) {
  try {
    await prisma.notification.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        key,
        level,
        patientId: opts?.patientId ?? null,
        entityType: opts?.entityType ?? null,
        entityId: opts?.entityId ?? null,
        detail: opts?.detail ?? "",
      },
    });
  } catch (err) {
    // Notifications must never break the triggering workflow.
    console.error("notify failed:", err);
  }
}
