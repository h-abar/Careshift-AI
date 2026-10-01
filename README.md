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
npm run db:migrate     # prisma migrate dev — applies prisma/migrations + seeds
# or, on an existing DB: npm run db:deploy && npm run db:seed
```

### Environment variables (`.env`, git-ignored — names in `.env.example`)

```
DATABASE_URL="postgres://…"           # REQUIRED — PostgreSQL only.
                                      # Local dev: `npx prisma dev` (PGlite)
                                      # or `docker compose up db`
SHADOW_DATABASE_URL="postgres://…"    # only for `prisma migrate dev`
SESSION_SECRET="<random 32+ chars>"   # REQUIRED in production — server
                                      # throws at startup if missing/short
API_ORIGIN="https://…"                # Capacitor server.url (optional)
```

### Database — PostgreSQL only

- The datasource provider is `postgresql`; SQLite is dropped (item 9).
  Local dev needs a Postgres server — easiest is `npx prisma dev` (local
  PGlite, prints DATABASE_URL + SHADOW_DATABASE_URL to paste into `.env`).
- **PGlite quirk**: its single backend leaks prepared statements across
  pooled connections (42P05 errors). `.env.development` therefore sets
  `DATABASE_URL` with `pgbouncer=true&connection_limit=1` for `next dev`;
  the prisma CLI reads the clean `.env` URL. Tests/e2e derive per-schema
  URLs (`?schema=test|e2e`) via `tests/db-url.ts` and run
  `scripts/deallocate.ts` before `migrate deploy`.
- Real migrations live in `prisma/migrations/` — use `npm run db:migrate`
  (dev) / `npm run db:deploy` (prod) rather than `db push`.
- Seed: `npm run db:seed` loads the fictional demo set (22 patients,
  50 claims, 10 users, handoffs/shifts/assignments/notifications). It is
  **non-production only** — it refuses to run when `APP_ENV=production`
  (or `NODE_ENV=production` when APP_ENV is unset).
- Tests use an isolated `test` schema, reset + re-seeded per run;
  Playwright E2E uses an `e2e` schema.
- Docker demo: `docker compose up --build` → app on :3000 seeded with the
  demo set (`APP_ENV=demo`, `SEED_DEMO=1`). Smoke test: `bash scripts/smoke.sh`.

## Run / verify

```bash
npm run dev            # dev server
npm test               # vitest — engines + server + route + i18n + proxy (97)
npm run lint           # eslint
npx tsc --noEmit       # typecheck
npm run build          # production build (server output — NOT static export)
npm start              # serve the production build
```

### Browser E2E (Playwright)

```bash
npx playwright install chromium   # once — browser binaries
npm run build                     # required first: suite runs the prod build
npm run e2e                       # spins up next start on :3100 + fresh e2e.db
```

`e2e/global-setup.ts` recreates `prisma/e2e.db` from committed migrations
(`migrate deploy`, not `db push`) and re-seeds it before every run — the
dev database is never touched. The suite covers, per role
(admin / physician / charge nurse / nurse / insurance reviewer):

- login / logout / wrong-password / suspended-user / 5-attempt lockout
- nav visibility + direct-URL redirect for forbidden pages (proxy.ts)
- handoff create → per-patient review → sign-off → incoming accept
- risk reassess → threshold notification → acknowledge
- interventions permission split (nurse cannot escalate)
- claim status change + document upload (e2e-uploads/, cleaned per run)
- admin: create user, view-as start/stop, suspend (live session dies),
  reset password, audit log verification
- Arabic RTL ↔ English LTR switching + axe accessibility scan
  (0 serious/critical violations)

Requires Chromium via `npx playwright install` (first run only).

## Demo accounts (dev-only)

Usernames = email prefix; password = `Demo@` + employee digits.
**Development only** — hashes live in the DB, never in client code, and
the seed refuses to run in production.

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
prisma/schema.prisma         User, Role, Patient, Shift, ShiftHandoff,
                             Handoff, Assignment, Notification,
                             RiskAssessment, InsuranceClaim, AuditLog,
                             Session, InterventionOverride
prisma/migrations/           real migrations (init) — migrate deploy in prod
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
  `proxy.ts` (page + API gates on the JWT claim) **and** `requirePerm()`
  inside each handler (re-checked against the live DB role — a stale JWT
  can never leak data). Notable rules:
  - Claim status changes need `claims_edit` (admin + insurance only) and
    follow a legal transition map (`pending→review/approved/denied`,
    `review→approved/denied`, `denied→review`; 400 otherwise).
  - Escalating an intervention needs `intervention_escalate`; step IDs are
    bound to their patient (400 on foreign `stepId`).
  - A handoff can only be accepted by its assigned incoming user, or by a
    `handoff_manage` holder (admin/charge nurse) on their behalf.
- View-as: `POST /api/auth/switch` (admin-only, audited `auth.switch`)
  impersonates through `Session.impersonatorId`; starting one while
  already impersonating → 409. `POST /api/auth/switch/stop` restores the
  admin and audits `auth.switch_end`. A persistent banner shows whom you
  are viewing as with a "return to admin" button.
- Login protection: 5 failed logins per username+IP within 15 min →
  HTTP 429; the lockout transition is audited as `auth.locked`.
- Audit: `auth.login/.logout/.login_failed/.locked/.switch/.switch_end`,
  `patient.view`, `patients.list`, `claims.list`, `users.list`,
  `audit.list`, `org.view`, `handoff.accept/.create`, `claim.status`,
  `intervention.*`, `user.create/.update/.password_reset` — browsable at
  `/audit` (perm `audit_view`) with user/action filters.
- Risk persistence: every (re)computed patient risk is stored as a
  `RiskAssessment` row (deduped per score/10-min window); the patient
  view shows the assessment history.

### Future SSO

`lib/server/session.ts` is deliberately shaped so an OIDC exchange
(Keycloak/Entra) can mint the same `{sub, sid, role}` session later —
replace only the login route's credential check.

## API surface

```
POST /api/auth/login|logout|switch     GET  /api/auth/session (public GET)
POST /api/auth/switch/stop             GET  /api/snapshots (org KPIs)
GET  /api/patients[/:id]               GET  /api/handoff (shift context)
GET  /api/handoffs[/:id]               POST /api/handoffs/create
POST /api/handoffs/:id/accept          POST /api/interventions/:stepId
GET  /api/claims                       PATCH /api/claims/:id (claims_edit)
GET|POST /api/users                    PATCH /api/users/:id
POST /api/users/:id/reset-password     GET  /api/audit?userId=&action=&entityId=
GET  /api/notifications
```

## Mobile / Capacitor

The app is no longer a static export (server auth + DB are required).
For an Android build, deploy the Next.js server (e.g. Vercel/VM), then
point the WebView at it via `API_ORIGIN` before `npx cap sync` —
`capacitor.config.ts` maps it to `server.url`:

```bash
API_ORIGIN="https://<your-deployment>" npx cap sync
```

`webDir: "out"` alone is only a demo shell without login/DB. iPad: use
the web app via Safari ("Add to Home Screen") — APKs are Android-only.

## Roadmap (not in MVP)

FHIR/HL7 ingestion · SSO/Keycloak OIDC · real HIS/LIS/claims connectors ·
PostgreSQL production profile · member portal · full claims lifecycle ·
eligibility engine · telemedicine.
