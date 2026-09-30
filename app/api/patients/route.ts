import { requirePerm } from "@/lib/server/session";
import { dbSnapshots, dbUsers } from "@/lib/server/data";
import { prisma } from "@/lib/server/prisma";
import { auditOnce, auditDedupeMin } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async (req: Request) => {
  const auth = await requirePerm("patients_view");
  const [snaps, users, assignments] = await Promise.all([
    dbSnapshots(),
    dbUsers(),
    prisma.assignment.findMany(),
  ]);
  await auditOnce(
    auth.user.id, "patients.list", "patient", "list",
    auditDedupeMin(), auth.sid, req,
  );
  return ok({
    snaps,
    assignments: assignments.map((a) => ({
      patientId: a.patientId,
      dept: a.dept,
      nurseId: a.nurseId,
      physicianId: a.physicianId,
      chargeNurseId: a.chargeNurseId,
    })),
    userNames: Object.fromEntries(
      users.map((u) => [u.id, { en: u.nameEn, ar: u.nameAr }]),
    ),
  });
});
