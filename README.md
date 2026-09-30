# Careshift AI 2.0

**Predict. Intervene. Prove. — تنبّأ بالخطر. تدخّل مبكرًا. أثبت الأثر.**

A bilingual (Arabic RTL / English LTR) clinical-to-insurance intelligence
platform. Careshift turns reactive healthcare into a closed loop:

```
Patient Data → AI Risk Detection → Clinical Intervention
             → Closed Loop → Evidence → Insurance Value
```

Insurance appears as the **outcome** of clinical intervention — claim
readiness, documentation completeness and avoidable exposure — never as a
standalone claims product.

> All data is simulated. The risk engine is a rule-based prototype
> ("AI Risk Signal — Prototype Simulation"), never a diagnosis, and Claim
> Readiness never promises claim acceptance.

---

## Stack

| Layer | Tech |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| API | Next.js Route Handlers (`app/api/**`) |
| DB | Prisma 6 + SQLite (dev) — schema is Postgres-ready |
| Auth | bcryptjs hashes + signed JWT (jose) in httpOnly cookie + DB `Session` row |
| Authz | `lib/permissions.ts` enforced in `proxy.ts` (fka middleware) + per-handler `requirePerm()` |
| Audit | `AuditLog` table — who/what/when/IP/session |
| Tests | Vitest |
| Fonts | Alexandria (Arabic) + Inter (Latin) via @fontsource |

## Setup

```bash
npm install
npm run db:push        # create prisma/dev.db from schema
npm run db:seed        # load demo data (22 patients, 50 claims, 10 users…)
```

### Environment variables (`.env`, git-ignored)

```
DATABASE_URL="file:./dev.db"          # Postgres: postgresql://user:pass@host:5432/careshift
SESSION_SECRET="<random 32+ chars>"   # JWT signing key — change in production
```

## Run / verify

```bash
npm run dev            # dev server
npm test               # vitest — engines + server (RBAC/JWT/bcrypt)
npm run lint           # eslint
npx tsc --noEmit       # typecheck
npm run build          # production build (server output — NOT static export)
npm start              # serve the production build
```

## Demo accounts

Usernames = email prefix; password = `Demo@` + employee digits.
All are seed-only — hashes live in the DB, **never** in client code.

| User | Username | Password | Role | Sees |
|---|---|---|---|---|
| Omar Khalil | `o.khalil` | `Demo@8895` | **Admin** | everything incl. users/audit/settings, view-as |
| Dr. Ahmed Salem | `a.salem` | `Demo@1021` | Physician | patients, risk, SBAR, escalation, evidence |
| Khaled Mohammed | `k.mohammed` | `Demo@3310` | Charge nurse | handoff manage/create, reassign, escalate |
| Sara Ahmed | `s.ahmed` | `Demo@2088` | Nurse | her patients, accept handoff, run interventions |
| Mona Alotaibi | `m.alotaibi` | `Demo@5542` | Insurance reviewer | claims, readiness, evidence only |
| Faisal Alshammari | `f.shammari` | `Demo@6613` | Hospital admin | command center, KPIs, reports, audit |
| Dr. Lina Haddad | `l.haddad` | `Demo@4477` | Physician | endocrinology — fits the DKA case |
| Rania Yousef | `r.yousef` | `Demo@7704` | Nurse | medical ward |
| **Dr. Reem Farouk** | `r.farouk` | `Demo@9012` | Physician | **suspended → login rejected (401)** |
| Nadia Hassan | `n.hassan` | `Demo@0143` | Nurse | ICU |

`/demo` is a public, self-contained P-1042 walkthrough
(87 → 42 → 18 → Evidence 96%) — no login required.

## Architecture

```
proxy.ts                     gate: session JWT required for /api/** and
                             permission-gated pages (redirect → "/")
app/api/**                   Route Handlers — every handler calls
                             requireAuth()/requirePerm(perm)
lib/server/
  prisma.ts                  Prisma singleton
  session.ts                 sign/verify JWT, getAuth, requireAuth/Perm
  data.ts                    DB → domain mappers + aggregates (all KPIs
                             computed from data — no hard-coded offsets)
  audit.ts                   AuditLog writer (never throws into requests)
  json.ts                    ok()/handle() wrappers → typed errors
lib/permissions.ts           single source of truth: RoleKey → PermKey map
prisma/schema.prisma         User, Role, Patient, Shift, Handoff,
                             RiskAssessment, InsuranceClaim, AuditLog,
                             Session, InterventionOverride
lib/engines/*                pure rule engines: clinical-risk, insurance-
                             risk, interventions, claim-readiness,
                             care-value, simulator, sbar
lib/api.ts                   typed client hooks (useOrg, usePatientsTable,
                             usePatientDetail, useHandoffs, …) + postJson
```

### Security model

- Passwords: bcrypt(10) hashes in `User.passwordHash`; the client `User`
  type has no password field at all.
- Sessions: `cs_session` httpOnly + SameSite=Lax + Secure (prod) cookie
  holding a JWT; every request re-validates the DB `Session` row, so
  logout/admin revocation kills sessions immediately. 8h expiry.
- Authorization: menu-hiding is cosmetic only — enforcement is
  `proxy.ts` (page + API gates) **and** `requirePerm()` inside each
  handler. "View as" runs through `POST /api/auth/switch` which requires
  `users_manage`, sets an `imp` claim, and writes `auth.switch` to audit.
- Audit: `auth.login/.logout/.login_failed/.switch`, `patient.view`,
  `handoff.accept/.create`, `claim.status`, `intervention.*` — browsable
  at `/audit` (perm `audit_view`) with user/action filters.

### Future SSO

`lib/server/session.ts` is deliberately shaped so an OIDC exchange
(Keycloak/Entra) can mint the same `{sub, sid, role}` session later —
replace only the login route's credential check.

## API surface

```
POST /api/auth/login|logout|switch     GET /api/auth/session
GET  /api/snapshots (org KPIs)         GET /api/patients[/:id]
GET  /api/handoff (shift context)      GET /api/handoffs[/:id]
POST /api/handoffs/create              POST /api/handoffs/:id/accept
POST /api/interventions/:stepId        GET  /api/claims   PATCH /api/claims/:id
GET  /api/users[/:id]                  GET  /api/audit?userId=&action=&entityId=
GET  /api/notifications
```

## Mobile / Capacitor

The app is no longer a static export (server auth + DB are required).
For an Android build, deploy the Next.js server (e.g. Vercel/VM), then
point the WebView at it:

```ts
// capacitor.config.ts
server: { url: "https://<your-deployment>" }
```

`webDir: "out"` + `output:"export"` can still be used only for a
demo-only shell without login/DB. iPad: use the web app via Safari
("Add to Home Screen") — APKs are Android-only.

## Roadmap (not in MVP)

FHIR/HL7 ingestion · SSO/Keycloak OIDC · real HIS/LIS/claims connectors ·
PostgreSQL production profile · member portal · full claims lifecycle ·
eligibility engine · telemedicine.
