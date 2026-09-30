/**
 * Shared Zod schemas — the same contract guards the Route Handlers and can
 * be reused by client forms. `.strict()` rejects unknown fields.
 */
import { z } from "zod";

const ROLES = z.enum([
  "admin", "physician", "nurse", "charge_nurse", "insurance", "hospital_admin",
]);

export const loginSchema = z
  .object({
    username: z.string().min(1),
    password: z.string().min(1),
    // 0.6 — CAPTCHA response token; only consulted when a verifier is
    // configured and the username-wide lock is hit.
    captchaToken: z.string().max(2048).optional(),
  })
  .strict();

export const userCreateSchema = z
  .object({
    username: z.string().min(2).max(50),
    nameEn: z.string().min(1),
    nameAr: z.string().min(1),
    roleKey: ROLES,
    dept: z.string().min(1),
    employeeId: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().max(30).optional(),
    password: z.string().min(8),
  })
  .strict();

export const userPatchSchema = z
  .object({
    nameEn: z.string().min(1).optional(),
    nameAr: z.string().min(1).optional(),
    roleKey: ROLES.optional(),
    dept: z.string().min(1).optional(),
    status: z.enum(["active", "suspended"]).optional(),
    specialtyEn: z.string().max(120).optional(),
    specialtyAr: z.string().max(120).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(30).optional(),
  })
  .strict();

export const resetPwSchema = z
  .object({ password: z.string().min(8).optional() })
  .strict();

const CLAIM_STATUS = z.enum(["approved", "pending", "review", "denied"]);

export const claimPatchSchema = z
  .object({
    status: CLAIM_STATUS,
    denialCode: z.string().max(40).optional(),
  })
  .strict();

export const appealSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export const resubmitSchema = z
  .object({ note: z.string().trim().min(1).max(500) })
  .strict();

export const handoffCreateSchema = z
  .object({
    dept: z.string().min(1),
    shift: z.string().min(1),
    outgoingId: z.string().min(1),
    incomingId: z.string().min(1),
    patientIds: z.array(z.string()).min(1).max(50),
  })
  .strict();

export const handoffPatchSchema = z
  .object({
    reviewed: z.record(z.string(), z.boolean()).optional(),
    checklist: z.array(z.string()).optional(),
    sbar: z
      .object({
        patientId: z.string(),
        lang: z.enum(["en", "ar"]),
        s: z.string().max(2000),
        bb: z.string().max(2000),
        a: z.string().max(2000),
        r: z.string().max(2000),
      })
      .optional(),
  })
  .strict();

export const rejectSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

const IV_STATUS = z.enum([
  "pending", "in_progress", "done", "overdue", "escalated", "resolved",
]);

export const interventionSchema = z
  .object({
    patientId: z.string().min(1),
    status: IV_STATUS,
    escalatedTo: z.enum(["nurse", "charge_nurse", "physician"]).optional(),
    assigneeId: z.string().optional(),
    dueAt: z.string().datetime({ offset: true }).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

const vitalPoint = z.object({
  t: z.string(),
  hr: z.number(),
  sbp: z.number(),
  rr: z.number(),
  temp: z.number(),
  spo2: z.number(),
  glucose: z.number().optional(),
});

const labResult = z.object({
  key: z.string(),
  value: z.string(),
  flag: z.enum(["high", "low", "normal"]),
});

export const patientPatchSchema = z
  .object({
    vitals: z.array(vitalPoint).max(200).optional(),
    labs: z.array(labResult).max(200).optional(),
  })
  .strict();

export const notifPatchSchema = z
  .object({ action: z.enum(["ack", "dismiss"]) })
  .strict();

export const switchSchema = z
  .object({ userId: z.string().min(1) })
  .strict();

export const handoffAcceptSchema = z
  .object({ checklist: z.array(z.string()).max(50).optional() })
  .strict();
