// ── Shared domain types ─────────────────────────────────────────────────────

export type RiskLevel = "critical" | "high" | "medium" | "low";
export type Role = "nurse" | "charge_nurse" | "doctor";
export type InterventionStatus =
  | "done"
  | "in_progress"
  | "pending"
  | "overdue"
  | "escalated"
  | "resolved";
export type ClaimStatus =
  | "approved" | "pending" | "review" | "denied"
  | "draft" | "exception"; // E7 — system-owned pipeline states
export type Lang = "en" | "ar";

/** Localized string pair */
export interface Loc {
  en: string;
  ar: string;
}

export interface VitalPoint {
  t: string; // "HH:MM"
  hr: number;
  sbp: number;
  rr: number;
  temp: number;
  spo2: number;
  glucose?: number;
}

export interface LabResult {
  key: string; // i18n key suffix, e.g. "wbc"
  value: string;
  flag: "high" | "low" | "normal";
}

export interface Patient {
  id: string;
  nameEn: string;
  nameAr: string;
  age: number;
  sex: "M" | "F";
  room: string;
  dxKey: string; // i18n key → conditions / diagnoses
  attending: string;
  admittedAt: string;
  shift: "day" | "night";
  vitals: VitalPoint[];
  labs: LabResult[];
  /** machine-readable clinical signals used by the risk engine */
  riskFlags: string[];
  meds: string[]; // i18n keys
  noteEn: string;
  noteAr: string;
}

export interface RiskFactor {
  key: string; // i18n key → factors.*
  weight: number; // percentage contribution, sums ~100
}

export interface ClinicalRisk {
  patientId: string;
  score: number; // 0–100
  level: RiskLevel;
  conditionKey: string; // i18n key → conditions.*
  factors: RiskFactor[];
  windowHrs: number; // potential deterioration window
  confidence: number; // % signal confidence — simulation, not diagnosis
}

export interface InsuranceRisk {
  patientId: string;
  claimRisk: RiskLevel;
  docCompleteness: number; // %
  docRisk: RiskLevel;
  exposureSar: number; // simulated avoidable cost exposure
  driverKeys: string[]; // i18n keys → insDrivers.*
}

export interface InterventionStep {
  id: string;
  patientId: string;
  offsetMin: number; // planned minute mark
  actionKey: string; // i18n key → actions.*
  role: Role;
  status: InterventionStatus;
  dueInMin: number; // countdown seed for the UI timer
  completedAt?: string;
  escalationChain: Role[]; // who it escalates to, in order
  // Phase-2 lifecycle fields (persisted via InterventionOverride)
  assigneeId?: string;
  dueAt?: string;
  note?: string;
  escalatedTo?: Role | string;
  resolvedAt?: string;
}

export type JourneyKind =
  | "admission"
  | "signal"
  | "risk"
  | "notify"
  | "action"
  | "escalation"
  | "review"
  | "outcome";

export interface JourneyEvent {
  t: string;
  kind: JourneyKind;
  key: string; // i18n key → journey.*
  riskScore?: number;
}

export interface Claim {
  id: string;
  patientId?: string; // linked current patient, if any
  amountSar: number;
  status: ClaimStatus;
  dxKey: string;
  losDays: number;
  icuDays: number;
  /** checklist item keys present → contribute to Claim Readiness */
  evidence: string[]; // subset of EVIDENCE_KEYS
  frictionKeys: string[]; // i18n keys → friction.* (only when status != approved)
  /** C6 — official NPHIES adjudication-reason code (simulated payer). */
  nphiesCode?: string | null;
  version?: number;
  supersedesId?: string | null;
  /** E7 — pipeline state */
  denialCode?: string | null;
  autoSubmitted?: boolean;
  submittedAt?: string | null;
  exceptions?: { kind: string; detail: string; owner: string; seCode?: string | null }[];
}

export interface ShiftHandoff {
  id: string;
  fromShift: Loc;
  toShift: Loc;
  at: string;
  outgoingTeam: string;
  incomingTeam: string;
}

// ── Users / RBAC ────────────────────────────────────────────────────────────

export type RoleKey =
  | "admin"
  | "doctor"
  | "nurse"
  | "charge_nurse"
  | "payer"
  | "hospital_admin";

export interface User {
  id: string;
  username: string;
  nameEn: string;
  nameAr: string;
  role: RoleKey;
  dept: string; // i18n dept key
  specialty: Loc;
  email: string;
  phone: string;
  employeeId: string;
  /** E1 — external payer organization; set only when role === "payer". */
  payerOrg?: string | null;
  status: "active" | "suspended";
  /** ISO timestamp of demo-data consent acknowledgement; null = pending. */
  consentAt: string | null;
  /** B3 — accepted terms version ("" = never accepted → re-prompt). */
  termsVersion: string;
  /** D2 — owning tenant slug. */
  tenantId: string;
  lastLoginMin: number | null; // minutes ago; null = never logged in
  createdAt: string;
}

/** E3 — tenant identity shown in the top bar (name + Simulated flag). */
export interface TenantBadge {
  nameEn: string;
  nameAr: string;
  simulated: boolean;
}

/** Minimum-necessary staff identity for pickers — no contact/HR fields. */
export interface StaffPicker {
  id: string;
  nameEn: string;
  nameAr: string;
  role: RoleKey;
  dept: string;
}

export type HandoffStatus =
  | "draft"
  | "pending"
  | "in_progress"
  | "signed_off"
  | "accepted"
  | "rejected"
  | "partial"
  | "escalated"
  | "completed";

export interface Sbar {
  s: string;
  b: string;
  a: string;
  r: string;
}

/** Per-patient handoff row — persisted, editable SBAR + review flag. */
export interface HandoffPatientRow {
  patientId: string;
  reviewed: boolean;
  sbar: { ar: Sbar; en: Sbar };
}

export interface HandoffEvent {
  t: string;
  key: string; // i18n → hftl.*
}

export interface HandoffRecord {
  id: string;
  dept: string; // i18n dept key
  shift: "day" | "night";
  date: string;
  outgoingId: string;
  incomingId: string;
  patientIds: string[];
  status: HandoffStatus;
  reviewed: Record<string, boolean>; // patientId → reviewed by incoming
  checklist: string[]; // completed checklist item keys
  timeline: HandoffEvent[];
  rejectionReason?: string;
  signedOffAt?: string;
  completedAt?: string;
  patients?: HandoffPatientRow[];
  events?: { actorId: string; action: string; detail: string; createdAt: string }[];
}

export interface NotificationItem {
  id: string;
  level: "critical" | "warning" | "info";
  key: string; // i18n → notif.* (may contain {id}/{detail} placeholders)
  detail?: string;
  patientId?: string;
  entityType?: string;
  entityId?: string;
  min: number; // minutes ago (legacy rows)
  createdAt?: string;
  read: boolean;
}

export interface AuditEntry {
  id: string;
  userId: string;
  actionKey: string; // i18n → auditAction.*
  entityId: string;
  at: string;
  session: string;
  prev?: string;
  next?: string;
}

export interface Assignment {
  patientId: string;
  dept: string;
  nurseId: string;
  physicianId: string;
  chargeNurseId: string;
}

export interface CareValueScore {
  total: number;
  clinicalSafety: number;
  timeliness: number;
  documentation: number;
  operational: number;
  insuranceReadiness: number;
}

export interface WhatIfScenario {
  icuRiskPct: number;
  extraLosDays: number;
  exposureSar: number;
  docCompleteness: number;
}
