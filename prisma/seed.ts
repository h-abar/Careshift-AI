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
  { key: "doctor", nameEn: "Doctor", nameAr: "طبيب" },
  { key: "nurse", nameEn: "Nurse", nameAr: "ممرض/ممرضة" },
  { key: "charge_nurse", nameEn: "Charge Nurse", nameAr: "ممرض مسؤول" },
  { key: "payer", nameEn: "Payer Reviewer", nameAr: "مراجع شركة التأمين" },
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
  await prisma.doctorTask.deleteMany();
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
  await prisma.tenant.deleteMany();

  // D2 — the demo hospital plus a second clearly-Simulated tenant to
  // prove cross-tenant isolation. All demo rows carry tenantId="demo".
  await prisma.tenant.createMany({
    data: [
      {
        id: "demo",
        nameEn: "Careshift Demo Hospital",
        nameAr: "مستشفى كيرشيفت التجريبي",
        simulated: true,
        configJson: JSON.stringify({
          adapters: ["webhook", "fhir", "hl7v2", "csv"],
          thresholdsVersion: "kb",
        }),
      },
      {
        id: "sim-east",
        nameEn: "Simulated East Hospital (tenant isolation test)",
        nameAr: "مستشفى الشرق الافتراضي (اختبار العزل) — Simulated",
        simulated: true,
        configJson: "{}",
      },
    ],
  });

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
        payerOrg: u.payerOrg ?? null,
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

  // Second tenant (sim-east) gets a minimal staff + patient so isolation
  // tests can assert that tenant demo never sees them and vice versa.
  await prisma.user.create({
    data: {
      id: "U-SE-1",
      username: "east.nurse",
      passwordHash: bcrypt.hashSync("Demo@0000", 10),
      nameEn: "Simulated East Nurse",
      nameAr: "ممرضة الشرق الافتراضية",
      roleKey: "nurse",
      dept: "ward",
      specialtyEn: "Simulated",
      specialtyAr: "افتراضي",
      email: "east.nurse@sim.example",
      phone: "+966 5X XXX 0000",
      employeeId: "EMP-SE-1",
      status: "active",
      tenantId: "sim-east",
    },
  });
  await prisma.patient.create({
    data: {
      id: "P-SE-1",
      nameEn: "Simulated East Patient",
      nameAr: "مريض الشرق الافتراضي — Simulated",
      age: 50,
      sex: "F",
      room: "E-1",
      dxKey: "obs",
      attending: "Simulated",
      admittedAt: "2025-01-01T00:00:00Z",
      shift: "day",
      dept: "ward",
      vitalsJson: JSON.stringify([
        { t: "08:00", hr: 78, sbp: 122, rr: 15, temp: 36.8, spo2: 98 },
      ]),
      labsJson: "[]",
      riskFlagsJson: "[]",
      medsJson: "[]",
      noteEn: "Simulated — tenant isolation fixture.",
      noteAr: "افتراضي — عنصر اختبار العزل.",
      tenantId: "sim-east",
    },
  });

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
        // E7 — claims split across two simulated payers so cross-payer
        // access can be denied and proven in tests.
        payerOrg: i % 4 === 0 ? "payer-sim-b" : "payer-sim-a",
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

  // E6 — an open doctor action task on a deteriorating patient whose
  // attending is the demo doctor a.salem (U-001): the doctor home
  // "Needs your action" widget and the ladder demo work live.
  {
    const deteriorating = "P-7455";
    const asg = await prisma.assignment.findUnique({
      where: { patientId: deteriorating },
    });
    if (asg) {
      const task = await prisma.doctorTask.create({
        data: {
          patientId: deteriorating,
          doctorId: asg.physicianId,
          level: "urgent",
          score: 5,
          nextEscalateAt: new Date(Date.now() + 5 * 60_000),
        },
      });
      await prisma.notification.create({
        data: {
          id: `n-${task.id}`,
          level: "critical",
          key: "notif.doctorTask",
          patientId: deteriorating,
          entityType: "doctor_task",
          entityId: task.id,
          detail: "5",
          receipts: {
            create: [{ id: `n-${task.id}-r0`, userId: asg.physicianId }],
          },
        },
      });
    }
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

  // ── NPHIES adjudication-reason snapshot (static official import,
  // offline — C4 checks map doc gaps to these codes and nothing else).
  const { loadNphiesAdjudicationReasons, NPHIES_SOURCE_URL } =
    await import("../lib/server/ext/nphies");
  const nphiesSnap = loadNphiesAdjudicationReasons();
  for (const c of nphiesSnap.concepts) {
    await prisma.terminology.upsert({
      where: {
        provider_system_code: {
          provider: "nphies", system: "adjudication-reason", code: c.code,
        },
      },
      update: {},
      create: {
        provider: "nphies", system: "adjudication-reason",
        code: c.code, displayEn: c.displayEn, displayAr: c.displayAr,
        metaJson: JSON.stringify({ sourceUrl: NPHIES_SOURCE_URL }),
        version: nphiesSnap.version,
      },
    });
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

  // C10 — synthetic admission documentation + a coded procedure event so
  // the demo claim bundle covers the IG-required supportingInfo slices.
  // Everything below is Simulated demo content, never real codes invented.
  const { appendEvent } = await import("../lib/server/events");
  const dbPatients = await prisma.patient.findMany({
    where: { tenantId: "demo" },
  });
  for (const p of dbPatients) {
    const docId = `${p.id}:admission-doc`;
    const exists = await prisma.clinicalEvent.findFirst({
      where: { sourceRecordId: docId },
    });
    if (!exists) {
      await appendEvent({
        patientId: p.id, type: "documentation_entry",
        occurredAt: new Date(`${new Date().toISOString().slice(0, 10)}T${p.admittedAt}:00`),
        actorRole: "doctor",
        payload: {
          synthetic: true, simulated: "Simulated",
          // admission assessment — synthetic demo values
          dbp: 78, heightCm: 162, weightKg: 58,
          chiefComplaintText: "Polyuria, vomiting and abdominal pain",
          history: "Rising glucose with ketones over the last day (simulated)",
          physicalExam: "Dehydrated, tachypnoeic, alert (simulated)",
          patientHistory: "Type 1 diabetes on insulin (simulated)",
          treatmentPlan: "IV insulin + fluids + hourly glucose (simulated)",
        },
        sourceRecordId: docId,
      });
    }
  }
  // P-1042 deterioration story — coded procedure from the IG fragment
  // (procedures CodeSystem, 13882-00-00 ventilatory support ≤24h).
  const procId = "P-1042:proc:vent";
  if (!(await prisma.clinicalEvent.findFirst({ where: { sourceRecordId: procId } }))) {
    await appendEvent({
      patientId: "P-1042", type: "procedure",
      occurredAt: new Date(),
      actorRole: "doctor",
      payload: {
        synthetic: true, simulated: "Simulated",
        code: "13882-00-00",
        codeSystem: "http://nphies.sa/terminology/CodeSystem/procedures",
        display: "Management of continuous ventilatory support, <= 24 hours",
      },
      sourceRecordId: procId,
    });
  }
  console.log("Seeded:", { ...counts, clinicalEvents: bf.events });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
