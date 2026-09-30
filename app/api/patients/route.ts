import { requirePerm } from "@/lib/server/session";
import { dbSnapshots, dbUsers } from "@/lib/server/data";
import { handle, ok } from "@/lib/server/json";
import { assignments } from "@/lib/data/handoffs";

export const GET = handle(async () => {
  await requirePerm("patients_view");
  const [snaps, users] = await Promise.all([dbSnapshots(), dbUsers()]);
  return ok({
    snaps,
    assignments,
    userNames: Object.fromEntries(
      users.map((u) => [u.id, { en: u.nameEn, ar: u.nameAr }]),
    ),
  });
});
