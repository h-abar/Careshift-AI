import { requirePerm } from "@/lib/server/session";
import { dbSnapshots } from "@/lib/server/data";
import { handle, ok } from "@/lib/server/json";
import { handoffs } from "@/lib/data/shifts";

/** Smart Handoff context — shift pair + live census snapshots. */
export const GET = handle(async () => {
  await requirePerm("handoff_view");
  return ok({ ho: handoffs[0], snaps: await dbSnapshots() });
});
