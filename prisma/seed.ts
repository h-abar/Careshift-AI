/**
 * Seed — loads the existing demo dataset from lib/data into the DB.
 * Run: npm run db:seed
 *
 * Demo passwords are generated as Demo@<employee-number> and stored
 * bcrypt-hashed — plaintext credentials never live in the DB or in
 * lib/data. See README for the account table.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { patients } from "../lib/data/patients";
import { users } from "../lib/data/users";
import { claims } from "../lib/data/claims";
import { handoffRecords } from "../lib/data/handoffs";
import { journeys } from "../lib/data/journeys";

const prisma = new PrismaClient();

const ROLES = [
  { key: "admin", nameEn: "System Administrator", nameAr: "مدير النظام" },
  { key: "physician", nameEn: "Physician", nameAr: "طبيب" },
  { key: "nurse", nameEn: "Nurse", nameAr: "ممرض/ممرضة" },
  { key: "charge_nurse", nameEn: "Charge Nurse", nameAr: "ممرض مسؤول" },
  { key: "insurance", nameEn: "Insurance Reviewer", nameAr: "مراجع تأمين" },
  { key: "hospital_admin", nameEn: "Hospital Administrator", nameAr: "مدير مستشفى" },
];

const SHIFTS = [
  { id: "SH-DAY", key: "day", nameEn: "Day Shift", nameAr: "الشيفت الصباحي", label: "07:00–19:00" },
  { id: "SH-NIGHT", key: "night", nameEn: "Night Shift", nameAr: "الشيفت الليلي", label: "19:00–07:00" },
];

const deptFor = (room: string) =>
  room.startsWith("Surg") ? "surgical"
    : room.startsWith("Obs") || room.startsWith("ER") ? "er"
    : "icu";

/** Demo password rule — documented in README. */
const demoPassword = (employeeId: string) =>
  `Demo@${employeeId.replace(/\D/g, "").slice(-4)}`;

async function main() {
  // Wipe in dependency order (dev seed only).
  await prisma.auditLog.deleteMany();
  await prisma.interventionOverride.deleteMany();
  await prisma.riskAssessment.deleteMany();
  await prisma.insuranceClaim.deleteMany();
  await prisma.handoff.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.role.deleteMany();

  await prisma.role.createMany({ data: ROLES });
  await prisma.shift.createMany({ data: SHIFTS });

  for (const u of users) {
    await prisma.user.create({
      data: {
        id: u.id,
        username: u.username,
        passwordHash: bcrypt.hashSync(demoPassword(u.employeeId), 10),
        nameEn: u.nameEn,
        nameAr: u.nameAr,
        roleKey: u.role,
        dept: u.dept,
        specialtyEn: u.specialty.en,
        specialtyAr: u.specialty.ar,
        email: u.email,
        phone: u.phone,
        employeeId: u.employeeId,
        status: u.status,
      },
    });
  }

  for (const p of patients) {
    await prisma.patient.create({
      data: {
        id: p.id,
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        age: p.age,
        sex: p.sex,
        room: p.room,
        dxKey: p.dxKey,
        attending: p.attending,
        admittedAt: p.admittedAt,
        shift: p.shift,
        dept: deptFor(p.room),
        vitalsJson: JSON.stringify(p.vitals),
        labsJson: JSON.stringify(p.labs),
        riskFlagsJson: JSON.stringify(p.riskFlags),
        medsJson: JSON.stringify(p.meds),
        noteEn: p.noteEn,
        noteAr: p.noteAr,
        journeyJson: journeys[p.id] ? JSON.stringify(journeys[p.id]) : null,
      },
    });
  }

  for (const c of claims) {
    await prisma.insuranceClaim.create({
      data: {
        id: c.id,
        patientId: c.patientId ?? null,
        amountSar: c.amountSar,
        status: c.status,
        dxKey: c.dxKey,
        losDays: c.losDays,
        icuDays: c.icuDays,
        evidenceJson: JSON.stringify(c.evidence),
        frictionJson: JSON.stringify(c.frictionKeys),
      },
    });
  }

  for (const h of handoffRecords) {
    await prisma.handoff.create({
      data: {
        id: h.id,
        dept: h.dept,
        shift: h.shift,
        date: h.date,
        outgoingId: h.outgoingId,
        incomingId: h.incomingId,
        patientIdsJson: JSON.stringify(h.patientIds),
        status: h.status,
        reviewedJson: JSON.stringify(h.reviewed),
        checklistJson: JSON.stringify(h.checklist),
        timelineJson: JSON.stringify(h.timeline),
      },
    });
  }

  const counts = {
    roles: ROLES.length,
    users: await prisma.user.count(),
    patients: await prisma.patient.count(),
    claims: await prisma.insuranceClaim.count(),
    handoffs: await prisma.handoff.count(),
    shifts: SHIFTS.length,
  };
  console.log("Seeded:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
