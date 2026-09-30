import { requirePerm } from "@/lib/server/session";
import { dbHandoffs, dbUsers } from "@/lib/server/data";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async () => {
  await requirePerm("handoff_view");
  const [records, users] = await Promise.all([dbHandoffs(), dbUsers()]);
  return ok({ handoffs: records, users });
});
