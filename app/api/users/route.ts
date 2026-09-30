import { requirePerm } from "@/lib/server/session";
import { dbUsers } from "@/lib/server/data";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async () => {
  await requirePerm("users_manage");
  return ok({ users: await dbUsers() });
});
