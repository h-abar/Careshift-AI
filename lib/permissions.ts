import type { RoleKey } from "@/lib/types";

/**
 * E1 — single source of truth for access control.
 * Role → Permissions → Page routes → API actions → Sidebar items.
 * `proxy.ts` gates page prefixes, `requirePerm()` gates API handlers,
 * and `app-shell.tsx` renders the sidebar from NAV below.
 * Hiding a menu item is NEVER the enforcement — the server checks `can()`
 * against the live DB role on every request.
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
  /** E6 — doctor-only: acknowledge / bedside review / clinical decision. */
  | "clinical_decide"
  | "journey_view"
  | "evidence_view"
  /** Hospital claims monitor (read-only) — replaced internal insurance_view. */
  | "claims_view"
  /** hospital_admin may approve an appeal on high-value claims (E4). */
  | "appeal_approve"
  /** External payer portal — claims scoped to the payer's own org (E7). */
  | "payer_claims"
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
  "clinical_decide",
  "journey_view",
  "evidence_view",
  "claims_view",
  "appeal_approve",
  "payer_claims",
  "reports_view",
  "users_manage",
  "depts_manage",
  "settings_manage",
  "audit_view",
];

const build = (keys: PermKey[]) =>
  Object.fromEntries(
    PERMISSION_KEYS.map((k) => [k, keys.includes(k)]),
  ) as Record<PermKey, boolean>;

/**
 * The E1 matrix (server-enforced):
 *  - nurse:         home, ward/assigned patients, interventions, handoffs
 *  - doctor:        nurse scope + all dept patients + clinical decisions
 *  - charge_nurse:  ward patients, handoff assignment, chain-gap, ward KPIs
 *  - hospital_admin:aggregated reports, audit (read), claims monitor — no
 *                   clinical patient pages
 *  - admin:         users, audit, settings — no clinical pages
 *  - payer:         external portal, own claims only — nothing clinical
 */
export const ROLE_PERMISSIONS: Record<RoleKey, Record<PermKey, boolean>> = {
  nurse: build([
    "patients_view",
    "risk_view",
    "handoff_view",
    "handoff_accept",
    "intervention_execute",
    "journey_view",
  ]),

  doctor: build([
    "patients_view",
    "risk_view",
    "handoff_view",
    "handoff_accept",
    "intervention_execute",
    "intervention_escalate",
    "clinical_decide",
    "journey_view",
    "evidence_view",
    "reports_view",
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
    "reports_view",
  ]),

  hospital_admin: build([
    "claims_view",
    "appeal_approve",
    "reports_view",
    "audit_view",
  ]),

  admin: build([
    "users_manage",
    "depts_manage",
    "settings_manage",
    "audit_view",
  ]),

  payer: build(["payer_claims"]),
};

export const can = (role: RoleKey, perm: PermKey): boolean =>
  ROLE_PERMISSIONS[role]?.[perm] === true;

/**
 * Page-route gate — prefix → required permission. `proxy.ts` enforces
 * this on every navigation (denial → 403 page + access_denied audit).
 * Routes not listed here are public-to-authenticated (rules, references,
 * terms) or explicitly public (/demo).
 */
export const PAGE_PERMS: { prefix: string; perm: PermKey }[] = [
  { prefix: "/users", perm: "users_manage" },
  { prefix: "/audit", perm: "audit_view" },
  { prefix: "/settings", perm: "settings_manage" },
  { prefix: "/claims", perm: "claims_view" },
  { prefix: "/payer", perm: "payer_claims" },
  { prefix: "/reports", perm: "reports_view" },
  { prefix: "/handoff", perm: "handoff_view" },
  { prefix: "/handoffs", perm: "handoff_view" },
  { prefix: "/patients", perm: "patients_view" },
  { prefix: "/patient", perm: "patients_view" },
  { prefix: "/interventions", perm: "patients_view" },
];

/** E2 — where each role lands after login. */
export const ROLE_HOME: Record<RoleKey, string> = {
  nurse: "/",
  doctor: "/",
  charge_nurse: "/",
  hospital_admin: "/reports",
  admin: "/users",
  payer: "/payer",
};

export const roleHome = (role: RoleKey): string => ROLE_HOME[role] ?? "/";

/**
 * E3 — sidebar/nav source. Groups keep the existing labels; each item
 * carries the perm that gates it (undefined = visible to all signed-in).
 */
export interface NavItem {
  href: string;
  key: string; // i18n key nav.*
  icon: string;
  perm?: PermKey;
}
export interface NavGroup {
  key: string; // i18n group label
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "nav.clinical",
    items: [
      // "/" is the clinical home — proxy redirects non-clinical roles to
      // their ROLE_HOME, so the item only makes sense with patients_view.
      { href: "/", key: "nav.command", icon: "dashboard", perm: "patients_view" },
      { href: "/patients", key: "nav.patients", icon: "patients", perm: "patients_view" },
      { href: "/interventions", key: "nav.interventions", icon: "interventions", perm: "patients_view" },
      { href: "/handoff", key: "nav.handoff", icon: "handoff", perm: "handoff_view" },
      { href: "/handoffs", key: "nav.handoffs", icon: "handoffs", perm: "handoff_view" },
    ],
  },
  {
    key: "nav.claims",
    items: [
      { href: "/claims", key: "nav.claimsItem", icon: "insurance", perm: "claims_view" },
      { href: "/payer", key: "nav.payer", icon: "insurance", perm: "payer_claims" },
    ],
  },
  {
    key: "nav.governance",
    items: [
      { href: "/reports", key: "nav.reports", icon: "reports", perm: "reports_view" },
      { href: "/audit", key: "nav.audit", icon: "audit", perm: "audit_view" },
      { href: "/users", key: "nav.users", icon: "users", perm: "users_manage" },
      { href: "/settings", key: "nav.settings", icon: "settings", perm: "settings_manage" },
    ],
  },
  {
    key: "nav.reference",
    items: [
      { href: "/rules/calculation", key: "nav.rulesCalc", icon: "audit" },
      { href: "/rules/general", key: "nav.rulesGeneral", icon: "lock" },
      { href: "/references/scientific", key: "nav.refSci", icon: "search" },
      { href: "/references/technical", key: "nav.refTech", icon: "settings" },
      { href: "/terms", key: "nav.terms", icon: "check" },
    ],
  },
];

/** Sidebar groups with only the items a role may see. */
export function navForRole(role: RoleKey): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => !n.perm || can(role, n.perm)),
  })).filter((g) => g.items.length > 0);
}
