import { requirePerm } from "@/lib/server/session";
import { metricsText } from "@/lib/server/metrics";
import { handle } from "@/lib/server/json";

/** Prometheus-format request metrics — admin surface (audit_view). */
export const GET = handle(async () => {
  await requirePerm("audit_view");
  return new Response(metricsText(), {
    headers: { "content-type": "text/plain; version=0.0.4" },
  });
});
