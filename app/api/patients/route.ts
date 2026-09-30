import { requirePerm } from "@/lib/server/session";
import { dbSnapshots, dbUsers } from "@/lib/server/data";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import { assignments } from "@/lib/data/handoffs";

export const GET = handle(async (req: Request) => {
  const auth = await requirePerm("patients_view");
  const [snaps, users] = await Promise.all([dbSnapshots(), dbUsers()]);
  await audit(
    {
      userId: auth.user.id,
      action: "patients.list",
      entityType: "patient",
      entityId: "list",
      sessionId: auth.sid,
    },
    req,
  );
  return ok({
    snaps,
    assignments,
    userNames: Object.fromEntries(
      users.map((u) => [u.id, { en: u.nameEn, ar: u.nameAr }]),
    ),
  });
});
