import { handle, ok } from "@/lib/server/json";
import { ApiError } from "@/lib/server/session";
import { ingest } from "@/lib/integrations/ingest";
import { vitalsWebhookAdapter } from "@/lib/integrations/webhook";
import { audit } from "@/lib/server/audit";
import { createHash } from "node:crypto";

/**
 * D1 — device vitals webhook. Machine-to-machine: gated by a shared
 * WEBHOOK_SECRET header (env); disabled (503) when unset so the demo
 * stays offline-first. Body: one vitals payload or an array.
 */
export const POST = handle(async (req: Request) => {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) throw new ApiError(503, "webhook disabled");
  if (req.headers.get("x-webhook-key") !== secret)
    throw new ApiError(401, "bad webhook key");

  const body = await req.json().catch(() => null);
  if (!body) throw new ApiError(400, "bad_json");

  const payloads = Array.isArray(body) ? body : [body];
  const report = await ingest(vitalsWebhookAdapter, payloads);

  await audit({
    userId: "webhook",
    action: "ingest.vitals",
    entityType: "ingestion",
    entityId: createHash("sha256").update(JSON.stringify(report)).digest("hex").slice(0, 16),
    next: report,
  });
  return ok(report, { status: 202 });
});
