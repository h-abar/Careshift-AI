import { requirePerm } from "@/lib/server/session";
import { dbHandoffs, dbStaffPickers } from "@/lib/server/data";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async () => {
  await requirePerm("handoff_view");
  // Staff pickers get minimum-necessary identity only (0.4).
  const [records, users] = await Promise.all([dbHandoffs(), dbStaffPickers()]);
  return ok({ handoffs: records, users });
});
