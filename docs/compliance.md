# Careshift AI — Compliance & Data Protection (PDPL / NCA ECC oriented)

> **Honesty note:** Careshift AI is implemented to be *oriented toward* Saudi
> PDPL and the NCA Essential Cybersecurity Controls (ECC). It is **not
> certified**. This document maps implemented controls to framework areas so a
> compliance review can verify them concretely.

## 1. Data classification

| Data class | Examples | Location | Controls |
|---|---|---|---|
| PHI (simulated) | Patient names, MRN, vitals, labs, risk scores, clinical notes | `Patient`, `RiskSnapshot`, `Handoff*`, `Intervention*`, claim documents | RBAC `patients_view` gate on every patient-linked route; aggregate-only payloads for non-PHI roles; upload AV scan + magic-byte checks; retained per `RETENTION_*` |
| PII (staff) | Names, employeeId, email, phone | `User` | Staff pickers return id/name/role/dept only (0.4); full profile only via admin/user routes |
| Security telemetry | AuditLog, LoginAttempt, Session, RateBucket | DB tables | Retention purge (`npm run db:purge`); audit export restricted to `audit_view` |
| Credentials | bcrypt hashes, SESSION_SECRET | DB / env | httpOnly SameSite=Lax cookie; kid-based key rotation; secrets never logged |

## 2. PDPL mapping

| PDPL area | Control | Where |
|---|---|---|
| Lawful basis / transparency | First-login disclaimer ("simulated data — not a diagnosis") recorded per user | `consentAt` on `User`; `POST /api/consent`; banner in `app-shell` |
| Data minimization | Staff pickers return minimum-necessary fields; aggregate-only snapshots for roles without `patients_view` | `toStaffPicker`, `dbOrgStats`, route-level `requirePerm` |
| Purpose limitation | Patient-linked notifications delivered only to `patients_view` holders | `lib/server/notify.ts` audience gate |
| Records of processing | Every state-changing and disclosure action writes `AuditLog` with user, session, IP (proxy-aware) | `lib/server/audit.ts`, all route handlers |
| Data subject / admin access | Audit export CSV/JSON filtered by date/user/action | `GET /api/audit/export` (audited itself) |
| Retention & disposal | Configurable retention + audited purge | `lib/server/retention.ts`, `scripts/purge.ts` |
| Security safeguards | bcrypt, session revocation, lockout + rate limits, CSP/CSRF/HSTS, AV hook | Part 0 + items 2–6 |
| Breach detection support | Lockout/audit events capture IP + actor | `auth.login`, `*.locked` audit actions |

## 3. NCA ECC mapping (selected)

| ECC area | Control |
|---|---|
| Identity & access mgmt | Role permissions (`lib/permissions.ts`), DB sessions, admin view-as is audited and revocable |
| Audit & accountability | Immutable `AuditLog`; export + access-review reports; purge is itself audited |
| Asset & vulnerability mgmt | `npm audit` (0 vulns), Dependabot, license policy, pinned deps |
| Data protection | PHI minimization table below; upload validation + AV; retention purge |
| Configuration mgmt | zod-validated env, fail-fast boot, `.env.example` contract |

## 4. PHI minimization — response audit table

| Endpoint | PHI fields returned | Gate |
|---|---|---|
| `GET /api/patients*` | name, MRN, vitals, labs, notes | `patients_view` |
| `GET /api/snapshots` | org aggregates only (no patient fields) unless `patients_view` | role-dependent payload |
| `GET /api/handoffs*` | patient id/name + SBAR | `handoff_view` (+ `patients_view` holders) |
| `GET /api/claims*` | claim + linked patient id | `insurance_view` |
| `GET /api/handoffs` staff pickers | id, names, role, dept only | `handoff_*` |
| `GET /api/users*` | full staff record | `users_manage` |
| `GET /api/audit*` | security telemetry | `audit_view` |
| `GET /api/notifications` | patient-linked rows filtered out without `patients_view` | per-receipt audience |

## 5. Retention policy

| Table | Env var | Default |
|---|---|---|
| AuditLog | `RETENTION_AUDIT_DAYS` | 365 |
| LoginAttempt | `RETENTION_LOGIN_DAYS` | 90 |
| Session | `RETENTION_SESSION_DAYS` | 30 (or expired) |
| Notification | `RETENTION_NOTIFICATION_DAYS` | 90 |
| ClaimDocument (+ file) | `RETENTION_DOCUMENT_DAYS` | 365 |
| RateBucket | `RETENTION_RATEBUCKET_DAYS` | 7 |

Run: `npm run db:purge` — writes a `system.purge` audit row with counts.

## 6. Access review

`GET /api/admin/access-review?format=csv|json` — every account with role,
permissions, last login and `dormant` flag (`DORMANT_DAYS`, default 90).
Export is audited (`admin.access_review`).

## 7. Secret rotation

Session JWTs carry `kid`. Rotate `SESSION_SECRET` by moving the old value to
`SESSION_SECRET_PREV`, setting a new secret, redeploying, and clearing PREV
after the 8h token TTL. Pre-rotation sessions keep verifying via `s0`.
