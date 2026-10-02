# E0 — Role-Based UI Migration Map

This document is the inventory required by PROMPT E0: every current
page/route/component mapped to the new role matrix. Implementation follows
in small commits E1–E7. Existing pages are refactored in place — no
parallel app.

## New role model

| Role | Kind | Landing |
|---|---|---|
| `nurse` | internal | `/` |
| `doctor` (renamed from `physician`) | internal | `/` |
| `charge_nurse` | internal | `/` |
| `hospital_admin` | internal | `/reports` |
| `admin` | internal | `/users` |
| `payer` (replaces internal `insurance`) | external | `/payer` |

The internal `insurance` role is removed. Its seed user migrates to
`payer` (external reviewer, scoped to own payer's claims).

## Page/route mapping

| Route | Today | E change | Allowed roles |
|---|---|---|---|
| `/` | one generic dashboard | role-branched home (E2) | nurse, doctor, charge_nurse, hospital_admin, admin |
| `/patients` | all patients list | dept/assignment scoping (E4) | nurse, doctor, charge_nurse |
| `/patient/[id]` | vitals, NEWS2, timeline | doctor action buttons (E5/E6) | nurse, doctor, charge_nurse |
| `/interventions` | intervention steps | unchanged | nurse, doctor, charge_nurse |
| `/handoff` | I-PASS create | unchanged | nurse, doctor, charge_nurse |
| `/handoffs`, `/handoffs/[id]` | handoff list/detail | unchanged | nurse, doctor, charge_nurse |
| `/insurance` | internal claims desk | **renamed → `/claims`** hospital monitor, read-only + approve-appeal (E4) | hospital_admin |
| `/claims` (new name) | — | submitted/accepted/denied/exception counts, financial exposure, exceptions queue, top reasons, time-to-submit, auto-submission rate, first-pass acceptance | hospital_admin |
| `/reports` | KPIs | aggregated only — no patient identifiers (E4) | hospital_admin, charge_nurse (ward-level) |
| `/audit` | audit log | unchanged | admin, hospital_admin (read) |
| `/users`, `/users/[id]` | user admin | unchanged | admin |
| `/settings` | thresholds | + escalation times, appeal-approval threshold — labeled prototype | admin |
| `/rules/calculation`, `/rules/general` | rule transparency | unchanged | all roles incl. payer |
| `/references`, `/references/*` | references | unchanged | all roles incl. payer |
| `/terms` | terms | unchanged | all roles |
| `/demo` | P-1042 story | unchanged, `Simulated` preserved | nurse, doctor, charge_nurse, hospital_admin, admin |
| `/payer` (new) | — | external payer portal (E7): own claims, evidence package, verify, accept/deny/request-evidence | payer |
| `/403` (new) | — | Arabic "not authorized" page; every denial audits `access_denied` | all |

## API route groups (enforced by `requirePerm`, audited on denial)

| Prefix | Consumer pages | Perm |
|---|---|---|
| `/api/patients*`, `/api/snapshots`, `/api/interventions*`, `/api/freshness`, `/api/metrics` | clinical pages | `patients_view` (+ scoped per role) |
| `/api/handoff*`, `/api/notifications*` | handoff flow | `handoff_view` |
| `/api/claims*` (list, assemble, checks, package, documents, lines, appeal*, resubmit, adjudicate, kpis) | claims monitor + payer portal | `claims_view` / `payer_claims` (new, scoped to payer org) |
| `/api/nphies/send` | auto-submission (system) | server-only, no user role |
| `/api/audit*`, `/api/admin/*` | audit + access review | `audit_view` |
| `/api/users*` | user admin | `users_manage` |
| `/api/rules*`, `/api/references*`, `/api/terms*`, `/api/consent` | reference pages | authenticated read |
| `/api/auth/*`, `/api/health`, `/api/ready` | login/health | public |

## Enforcement layers (already in place, hardened in E1)

1. `proxy.ts` — page prefix → perm from `lib/permissions.ts`; denial →
   `/403` page (Arabic) + `access_denied` audit event (user, route, IP, time).
2. `requirePerm()` in every API handler — live-DB role check; denial →
   403 JSON + same audit event.
3. Sidebar generated from `lib/permissions.ts` (E3) — UI convenience only.

## Link integrity

`tests/links.test.ts` scans every internal `href` in `app/` +
`components/` and asserts a matching `page.tsx` exists — guards against
dead links after the `/insurance → /claims` rename and any deletions.

## Demo path (jury) to keep flawless

nurse home → `/patient/P-1042` (NEWS2 breakdown) → `/handoff` (I-PASS
auto-fill + sign/accept) → auto-submitted claim → `/payer` verify →
`/demo` story.
