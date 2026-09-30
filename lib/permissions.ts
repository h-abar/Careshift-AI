import type { RoleKey } from "@/lib/types";

/**
 * RBAC — Role → Permissions → Routes → Components → Actions.
 * A permission map per role; UI and routes consult `can()` before
 * rendering or allowing actions. Ready to be backed by SSO/Keycloak claims.
 */

export type PermKey =
  | "patients_view"
  | "patients_edit"
  | "risk_view"
  | "handoff_view"
  | "handoff_accept"
  | "handoff_manage"
  | "assign_manage"
  | "intervention_execute"
  | "intervention_escalate"
  | "journey_view"
  | "evidence_view"
  | "insurance_view"
  | "claims_edit"
  | "command_view"
  | "reports_view"
  | "users_manage"
  | "depts_manage"
  | "settings_manage"
  | "audit_view";

export const PERMISSION_KEYS: PermKey[] = [
  "patients_view",
  "patients_edit",
  "risk_view",
  "handoff_view",
  "handoff_accept",
  "handoff_manage",
  "assign_manage",
  "intervention_execute",
  "intervention_escalate",
  "journey_view",
  "evidence_view",
  "insurance_view",
  "claims_edit",
  "command_view",
  "reports_view",
  "users_manage",
  "depts_manage",
  "settings_manage",
  "audit_view",
];

const ALL = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as Record<
  PermKey,
  boolean
>;

const build = (keys: PermKey[]) =>
  Object.fromEntries(
    PERMISSION_KEYS.map((k) => [k, keys.includes(k)]),
  ) as Record<PermKey, boolean>;

export const ROLE_PERMISSIONS: Record<RoleKey, Record<PermKey, boolean>> = {
  admin: { ...ALL },

  physician: build([
    "patients_view",
    "risk_view",
    "handoff_view",
    "handoff_accept",
    "intervention_execute",
    "intervention_escalate",
    "journey_view",
    "evidence_view",
    "reports_view",
  ]),

  nurse: build([
    "patients_view",
    "risk_view",
    "handoff_view",
    "handoff_accept",
    "intervention_execute",
    "journey_view",
  ]),

  charge_nurse: build([
    "patients_view",
    "patients_edit",
    "risk_view",
    "handoff_view",
    "handoff_accept",
    "handoff_manage",
    "assign_manage",
    "intervention_execute",
    "intervention_escalate",
    "journey_view",
    "evidence_view",
  ]),

  insurance: build([
    "insurance_view",
    "claims_edit",
    "journey_view",
    "evidence_view",
    "reports_view",
  ]),

  hospital_admin: build([
    "patients_view",
    "risk_view",
    "handoff_view",
    "journey_view",
    "evidence_view",
    "insurance_view",
    "command_view",
    "reports_view",
    "audit_view",
  ]),
};

export const can = (role: RoleKey, perm: PermKey): boolean =>
  ROLE_PERMISSIONS[role][perm] === true;
