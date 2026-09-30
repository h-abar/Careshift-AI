import { requirePerm } from "@/lib/server/session";
import { dbSnapshots, dbStaffPickers } from "@/lib/server/data";
import { prisma } from "@/lib/server/prisma";
import { auditOnce, auditDedupeMin } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async (req: Request) => {
  const auth = await requirePerm("patients_view");
  const [snaps, users, assignments] = await Promise.all([
    dbSnapshots(),
    dbStaffPickers(),
    prisma.assignment.findMany(),
  ]);
  await auditOnce(
    auth.user.id, "patients.list", "patient", "list",
    auditDedupeMin(), auth.sid, req,
  );
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 0);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("pageSize")) || 25),
  );
  const paged = page > 0;
  const pageSnaps = paged ? snaps.slice((page - 1) * pageSize, page * pageSize) : snaps;
  return ok({
    snaps: pageSnaps,
    total: snaps.length,
    page: paged ? page : 1,
    pageSize,
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
