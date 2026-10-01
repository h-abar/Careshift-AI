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
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { bouncerUrl } from "../scripts/bouncer-url";
import { patients } from "../lib/data/patients";
import { users } from "../lib/data/users";
import { claims } from "../lib/data/claims";
import { handoffRecords, assignments, notifications } from "../lib/data/handoffs";
import { handoffs as shiftHandoffs } from "../lib/data/shifts";
import { journeys } from "../lib/data/journeys";

// Never seed a real production environment. APP_ENV marks deployment
// intent (production/demo/development); NODE_ENV=production is also used
// for the demo container build, so APP_ENV takes precedence when set.
const appEnv = process.env.APP_ENV || process.env.NODE_ENV;
if (appEnv === "production") {
  console.error(
    "Refusing to seed — demo data/passwords are development/demo-only and must never run in production.",
  );
  process.exit(1);
}

// pgbouncer mode → simple statements only; on local `prisma dev` (PGlite)
// prepared statements leak across pooled connections and collide (42P05).
// Assign BEFORE any lib/server/* module import so the shared `prisma`
// singleton (created lazily at import) also uses the simple-statement URL.
process.env.DATABASE_URL = bouncerUrl(process.env.DATABASE_URL);
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
  await prisma.assignment.deleteMany();
  await prisma.notificationReceipt.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.shiftHandoff.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.role.deleteMany();
  // Knowledge base (PROMPT A) — reloaded idempotently below.
  await prisma.ruleExecution.deleteMany();
  await prisma.ruleReference.deleteMany();
  await prisma.ruleVersion.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.reference.deleteMany();
  await prisma.terminology.deleteMany();
  await prisma.kpiDefinition.deleteMany();
  await prisma.extCache.deleteMany();
  await prisma.clinicalEvent.deleteMany();

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
        lastLoginAt: new Date(Date.now() - (u.lastLoginMin ?? 0) * 60000),
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

  for (const [i, c] of claims.entries()) {
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
        // Spread across the last 6 months so the savings trend is real.
        updatedAt: new Date(
          Date.now() - (i % 6) * 30 * 24 * 60 * 60 * 1000,
        ),
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

  await prisma.assignment.createMany({
    data: assignments.map((a) => ({
      patientId: a.patientId,
      dept: a.dept,
      nurseId: a.nurseId,
      physicianId: a.physicianId,
      chargeNurseId: a.chargeNurseId,
    })),
  });

  // Seeded notifications are delivered per-user via receipts — patient-linked
  // rows only go to users who hold patients_view (clinical staff).
  const CLINICAL = ["U-001", "U-002", "U-003"]; // physician, nurse, charge nurse
  for (const n of notifications) {
    await prisma.notification.create({
      data: {
        id: n.id,
        level: n.level,
        key: n.key,
        patientId: n.patientId ?? null,
        min: n.min,
        receipts: {
          create: CLINICAL.map((uid, i) => ({
            id: `${n.id}-r${i}`,
            userId: uid,
            // `read` on the seed item maps to a per-user receipt timestamp.
            readAt: n.read ? new Date() : null,
          })),
        },
      },
    });
  }

  await prisma.shiftHandoff.createMany({
    data: shiftHandoffs.map((s) => ({
      id: s.id,
      fromShiftEn: s.fromShift.en,
      fromShiftAr: s.fromShift.ar,
      toShiftEn: s.toShift.en,
      toShiftAr: s.toShift.ar,
      at: s.at,
      outgoingTeam: s.outgoingTeam,
      incomingTeam: s.incomingTeam,
    })),
  });

  // ── Knowledge base seed (A1): references + versioned rules + KPIs ──
  const kbDir = path.join(process.cwd(), "knowledge", "seed");
  const { kbFileSchema, loadKbFile } = await import("../lib/server/kb");
  for (const f of readdirSync(kbDir).filter((x) => x.endsWith(".json"))) {
    const parsed = kbFileSchema.parse(
      JSON.parse(readFileSync(path.join(kbDir, f), "utf8")),
    );
    await loadKbFile(parsed);
  }

  // ── Risk-assessment history (3B2-16): seeds P-1042's recorded 87→42→18
  // trajectory so the hour-1 bundle clock and risk chart have real rows.
  const riskHistory: { patientId: string; score: number; level: string; ago: number }[] = [
    { patientId: "P-1042", score: 87, level: "critical", ago: 120 },
    { patientId: "P-1042", score: 42, level: "medium", ago: 60 },
    { patientId: "P-1042", score: 18, level: "low", ago: 15 },
  ];
  for (const r of riskHistory) {
    await prisma.riskAssessment.create({
      data: {
        patientId: r.patientId,
        score: r.score,
        level: r.level,
        conditionKey: "dka",
        factorsJson: "[]",
        windowHrs: 4,
        confidence: 95,
        assessedAt: new Date(Date.now() - r.ago * 60000),
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
    assignments: await prisma.assignment.count(),
    notifications: await prisma.notification.count(),
    rules: await prisma.rule.count(),
    references: await prisma.reference.count(),
    riskAssessments: await prisma.riskAssessment.count(),
  };

  // C1 — backfill the immutable event store from the seeded tables.
  // Dynamic import: the shared `prisma` singleton must be created AFTER
  // the DATABASE_URL bouncer rewrite above.
  const { backfillEvents } = await import("../lib/server/backfill-events");
  const bf = await backfillEvents();
  console.log("Seeded:", { ...counts, clinicalEvents: bf.events });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
