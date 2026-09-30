import type { Assignment, AuditEntry, HandoffRecord, NotificationItem } from "@/lib/types";

export const handoffRecords: HandoffRecord[] = [
  {
    id: "HF-2026-0929",
    dept: "icu",
    shift: "day",
    date: "2026-09-29",
    outgoingId: "U-001",
    incomingId: "U-002",
    patientIds: [
      "P-1042", "P-2031", "P-3092", "P-6304", "P-4110", "P-5218",
      "P-7455", "P-8520", "P-9611", "P-0773", "P-1880", "P-2944",
    ],
    status: "in_progress",
    reviewed: { "P-1042": true, "P-2031": true },
    checklist: ["criticalReviewed"],
    timeline: [
      { t: "07:00", key: "hftl.created" },
      { t: "07:02", key: "hftl.assigned" },
      { t: "07:08", key: "hftl.incomingNotified" },
      { t: "07:12", key: "hftl.criticalReviewed" },
    ],
  },
  {
    id: "HF-2026-0928",
    dept: "medical",
    shift: "night",
    date: "2026-09-28",
    outgoingId: "U-002",
    incomingId: "U-007",
    patientIds: ["P-2031", "P-6304", "P-7455", "P-0773", "P-2944"],
    status: "completed",
    reviewed: {},
    checklist: ["criticalReviewed", "pendingReviewed", "escalationsReviewed", "recommendationsReviewed"],
    timeline: [
      { t: "19:00", key: "hftl.created" },
      { t: "19:04", key: "hftl.assigned" },
      { t: "19:11", key: "hftl.incomingNotified" },
      { t: "19:15", key: "hftl.accepted" },
      { t: "19:20", key: "hftl.firstAction" },
    ],
  },
  {
    id: "HF-2026-0929-PM",
    dept: "er",
    shift: "night",
    date: "2026-09-29",
    outgoingId: "U-004",
    incomingId: "U-009",
    patientIds: ["P-4110", "P-5218", "P-8520", "P-1880"],
    status: "draft",
    reviewed: {},
    checklist: [],
    timeline: [{ t: "18:30", key: "hftl.created" }],
  },
];

export const getHandoff = (id: string) => handoffRecords.find((h) => h.id === id);

export const notifications: NotificationItem[] = [
  { id: "N1", level: "critical", key: "notif.overdue", patientId: "P-1042", min: 4, read: false },
  { id: "N2", level: "warning", key: "notif.handoffPending", patientId: undefined, min: 12, read: false },
  { id: "N3", level: "info", key: "notif.handoffAccepted", min: 21, read: false },
  { id: "N4", level: "warning", key: "notif.docGap", patientId: "P-2031", min: 34, read: true },
  { id: "N5", level: "critical", key: "notif.riskSpike", patientId: "P-2031", min: 48, read: true },
  { id: "N6", level: "info", key: "notif.evidenceReady", patientId: "P-1042", min: 66, read: true },
];

export const auditLog: AuditEntry[] = [
  { id: "A-0141", userId: "U-002", actionKey: "auditAction.acceptedHandoff", entityId: "HF-2026-0929", at: "09:21", session: "sess-8f3a" },
  { id: "A-0140", userId: "U-001", actionKey: "auditAction.escalatedIntervention", entityId: "P-1042", at: "09:52", session: "sess-21bc" },
  { id: "A-0139", userId: "U-002", actionKey: "auditAction.completedIntervention", entityId: "P-1042", at: "09:30", session: "sess-8f3a", prev: "in_progress", next: "done" },
  { id: "A-0138", userId: "U-003", actionKey: "auditAction.reassigned", entityId: "P-2031", at: "09:18", session: "sess-40dd", prev: "U-002", next: "U-010" },
  { id: "A-0137", userId: "U-005", actionKey: "auditAction.reviewedClaim", entityId: "CL-88120", at: "09:05", session: "sess-77e1" },
  { id: "A-0136", userId: "U-001", actionKey: "auditAction.acknowledgedRisk", entityId: "P-1042", at: "09:15", session: "sess-21bc" },
  { id: "A-0135", userId: "U-007", actionKey: "auditAction.acceptedHandoff", entityId: "HF-2026-0928", at: "19:15", session: "sess-12aa", prev: "in_progress", next: "accepted" },
  { id: "A-0134", userId: "U-008", actionKey: "auditAction.updatedUser", entityId: "U-009", at: "16:44", session: "sess-99c0", prev: "active", next: "suspended" },
  { id: "A-0133", userId: "U-003", actionKey: "auditAction.escalatedIntervention", entityId: "P-6304", at: "08:40", session: "sess-40dd" },
  { id: "A-0132", userId: "U-010", actionKey: "auditAction.completedIntervention", entityId: "P-2031", at: "02:55", session: "sess-b8e2" },
];

export const assignments: Assignment[] = [
  { patientId: "P-1042", dept: "icu", nurseId: "U-002", physicianId: "U-001", chargeNurseId: "U-003" },
  { patientId: "P-2031", dept: "medical", nurseId: "U-010", physicianId: "U-004", chargeNurseId: "U-003" },
  { patientId: "P-3092", dept: "surgical", nurseId: "U-007", physicianId: "U-001", chargeNurseId: "U-003" },
  { patientId: "P-6304", dept: "medical", nurseId: "U-007", physicianId: "U-004", chargeNurseId: "U-003" },
  { patientId: "P-4110", dept: "er", nurseId: "U-002", physicianId: "U-009", chargeNurseId: "U-003" },
  { patientId: "P-5218", dept: "medical", nurseId: "U-010", physicianId: "U-004", chargeNurseId: "U-003" },
  { patientId: "P-7455", dept: "medical", nurseId: "U-010", physicianId: "U-001", chargeNurseId: "U-003" },
];

export const getAssignment = (patientId: string) =>
  assignments.find((a) => a.patientId === patientId);
