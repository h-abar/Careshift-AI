import { requireAuth } from "@/lib/server/session";
import { handle, ok } from "@/lib/server/json";
import { notifications } from "@/lib/data/handoffs";

export const GET = handle(async () => {
  await requireAuth();
  return ok({ notifications });
});
